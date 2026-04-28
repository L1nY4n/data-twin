use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::Value;
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet, VecDeque},
    hash::{Hash, Hasher},
    sync::Arc,
};
use tokio::sync::Mutex;

use crate::{
    app::AppState,
    contracts::{RealtimeEvent, RuntimeIngestEvent, RuntimeIngestRequest, RuntimeIngestResponse},
    realtime::now_millis,
};

type RuntimeIngestResult =
    Result<Json<RuntimeIngestResponse>, (StatusCode, Json<serde_json::Value>)>;

const MAX_RUNTIME_INGEST_EVENTS: usize = 512;
const MAX_INCIDENT_PAYLOAD_BYTES: usize = 16 * 1024;
const REQUEST_WINDOW_MS: u64 = 10_000;
const MAX_REQUESTS_PER_WINDOW: usize = 120;
const REPLAY_WINDOW_MS: u64 = 30_000;

#[derive(Default)]
struct RuntimeIngestGuardStore {
    requests_by_scope: HashMap<String, VecDeque<u64>>,
    event_fingerprint_expiry_by_scope: HashMap<String, HashMap<u64, u64>>,
}

#[derive(Clone, Default)]
pub struct RuntimeIngestState {
    inner: Arc<Mutex<RuntimeIngestGuardStore>>,
}

impl RuntimeIngestState {
    pub async fn validate_and_record(
        &self,
        scope_key: &str,
        scope_label: &str,
        event_fingerprints: &[u64],
        now: u64,
    ) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
        let mut guard = self.inner.lock().await;
        let request_window_start = now.saturating_sub(REQUEST_WINDOW_MS);
        let replay_window_expiry = now.saturating_add(REPLAY_WINDOW_MS);

        let mut seen_in_batch = HashSet::with_capacity(event_fingerprints.len());
        if event_fingerprints
            .iter()
            .any(|fingerprint| !seen_in_batch.insert(*fingerprint))
        {
            return Err((
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "duplicate runtime event detected within replay window"
                })),
            ));
        }

        guard
            .event_fingerprint_expiry_by_scope
            .retain(|_, fingerprints| {
                fingerprints.retain(|_, expiry| *expiry > now);
                !fingerprints.is_empty()
            });
        let duplicate_in_replay_window = guard
            .event_fingerprint_expiry_by_scope
            .get(scope_key)
            .is_some_and(|existing_scope_fingerprints| {
                event_fingerprints
                    .iter()
                    .any(|fingerprint| existing_scope_fingerprints.contains_key(fingerprint))
            });

        if duplicate_in_replay_window {
            return Err((
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "duplicate runtime event detected within replay window"
                })),
            ));
        }

        let request_times = guard
            .requests_by_scope
            .entry(scope_key.to_string())
            .or_default();
        while request_times
            .front()
            .is_some_and(|recorded_at| *recorded_at < request_window_start)
        {
            request_times.pop_front();
        }
        if request_times.len() >= MAX_REQUESTS_PER_WINDOW {
            return Err((
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "error": format!(
                        "runtime ingest rate limit exceeded for workspace {}",
                        scope_label
                    )
                })),
            ));
        }

        request_times.push_back(now);
        let scope_fingerprints = guard
            .event_fingerprint_expiry_by_scope
            .entry(scope_key.to_string())
            .or_default();
        for fingerprint in event_fingerprints {
            scope_fingerprints.insert(*fingerprint, replay_window_expiry);
        }

        Ok(())
    }
}

fn require_string_field<'a>(
    object: &'a serde_json::Map<String, Value>,
    field: &str,
) -> Result<&'a str, (StatusCode, Json<serde_json::Value>)> {
    object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("incident.{} must be a non-empty string", field)
            })),
        ))
}

fn validate_incident_payload(
    incident: &Value,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let object = incident.as_object().ok_or((
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "incident must be a JSON object" })),
    ))?;

    require_string_field(object, "id")?;
    let event_type = object
        .get("eventType")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            object
                .get("kind")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
        })
        .ok_or((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "incident.eventType or incident.kind must be a non-empty string" })),
        ))?;
    if event_type.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "incident.eventType or incident.kind is invalid" })),
        ));
    }

    let severity = require_string_field(object, "severity")?;
    if !matches!(severity, "info" | "warning" | "error" | "critical") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "incident.severity is invalid" })),
        ));
    }

    require_string_field(object, "title")?;
    require_string_field(object, "summary")?;
    require_string_field(object, "message")?;
    require_string_field(object, "primaryEntityId")?;

    let entity_ids = object.get("entityIds").and_then(Value::as_array).ok_or((
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "incident.entityIds must be an array" })),
    ))?;
    if entity_ids.is_empty() || entity_ids.iter().any(|item| item.as_str().is_none()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "incident.entityIds must contain non-empty strings"
            })),
        ));
    }

    let citations = object.get("citations").and_then(Value::as_array).ok_or((
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "incident.citations must be an array" })),
    ))?;
    for citation in citations {
        let citation_object = citation.as_object().ok_or((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "incident.citations entries must be objects" })),
        ))?;
        require_string_field(citation_object, "id")?;
        require_string_field(citation_object, "label")?;
        require_string_field(citation_object, "value")?;
    }

    if object
        .get("acknowledged")
        .and_then(Value::as_bool)
        .is_none()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "incident.acknowledged must be a boolean" })),
        ));
    }

    if object.get("timestamp").and_then(Value::as_u64).is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": "incident.timestamp must be a unix millisecond number" }),
            ),
        ));
    }

    Ok(())
}

fn fingerprint_runtime_event(
    event: &RuntimeIngestEvent,
) -> Result<u64, (StatusCode, Json<serde_json::Value>)> {
    let serialized = serde_json::to_string(event).map_err(|error| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("runtime ingest event is not serializable: {error}")
            })),
        )
    })?;
    let mut hasher = DefaultHasher::new();
    serialized.hash(&mut hasher);
    Ok(hasher.finish())
}

fn normalize_runtime_event(
    event: RuntimeIngestEvent,
    received_at: u64,
) -> Result<RealtimeEvent, (StatusCode, Json<serde_json::Value>)> {
    Ok(match event {
        RuntimeIngestEvent::PositionUpdate { timestamp, payload } => {
            RealtimeEvent::PositionUpdate {
                timestamp: timestamp.unwrap_or(received_at),
                payload,
            }
        }
        RuntimeIngestEvent::StatusUpdate { timestamp, payload } => RealtimeEvent::StatusUpdate {
            timestamp: timestamp.unwrap_or(received_at),
            payload,
        },
        RuntimeIngestEvent::Alarm { timestamp, payload } => RealtimeEvent::Alarm {
            timestamp: timestamp.unwrap_or(received_at),
            payload,
        },
        RuntimeIngestEvent::Incident { timestamp, payload } => {
            let payload_size = serde_json::to_vec(&payload.incident)
                .map_err(|error| {
                    (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "error": format!("incident payload is invalid json: {error}")
                        })),
                    )
                })?
                .len();
            if payload_size > MAX_INCIDENT_PAYLOAD_BYTES {
                return Err((
                    StatusCode::PAYLOAD_TOO_LARGE,
                    Json(serde_json::json!({
                        "error": format!(
                            "incident payload exceeds {} bytes",
                            MAX_INCIDENT_PAYLOAD_BYTES
                        )
                    })),
                ));
            }
            validate_incident_payload(&payload.incident)?;

            RealtimeEvent::Incident {
                timestamp: timestamp.unwrap_or(received_at),
                payload,
            }
        }
    })
}

fn runtime_event_entity_id(event: &RuntimeIngestEvent) -> Option<&str> {
    match event {
        RuntimeIngestEvent::PositionUpdate { payload, .. } => Some(payload.entity_id.as_str()),
        RuntimeIngestEvent::StatusUpdate { payload, .. } => Some(payload.entity_id.as_str()),
        _ => None,
    }
}

async fn validate_runtime_event_entity_refs(
    state: &AppState,
    workspace_id: &str,
    events: &[RuntimeIngestEvent],
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let mut seen = HashSet::new();
    let mut entity_ids = Vec::new();

    for event in events {
        let Some(entity_id) = runtime_event_entity_id(event) else {
            continue;
        };
        if seen.insert(entity_id) {
            entity_ids.push(entity_id.to_string());
        }
    }

    if entity_ids.is_empty() {
        return Ok(());
    }

    let missing = state
        .store
        .workspace_missing_entities(workspace_id, &entity_ids)
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
        })?;

    if let Some(entity_id) = missing.first() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": format!(
                    "entity {} was not found in workspace {}",
                    entity_id, workspace_id
                )
            })),
        ));
    }

    Ok(())
}

pub async fn post_runtime_ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RuntimeIngestRequest>,
) -> RuntimeIngestResult {
    let Some(expected_token) = &state.runtime_ingest_token else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "error": "runtime ingest is disabled until RUNTIME_INGEST_TOKEN is configured" }),
            ),
        ));
    };

    let provided_token = headers
        .get("x-runtime-ingest-token")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        });

    if provided_token != Some(expected_token.as_str()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "runtime ingest token is invalid" })),
        ));
    }

    if request.source.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "source is required" })),
        ));
    }

    if request.events.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "at least one runtime event is required" })),
        ));
    }

    if request.events.len() > MAX_RUNTIME_INGEST_EVENTS {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!(
                    "runtime ingest accepts at most {} events per request",
                    MAX_RUNTIME_INGEST_EVENTS
                )
            })),
        ));
    }

    let home_workspace_id = state
        .store
        .get_homepage_workspace()
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
        })?
        .id;
    let received_at = now_millis();
    validate_runtime_event_entity_refs(&state, &home_workspace_id, &request.events).await?;

    let mut normalized_events = Vec::with_capacity(request.events.len());
    let mut fingerprints = Vec::with_capacity(request.events.len());
    for event in request.events {
        fingerprints.push(fingerprint_runtime_event(&event)?);
        normalized_events.push(normalize_runtime_event(event, received_at)?);
    }

    state
        .runtime_ingest_state
        .validate_and_record(
            &home_workspace_id,
            &home_workspace_id,
            &fingerprints,
            received_at,
        )
        .await?;

    state
        .realtime
        .emit_many_for_workspace(&home_workspace_id, received_at, normalized_events);

    Ok(Json(RuntimeIngestResponse {
        source: request.source,
        accepted_count: fingerprints.len(),
        received_at,
    }))
}

pub async fn post_workspace_runtime_ingest(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RuntimeIngestRequest>,
) -> RuntimeIngestResult {
    let Some(expected_token) = &state.runtime_ingest_token else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "error": "runtime ingest is disabled until RUNTIME_INGEST_TOKEN is configured" }),
            ),
        ));
    };

    let provided_token = headers
        .get("x-runtime-ingest-token")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        });

    if provided_token != Some(expected_token.as_str()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "runtime ingest token is invalid" })),
        ));
    }

    if request.source.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "source is required" })),
        ));
    }

    if request.events.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "at least one runtime event is required" })),
        ));
    }

    if request.events.len() > MAX_RUNTIME_INGEST_EVENTS {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!(
                    "runtime ingest accepts at most {} events per request",
                    MAX_RUNTIME_INGEST_EVENTS
                )
            })),
        ));
    }

    let received_at = now_millis();
    validate_runtime_event_entity_refs(&state, &workspace_id, &request.events).await?;

    let mut normalized_events = Vec::with_capacity(request.events.len());
    let mut fingerprints = Vec::with_capacity(request.events.len());
    for event in request.events {
        fingerprints.push(fingerprint_runtime_event(&event)?);
        normalized_events.push(normalize_runtime_event(event, received_at)?);
    }

    state
        .runtime_ingest_state
        .validate_and_record(&workspace_id, &workspace_id, &fingerprints, received_at)
        .await?;

    state
        .realtime
        .emit_many_for_workspace(&workspace_id, received_at, normalized_events);

    Ok(Json(RuntimeIngestResponse {
        source: request.source,
        accepted_count: fingerprints.len(),
        received_at,
    }))
}
