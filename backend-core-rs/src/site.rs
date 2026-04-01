use axum::Json;

use crate::{contracts::BootstrapResponse, seed_scene};

pub(crate) async fn bootstrap() -> Json<BootstrapResponse> {
    Json(seed_scene::build_bootstrap_response())
}
