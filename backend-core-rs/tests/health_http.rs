use axum::{
    body::Body,
    http::{
        header::{ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN},
        Request, StatusCode,
    },
};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn live_health_returns_ok_status_payload() {
    let allowed_origin = "http://localhost:3000";
    let response = backend_core_rs::app::build_app(allowed_origin)
        .expect("valid allowed origin should build the app")
        .oneshot(
            Request::builder()
                .uri("/health/live")
                .header(ORIGIN, allowed_origin)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(),
        allowed_origin
    );
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
        json!({"status": "ok"})
    );
}

#[tokio::test]
async fn ready_health_returns_ready_status_payload() {
    let response = backend_core_rs::app::build_app("http://localhost:3000")
        .expect("valid allowed origin should build the app")
        .oneshot(
            Request::builder()
                .uri("/health/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
        json!({"status": "ready"})
    );
}

#[test]
fn malformed_allowed_origins_return_syntax_errors() {
    let cases = [
        "localhost:3000",
        "http://localhost:3000/",
        "http://localhost:3000/path",
        "ftp://localhost:3000",
    ];

    for case in cases {
        let result = backend_core_rs::app::build_app(case);

        assert!(
            matches!(
                result,
                Err(backend_core_rs::app::AppBuildError::InvalidAllowedOriginSyntax)
            ),
            "{case} should return InvalidAllowedOriginSyntax, got {result:?}"
        );
    }
}
