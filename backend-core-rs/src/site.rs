use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};

use crate::{
    app::AppState,
    contracts::{BootstrapResponse, WorkspaceRecord},
};

pub(crate) async fn bootstrap(
    State(state): State<AppState>,
) -> Result<Json<BootstrapResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    state
        .store
        .ensure_legacy_published_state_alias()
        .await
        .map_err(|error| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
        })?;
    let payload = state.store.bootstrap().await.map_err(|error| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
    })?;

    Ok(Json(payload))
}

pub(crate) async fn workspace_bootstrap(
    Path(workspace_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<BootstrapResponse>, (StatusCode, Json<serde_json::Value>)> {
    let payload = state
        .store
        .workspace_bootstrap(&workspace_id)
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
        })?;

    Ok(Json(payload))
}

pub(crate) async fn workspace_by_slug(
    Path(slug): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<WorkspaceRecord>, (StatusCode, Json<serde_json::Value>)> {
    let workspace = state
        .store
        .get_workspace_by_slug(&slug)
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": format!("workspace slug {slug} not found") })),
            )
        })?;

    Ok(Json(workspace))
}
