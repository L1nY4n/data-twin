use std::{env, error::Error, fmt};

use axum::{
    body::Body,
    extract::State,
    http::{
        header, header::InvalidHeaderValue, HeaderName, HeaderValue, Method, Request, StatusCode,
        Uri,
    },
    middleware::{self, Next},
    response::Response,
    routing::{get, post, put},
    Json, Router,
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
    realtime::{
        issue_realtime_ticket, realtime_ws_handler, workspace_realtime_ws_handler, RealtimeState,
    },
    runtime_ingest::{post_runtime_ingest, post_workspace_runtime_ingest, RuntimeIngestState},
    site::{bootstrap, workspace_bootstrap, workspace_by_slug},
    store::{Store, StoreError},
};

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub publish: PublishRuntime,
    pub publish_config: PublishConfig,
    pub realtime: RealtimeState,
    pub admin_api_token: Option<String>,
    pub realtime_access_token: Option<String>,
    pub runtime_ingest_token: Option<String>,
    pub runtime_ingest_state: RuntimeIngestState,
}

#[derive(Clone, Debug, Default)]
pub struct AppBuildOptions {
    pub publish_config: PublishConfig,
}

fn read_optional_secret_env(name: &str) -> Option<String> {
    env::var(name).ok().and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn request_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get("x-admin-api-token")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        })
}

async fn require_admin_api_token(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let Some(expected_token) = &state.admin_api_token else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "error": "admin API is disabled until BACKEND_ADMIN_API_TOKEN is configured" }),
            ),
        ));
    };

    if request_token(request.headers()) != Some(expected_token.as_str()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "admin API token is invalid" })),
        ));
    }

    Ok(next.run(request).await)
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
    let admin_api_token = read_optional_secret_env("BACKEND_ADMIN_API_TOKEN");
    let realtime_access_token = read_optional_secret_env("BACKEND_REALTIME_ACCESS_TOKEN");
    let runtime_ingest_token = read_optional_secret_env("RUNTIME_INGEST_TOKEN");

    let app_state = AppState {
        store,
        publish: PublishRuntime::default(),
        publish_config,
        realtime: realtime_state,
        admin_api_token,
        realtime_access_token,
        runtime_ingest_token,
        runtime_ingest_state: RuntimeIngestState::default(),
    };
    let workspace_admin_routes = Router::new()
        .route(
            "/:workspaceId/editor/bootstrap",
            get(admin::get_workspace_editor_bootstrap),
        )
        .route(
            "/:workspaceId/scene",
            get(admin::get_workspace_scene).put(admin::put_workspace_scene),
        )
        .route(
            "/:workspaceId/admin/overview",
            get(admin::get_workspace_overview),
        )
        .route("/:workspaceId/modules", get(admin::list_workspace_modules))
        .route(
            "/:workspaceId/editor-save",
            post(admin::post_workspace_editor_save),
        )
        .route(
            "/:workspaceId/entities",
            get(admin::list_workspace_entities).post(admin::create_workspace_entity),
        )
        .route(
            "/:workspaceId/entities/:id",
            get(admin::get_workspace_entity)
                .put(admin::update_workspace_entity)
                .delete(admin::delete_workspace_entity),
        )
        .route(
            "/:workspaceId/static-assets",
            get(admin::list_workspace_static_assets).post(admin::create_workspace_static_asset),
        )
        .route(
            "/:workspaceId/static-assets/:id",
            get(admin::get_workspace_static_asset)
                .put(admin::update_workspace_static_asset)
                .delete(admin::delete_workspace_static_asset),
        )
        .route(
            "/:workspaceId/entities/:id/bindings",
            get(admin::list_workspace_entity_bindings)
                .put(admin::replace_workspace_entity_bindings),
        )
        .route(
            "/:workspaceId/data-sources",
            get(admin::list_workspace_data_sources).post(admin::create_workspace_data_source),
        )
        .route(
            "/:workspaceId/data-sources/:id",
            put(admin::update_workspace_data_source).delete(admin::delete_workspace_data_source),
        )
        .route("/:workspaceId/alarms", get(admin::list_workspace_alarms))
        .route(
            "/:workspaceId/audit",
            get(admin::list_workspace_audit_events),
        )
        .route(
            "/:workspaceId/rules",
            get(admin::list_workspace_rules).post(admin::create_workspace_rule),
        )
        .route(
            "/:workspaceId/rules/:id",
            get(admin::get_workspace_rule)
                .put(admin::update_workspace_rule)
                .delete(admin::delete_workspace_rule),
        )
        .route(
            "/:workspaceId/rules/:id/validate",
            post(admin::validate_workspace_rule),
        )
        .route(
            "/:workspaceId/publish",
            get(admin::get_workspace_publish_status).post(admin::post_workspace_publish),
        )
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            require_admin_api_token,
        ));

    let global_admin_routes = Router::new()
        .route("/overview", get(admin::get_overview))
        .route("/bootstrap", get(admin::get_editor_bootstrap))
        .route(
            "/workspaces",
            get(admin::list_workspaces).post(admin::create_workspace),
        )
        .route(
            "/workspaces/:id",
            get(admin::get_workspace)
                .put(admin::update_workspace)
                .delete(admin::delete_workspace),
        )
        .route(
            "/publish",
            get(admin::get_publish_status).post(admin::post_publish),
        )
        .route("/scene", get(admin::get_scene).put(admin::put_scene))
        .route("/editor-save", post(admin::post_editor_save))
        .route(
            "/entities",
            get(admin::list_entities).post(admin::create_entity),
        )
        .route(
            "/entities/:id",
            get(admin::get_entity)
                .put(admin::update_entity)
                .delete(admin::delete_entity),
        )
        .route(
            "/entity-categories",
            get(admin::list_entity_categories).post(admin::create_entity_category),
        )
        .route(
            "/entity-categories/:id",
            get(admin::get_entity_category)
                .put(admin::update_entity_category)
                .delete(admin::delete_entity_category),
        )
        .route(
            "/entity-archetypes",
            get(admin::list_entity_archetypes).post(admin::create_entity_archetype),
        )
        .route(
            "/entity-archetypes/:id",
            get(admin::get_entity_archetype)
                .put(admin::update_entity_archetype)
                .delete(admin::delete_entity_archetype),
        )
        .route("/model-assets/upload", post(admin::upload_model_asset))
        .route(
            "/static-assets",
            get(admin::list_static_assets).post(admin::create_static_asset),
        )
        .route(
            "/static-assets/:id",
            get(admin::get_static_asset)
                .put(admin::update_static_asset)
                .delete(admin::delete_static_asset),
        )
        .route(
            "/entities/:id/bindings",
            get(admin::list_entity_bindings).put(admin::replace_entity_bindings),
        )
        .route(
            "/data-sources",
            get(admin::list_data_sources).post(admin::create_data_source),
        )
        .route(
            "/data-sources/:id",
            put(admin::update_data_source).delete(admin::delete_data_source),
        )
        .route("/alarms", get(admin::list_alarms))
        .route("/audit", get(admin::list_audit_events))
        .route("/rules", get(admin::list_rules).post(admin::create_rule))
        .route(
            "/rules/:id",
            get(admin::get_rule)
                .put(admin::update_rule)
                .delete(admin::delete_rule),
        )
        .route("/rules/:id/validate", post(admin::validate_rule))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            require_admin_api_token,
        ));
    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/api/v1/site/bootstrap", get(bootstrap))
        .route(
            "/api/v1/site/home-workspace",
            get(admin::get_home_workspace),
        )
        .route("/api/v1/workspaces/by-slug/:slug", get(workspace_by_slug))
        .route(
            "/api/v1/workspaces/:workspaceId/runtime/bootstrap",
            get(workspace_bootstrap),
        )
        .nest("/api/v1/workspaces", workspace_admin_routes)
        .nest("/api/v1/admin", global_admin_routes)
        .route("/api/v1/runtime/ingest", post(post_runtime_ingest))
        .route("/api/v1/realtime/ticket", post(issue_realtime_ticket))
        .route(
            "/api/v1/workspaces/:workspaceId/runtime/ingest",
            post(post_workspace_runtime_ingest),
        )
        .route("/ws/realtime", get(realtime_ws_handler))
        .route(
            "/ws/workspaces/:workspaceId/realtime",
            get(workspace_realtime_ws_handler),
        )
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
                    HeaderName::from_static("x-admin-api-token"),
                    HeaderName::from_static("x-realtime-access-token"),
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
