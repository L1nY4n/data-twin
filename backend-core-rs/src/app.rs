use axum::{
    http::{HeaderValue, Method},
    routing::get,
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::health::{live, ready};

pub fn build_app(allowed_origin: &str) -> Router {
    let allowed_origin = allowed_origin
        .parse::<HeaderValue>()
        .expect("BACKEND_ALLOWED_ORIGIN must be a valid header value");

    Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origin)
                .allow_methods([Method::GET]),
        )
        .layer(TraceLayer::new_for_http())
}
