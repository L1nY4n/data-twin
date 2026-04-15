use std::{env, error::Error, fmt};

use axum::{
    http::{header::InvalidHeaderValue, HeaderName, HeaderValue, Method, Uri},
    routing::{get, post, put},
    Router,
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

pub use crate::publish_service::PublishConfig;

use crate::{
    admin,
    health::{live, ready},
    publish_service::PublishRuntime,
    realtime::{realtime_ws_handler, RealtimeState},
    runtime_ingest::{post_runtime_ingest, RuntimeIngestState},
    site::bootstrap,
    store::{Store, StoreError},
};

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub publish: PublishRuntime,
    pub publish_config: PublishConfig,
    pub realtime: RealtimeState,
    pub runtime_ingest_token: Option<String>,
    pub runtime_ingest_state: RuntimeIngestState,
}

#[derive(Clone, Debug, Default)]
pub struct AppBuildOptions {
    pub publish_config: PublishConfig,
}

#[derive(Debug)]
pub enum AppBuildError {
    InvalidAllowedOriginSyntax,
    InvalidAllowedOriginHeader(InvalidHeaderValue),
    Store(StoreError),
}

impl fmt::Display for AppBuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidAllowedOriginSyntax | Self::InvalidAllowedOriginHeader(_) => write!(
                f,
                "BACKEND_ALLOWED_ORIGIN must be a valid origin like http://localhost:3000"
            ),
            Self::Store(error) => write!(f, "failed to initialize store: {error}"),
        }
    }
}

impl Error for AppBuildError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidAllowedOriginSyntax => None,
            Self::InvalidAllowedOriginHeader(error) => Some(error),
            Self::Store(error) => Some(error),
        }
    }
}

impl From<StoreError> for AppBuildError {
    fn from(value: StoreError) -> Self {
        Self::Store(value)
    }
}

pub async fn build_app(allowed_origin: &str) -> Result<Router, AppBuildError> {
    build_app_with_options(allowed_origin, AppBuildOptions::default()).await
}

pub async fn build_app_with_database_url(
    allowed_origin: &str,
    database_url: &str,
) -> Result<Router, AppBuildError> {
    build_app_with_store(
        allowed_origin,
        Store::from_database_url(database_url).await?,
        AppBuildOptions::default(),
    )
    .await
}

pub async fn build_app_with_options(
    allowed_origin: &str,
    options: AppBuildOptions,
) -> Result<Router, AppBuildError> {
    build_app_with_store(allowed_origin, Store::from_env().await?, options).await
}

async fn build_app_with_store(
    allowed_origin: &str,
    store: Store,
    options: AppBuildOptions,
) -> Result<Router, AppBuildError> {
    let allowed_origins = parse_allowed_origins(allowed_origin)?;
    let realtime_state = RealtimeState::new(allowed_origins.clone());
    let AppBuildOptions { publish_config } = options;
    let runtime_ingest_token = env::var("RUNTIME_INGEST_TOKEN").ok().and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    let app_state = AppState {
        store,
        publish: PublishRuntime::default(),
        publish_config,
        realtime: realtime_state,
        runtime_ingest_token,
        runtime_ingest_state: RuntimeIngestState::default(),
    };

    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/api/v1/site/bootstrap", get(bootstrap))
        .route("/api/v1/site/home-workspace", get(admin::get_home_workspace))
        .route("/api/v1/admin/overview", get(admin::get_overview))
        .route("/api/v1/admin/bootstrap", get(admin::get_editor_bootstrap))
        .route(
            "/api/v1/admin/workspaces",
            get(admin::list_workspaces).post(admin::create_workspace),
        )
        .route(
            "/api/v1/admin/workspaces/:id",
            get(admin::get_workspace)
                .put(admin::update_workspace)
                .delete(admin::delete_workspace),
        )
        .route(
            "/api/v1/admin/publish",
            get(admin::get_publish_status).post(admin::post_publish),
        )
        .route(
            "/api/v1/admin/scene",
            get(admin::get_scene).put(admin::put_scene),
        )
        .route("/api/v1/admin/editor-save", post(admin::post_editor_save))
        .route(
            "/api/v1/admin/entities",
            get(admin::list_entities).post(admin::create_entity),
        )
        .route(
            "/api/v1/admin/entities/:id",
            get(admin::get_entity)
                .put(admin::update_entity)
                .delete(admin::delete_entity),
        )
        .route(
            "/api/v1/admin/entity-categories",
            get(admin::list_entity_categories).post(admin::create_entity_category),
        )
        .route(
            "/api/v1/admin/entity-categories/:id",
            get(admin::get_entity_category)
                .put(admin::update_entity_category)
                .delete(admin::delete_entity_category),
        )
        .route(
            "/api/v1/admin/entity-archetypes",
            get(admin::list_entity_archetypes).post(admin::create_entity_archetype),
        )
        .route(
            "/api/v1/admin/entity-archetypes/:id",
            get(admin::get_entity_archetype)
                .put(admin::update_entity_archetype)
                .delete(admin::delete_entity_archetype),
        )
        .route(
            "/api/v1/admin/model-assets/upload",
            post(admin::upload_model_asset),
        )
        .route(
            "/api/v1/admin/static-assets",
            get(admin::list_static_assets).post(admin::create_static_asset),
        )
        .route(
            "/api/v1/admin/static-assets/:id",
            get(admin::get_static_asset)
                .put(admin::update_static_asset)
                .delete(admin::delete_static_asset),
        )
        .route(
            "/api/v1/admin/entities/:id/bindings",
            get(admin::list_entity_bindings).put(admin::replace_entity_bindings),
        )
        .route(
            "/api/v1/admin/data-sources",
            get(admin::list_data_sources).post(admin::create_data_source),
        )
        .route(
            "/api/v1/admin/data-sources/:id",
            put(admin::update_data_source).delete(admin::delete_data_source),
        )
        .route("/api/v1/admin/alarms", get(admin::list_alarms))
        .route("/api/v1/admin/audit", get(admin::list_audit_events))
        .route(
            "/api/v1/admin/rules",
            get(admin::list_rules).post(admin::create_rule),
        )
        .route(
            "/api/v1/admin/rules/:id",
            get(admin::get_rule)
                .put(admin::update_rule)
                .delete(admin::delete_rule),
        )
        .route(
            "/api/v1/admin/rules/:id/validate",
            post(admin::validate_rule),
        )
        .route("/api/v1/runtime/ingest", post(post_runtime_ingest))
        .route("/ws/realtime", get(realtime_ws_handler))
        .with_state(app_state)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(allowed_origins))
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::AUTHORIZATION,
                    HeaderName::from_static("x-runtime-ingest-token"),
                ]),
        )
        .layer(TraceLayer::new_for_http()))
}

fn parse_allowed_origins(allowed_origin: &str) -> Result<Vec<HeaderValue>, AppBuildError> {
    let origins = allowed_origin
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(parse_allowed_origin_item)
        .collect::<Result<Vec<_>, _>>()?;

    if origins.is_empty() {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    }

    Ok(origins)
}

fn parse_allowed_origin_item(origin: &str) -> Result<HeaderValue, AppBuildError> {
    let uri = origin
        .parse::<Uri>()
        .map_err(|_| AppBuildError::InvalidAllowedOriginSyntax)?;
    let Some(scheme) = uri.scheme_str() else {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    };
    let Some(authority) = uri.authority() else {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    };

    if !matches!(scheme, "http" | "https") {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    }

    if origin != format!("{scheme}://{authority}") {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    }

    origin
        .parse::<HeaderValue>()
        .map_err(AppBuildError::InvalidAllowedOriginHeader)
}
