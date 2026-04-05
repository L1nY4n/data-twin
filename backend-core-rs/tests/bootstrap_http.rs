use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use std::collections::HashMap;
use tower::ServiceExt;

#[tokio::test]
async fn bootstrap_endpoint_returns_seeded_site_payload() {
    init_test_database_url();
    let response = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("valid allowed origin should build the app")
        .oneshot(
            Request::builder()
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body = serde_json::from_slice::<serde_json::Value>(&body).unwrap();

    assert_eq!(body["siteId"], "factory-demo-site");
    assert_eq!(body["sceneConfig"]["id"], "factory-demo-scene");
    assert_eq!(
        body["publishedScene"]["packageUrl"],
        "/generated/published-static/published-scene-package.json"
    );
    assert_eq!(
        body["publishedScene"]["staticAssetManifestUrl"],
        "/generated/published-static/chunk-manifest.json"
    );
    assert_eq!(body["publishedScene"]["sceneId"], "chemical-plant-campus");
    assert!(body["publishedScene"]["packageVersion"].is_string());
    assert!(body["publishedScene"]["generatedAt"].is_string());

    let entities = body["entities"].as_array().unwrap();
    assert!(entities.len() >= 9);
    assert_eq!(body["staticAssets"], serde_json::json!([]));

    let entity_ids = entities
        .iter()
        .map(|entity| entity["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    for expected_id in [
        "zone-workshop-01",
        "person-operator-01",
        "vehicle-forklift-01",
        "equipment-cnc-01",
        "sensor-temp-reactor-01",
        "sensor-gas-loading-01",
        "sensor-pressure-pump-01",
        "camera-gate-fixed-01",
        "camera-yard-ptz-01",
    ] {
        assert!(entity_ids.contains(&expected_id));
    }

    let entities_by_id = entities
        .iter()
        .map(|entity| (entity["id"].as_str().unwrap(), entity))
        .collect::<HashMap<_, _>>();
    assert_eq!(entities_by_id["sensor-temp-reactor-01"]["type"], "sensor");
    assert_eq!(
        entities_by_id["sensor-temp-reactor-01"]["sensorType"],
        "temperature"
    );
    assert_eq!(entities_by_id["sensor-gas-loading-01"]["status"], "warning");
    assert_eq!(entities_by_id["camera-gate-fixed-01"]["type"], "camera");
    assert_eq!(
        entities_by_id["camera-gate-fixed-01"]["cameraType"],
        "fixed"
    );
    assert_eq!(entities_by_id["camera-yard-ptz-01"]["cameraType"], "ptz");
    assert_eq!(entities_by_id["camera-yard-ptz-01"]["recording"], true);

    let rules = body["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0]["id"], "rule-zone-warning-01");
    assert_eq!(rules[0]["nodes"][0]["type"], "input");
    assert_eq!(rules[0]["nodes"][0]["data"]["nodeType"], "trigger-location");

    assert_eq!(body["alarms"], serde_json::json!([]));
    assert!(body["issuedAt"].is_number());
}

fn init_test_database_url() {
    std::env::set_var("DATABASE_URL", "sqlite::memory:");
}
