use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;

use crate::{
    admin_service,
    app::AppState,
    contracts::{
        AdminOverviewResponse, Alarm, AuditEventRecord, BootstrapResponse, ConfigChangedScope,
        DataConnector, Entity, EntityBinding, PublishStatusResponse, RuleConfig,
        RuleValidationResponse, SceneConfig, SceneResponse, StaticAssetInstance,
    },
    publish_service,
    store::StoreError,
};

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn from_store(error: StoreError) -> Self {
        match error {
            StoreError::Validation(message) => Self {
                status: StatusCode::BAD_REQUEST,
                message,
            },
            StoreError::NotFound(message) => Self {
                status: StatusCode::NOT_FOUND,
                message,
            },
            other => Self {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                message: other.to_string(),
            },
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(serde_json::json!({
                "error": self.message,
            })),
        )
            .into_response()
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
    })?;
    let snapshot = state
        .store
        .load_working_snapshot()
        .await
        .map_err(ApiError::from_store)?;

    match publish_service::publish_working_snapshot(&state.store, &snapshot, &state.publish_config)
        .await
    {
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
            })
        }
    }
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
        .ok_or_else(|| ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("entity {id} not found"),
        })?;

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
        return Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("entity {id} not found"),
        });
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
        .ok_or_else(|| ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("static asset {id} not found"),
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
        return Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("static asset {id} not found"),
        });
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
        return Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("data source {id} not found"),
        });
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
        .ok_or_else(|| ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("rule {id} not found"),
        })?;

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
        return Err(ApiError {
            status: StatusCode::NOT_FOUND,
            message: format!("rule {id} not found"),
        });
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
            .ok_or_else(|| ApiError {
                status: StatusCode::NOT_FOUND,
                message: format!("rule {id} not found"),
            })?
    };

    let result = state.store.validate_rule(&rule);
    Ok(Json(result))
}
