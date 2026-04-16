use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sqlx::SqlitePool;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tower::ServiceExt;

#[tokio::test]
async fn bootstrap_endpoint_returns_seeded_site_payload() {
    let response = backend_core_rs::app::build_app_with_database_url(
        "http://localhost:3000",
        "sqlite::memory:",
    )
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
    assert!(body["publishedScene"]["staticAssetManifestUrl"]
        .as_str()
        .unwrap()
        .ends_with("/chunk-manifest.json"));
    assert!(body["publishedScene"]["sceneId"].is_string());
    assert!(body["publishedScene"]["packageVersion"].is_string());
    assert!(body["publishedScene"]["generatedAt"].is_string());

    let stable_alias_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../public/generated/published-static/published-scene-package.json");
    let stable_alias_body = serde_json::from_str::<serde_json::Value>(
        &fs::read_to_string(&stable_alias_path).expect("stable alias package should exist"),
    )
    .expect("stable alias package should parse");
    assert_eq!(stable_alias_body["sceneId"], body["publishedScene"]["sceneId"]);
    assert!(
        stable_alias_body["sectors"].as_array().unwrap().len() > 1,
        "stable alias should point at the large campus package"
    );
    assert!(
        stable_alias_body["routingLayers"].as_array().unwrap().len() > 0,
        "stable alias should preserve routing layers"
    );

    let entities = body["entities"].as_array().unwrap();
    assert!(entities.len() >= 15);
    assert_eq!(body["staticAssets"], serde_json::json!([]));
    assert_eq!(body["entityCategories"], serde_json::json!([]));
    assert_eq!(body["entityArchetypes"], serde_json::json!([]));

    let entity_ids = entities
        .iter()
        .map(|entity| entity["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    for expected_id in [
        "zone-workshop-01",
        "person-operator-01",
        "vehicle-forklift-01",
        "vehicle-forklift-02",
        "vehicle-forklift-03",
        "vehicle-forklift-04",
        "vehicle-forklift-05",
        "vehicle-truck-01",
        "vehicle-truck-02",
        "vehicle-truck-03",
        "sensor-temp-reactor-01",
        "sensor-gas-loading-01",
        "sensor-pressure-pump-01",
        "camera-gate-fixed-01",
        "camera-yard-ptz-01",
    ] {
        assert!(entity_ids.contains(&expected_id));
    }
    assert!(!entity_ids.contains(&"equipment-cnc-01"));

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
    assert_eq!(
        entities_by_id["vehicle-forklift-01"]["routeTrack"]["routeId"],
        "factory-yard-circulation"
    );
    assert_eq!(
        entities_by_id["vehicle-forklift-01"]["routeTrack"]["trackId"],
        "forklift-track-01"
    );
    assert_eq!(
        entities_by_id["vehicle-forklift-01"]["trackPosition"]["nextWaypointIndex"],
        1
    );
    assert!(
        entities_by_id["vehicle-forklift-01"]["routeTrack"]["waypoints"]
            .as_array()
            .unwrap()
            .len()
            >= 5
    );
    assert_eq!(
        entities_by_id["vehicle-forklift-01"]["routeTrack"]["waypoints"][0],
        serde_json::json!({ "x": -92.0, "y": 0.0, "z": 54.0 })
    );
    assert_eq!(
        entities_by_id["vehicle-forklift-01"]["routeTrack"]["waypoints"][6],
        serde_json::json!({ "x": 86.0, "y": 0.0, "z": -72.0 })
    );
    assert_eq!(
        entities_by_id["vehicle-forklift-04"]["routeTrack"]["waypoints"][0],
        serde_json::json!({ "x": 0.0, "y": 0.0, "z": 32.0 })
    );
    assert_eq!(
        entities_by_id["vehicle-truck-01"]["routeTrack"]["routeId"],
        "factory-yard-logistics"
    );
    assert_eq!(
        entities_by_id["vehicle-truck-01"]["routeTrack"]["trackId"],
        "truck-track-01"
    );
    assert_eq!(
        entities_by_id["vehicle-truck-01"]["trackPosition"]["nextWaypointIndex"],
        1
    );
    assert_eq!(
        entities_by_id["vehicle-truck-01"]["routeTrack"]["waypoints"][0],
        serde_json::json!({ "x": -44.0, "y": 0.0, "z": 54.0 })
    );
    assert_eq!(
        entities_by_id["vehicle-truck-01"]["routeTrack"]["waypoints"][1],
        serde_json::json!({ "x": -44.0, "y": 0.0, "z": 92.0 })
    );

    let rules = body["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0]["id"], "rule-zone-warning-01");
    assert_eq!(rules[0]["nodes"][0]["type"], "input");
    assert_eq!(rules[0]["nodes"][0]["data"]["nodeType"], "trigger-location");

    assert_eq!(body["alarms"], serde_json::json!([]));
    assert!(body["issuedAt"].is_number());
}

#[tokio::test]
async fn bootstrap_endpoint_recovers_when_published_state_row_is_missing() {
    let (database_url, database_path) = init_file_test_database_url("bootstrap-backfill");
    let app =
        backend_core_rs::app::build_app_with_database_url("http://localhost:3000", &database_url)
            .await
            .expect("valid allowed origin should build the app");

    let pool = SqlitePool::connect(&database_url)
        .await
        .expect("temp sqlite database should connect");
    sqlx::query("DELETE FROM published_state WHERE site_id = ?")
        .bind("factory-demo-site")
        .execute(&pool)
        .await
        .expect("published_state row should be removable");

    let response = app
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

    let published_state_rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM published_state WHERE site_id = ?")
            .bind("factory-demo-site")
            .fetch_one(&pool)
            .await
            .expect("published_state row should be recreated");
    assert_eq!(published_state_rows, 1);

    drop(pool);
    let _ = fs::remove_file(database_path);
}

#[tokio::test]
async fn workspace_scoped_bootstrap_and_scene_updates_are_isolated() {
    let app = backend_core_rs::app::build_app_with_database_url(
        "http://localhost:3000",
        "sqlite::memory:",
    )
    .await
    .expect("valid allowed origin should build the app");

    let create_workspace_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/admin/workspaces")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "id": "workspace-b",
                        "slug": "workspace-b",
                        "name": "Workspace B",
                        "description": "secondary workspace",
                        "isHomepage": false,
                        "createdAt": 0,
                        "updatedAt": 0
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_workspace_response.status(), StatusCode::OK);

    let slug_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/workspaces/by-slug/workspace-b")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(slug_response.status(), StatusCode::OK);
    let slug_body = slug_response.into_body().collect().await.unwrap().to_bytes();
    let slug_body = serde_json::from_slice::<serde_json::Value>(&slug_body).unwrap();
    assert_eq!(slug_body["id"], "workspace-b");
    assert_eq!(slug_body["slug"], "workspace-b");

    let workspace_bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/workspaces/workspace-b/editor/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(workspace_bootstrap_response.status(), StatusCode::OK);
    let workspace_bootstrap_body = workspace_bootstrap_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let workspace_bootstrap_body =
        serde_json::from_slice::<serde_json::Value>(&workspace_bootstrap_body).unwrap();
    assert_eq!(workspace_bootstrap_body["workspaceId"], "workspace-b");
    assert_eq!(workspace_bootstrap_body["workspaceSlug"], "workspace-b");
    assert_eq!(workspace_bootstrap_body["sceneConfig"]["id"], "workspace-b");
    assert_eq!(workspace_bootstrap_body["sceneConfig"]["name"], "Workspace B");

    let mut next_scene = workspace_bootstrap_body["sceneConfig"].clone();
    next_scene["backgroundColor"] = serde_json::json!("#123456");
    next_scene["name"] = serde_json::json!("Workspace B Scene");

    let update_scene_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/v1/workspaces/workspace-b/scene")
                .header("content-type", "application/json")
                .body(Body::from(next_scene.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_scene_response.status(), StatusCode::OK);

    let workspace_after_update = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/workspaces/workspace-b/editor/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let workspace_after_update_body = workspace_after_update
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let workspace_after_update_body =
        serde_json::from_slice::<serde_json::Value>(&workspace_after_update_body).unwrap();
    assert_eq!(workspace_after_update_body["sceneConfig"]["backgroundColor"], "#123456");
    assert_eq!(workspace_after_update_body["sceneConfig"]["name"], "Workspace B Scene");
    assert_eq!(workspace_after_update_body["sceneVersion"], 2);

    let default_workspace_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/workspaces/factory-demo-scene/editor/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let default_workspace_body = default_workspace_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let default_workspace_body =
        serde_json::from_slice::<serde_json::Value>(&default_workspace_body).unwrap();
    assert_eq!(default_workspace_body["workspaceId"], "factory-demo-scene");
    assert_eq!(default_workspace_body["sceneConfig"]["name"], "工厂演示场景");
    assert_eq!(default_workspace_body["sceneConfig"]["backgroundColor"], "#0a0a0f");
}

fn init_file_test_database_url(label: &str) -> (String, PathBuf) {
    let path = unique_test_db_path(label);
    let url = format!("sqlite://{}?mode=rwc", path.display());
    (url, path)
}

fn unique_test_db_path(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "backend-core-rs-{label}-{}-{nonce}.db",
        std::process::id()
    ));

    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).unwrap();
    }

    path
}
