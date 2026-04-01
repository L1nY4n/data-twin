use std::{error::Error, fmt};

use axum::{
    http::{header::InvalidHeaderValue, HeaderValue, Method, Uri},
    routing::get,
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::health::{live, ready};
use crate::realtime::{realtime_ws_handler, RealtimeState};
use crate::site::bootstrap;

#[derive(Debug)]
pub enum AppBuildError {
    InvalidAllowedOriginSyntax,
    InvalidAllowedOriginHeader(InvalidHeaderValue),
}

impl fmt::Display for AppBuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidAllowedOriginSyntax | Self::InvalidAllowedOriginHeader(_) => write!(
                f,
                "BACKEND_ALLOWED_ORIGIN must be a valid origin like http://localhost:3000"
            ),
        }
    }
}

impl Error for AppBuildError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidAllowedOriginSyntax => None,
            Self::InvalidAllowedOriginHeader(error) => Some(error),
        }
    }
}

pub fn build_app(allowed_origin: &str) -> Result<Router, AppBuildError> {
    let allowed_origin = parse_allowed_origin(allowed_origin)?;
    let realtime_state = RealtimeState::new();

    Ok(Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/api/v1/site/bootstrap", get(bootstrap))
        .route("/ws/realtime", get(realtime_ws_handler))
        .with_state(realtime_state)
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origin)
                .allow_methods([Method::GET]),
        )
        .layer(TraceLayer::new_for_http()))
}

fn parse_allowed_origin(allowed_origin: &str) -> Result<HeaderValue, AppBuildError> {
    let uri = allowed_origin
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

    if allowed_origin != format!("{scheme}://{authority}") {
        return Err(AppBuildError::InvalidAllowedOriginSyntax);
    }

    allowed_origin
        .parse::<HeaderValue>()
        .map_err(AppBuildError::InvalidAllowedOriginHeader)
}
