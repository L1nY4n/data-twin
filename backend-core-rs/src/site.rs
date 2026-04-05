use axum::{extract::State, Json};

use crate::{
    app::AppState, contracts::BootstrapResponse, published_scene::load_published_scene_descriptor,
};

pub(crate) async fn bootstrap(
    State(state): State<AppState>,
) -> Result<Json<BootstrapResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let mut payload = state.store.bootstrap().await.map_err(|error| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
    })?;
    payload.published_scene = load_published_scene_descriptor();

    Ok(Json(payload))
}
