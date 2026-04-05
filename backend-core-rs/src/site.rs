use axum::{extract::State, Json};

use crate::{app::AppState, contracts::BootstrapResponse};

pub(crate) async fn bootstrap(
    State(state): State<AppState>,
) -> Result<Json<BootstrapResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let payload = state.store.bootstrap().await.map_err(|error| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
    })?;

    Ok(Json(payload))
}
