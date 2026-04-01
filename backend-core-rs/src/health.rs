use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct StatusResponse {
    status: &'static str,
}

pub(crate) async fn live() -> Json<StatusResponse> {
    Json(StatusResponse { status: "ok" })
}

pub(crate) async fn ready() -> Json<StatusResponse> {
    Json(StatusResponse { status: "ready" })
}
