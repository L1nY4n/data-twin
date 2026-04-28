use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use tower::ServiceExt;

const ADMIN_API_TOKEN: &str = "test-admin-api-token";

#[tokio::test]
async fn admin_routes_fail_closed_until_token_is_configured() {
    std::env::set_var("DATABASE_URL", "sqlite::memory:");
    std::env::remove_var("BACKEND_ADMIN_API_TOKEN");
    let disabled_app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let disabled_response = disabled_app
        .oneshot(admin_request(None))
        .await
        .expect("request should complete");
    assert_eq!(disabled_response.status(), StatusCode::SERVICE_UNAVAILABLE);

    std::env::set_var("DATABASE_URL", "sqlite::memory:");
    std::env::set_var("BACKEND_ADMIN_API_TOKEN", ADMIN_API_TOKEN);
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let missing_token = app
        .clone()
        .oneshot(admin_request(None))
        .await
        .expect("request should complete");
    assert_eq!(missing_token.status(), StatusCode::UNAUTHORIZED);

    let wrong_token = app
        .clone()
        .oneshot(admin_request(Some("wrong-token")))
        .await
        .expect("request should complete");
    assert_eq!(wrong_token.status(), StatusCode::UNAUTHORIZED);

    let valid_token = app
        .oneshot(admin_request(Some(ADMIN_API_TOKEN)))
        .await
        .expect("request should complete");
    assert_eq!(valid_token.status(), StatusCode::OK);
}

fn admin_request(token: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/admin/scene");
    if let Some(token) = token {
        builder = builder.header("x-admin-api-token", token);
    }
    builder.body(Body::empty()).unwrap()
}
