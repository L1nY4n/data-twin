use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    Json,
};
use futures_util::{SinkExt, StreamExt};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::{
    app::AppState,
    contracts::{
        ConfigChangedPayload, ConfigChangedScope, PositionUpdatePayload, PublishedSceneDescriptor,
        RealtimeBatchPayload, RealtimeEvent,
    },
};

const REALTIME_BATCH_EVENT_THRESHOLD: usize = 16;
const RUNTIME_POSE_FRAME_VERSION: u8 = 1;
const RUNTIME_POSE_FRAME_TYPE: u8 = 1;
const RUNTIME_POSE_FRAME_FLAG_YAW: u16 = 1 << 0;
const RUNTIME_POSE_FRAME_FLAG_SPEED: u16 = 1 << 1;
const RUNTIME_POSE_FRAME_FLAG_HEADING: u16 = 1 << 2;
const MAX_RUNTIME_POSE_FRAME_RECORDS: usize = 512;
const TICKET_TTL_MS: u64 = 60_000;
const TICKET_REQUEST_WINDOW_MS: u64 = 10_000;
const MAX_TICKET_REQUESTS_PER_WINDOW: usize = 60;
const MAX_PENDING_ACCESS_TICKETS: usize = 256;

#[derive(Debug, Clone, Copy)]
enum RealtimeTicketIssueError {
    RateLimited,
    CapacityExceeded,
}

#[derive(Clone)]
pub struct RealtimeState {
    broadcasters: Arc<Mutex<HashMap<String, broadcast::Sender<RealtimeEvent>>>>,
    access_tickets: Arc<Mutex<HashMap<String, u64>>>,
    ticket_requests_by_scope: Arc<Mutex<HashMap<String, VecDeque<u64>>>>,
    allowed_origins: Vec<HeaderValue>,
}

impl RealtimeState {
    pub fn new(allowed_origins: Vec<HeaderValue>) -> Self {
        Self {
            broadcasters: Arc::new(Mutex::new(HashMap::new())),
            access_tickets: Arc::new(Mutex::new(HashMap::new())),
            ticket_requests_by_scope: Arc::new(Mutex::new(HashMap::new())),
            allowed_origins,
        }
    }

    fn sender_for(&self, workspace_id: &str) -> broadcast::Sender<RealtimeEvent> {
        let mut broadcasters = self
            .broadcasters
            .lock()
            .expect("realtime broadcaster mutex should not be poisoned");
        broadcasters
            .entry(workspace_id.to_string())
            .or_insert_with(|| {
                let (sender, _) = broadcast::channel(128);
                sender
            })
            .clone()
    }

    fn subscribe(&self, workspace_id: &str) -> broadcast::Receiver<RealtimeEvent> {
        self.sender_for(workspace_id).subscribe()
    }

    fn origin_allowed(&self, origin: Option<&HeaderValue>) -> bool {
        origin
            .map(|candidate| {
                self.allowed_origins
                    .iter()
                    .any(|allowed| allowed == candidate)
            })
            .unwrap_or(false)
    }

    pub fn emit(&self, event: RealtimeEvent) {
        self.emit_for_workspace("global", event);
    }

    pub fn emit_for_workspace(&self, workspace_id: &str, event: RealtimeEvent) {
        let _ = self.sender_for(workspace_id).send(event);
    }

    pub fn emit_many_for_workspace(
        &self,
        workspace_id: &str,
        timestamp: u64,
        events: Vec<RealtimeEvent>,
    ) {
        if events.is_empty() {
            return;
        }

        if events.len() > REALTIME_BATCH_EVENT_THRESHOLD {
            self.emit_for_workspace(
                workspace_id,
                RealtimeEvent::Batch {
                    timestamp,
                    payload: RealtimeBatchPayload { events },
                },
            );
            return;
        }

        for event in events {
            self.emit_for_workspace(workspace_id, event);
        }
    }

    pub fn emit_config_changed(
        &self,
        scene_version: u64,
        scope: ConfigChangedScope,
        published_scene: Option<PublishedSceneDescriptor>,
    ) {
        let timestamp = now_millis();
        self.emit(RealtimeEvent::ConfigChanged {
            timestamp,
            payload: ConfigChangedPayload {
                workspace_id: "global".to_string(),
                scene_version,
                changed_at: timestamp,
                scope,
                published_scene,
            },
        });
    }

    pub fn emit_config_changed_for_workspace(
        &self,
        workspace_id: &str,
        scene_version: u64,
        scope: ConfigChangedScope,
        published_scene: Option<PublishedSceneDescriptor>,
    ) {
        let timestamp = now_millis();
        self.emit_for_workspace(
            workspace_id,
            RealtimeEvent::ConfigChanged {
                timestamp,
                payload: ConfigChangedPayload {
                    workspace_id: workspace_id.to_string(),
                    scene_version,
                    changed_at: timestamp,
                    scope,
                    published_scene,
                },
            },
        );
    }

    fn issue_access_ticket(
        &self,
        scope_key: &str,
        now: u64,
    ) -> Result<(String, u64), RealtimeTicketIssueError> {
        let request_window_start = now.saturating_sub(TICKET_REQUEST_WINDOW_MS);
        {
            let mut scopes = self
                .ticket_requests_by_scope
                .lock()
                .expect("realtime ticket request mutex should not be poisoned");
            scopes.retain(|_, requests| {
                while requests
                    .front()
                    .is_some_and(|recorded_at| *recorded_at < request_window_start)
                {
                    requests.pop_front();
                }
                !requests.is_empty()
            });
            let requests = scopes.entry(scope_key.to_string()).or_default();
            if requests.len() >= MAX_TICKET_REQUESTS_PER_WINDOW {
                return Err(RealtimeTicketIssueError::RateLimited);
            }
            requests.push_back(now);
        }

        let token = format!("rt-{}", Uuid::new_v4());
        let expires_at = now.saturating_add(TICKET_TTL_MS);
        let mut tickets = self
            .access_tickets
            .lock()
            .expect("realtime ticket mutex should not be poisoned");
        tickets.retain(|_, expiry| *expiry > now);
        if tickets.len() >= MAX_PENDING_ACCESS_TICKETS {
            return Err(RealtimeTicketIssueError::CapacityExceeded);
        }
        tickets.insert(token.clone(), expires_at);
        Ok((token, expires_at))
    }

    fn consume_access_ticket(&self, token: &str, now: u64) -> bool {
        let mut tickets = self
            .access_tickets
            .lock()
            .expect("realtime ticket mutex should not be poisoned");
        tickets.retain(|_, expiry| *expiry > now);
        tickets
            .remove(token)
            .is_some_and(|expires_at| expires_at > now)
    }
}

fn bearer_or_header_token<'a>(headers: &'a HeaderMap, header_name: &str) -> Option<&'a str> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        })
}

fn websocket_token(headers: &HeaderMap) -> Option<&str> {
    bearer_or_header_token(headers, "x-realtime-access-token").or_else(|| {
        headers
            .get(header::SEC_WEBSOCKET_PROTOCOL)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| {
                let mut protocols = value.split(',').map(str::trim);
                while let Some(protocol) = protocols.next() {
                    if protocol == "dt-realtime-token" {
                        return protocols.next();
                    }
                }
                None
            })
    })
}

fn realtime_ticket_scope(headers: &HeaderMap) -> String {
    headers
        .get("x-realtime-ticket-scope")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.split(',').next())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .or_else(|| {
            headers
                .get(header::ORIGIN)
                .and_then(|value| value.to_str().ok())
        })
        .map(|value| value.chars().take(128).collect())
        .unwrap_or_else(|| "global".to_string())
}

fn validate_ws_access(state: &AppState, headers: &HeaderMap) -> Result<(), StatusCode> {
    if !state.realtime.origin_allowed(headers.get(header::ORIGIN)) {
        warn!(
            request_origin = ?headers.get(header::ORIGIN),
            allowed_origins = ?state.realtime.allowed_origins,
            "rejected websocket handshake due to invalid origin"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    let Some(expected_token) = &state.realtime_access_token else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let Some(provided_token) = websocket_token(headers) else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if provided_token != expected_token.as_str()
        && !state
            .realtime
            .consume_access_ticket(provided_token, now_millis())
    {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(())
}

pub async fn issue_realtime_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let Some(expected_token) = &state.realtime_access_token else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "error": "realtime tickets are disabled until BACKEND_REALTIME_ACCESS_TOKEN is configured" }),
            ),
        ));
    };

    if bearer_or_header_token(&headers, "x-realtime-access-token") != Some(expected_token.as_str())
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "realtime access token is invalid" })),
        ));
    }

    let now = now_millis();
    let scope = realtime_ticket_scope(&headers);
    let (token, expires_at) = state
        .realtime
        .issue_access_ticket(&scope, now)
        .map_err(|error| match error {
            RealtimeTicketIssueError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({ "error": "realtime ticket rate limit exceeded" })),
            ),
            RealtimeTicketIssueError::CapacityExceeded => (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({ "error": "too many pending realtime tickets" })),
            ),
        })?;

    Ok(Json(serde_json::json!({
        "token": token,
        "expiresAt": expires_at,
    })))
}

pub async fn realtime_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    validate_ws_access(&state, &headers)?;

    let home_workspace_id = state
        .store
        .get_homepage_workspace()
        .await
        .map(|workspace| workspace.id)
        .unwrap_or_else(|_| "global".to_string());

    Ok(ws
        .protocols(["dt-realtime-token"])
        .on_upgrade(move |socket| client_stream(socket, state.realtime.clone(), home_workspace_id)))
}

pub async fn workspace_realtime_ws_handler(
    Path(workspace_id): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    validate_ws_access(&state, &headers)?;

    Ok(ws
        .protocols(["dt-realtime-token"])
        .on_upgrade(move |socket| client_stream(socket, state.realtime.clone(), workspace_id)))
}

async fn client_stream(socket: WebSocket, state: RealtimeState, workspace_id: String) {
    let mut subscription = state.subscribe(&workspace_id);

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            event = subscription.recv() => {
                match event {
                    Ok(event) => {
                        if let Some(messages) = runtime_batch_outbound_messages(&event) {
                            let mut disconnected = false;
                            for message in messages {
                                if sender.send(message).await.is_err() {
                                    disconnected = true;
                                    break;
                                }
                            }
                            if disconnected {
                                break;
                            }
                            continue;
                        }

                        let Some(message) = serialize_realtime_event(&event) else {
                            continue;
                        };

                        if sender.send(Message::Text(message)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        debug!(skipped, "websocket client lagged behind realtime stream");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            inbound = receiver.next() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        debug!(%error, "websocket client disconnected");
                        break;
                    }
                }
            }
        }
    }
}

fn append_u64_le(target: &mut Vec<u8>, value: u64) {
    target.extend_from_slice(&value.to_le_bytes());
}

fn append_f32_le(target: &mut Vec<u8>, value: f32) {
    target.extend_from_slice(&value.to_le_bytes());
}

fn degrees_to_radians(value: f32) -> f32 {
    value * std::f32::consts::PI / 180.0
}

fn normalize_rotation_value(value: f32) -> f32 {
    if value.abs() > std::f32::consts::PI * 2.0 {
        degrees_to_radians(value)
    } else {
        value
    }
}

fn resolve_pose_frame_yaw(payload: &PositionUpdatePayload) -> (u16, f32, f32, f32) {
    let mut flags = 0;
    let mut yaw = 0.0;
    let mut speed = 0.0;
    let mut heading = 0.0;

    if let Some(value) = payload.heading {
        heading = value;
        yaw = degrees_to_radians(value);
        flags |= RUNTIME_POSE_FRAME_FLAG_YAW | RUNTIME_POSE_FRAME_FLAG_HEADING;
    } else if let Some(rotation) = payload.rotation {
        yaw = normalize_rotation_value(rotation.y);
        flags |= RUNTIME_POSE_FRAME_FLAG_YAW;
    }

    if let Some(value) = payload.speed {
        speed = value;
        flags |= RUNTIME_POSE_FRAME_FLAG_SPEED;
    }
    if let Some(value) = payload.heading {
        heading = value;
        flags |= RUNTIME_POSE_FRAME_FLAG_HEADING;
    }

    (flags, yaw, speed, heading)
}

fn append_pose_frame_record(
    target: &mut Vec<u8>,
    timestamp: u64,
    payload: &PositionUpdatePayload,
) -> Option<()> {
    let entity_id = payload.entity_id.as_bytes();
    let entity_id_len = u16::try_from(entity_id.len()).ok()?;
    let (flags, yaw, speed, heading) = resolve_pose_frame_yaw(payload);

    target.extend_from_slice(&entity_id_len.to_le_bytes());
    target.extend_from_slice(entity_id);
    target.extend_from_slice(&flags.to_le_bytes());
    target.push(0); // status unknown; the client keeps current ECS status.
    target.push(0); // reserved
    append_u64_le(target, timestamp);
    append_f32_le(target, payload.position.x);
    append_f32_le(target, payload.position.y);
    append_f32_le(target, payload.position.z);
    append_f32_le(target, yaw);
    append_f32_le(target, speed);
    append_f32_le(target, heading);
    Some(())
}

fn position_event_payload(event: &RealtimeEvent) -> Option<(u64, &PositionUpdatePayload)> {
    match event {
        RealtimeEvent::PositionUpdate { timestamp, payload } => Some((*timestamp, payload)),
        _ => None,
    }
}

fn is_position_event(event: &RealtimeEvent) -> bool {
    matches!(event, RealtimeEvent::PositionUpdate { .. })
}

fn serialize_realtime_event(event: &RealtimeEvent) -> Option<String> {
    match serde_json::to_string(event) {
        Ok(message) => Some(message),
        Err(error) => {
            warn!(%error, "failed to serialize realtime event");
            None
        }
    }
}

fn encode_runtime_pose_frame_events(timestamp: u64, events: &[RealtimeEvent]) -> Option<Vec<u8>> {
    if events.is_empty() || events.len() > MAX_RUNTIME_POSE_FRAME_RECORDS {
        return None;
    }

    if !events.iter().all(is_position_event) {
        return None;
    }

    let mut frame = Vec::with_capacity(20 + events.len() * 64);
    frame.extend_from_slice(b"DTPF");
    frame.push(RUNTIME_POSE_FRAME_VERSION);
    frame.push(RUNTIME_POSE_FRAME_TYPE);
    frame.extend_from_slice(&0_u16.to_le_bytes());
    append_u64_le(&mut frame, timestamp);
    frame.extend_from_slice(&(events.len() as u32).to_le_bytes());

    for event in events {
        let (event_timestamp, event_payload) = position_event_payload(event)?;
        append_pose_frame_record(&mut frame, event_timestamp, event_payload)?;
    }

    Some(frame)
}

fn text_message_for_events(timestamp: u64, events: &[RealtimeEvent]) -> Option<Message> {
    if events.is_empty() {
        return None;
    }

    let event = if events.len() == 1 {
        events[0].clone()
    } else {
        RealtimeEvent::Batch {
            timestamp,
            payload: RealtimeBatchPayload {
                events: events.to_vec(),
            },
        }
    };

    serialize_realtime_event(&event).map(Message::Text)
}

fn runtime_batch_outbound_messages(event: &RealtimeEvent) -> Option<Vec<Message>> {
    let RealtimeEvent::Batch { timestamp, payload } = event else {
        return None;
    };
    if payload.events.len() <= REALTIME_BATCH_EVENT_THRESHOLD {
        return None;
    }

    let pose_count = payload
        .events
        .iter()
        .filter(|event| position_event_payload(event).is_some())
        .count();
    if pose_count == 0 {
        return None;
    }

    let mut messages = Vec::new();
    let mut index = 0;
    while index < payload.events.len() {
        let run_is_position = is_position_event(&payload.events[index]);
        let run_start = index;
        while index < payload.events.len()
            && is_position_event(&payload.events[index]) == run_is_position
        {
            index += 1;
        }

        if run_is_position {
            let mut chunk_start = run_start;
            while chunk_start < index {
                let chunk_end = usize::min(chunk_start + MAX_RUNTIME_POSE_FRAME_RECORDS, index);
                messages.push(Message::Binary(encode_runtime_pose_frame_events(
                    *timestamp,
                    &payload.events[chunk_start..chunk_end],
                )?));
                chunk_start = chunk_end;
            }
        } else if let Some(message) =
            text_message_for_events(*timestamp, &payload.events[run_start..index])
        {
            messages.push(message);
        }
    }

    Some(messages)
}

pub(crate) fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}
