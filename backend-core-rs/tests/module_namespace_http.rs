use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

const ADMIN_API_TOKEN: &str = "test-admin-api-token";

#[tokio::test]
async fn workspace_module_namespace_lists_built_in_modules() {
    std::env::set_var("BACKEND_ADMIN_API_TOKEN", ADMIN_API_TOKEN);
    let app = backend_core_rs::app::build_app_with_database_url(
        "http://localhost:3000",
        "sqlite::memory:",
    )
    .await
    .expect("valid allowed origin should build the app");

    let response = app
        .oneshot(
            admin_request_builder()
                .uri("/api/v1/workspaces/factory-demo-scene/modules")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body = serde_json::from_slice::<serde_json::Value>(&body).unwrap();
    let modules = body
        .as_array()
        .expect("modules should serialize as an array");

    assert!(modules
        .iter()
        .any(|module| module["key"] == serde_json::json!("workspace-admin")));
    assert!(modules
        .iter()
        .any(|module| module["key"] == serde_json::json!("governance-center")));
}

fn admin_request_builder() -> axum::http::request::Builder {
    Request::builder().header("x-admin-api-token", ADMIN_API_TOKEN)
}
