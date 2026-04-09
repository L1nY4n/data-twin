use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use tokio::sync::watch;
use uuid::Uuid;

use crate::{
    admin_service,
    app::AppState,
    contracts::{
        AdminOverviewResponse, Alarm, AuditEventRecord, BootstrapResponse, ConfigChangedScope,
        DataConnector, EditorSaveRequest, EditorSaveResponse, Entity, EntityBinding,
        PublishStatusResponse, RuleConfig, RuleValidationResponse, SceneConfig, SceneResponse,
        StaticAssetInstance,
    },
    publish_service,
    store::StoreError,
};

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
    code: Option<&'static str>,
    expected_scene_version: Option<u64>,
    current_scene_version: Option<u64>,
    recovery_action: Option<&'static str>,
}

impl ApiError {
    fn simple(status: StatusCode, message: String) -> Self {
        Self {
            status,
            message,
            code: None,
            expected_scene_version: None,
            current_scene_version: None,
            recovery_action: None,
        }
    }

    fn from_store(error: StoreError) -> Self {
        match error {
            StoreError::Validation(message) => Self::simple(StatusCode::BAD_REQUEST, message),
            StoreError::Conflict(message) => Self::simple(StatusCode::CONFLICT, message),
            StoreError::SceneVersionConflict { expected, actual } => Self {
                status: StatusCode::CONFLICT,
                message: format!(
                    "editor save is based on scene version {expected}, but the current version is {actual}; reload the editor and retry"
                ),
                code: Some("scene_version_conflict"),
                expected_scene_version: Some(expected),
                current_scene_version: Some(actual),
                recovery_action: Some("reload"),
            },
            StoreError::NotFound(message) => Self::simple(StatusCode::NOT_FOUND, message),
            other => Self::simple(StatusCode::INTERNAL_SERVER_ERROR, other.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut payload = serde_json::Map::new();
        payload.insert("error".to_string(), serde_json::Value::String(self.message));
        if let Some(code) = self.code {
            payload.insert(
                "code".to_string(),
                serde_json::Value::String(code.to_string()),
            );
        }
        if let Some(expected_scene_version) = self.expected_scene_version {
            payload.insert(
                "expectedSceneVersion".to_string(),
                serde_json::Value::Number(expected_scene_version.into()),
            );
        }
        if let Some(current_scene_version) = self.current_scene_version {
            payload.insert(
                "currentSceneVersion".to_string(),
                serde_json::Value::Number(current_scene_version.into()),
            );
        }
        if let Some(recovery_action) = self.recovery_action {
            payload.insert(
                "recoveryAction".to_string(),
                serde_json::Value::String(recovery_action.to_string()),
            );
        }

        (self.status, Json(serde_json::Value::Object(payload))).into_response()
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceBindingsRequest {
    pub bindings: Vec<EntityBinding>,
}

async fn emit_config_changed(
    state: &AppState,
    scene_version: u64,
    scope: ConfigChangedScope,
) -> Result<(), ApiError> {
    let published_scene = state
        .store
        .published_scene_descriptor()
        .await
        .map_err(ApiError::from_store)?;
    state
        .realtime
        .emit_config_changed(scene_version, scope, published_scene);
    Ok(())
}

pub async fn get_scene(State(state): State<AppState>) -> ApiResult<SceneResponse> {
    let scene = state
        .store
        .get_scene()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(scene))
}

pub async fn get_overview(State(state): State<AppState>) -> ApiResult<AdminOverviewResponse> {
    let overview = admin_service::load_admin_overview(&state.store)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(overview))
}

pub async fn get_editor_bootstrap(State(state): State<AppState>) -> ApiResult<BootstrapResponse> {
    let payload = state
        .store
        .editor_bootstrap()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(payload))
}

pub async fn get_publish_status(State(state): State<AppState>) -> ApiResult<PublishStatusResponse> {
    let status = publish_service::load_publish_status(&state.store, &state.publish)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(status))
}

pub async fn post_publish(State(state): State<AppState>) -> ApiResult<PublishStatusResponse> {
    let lease = state.publish.try_acquire().ok_or(ApiError {
        status: StatusCode::CONFLICT,
        message: "publish already in progress".to_string(),
        code: None,
        expected_scene_version: None,
        current_scene_version: None,
        recovery_action: None,
    })?;
    let snapshot = state
        .store
        .load_working_snapshot()
        .await
        .map_err(ApiError::from_store)?;

    let publish_token = Uuid::new_v4().to_string();
    let lock_acquired = state
        .store
        .try_begin_publish(
            &publish_token,
            now_millis(),
            publish_service::publish_lock_stale_after_ms(),
        )
        .await
        .map_err(ApiError::from_store)?;
    if !lock_acquired {
        drop(lease);
        return Err(ApiError {
            status: StatusCode::CONFLICT,
            message: "publish already in progress".to_string(),
            code: None,
            expected_scene_version: None,
            current_scene_version: None,
            recovery_action: None,
        });
    }

    let (heartbeat_stop_tx, mut heartbeat_stop_rx) = watch::channel(false);
    let heartbeat_store = state.store.clone();
    let heartbeat_token = publish_token.clone();
    let heartbeat_task = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(
            publish_service::PUBLISH_HEARTBEAT_INTERVAL_MS,
        ));
        loop {
            tokio::select! {
                _ = heartbeat_stop_rx.changed() => {
                    break;
                }
                _ = ticker.tick() => {
                    let refreshed = heartbeat_store
                        .refresh_publish_heartbeat(&heartbeat_token, now_millis())
                        .await
                        .unwrap_or(false);
                    if !refreshed {
                        break;
                    }
                }
            }
        }
    });

    let publish_result =
        publish_service::publish_working_snapshot(&state.store, &snapshot, &state.publish_config)
            .await;
    let _ = heartbeat_stop_tx.send(true);
    let _ = heartbeat_task.await;

    match publish_result {
        Ok(published) => {
            let published_scene = published.published_scene.clone();
            let scene_version = published.published_scene_version;
            drop(lease);
            state.realtime.emit_config_changed(
                scene_version,
                ConfigChangedScope::Publish,
                published_scene,
            );
            let status = publish_service::load_publish_status(&state.store, &state.publish)
                .await
                .map_err(ApiError::from_store)?;
            Ok(Json(status))
        }
        Err(error) => {
            let _ = publish_service::record_publish_failure(&state.store, &snapshot, &error).await;
            drop(lease);
            Err(ApiError {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                message: error.to_string(),
                code: None,
                expected_scene_version: None,
                current_scene_version: None,
                recovery_action: None,
            })
        }
    }
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

pub async fn put_scene(
    State(state): State<AppState>,
    Json(payload): Json<SceneConfig>,
) -> ApiResult<SceneResponse> {
    let scene = state
        .store
        .update_scene(payload)
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene.scene_version, ConfigChangedScope::Scene).await?;
    Ok(Json(scene))
}

pub async fn post_editor_save(
    State(state): State<AppState>,
    Json(payload): Json<EditorSaveRequest>,
) -> ApiResult<EditorSaveResponse> {
    let scope = if payload.scene_config.is_some() {
        ConfigChangedScope::Scene
    } else if payload.static_asset.is_some() {
        ConfigChangedScope::StaticAsset
    } else {
        ConfigChangedScope::Entity
    };

    let response = state
        .store
        .save_editor_changes(payload)
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, response.scene_version, scope).await?;
    Ok(Json(response))
}

pub async fn list_entities(State(state): State<AppState>) -> ApiResult<Vec<Entity>> {
    let entities = state
        .store
        .list_entities()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(entities))
}

pub async fn get_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .get_entity(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("entity {id} not found")))?;

    Ok(Json(entity))
}

pub async fn create_entity(
    State(state): State<AppState>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .create_entity(payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(entity))
}

pub async fn update_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .update_entity(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(entity))
}

pub async fn delete_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_entity(&id)
        .await
        .map_err(ApiError::from_store)?;

    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("entity {id} not found"),
        ));
    }

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_static_assets(
    State(state): State<AppState>,
) -> ApiResult<Vec<StaticAssetInstance>> {
    let static_assets = state
        .store
        .list_static_assets()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(static_assets))
}

pub async fn get_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .get_static_asset(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| {
            ApiError::simple(
                StatusCode::NOT_FOUND,
                format!("static asset {id} not found"),
            )
        })?;

    Ok(Json(static_asset))
}

pub async fn create_static_asset(
    State(state): State<AppState>,
    Json(payload): Json<StaticAssetInstance>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .create_static_asset(payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(Json(static_asset))
}

pub async fn update_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<StaticAssetInstance>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .update_static_asset(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(Json(static_asset))
}

pub async fn delete_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_static_asset(&id)
        .await
        .map_err(ApiError::from_store)?;

    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("static asset {id} not found"),
        ));
    }

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_data_sources(State(state): State<AppState>) -> ApiResult<Vec<DataConnector>> {
    let sources = state
        .store
        .list_connectors()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(sources))
}

pub async fn list_alarms(State(state): State<AppState>) -> ApiResult<Vec<Alarm>> {
    let alarms = admin_service::load_admin_alarms(&state.store)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(alarms))
}

pub async fn list_audit_events(State(state): State<AppState>) -> ApiResult<Vec<AuditEventRecord>> {
    let audit_events = admin_service::load_audit_events(&state.store, 100)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(audit_events))
}

pub async fn create_data_source(
    State(state): State<AppState>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let source = state
        .store
        .create_connector(payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(source))
}

pub async fn update_data_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let source = state
        .store
        .update_connector(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(source))
}

pub async fn delete_data_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_connector(&id)
        .await
        .map_err(ApiError::from_store)?;

    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("data source {id} not found"),
        ));
    }

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Binding).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_entity_bindings(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Vec<EntityBinding>> {
    let bindings = state
        .store
        .list_bindings_by_entity(&id)
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(bindings))
}

pub async fn replace_entity_bindings(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<ReplaceBindingsRequest>,
) -> ApiResult<Vec<EntityBinding>> {
    let bindings = state
        .store
        .replace_entity_bindings(&id, payload.bindings)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(bindings))
}

pub async fn list_rules(State(state): State<AppState>) -> ApiResult<Vec<RuleConfig>> {
    let rules = state
        .store
        .list_rules()
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<AppState>,
    Json(payload): Json<RuleConfig>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .create_rule(payload)
        .await
        .map_err(ApiError::from_store)?;

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Rule).await?;

    Ok(Json(rule))
}

pub async fn get_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .get_rule(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("rule {id} not found")))?;

    Ok(Json(rule))
}

pub async fn update_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<RuleConfig>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .update_rule(&id, payload)
        .await
        .map_err(ApiError::from_store)?;

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Rule).await?;

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_rule(&id)
        .await
        .map_err(ApiError::from_store)?;

    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("rule {id} not found"),
        ));
    }

    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Rule).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn validate_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    payload: Option<Json<RuleConfig>>,
) -> ApiResult<RuleValidationResponse> {
    let rule = if let Some(payload) = payload {
        payload.0
    } else {
        state
            .store
            .get_rule(&id)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(|| {
                ApiError::simple(StatusCode::NOT_FOUND, format!("rule {id} not found"))
            })?
    };

    let result = state.store.validate_rule(&rule);
    Ok(Json(result))
}
