use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use std::{fs, path::PathBuf};
use tokio::sync::watch;
use uuid::Uuid;

use crate::{
    admin_service,
    app::AppState,
    contracts::{
        AdminOverviewResponse, Alarm, ArchetypeModelAsset, ArchetypeModelCalibration,
        AuditEventRecord, BootstrapResponse, ConfigChangedScope, DataConnector,
        EditorSaveRequest, EditorSaveResponse, Entity, EntityArchetype, EntityBinding,
        EntityCategory, ModelAssetFileType, PublishStatusResponse, RuleConfig,
        RuleValidationResponse, SceneConfig, SceneResponse, StaticAssetInstance, Vector3,
        WorkspaceRecord,
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

fn model_asset_public_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../public/assets/entity-archetypes")
}

fn detect_model_file_type(file_name: &str) -> Result<ModelAssetFileType, ApiError> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".glb") {
        Ok(ModelAssetFileType::Glb)
    } else if lower.ends_with(".fbx") {
        Ok(ModelAssetFileType::Fbx)
    } else {
        Err(ApiError::simple(
            StatusCode::BAD_REQUEST,
            "only .glb and .fbx model files are supported".to_string(),
        ))
    }
}

fn default_model_calibration() -> ArchetypeModelCalibration {
    ArchetypeModelCalibration {
        scale: Vector3 { x: 1.0, y: 1.0, z: 1.0 },
        rotation: Vector3 { x: 0.0, y: 0.0, z: 0.0 },
        translation: Vector3 { x: 0.0, y: 0.0, z: 0.0 },
        floor_offset: 0.0,
        bounds: None,
        thumbnail_url: None,
    }
}

async fn emit_config_changed(
    state: &AppState,
    scene_version: u64,
    scope: ConfigChangedScope,
) -> Result<(), ApiError> {
    let workspace = state
        .store
        .get_homepage_workspace()
        .await
        .map_err(ApiError::from_store)?;
    let published_scene = state
        .store
        .published_scene_descriptor()
        .await
        .map_err(ApiError::from_store)?;
    state.realtime.emit_config_changed_for_workspace(
        &workspace.id,
        scene_version,
        scope,
        published_scene,
    );
    Ok(())
}

async fn emit_workspace_config_changed(
    state: &AppState,
    workspace_id: &str,
    scene_version: u64,
    scope: ConfigChangedScope,
) -> Result<(), ApiError> {
    let published_scene = state
        .store
        .workspace_published_state(workspace_id)
        .await
        .map_err(ApiError::from_store)?
        .published_scene;
    state.realtime.emit_config_changed_for_workspace(
        workspace_id,
        scene_version,
        scope,
        published_scene,
    );
    Ok(())
}

async fn homepage_workspace_id(state: &AppState) -> Result<String, ApiError> {
    Ok(state
        .store
        .get_homepage_workspace()
        .await
        .map_err(ApiError::from_store)?
        .id)
}

pub async fn get_scene(State(state): State<AppState>) -> ApiResult<SceneResponse> {
    let scene = state
        .store
        .get_scene()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(scene))
}

pub async fn get_workspace_scene(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<SceneResponse> {
    let scene = state
        .store
        .workspace_get_scene(&workspace_id)
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

pub async fn get_workspace_editor_bootstrap(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<BootstrapResponse> {
    let payload = state
        .store
        .workspace_editor_bootstrap(&workspace_id)
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

pub async fn get_workspace_publish_status(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<PublishStatusResponse> {
    let status = publish_service::load_publish_status_for_workspace(
        &state.store,
        &state.publish,
        &workspace_id,
    )
    .await
    .map_err(ApiError::from_store)?;
    Ok(Json(status))
}

pub async fn get_workspace_overview(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<AdminOverviewResponse> {
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let entities = state
        .store
        .workspace_list_entities(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let rules = state
        .store
        .workspace_list_rules(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let connectors = state
        .store
        .workspace_list_connectors(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let binding_count = state
        .store
        .workspace_binding_count(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let alarms = state
        .store
        .workspace_list_alarms(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    let recent_change_at = state
        .store
        .workspace_list_audit_events(&workspace_id, 1)
        .await
        .map_err(ApiError::from_store)?
        .into_iter()
        .next()
        .map(|event| event.created_at);

    Ok(Json(AdminOverviewResponse {
        scene_version,
        entity_count: entities.len() as u64,
        rule_count: rules.len() as u64,
        connector_count: connectors.len() as u64,
        binding_count,
        unacknowledged_alarm_count: alarms.iter().filter(|alarm| !alarm.acknowledged).count() as u64,
        recent_change_at,
    }))
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
            let scene_version = published.published_scene_version;
            drop(lease);
            emit_config_changed(&state, scene_version, ConfigChangedScope::Publish).await?;
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

pub async fn post_workspace_publish(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<PublishStatusResponse> {
    let workspace = state
        .store
        .get_workspace(&workspace_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| {
            ApiError::simple(StatusCode::NOT_FOUND, format!("workspace {workspace_id} not found"))
        })?;
    let snapshot = state
        .store
        .workspace_load_working_snapshot(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;

    let publish_token = Uuid::new_v4().to_string();
    let lock_acquired = state
        .store
        .workspace_try_begin_publish(
            &workspace_id,
            &publish_token,
            now_millis(),
            publish_service::publish_lock_stale_after_ms(),
        )
        .await
        .map_err(ApiError::from_store)?;
    if !lock_acquired {
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
    let workspace_id_for_heartbeat = workspace_id.clone();
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
                        .workspace_refresh_publish_heartbeat(
                            &workspace_id_for_heartbeat,
                            &heartbeat_token,
                            now_millis(),
                        )
                        .await
                        .unwrap_or(false);
                    if !refreshed {
                        break;
                    }
                }
            }
        }
    });

    let publish_result = publish_service::publish_working_snapshot_for_workspace(
        &state.store,
        &workspace_id,
        &workspace.slug,
        &snapshot,
        &state.publish_config,
    )
    .await;
    let _ = heartbeat_stop_tx.send(true);
    let _ = heartbeat_task.await;

    match publish_result {
        Ok(published) => {
            emit_workspace_config_changed(
                &state,
                &workspace_id,
                published.published_scene_version,
                ConfigChangedScope::Publish,
            )
            .await?;
            let status = publish_service::load_publish_status_for_workspace(
                &state.store,
                &state.publish,
                &workspace_id,
            )
            .await
            .map_err(ApiError::from_store)?;
            Ok(Json(status))
        }
        Err(error) => {
            publish_service::record_publish_failure_for_workspace(
                &state.store,
                &workspace_id,
                &snapshot,
                &error,
            )
            .await
            .map_err(ApiError::from_store)?;
            Err(ApiError::simple(
                StatusCode::INTERNAL_SERVER_ERROR,
                error.to_string(),
            ))
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

pub async fn put_workspace_scene(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SceneConfig>,
) -> ApiResult<SceneResponse> {
    let scene = state
        .store
        .workspace_update_scene(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(
        &state,
        &workspace_id,
        scene.scene_version,
        ConfigChangedScope::Scene,
    )
    .await?;
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

pub async fn post_workspace_editor_save(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<EditorSaveRequest>,
) -> ApiResult<EditorSaveResponse> {
    let scope = if payload.static_asset.is_some() {
        ConfigChangedScope::StaticAsset
    } else if payload.entity.is_some() {
        ConfigChangedScope::Entity
    } else {
        ConfigChangedScope::Scene
    };

    let response = state
        .store
        .workspace_save_editor_changes(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, response.scene_version, scope).await?;
    Ok(Json(response))
}

pub async fn list_entities(State(state): State<AppState>) -> ApiResult<Vec<Entity>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let entities = state
        .store
        .workspace_list_entities(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(entities))
}

pub async fn list_workspace_entities(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<Entity>> {
    let entities = state
        .store
        .workspace_list_entities(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(entities))
}

pub async fn get_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Entity> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let entity = state
        .store
        .workspace_get_entity(&workspace_id, &id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("entity {id} not found")))?;

    Ok(Json(entity))
}

pub async fn get_workspace_entity(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .workspace_get_entity(&workspace_id, &id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("entity {id} not found")))?;

    Ok(Json(entity))
}

pub async fn create_entity(
    State(state): State<AppState>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let entity = state
        .store
        .workspace_create_entity(&workspace_id, payload)
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

pub async fn create_workspace_entity(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .workspace_create_entity(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(entity))
}

pub async fn update_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let entity = state
        .store
        .workspace_update_entity(&workspace_id, &id, payload)
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

pub async fn update_workspace_entity(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<Entity>,
) -> ApiResult<Entity> {
    let entity = state
        .store
        .workspace_update_entity(&workspace_id, &id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(entity))
}

pub async fn delete_entity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let deleted = state
        .store
        .workspace_delete_entity(&workspace_id, &id)
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

pub async fn delete_workspace_entity(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .workspace_delete_entity(&workspace_id, &id)
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
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Entity).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_workspaces(State(state): State<AppState>) -> ApiResult<Vec<WorkspaceRecord>> {
    let workspaces = state
        .store
        .list_workspaces()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(workspaces))
}

pub async fn get_home_workspace(State(state): State<AppState>) -> ApiResult<WorkspaceRecord> {
    let workspace = state
        .store
        .get_homepage_workspace()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(workspace))
}

pub async fn create_workspace(
    State(state): State<AppState>,
    Json(payload): Json<WorkspaceRecord>,
) -> ApiResult<WorkspaceRecord> {
    let workspace = state
        .store
        .create_workspace(payload)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(workspace))
}

pub async fn get_workspace(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<WorkspaceRecord> {
    let workspace = state
        .store
        .get_workspace(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("workspace {id} not found")))?;
    Ok(Json(workspace))
}

pub async fn update_workspace(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<WorkspaceRecord>,
) -> ApiResult<WorkspaceRecord> {
    let workspace = state
        .store
        .update_workspace(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(workspace))
}

pub async fn delete_workspace(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_workspace(&id)
        .await
        .map_err(ApiError::from_store)?;
    if !deleted {
        return Err(ApiError::simple(StatusCode::NOT_FOUND, format!("workspace {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_entity_categories(
    State(state): State<AppState>,
) -> ApiResult<Vec<EntityCategory>> {
    let categories = state
        .store
        .list_entity_categories()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(categories))
}

pub async fn create_entity_category(
    State(state): State<AppState>,
    Json(payload): Json<EntityCategory>,
) -> ApiResult<EntityCategory> {
    let category = state
        .store
        .create_entity_category(payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(category))
}

pub async fn get_entity_category(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<EntityCategory> {
    let category = state
        .store
        .get_entity_category(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| {
            ApiError::simple(StatusCode::NOT_FOUND, format!("entity category {id} not found"))
        })?;
    Ok(Json(category))
}

pub async fn update_entity_category(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<EntityCategory>,
) -> ApiResult<EntityCategory> {
    let category = state
        .store
        .update_entity_category(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(category))
}

pub async fn delete_entity_category(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_entity_category(&id)
        .await
        .map_err(ApiError::from_store)?;
    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("entity category {id} not found"),
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

pub async fn list_entity_archetypes(
    State(state): State<AppState>,
) -> ApiResult<Vec<EntityArchetype>> {
    let archetypes = state
        .store
        .list_entity_archetypes()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(archetypes))
}

pub async fn create_entity_archetype(
    State(state): State<AppState>,
    Json(payload): Json<EntityArchetype>,
) -> ApiResult<EntityArchetype> {
    let archetype = state
        .store
        .create_entity_archetype(payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(archetype))
}

pub async fn get_entity_archetype(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<EntityArchetype> {
    let archetype = state
        .store
        .get_entity_archetype(&id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| {
            ApiError::simple(StatusCode::NOT_FOUND, format!("entity archetype {id} not found"))
        })?;
    Ok(Json(archetype))
}

pub async fn update_entity_archetype(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<EntityArchetype>,
) -> ApiResult<EntityArchetype> {
    let archetype = state
        .store
        .update_entity_archetype(&id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .scene_version()
        .await
        .map_err(ApiError::from_store)?;
    emit_config_changed(&state, scene_version, ConfigChangedScope::Entity).await?;
    Ok(Json(archetype))
}

pub async fn delete_entity_archetype(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .delete_entity_archetype(&id)
        .await
        .map_err(ApiError::from_store)?;
    if !deleted {
        return Err(ApiError::simple(
            StatusCode::NOT_FOUND,
            format!("entity archetype {id} not found"),
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

pub async fn upload_model_asset(
    mut multipart: Multipart,
) -> ApiResult<ArchetypeModelAsset> {
    let mut file_name: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut payload = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::simple(StatusCode::BAD_REQUEST, error.to_string()))?
    {
        if field.name() != Some("file") {
            continue;
        }

        file_name = field.file_name().map(ToString::to_string);
        content_type = field.content_type().map(ToString::to_string);
        payload = field
            .bytes()
            .await
            .map_err(|error| ApiError::simple(StatusCode::BAD_REQUEST, error.to_string()))?
            .to_vec();
        break;
    }

    let file_name = file_name.ok_or_else(|| {
        ApiError::simple(
            StatusCode::BAD_REQUEST,
            "multipart field `file` is required".to_string(),
        )
    })?;
    if payload.is_empty() {
        return Err(ApiError::simple(
            StatusCode::BAD_REQUEST,
            "uploaded model file is empty".to_string(),
        ));
    }
    if payload.len() > 20 * 1024 * 1024 {
        return Err(ApiError::simple(
            StatusCode::PAYLOAD_TOO_LARGE,
            "model upload exceeds 20MB limit".to_string(),
        ));
    }

    let file_type = detect_model_file_type(&file_name)?;
    let extension = match file_type {
        ModelAssetFileType::Glb => "glb",
        ModelAssetFileType::Fbx => "fbx",
    };
    let asset_id = Uuid::new_v4().to_string();
    let public_root = model_asset_public_root();
    fs::create_dir_all(&public_root).map_err(|error| {
        ApiError::simple(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to create model asset directory: {error}"),
        )
    })?;
    let stored_file_name = format!("{asset_id}.{extension}");
    let disk_path = public_root.join(&stored_file_name);
    fs::write(&disk_path, &payload).map_err(|error| {
        ApiError::simple(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to persist uploaded model asset: {error}"),
        )
    })?;

    Ok(Json(ArchetypeModelAsset {
        asset_id,
        file_name,
        file_type,
        asset_url: format!("/assets/entity-archetypes/{stored_file_name}"),
        content_type,
        file_size_bytes: Some(payload.len() as u64),
        calibration: default_model_calibration(),
        uploaded_at: now_millis(),
    }))
}

pub async fn list_static_assets(
    State(state): State<AppState>,
) -> ApiResult<Vec<StaticAssetInstance>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let static_assets = state
        .store
        .workspace_list_static_assets(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(static_assets))
}

pub async fn list_workspace_static_assets(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<StaticAssetInstance>> {
    let static_assets = state
        .store
        .workspace_list_static_assets(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(static_assets))
}

pub async fn get_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StaticAssetInstance> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let static_asset = state
        .store
        .workspace_get_static_asset(&workspace_id, &id)
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

pub async fn get_workspace_static_asset(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .workspace_get_static_asset(&workspace_id, &id)
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
    let workspace_id = homepage_workspace_id(&state).await?;
    let static_asset = state
        .store
        .workspace_create_static_asset(&workspace_id, payload)
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

pub async fn create_workspace_static_asset(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<StaticAssetInstance>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .workspace_create_static_asset(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(Json(static_asset))
}

pub async fn update_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<StaticAssetInstance>,
) -> ApiResult<StaticAssetInstance> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let static_asset = state
        .store
        .workspace_update_static_asset(&workspace_id, &id, payload)
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

pub async fn update_workspace_static_asset(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<StaticAssetInstance>,
) -> ApiResult<StaticAssetInstance> {
    let static_asset = state
        .store
        .workspace_update_static_asset(&workspace_id, &id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(Json(static_asset))
}

pub async fn delete_static_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let deleted = state
        .store
        .workspace_delete_static_asset(&workspace_id, &id)
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

pub async fn delete_workspace_static_asset(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .workspace_delete_static_asset(&workspace_id, &id)
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
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::StaticAsset).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_data_sources(State(state): State<AppState>) -> ApiResult<Vec<DataConnector>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let sources = state
        .store
        .workspace_list_connectors(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(sources))
}

pub async fn list_workspace_data_sources(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<DataConnector>> {
    let sources = state
        .store
        .workspace_list_connectors(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(sources))
}

pub async fn list_alarms(State(state): State<AppState>) -> ApiResult<Vec<Alarm>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let alarms = state
        .store
        .workspace_list_alarms(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(alarms))
}

pub async fn list_workspace_alarms(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<Alarm>> {
    let alarms = state
        .store
        .workspace_list_alarms(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(alarms))
}

pub async fn list_audit_events(State(state): State<AppState>) -> ApiResult<Vec<AuditEventRecord>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let audit_events = state
        .store
        .workspace_list_audit_events(&workspace_id, 100)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(audit_events))
}

pub async fn list_workspace_audit_events(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<AuditEventRecord>> {
    let audit_events = state
        .store
        .workspace_list_audit_events(&workspace_id, 100)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(audit_events))
}

pub async fn create_data_source(
    State(state): State<AppState>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let source = state
        .store
        .workspace_create_connector(&workspace_id, payload)
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

pub async fn create_workspace_data_source(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let source = state
        .store
        .workspace_create_connector(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(source))
}

pub async fn update_data_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let source = state
        .store
        .workspace_update_connector(&workspace_id, &id, payload)
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

pub async fn update_workspace_data_source(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<DataConnector>,
) -> ApiResult<DataConnector> {
    let source = state
        .store
        .workspace_update_connector(&workspace_id, &id, payload)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(source))
}

pub async fn delete_data_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let deleted = state
        .store
        .workspace_delete_connector(&workspace_id, &id)
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

pub async fn delete_workspace_data_source(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .workspace_delete_connector(&workspace_id, &id)
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
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Binding).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_entity_bindings(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Vec<EntityBinding>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let bindings = state
        .store
        .workspace_list_bindings_by_entity(&workspace_id, &id)
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(bindings))
}

pub async fn list_workspace_entity_bindings(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> ApiResult<Vec<EntityBinding>> {
    let bindings = state
        .store
        .workspace_list_bindings_by_entity(&workspace_id, &id)
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(bindings))
}

pub async fn replace_entity_bindings(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<ReplaceBindingsRequest>,
) -> ApiResult<Vec<EntityBinding>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let bindings = state
        .store
        .workspace_replace_entity_bindings(&workspace_id, &id, payload.bindings)
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

pub async fn replace_workspace_entity_bindings(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<ReplaceBindingsRequest>,
) -> ApiResult<Vec<EntityBinding>> {
    let bindings = state
        .store
        .workspace_replace_entity_bindings(&workspace_id, &id, payload.bindings)
        .await
        .map_err(ApiError::from_store)?;
    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Binding).await?;
    Ok(Json(bindings))
}

pub async fn list_rules(State(state): State<AppState>) -> ApiResult<Vec<RuleConfig>> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let rules = state
        .store
        .workspace_list_rules(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(rules))
}

pub async fn list_workspace_rules(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Vec<RuleConfig>> {
    let rules = state
        .store
        .workspace_list_rules(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;

    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<AppState>,
    Json(payload): Json<RuleConfig>,
) -> ApiResult<RuleConfig> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let rule = state
        .store
        .workspace_create_rule(&workspace_id, payload)
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

pub async fn create_workspace_rule(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<RuleConfig>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .workspace_create_rule(&workspace_id, payload)
        .await
        .map_err(ApiError::from_store)?;

    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Rule).await?;

    Ok(Json(rule))
}

pub async fn get_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<RuleConfig> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let rule = state
        .store
        .workspace_get_rule(&workspace_id, &id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::simple(StatusCode::NOT_FOUND, format!("rule {id} not found")))?;

    Ok(Json(rule))
}

pub async fn get_workspace_rule(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .workspace_get_rule(&workspace_id, &id)
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
    let workspace_id = homepage_workspace_id(&state).await?;
    let rule = state
        .store
        .workspace_update_rule(&workspace_id, &id, payload)
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

pub async fn update_workspace_rule(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<RuleConfig>,
) -> ApiResult<RuleConfig> {
    let rule = state
        .store
        .workspace_update_rule(&workspace_id, &id, payload)
        .await
        .map_err(ApiError::from_store)?;

    let scene_version = state
        .store
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Rule).await?;

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let workspace_id = homepage_workspace_id(&state).await?;
    let deleted = state
        .store
        .workspace_delete_rule(&workspace_id, &id)
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

pub async fn delete_workspace_rule(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<StatusCode, ApiError> {
    let deleted = state
        .store
        .workspace_delete_rule(&workspace_id, &id)
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
        .workspace_scene_version(&workspace_id)
        .await
        .map_err(ApiError::from_store)?;
    emit_workspace_config_changed(&state, &workspace_id, scene_version, ConfigChangedScope::Rule).await?;

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

pub async fn validate_workspace_rule(
    Path((workspace_id, id)): Path<(String, String)>,
    State(state): State<AppState>,
    payload: Option<Json<RuleConfig>>,
) -> ApiResult<RuleValidationResponse> {
    let rule = if let Some(payload) = payload {
        payload.0
    } else {
        state
            .store
            .workspace_get_rule(&workspace_id, &id)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(|| {
                ApiError::simple(StatusCode::NOT_FOUND, format!("rule {id} not found"))
            })?
    };

    let result = state.store.validate_rule(&rule);
    Ok(Json(result))
}
