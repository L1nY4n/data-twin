use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn bootstrap_endpoint_returns_seeded_site_payload() {
    let response = backend_core_rs::app::build_app("http://localhost:3000")
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

    let entities = body["entities"].as_array().unwrap();
    assert_eq!(entities.len(), 4);

    let entity_ids = entities
        .iter()
        .map(|entity| entity["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        entity_ids,
        vec![
            "zone-workshop-01",
            "person-operator-01",
            "vehicle-forklift-01",
            "equipment-cnc-01",
        ]
    );

    let rules = body["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0]["id"], "rule-zone-warning-01");
    assert_eq!(rules[0]["nodes"][0]["type"], "input");
    assert_eq!(rules[0]["nodes"][0]["data"]["nodeType"], "trigger-location");

    assert_eq!(body["alarms"], serde_json::json!([]));
    assert!(body["issuedAt"].is_number());
}
