use std::{error::Error, fmt};

use axum::{
    http::{header::InvalidHeaderValue, HeaderValue, Method},
    routing::get,
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::health::{live, ready};

#[derive(Debug)]
pub enum AppBuildError {
    InvalidAllowedOrigin(InvalidHeaderValue),
}

impl fmt::Display for AppBuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidAllowedOrigin(_) => {
                write!(f, "BACKEND_ALLOWED_ORIGIN must be a valid header value")
            }
        }
    }
}

impl Error for AppBuildError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidAllowedOrigin(error) => Some(error),
        }
    }
}

pub fn build_app(allowed_origin: &str) -> Result<Router, AppBuildError> {
    let allowed_origin = allowed_origin
        .parse::<HeaderValue>()
        .map_err(AppBuildError::InvalidAllowedOrigin)?;

    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origin)
                .allow_methods([Method::GET]),
        )
        .layer(TraceLayer::new_for_http()))
}
