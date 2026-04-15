use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    http::{header::CONTENT_TYPE, Method, Request, StatusCode},
};
use backend_core_rs::app::{AppBuildOptions, PublishConfig};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[tokio::test]
async fn scene_update_increments_scene_version_but_site_bootstrap_stays_on_published_snapshot() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let scene_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(scene_response.status(), StatusCode::OK);
    let scene_body = parse_json(scene_response).await;
    let scene_version = scene_body["sceneVersion"].as_u64().unwrap();

    let mut scene_config = scene_body["sceneConfig"].clone();
    scene_config["name"] = json!("更新后的演示场景");

    let update_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/scene",
            scene_config,
        ))
        .await
        .unwrap();

    assert_eq!(update_response.status(), StatusCode::OK);
    let update_body = parse_json(update_response).await;
    assert_eq!(
        update_body["sceneVersion"].as_u64().unwrap(),
        scene_version + 1
    );
    assert_eq!(
        update_body["sceneConfig"]["name"],
        json!("更新后的演示场景")
    );

    let editor_bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(editor_bootstrap_response.status(), StatusCode::OK);
    let editor_bootstrap_body = parse_json(editor_bootstrap_response).await;
    assert_eq!(
        editor_bootstrap_body["sceneVersion"].as_u64().unwrap(),
        scene_version + 1
    );
    assert_eq!(
        editor_bootstrap_body["sceneConfig"]["name"],
        json!("更新后的演示场景")
    );

    let bootstrap_response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bootstrap_response.status(), StatusCode::OK);
    let bootstrap_body = parse_json(bootstrap_response).await;
    assert_eq!(
        bootstrap_body["sceneVersion"].as_u64().unwrap(),
        scene_version
    );
    assert_ne!(
        bootstrap_body["sceneConfig"]["name"],
        json!("更新后的演示场景")
    );
}

#[tokio::test]
async fn editor_save_commits_scene_and_static_asset_with_one_version_bump() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_scene.status(), StatusCode::OK);
    let initial_scene_body = parse_json(initial_scene).await;
    let initial_version = initial_scene_body["sceneVersion"].as_u64().unwrap();

    let save_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": initial_version,
              "sceneConfig": {
                "id": "editor-save-scene",
                "name": "事务保存场景",
                "gridSize": 96,
                "gridDivisions": 48,
                "backgroundColor": "#162230",
                "ambientLightIntensity": 0.57,
                "showAxes": true,
                "showGrid": false,
                "cameraPosition": {"x": 30.0, "y": 20.0, "z": 10.0},
                "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0}
              },
              "staticAsset": {
                "mode": "create",
                "staticAsset": {
                  "id": "editor-save-wall-01",
                  "name": "事务保存墙体",
                  "assetKind": "wall-system",
                  "variant": "solid-wall",
                  "position": {"x": 12.0, "y": 0.0, "z": -4.0},
                  "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "visible": true,
                  "metadata": {"catalogId": "wall-system-solid-wall"},
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(save_response.status(), StatusCode::OK);
    let save_body = parse_json(save_response).await;
    assert_eq!(save_body["sceneVersion"], json!(initial_version + 1));
    assert_eq!(save_body["sceneConfig"]["id"], json!("editor-save-scene"));
    assert_eq!(
        save_body["savedStaticAsset"]["id"],
        json!("editor-save-wall-01")
    );

    let editor_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(editor_bootstrap.status(), StatusCode::OK);
    let editor_bootstrap_body = parse_json(editor_bootstrap).await;
    assert_eq!(
        editor_bootstrap_body["sceneVersion"],
        json!(initial_version + 1)
    );
    assert_eq!(
        editor_bootstrap_body["sceneConfig"]["name"],
        json!("事务保存场景")
    );
    assert!(editor_bootstrap_body["staticAssets"]
        .as_array()
        .unwrap()
        .iter()
        .any(|asset| asset["id"] == json!("editor-save-wall-01")));
}

#[tokio::test]
async fn editor_save_rolls_back_scene_when_selection_create_fails() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let existing_entity_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "entity-save-duplicate-01",
              "type": "equipment",
              "name": "已存在设备",
              "position": {"x": 0.0, "y": 0.0, "z": 0.0},
              "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "status": "active",
              "visible": true,
              "metadata": {},
              "modelId": "",
              "parameters": {},
              "alarms": [],
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(existing_entity_response.status(), StatusCode::OK);

    let before_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(before_scene.status(), StatusCode::OK);
    let before_scene_body = parse_json(before_scene).await;
    let before_version = before_scene_body["sceneVersion"].as_u64().unwrap();
    let before_scene_id = before_scene_body["sceneConfig"]["id"].clone();

    let failed_save = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": before_version,
              "sceneConfig": {
                "id": "should-not-persist",
                "name": "失败后不应落库",
                "gridSize": 64,
                "gridDivisions": 32,
                "backgroundColor": "#000000",
                "ambientLightIntensity": 0.4,
                "showAxes": true,
                "showGrid": false,
                "cameraPosition": {"x": 30.0, "y": 20.0, "z": 10.0},
                "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0}
              },
              "entity": {
                "mode": "create",
                "entity": {
                  "id": "entity-save-duplicate-01",
                  "type": "equipment",
                  "name": "重复设备",
                  "position": {"x": 1.0, "y": 0.0, "z": 1.0},
                  "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "status": "active",
                  "visible": true,
                  "metadata": {},
                  "modelId": "",
                  "parameters": {},
                  "alarms": [],
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(failed_save.status(), StatusCode::BAD_REQUEST);
    let failed_save_body = parse_json(failed_save).await;
    assert!(failed_save_body["error"]
        .as_str()
        .unwrap()
        .contains("already exists"));

    let after_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(after_scene.status(), StatusCode::OK);
    let after_scene_body = parse_json(after_scene).await;
    assert_eq!(after_scene_body["sceneVersion"], json!(before_version));
    assert_eq!(after_scene_body["sceneConfig"]["id"], before_scene_id);
}

#[tokio::test]
async fn editor_save_rejects_stale_scene_versions_without_writing_changes() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_scene.status(), StatusCode::OK);
    let initial_scene_body = parse_json(initial_scene).await;
    let stale_version = initial_scene_body["sceneVersion"].as_u64().unwrap();

    let updated_scene = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/scene",
            json!({
              "id": "scene-fresh-version",
              "name": "Fresh scene version",
              "gridSize": 88,
              "gridDivisions": 44,
              "backgroundColor": "#112233",
              "ambientLightIntensity": 0.63,
              "showAxes": true,
              "showGrid": false,
              "cameraPosition": {"x": 18.0, "y": 12.0, "z": 16.0},
              "cameraTarget": {"x": 1.0, "y": 0.0, "z": -1.0}
            }),
        ))
        .await
        .unwrap();
    assert_eq!(updated_scene.status(), StatusCode::OK);
    let updated_scene_body = parse_json(updated_scene).await;
    let current_version = updated_scene_body["sceneVersion"].as_u64().unwrap();
    assert_eq!(current_version, stale_version + 1);

    let stale_save = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": stale_version,
              "sceneConfig": {
                "id": "scene-stale-save",
                "name": "Stale save should fail",
                "gridSize": 100,
                "gridDivisions": 50,
                "backgroundColor": "#221122",
                "ambientLightIntensity": 0.4,
                "showAxes": false,
                "showGrid": true,
                "cameraPosition": {"x": 30.0, "y": 20.0, "z": 10.0},
                "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0}
              },
              "entity": {
                "mode": "create",
                "entity": {
                  "id": "entity-stale-save-01",
                  "type": "equipment",
                  "name": "Stale save entity",
                  "position": {"x": 2.0, "y": 0.0, "z": 2.0},
                  "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "status": "active",
                  "visible": true,
                  "metadata": {},
                  "modelId": "",
                  "parameters": {},
                  "alarms": [],
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(stale_save.status(), StatusCode::CONFLICT);
    let stale_save_body = parse_json(stale_save).await;
    assert_eq!(stale_save_body["code"], json!("scene_version_conflict"));
    assert_eq!(
        stale_save_body["expectedSceneVersion"],
        json!(stale_version)
    );
    assert_eq!(
        stale_save_body["currentSceneVersion"],
        json!(current_version)
    );
    assert_eq!(stale_save_body["recoveryAction"], json!("reload"));
    assert!(stale_save_body["error"]
        .as_str()
        .unwrap()
        .contains("reload the editor and retry"));

    let final_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(final_scene.status(), StatusCode::OK);
    let final_scene_body = parse_json(final_scene).await;
    assert_eq!(final_scene_body["sceneVersion"], json!(current_version));
    assert_eq!(
        final_scene_body["sceneConfig"]["id"],
        json!("scene-fresh-version")
    );

    let entities_response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/entities")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(entities_response.status(), StatusCode::OK);
    let entities_body = parse_json(entities_response).await;
    assert!(!entities_body
        .as_array()
        .unwrap()
        .iter()
        .any(|entity| entity["id"] == json!("entity-stale-save-01")));
}

#[tokio::test]
async fn overview_alarm_and_audit_endpoints_reflect_admin_state() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_overview = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/overview")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_overview.status(), StatusCode::OK);
    let initial_overview_body = parse_json(initial_overview).await;
    assert_eq!(initial_overview_body["sceneVersion"], json!(1));
    assert_eq!(initial_overview_body["entityCount"], json!(15));
    assert_eq!(initial_overview_body["ruleCount"], json!(1));
    assert_eq!(initial_overview_body["connectorCount"], json!(0));
    assert_eq!(initial_overview_body["bindingCount"], json!(0));
    assert_eq!(initial_overview_body["unacknowledgedAlarmCount"], json!(0));

    let connector = json!({
      "id": "connector-overview-01",
      "name": "DCS OPCUA",
      "protocol": "opcua",
      "endpoint": "opc.tcp://127.0.0.1:4840",
      "authConfig": {"username": "demo"},
      "enabled": true,
      "createdAt": 0,
      "updatedAt": 0
    });
    let create_connector_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/data-sources",
            connector,
        ))
        .await
        .unwrap();
    assert_eq!(create_connector_response.status(), StatusCode::OK);

    let binding_payload = json!({
      "bindings": [
        {
          "bindingId": "",
          "entityId": "sensor-temp-reactor-01",
          "connectorId": "connector-overview-01",
          "sourcePath": "ns=2;s=Plant.Sensor.Temp01",
          "mapping": {"reading": "value"},
          "enabled": true,
          "createdAt": 0,
          "updatedAt": 0
        }
      ]
    });
    let replace_binding_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/entities/sensor-temp-reactor-01/bindings",
            binding_payload,
        ))
        .await
        .unwrap();
    assert_eq!(replace_binding_response.status(), StatusCode::OK);

    let overview_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/overview")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(overview_response.status(), StatusCode::OK);
    let overview_body = parse_json(overview_response).await;
    assert_eq!(overview_body["connectorCount"], json!(1));
    assert_eq!(overview_body["bindingCount"], json!(1));
    assert!(overview_body["recentChangeAt"].as_u64().is_some());

    let alarms_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/alarms")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(alarms_response.status(), StatusCode::OK);
    let alarms_body = parse_json(alarms_response).await;
    assert_eq!(alarms_body, json!([]));

    let audit_response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/audit")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(audit_response.status(), StatusCode::OK);
    let audit_body = parse_json(audit_response).await;
    let audit_events = audit_body.as_array().unwrap();
    assert!(audit_events
        .iter()
        .any(|event| event["action"] == json!("connector.create")));
    assert!(audit_events
        .iter()
        .any(|event| event["action"] == json!("binding.replace")));
}

#[tokio::test]
async fn entity_crud_and_binding_flow_works() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let new_entity = json!({
      "type": "person",
      "id": "person-test-01",
      "name": "测试人员",
      "position": {"x": 1.0, "y": 0.0, "z": 2.0},
      "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
      "status": "active",
      "visible": true,
      "metadata": {},
      "createdAt": 0,
      "updatedAt": 0,
      "role": "操作员",
      "department": "生产部",
      "avatar": null,
      "schedule": [],
      "currentActivity": "巡检"
    });

    let create_entity_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            new_entity,
        ))
        .await
        .unwrap();
    assert_eq!(create_entity_response.status(), StatusCode::OK);

    let get_entity_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/entities/person-test-01")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_entity_response.status(), StatusCode::OK);

    let connector = json!({
      "id": "connector-test-01",
      "name": "OPCUA接入",
      "protocol": "opcua",
      "endpoint": "opc.tcp://127.0.0.1:4840",
      "authConfig": {"username": "demo"},
      "enabled": true,
      "createdAt": 0,
      "updatedAt": 0
    });

    let create_connector_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/data-sources",
            connector,
        ))
        .await
        .unwrap();
    assert_eq!(create_connector_response.status(), StatusCode::OK);

    let binding_payload = json!({
      "bindings": [
        {
          "bindingId": "",
          "entityId": "person-test-01",
          "connectorId": "connector-test-01",
          "sourcePath": "ns=2;s=Channel1.Device1.Tag1",
          "mapping": {"status": "value"},
          "enabled": true,
          "createdAt": 0,
          "updatedAt": 0
        }
      ]
    });

    let replace_binding_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/entities/person-test-01/bindings",
            binding_payload,
        ))
        .await
        .unwrap();
    assert_eq!(replace_binding_response.status(), StatusCode::OK);

    let bindings_body = parse_json(replace_binding_response).await;
    assert_eq!(bindings_body.as_array().unwrap().len(), 1);

    let delete_entity_response = app
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/entities/person-test-01")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_entity_response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn static_asset_crud_and_bootstrap_flow_works() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let new_static_asset = json!({
      "id": "static-asset-tank-01",
      "name": "东侧立罐 A",
      "assetKind": "vertical-tank",
      "variant": "fixed-roof",
      "position": {"x": 38.0, "y": 0.0, "z": -20.0},
      "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
      "visible": true,
      "metadata": {"catalogId": "vertical-tank-fixed-roof"},
      "createdAt": 0,
      "updatedAt": 0
    });

    let create_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            new_static_asset,
        ))
        .await
        .unwrap();
    assert_eq!(create_response.status(), StatusCode::OK);
    let create_body = parse_json(create_response).await;
    assert_eq!(create_body["assetKind"], json!("vertical-tank"));
    assert!(create_body["createdAt"].as_u64().unwrap() > 0);

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/static-assets")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = parse_json(list_response).await;
    assert_eq!(list_body.as_array().unwrap().len(), 1);
    assert_eq!(list_body[0]["id"], json!("static-asset-tank-01"));

    let update_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/static-assets/static-asset-tank-01",
            json!({
              "id": "ignored-on-update",
              "name": "东侧立罐 A-更新",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 40.0, "y": 0.0, "z": -19.0},
              "rotation": {"x": 0.0, "y": 0.8, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {"catalogId": "vertical-tank-fixed-roof"},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);
    let update_body = parse_json(update_response).await;
    assert_eq!(update_body["id"], json!("static-asset-tank-01"));
    assert_eq!(update_body["name"], json!("东侧立罐 A-更新"));
    assert_eq!(update_body["position"]["x"], json!(40.0));

    let editor_bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(editor_bootstrap_response.status(), StatusCode::OK);
    let editor_bootstrap_body = parse_json(editor_bootstrap_response).await;
    let editor_static_assets = editor_bootstrap_body["staticAssets"].as_array().unwrap();
    assert_eq!(editor_static_assets.len(), 1);
    assert_eq!(editor_static_assets[0]["rotation"]["y"], json!(0.8));

    let bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bootstrap_response.status(), StatusCode::OK);
    let bootstrap_body = parse_json(bootstrap_response).await;
    let static_assets = bootstrap_body["staticAssets"].as_array().unwrap();
    assert_eq!(static_assets.len(), 0);

    let delete_response = app
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/static-assets/static-asset-tank-01")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn building_shell_and_smart_assets_round_trip_through_admin_bootstrap() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let wall_asset = json!({
      "id": "static-asset-wall-01",
      "name": "南侧实体墙",
      "assetKind": "wall-system",
      "variant": "solid-wall",
      "position": {"x": 8.0, "y": 0.0, "z": 4.0},
      "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
      "visible": true,
      "metadata": {
        "catalogId": "wall-system-solid-wall",
        "domain": "building-shell"
      },
      "createdAt": 0,
      "updatedAt": 0
    });

    let control_asset = json!({
      "id": "static-asset-lock-01",
      "name": "入户智能门锁",
      "assetKind": "smart-control",
      "variant": "smart-lock",
      "position": {"x": 8.6, "y": 1.05, "z": 4.0},
      "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
      "visible": true,
      "metadata": {
        "catalogId": "smart-control-smart-lock",
        "domain": "smart-home",
        "hostStaticAssetId": "static-asset-wall-01"
      },
      "createdAt": 0,
      "updatedAt": 0
    });

    let wall_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            wall_asset,
        ))
        .await
        .unwrap();
    assert_eq!(wall_response.status(), StatusCode::OK);
    let wall_body = parse_json(wall_response).await;
    assert_eq!(wall_body["assetKind"], json!("wall-system"));

    let control_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            control_asset,
        ))
        .await
        .unwrap();
    assert_eq!(control_response.status(), StatusCode::OK);
    let control_body = parse_json(control_response).await;
    assert_eq!(control_body["assetKind"], json!("smart-control"));

    let editor_bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(editor_bootstrap_response.status(), StatusCode::OK);
    let editor_bootstrap_body = parse_json(editor_bootstrap_response).await;
    let editor_static_assets = editor_bootstrap_body["staticAssets"].as_array().unwrap();
    assert_eq!(editor_static_assets.len(), 2);
    assert!(editor_static_assets
        .iter()
        .any(|asset| asset["assetKind"] == json!("wall-system")));
    assert!(editor_static_assets
        .iter()
        .any(|asset| asset["assetKind"] == json!("smart-control")));
}

#[tokio::test]
async fn editor_save_batches_scene_and_entity_create_with_single_version_bump() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_scene.status(), StatusCode::OK);
    let initial_scene_body = parse_json(initial_scene).await;
    let initial_version = initial_scene_body["sceneVersion"].as_u64().unwrap();

    let save_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": initial_version,
              "sceneConfig": {
                "id": "editor-save-scene",
                "name": "批量保存场景",
                "gridSize": 96,
                "gridDivisions": 48,
                "backgroundColor": "#162230",
                "ambientLightIntensity": 0.57,
                "showAxes": true,
                "showGrid": false,
                "cameraPosition": {"x": 24.0, "y": 18.0, "z": 20.0},
                "cameraTarget": {"x": 4.0, "y": 0.0, "z": -2.0}
              },
              "entity": {
                "mode": "create",
                "entity": {
                  "id": "entity-editor-save-01",
                  "type": "person",
                  "name": "批量保存巡检员",
                  "position": {"x": 6.0, "y": 0.0, "z": -4.0},
                  "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "status": "active",
                  "visible": true,
                  "metadata": {},
                  "role": "巡检",
                  "department": "运维",
                  "schedule": [],
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(save_response.status(), StatusCode::OK);
    let save_body = parse_json(save_response).await;
    assert_eq!(save_body["sceneVersion"], json!(initial_version + 1));
    assert_eq!(save_body["sceneConfig"]["id"], json!("editor-save-scene"));
    assert_eq!(
        save_body["savedEntity"]["id"],
        json!("entity-editor-save-01")
    );

    let editor_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(editor_bootstrap.status(), StatusCode::OK);
    let editor_bootstrap_body = parse_json(editor_bootstrap).await;
    assert_eq!(
        editor_bootstrap_body["sceneVersion"],
        json!(initial_version + 1)
    );
    assert_eq!(
        editor_bootstrap_body["sceneConfig"]["id"],
        json!("editor-save-scene")
    );
    assert!(editor_bootstrap_body["entities"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entity| entity["id"] == json!("entity-editor-save-01")));
}

#[tokio::test]
async fn editor_save_rolls_back_scene_changes_when_selection_write_fails() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_scene = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_scene.status(), StatusCode::OK);
    let initial_scene_body = parse_json(initial_scene).await;

    let failed_save = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": initial_scene_body["sceneVersion"].as_u64().unwrap(),
              "sceneConfig": {
                "id": "rolled-back-scene",
                "name": "不应落库的场景",
                "gridSize": 120,
                "gridDivisions": 60,
                "backgroundColor": "#2a1721",
                "ambientLightIntensity": 0.7,
                "showAxes": true,
                "showGrid": false,
                "cameraPosition": {"x": 22.0, "y": 16.0, "z": 18.0},
                "cameraTarget": {"x": 2.0, "y": 0.0, "z": -1.0}
              },
              "entity": {
                "mode": "create",
                "entity": {
                  "id": "person-operator-01",
                  "type": "person",
                  "name": "重复 ID 巡检员",
                  "position": {"x": 1.0, "y": 0.0, "z": 1.0},
                  "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "status": "active",
                  "visible": true,
                  "metadata": {},
                  "role": "巡检",
                  "department": "运维",
                  "schedule": [],
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(failed_save.status(), StatusCode::BAD_REQUEST);

    let scene_after_failure = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(scene_after_failure.status(), StatusCode::OK);
    let scene_after_failure_body = parse_json(scene_after_failure).await;
    assert_eq!(
        scene_after_failure_body["sceneVersion"],
        initial_scene_body["sceneVersion"]
    );
    assert_eq!(
        scene_after_failure_body["sceneConfig"],
        initial_scene_body["sceneConfig"]
    );
}

#[tokio::test]
async fn editor_save_updates_static_asset_and_publish_works_afterwards() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let create_asset_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            json!({
              "id": "static-asset-editor-save-01",
              "name": "编辑器保存测试罐体",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 24.0, "y": 0.0, "z": -11.0},
              "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {"catalogId": "vertical-tank-fixed-roof"},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_asset_response.status(), StatusCode::OK);

    let scene_before_save = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/scene")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let scene_before_save_body = parse_json(scene_before_save).await;
    let version_before_save = scene_before_save_body["sceneVersion"].as_u64().unwrap();

    let save_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/editor-save",
            json!({
              "expectedSceneVersion": version_before_save,
              "sceneConfig": {
                "id": "editor-save-publish-scene",
                "name": "编辑器保存发布场景",
                "gridSize": 88,
                "gridDivisions": 44,
                "backgroundColor": "#13212f",
                "ambientLightIntensity": 0.63,
                "showAxes": false,
                "showGrid": true,
                "cameraPosition": {"x": 20.0, "y": 15.0, "z": 19.0},
                "cameraTarget": {"x": 2.0, "y": 0.0, "z": -1.0}
              },
              "staticAsset": {
                "mode": "update",
                "staticAsset": {
                  "id": "static-asset-editor-save-01",
                  "name": "编辑器保存后罐体",
                  "assetKind": "vertical-tank",
                  "variant": "fixed-roof",
                  "position": {"x": 30.0, "y": 0.0, "z": -9.0},
                  "rotation": {"x": 0.0, "y": 0.35, "z": 0.0},
                  "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                  "visible": true,
                  "metadata": {"catalogId": "vertical-tank-fixed-roof"},
                  "createdAt": 0,
                  "updatedAt": 0
                }
              }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(save_response.status(), StatusCode::OK);
    let save_body = parse_json(save_response).await;
    assert_eq!(save_body["sceneVersion"], json!(version_before_save + 1));
    assert_eq!(
        save_body["savedStaticAsset"]["name"],
        json!("编辑器保存后罐体")
    );

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_response.status(), StatusCode::OK);

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    assert_eq!(
        site_bootstrap_body["sceneConfig"]["id"],
        json!("editor-save-publish-scene")
    );
    assert!(site_bootstrap_body["staticAssets"]
        .as_array()
        .unwrap()
        .iter()
        .any(|asset| {
            asset["id"] == json!("static-asset-editor-save-01")
                && asset["name"] == json!("编辑器保存后罐体")
        }));
}

#[tokio::test]
async fn publish_promotes_working_changes_into_site_bootstrap_and_status() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let update_scene_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/scene",
            json!({
              "id": "ibms-publish-scene",
              "name": "楼宇发布联调场景",
              "gridSize": 80,
              "gridDivisions": 80,
              "backgroundColor": "#10151d",
              "ambientLightIntensity": 0.62,
              "showAxes": false,
              "showGrid": true,
              "cameraPosition": {"x": 18.0, "y": 14.0, "z": 22.0},
              "cameraTarget": {"x": 2.0, "y": 0.0, "z": -1.0}
            }),
        ))
        .await
        .unwrap();
    assert_eq!(update_scene_response.status(), StatusCode::OK);

    let create_asset_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            json!({
              "id": "static-asset-publish-01",
              "name": "发布测试罐体",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 24.0, "y": 0.0, "z": -11.0},
              "rotation": {"x": 0.0, "y": 0.25, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {"catalogId": "vertical-tank-fixed-roof"},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_asset_response.status(), StatusCode::OK);

    let unpublished_status = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unpublished_status.status(), StatusCode::OK);
    let unpublished_status_body = parse_json(unpublished_status).await;
    assert_eq!(
        unpublished_status_body["status"],
        json!("saved-unpublished")
    );
    assert_eq!(
        unpublished_status_body["hasUnpublishedChanges"],
        json!(true)
    );

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_response.status(), StatusCode::OK);
    let publish_body = parse_json(publish_response).await;
    assert_eq!(publish_body["status"], json!("published"));
    assert_eq!(publish_body["hasUnpublishedChanges"], json!(false));
    assert_eq!(publish_body["compilerSource"], json!("working-snapshot"));
    assert!(publish_body["lastPublishedVersion"].is_string());
    let package_url = publish_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(package_url.contains("/generated/published-static/versions/"));

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    let site_static_assets = site_bootstrap_body["staticAssets"].as_array().unwrap();
    assert_eq!(site_static_assets.len(), 1);
    assert_eq!(
        site_static_assets[0]["id"],
        json!("static-asset-publish-01")
    );
    assert_eq!(
        site_bootstrap_body["sceneConfig"]["id"],
        json!("ibms-publish-scene")
    );
    assert!(site_bootstrap_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .contains("/generated/published-static/versions/"));

    let package_path = harness
        .generated_root
        .join(package_url.trim_start_matches("/generated/published-static/"));
    let package_payload = fs::read_to_string(package_path).expect("package file should exist");
    let package_body = serde_json::from_str::<Value>(&package_payload).unwrap();
    assert_eq!(package_body["sceneId"], json!("ibms-publish-scene"));
    assert_eq!(package_body["source"], json!("working-snapshot"));
    assert_eq!(
        package_body["sceneConfig"]["backgroundColor"],
        json!("#10151d")
    );
}

#[tokio::test]
async fn expanded_editor_static_asset_kinds_round_trip_through_admin_and_publish() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let assets = [
        (
            "wall-system-solid-wall",
            "wall-system",
            "solid-wall",
            json!({"catalogId": "wall-system-solid-wall", "domain": "building-shell"}),
        ),
        (
            "door-system-single-swing",
            "door-system",
            "single-swing",
            json!({
                "catalogId": "door-system-single-swing",
                "domain": "building-shell",
                "hostStaticAssetId": "wall-system-solid-wall"
            }),
        ),
        (
            "window-system-casement-window",
            "window-system",
            "casement-window",
            json!({
                "catalogId": "window-system-casement-window",
                "domain": "building-shell",
                "hostStaticAssetId": "wall-system-solid-wall"
            }),
        ),
        (
            "security-device-access-reader",
            "security-device",
            "access-reader",
            json!({"catalogId": "security-device-access-reader", "domain": "ibms-device"}),
        ),
        (
            "smart-sensor-occupancy-sensor",
            "smart-sensor",
            "occupancy-sensor",
            json!({"catalogId": "smart-sensor-occupancy-sensor", "domain": "ibms-device"}),
        ),
        (
            "smart-control-smart-lock",
            "smart-control",
            "smart-lock",
            json!({
                "catalogId": "smart-control-smart-lock",
                "domain": "smart-home",
                "hostStaticAssetId": "door-system-single-swing"
            }),
        ),
    ];

    for (index, (id, asset_kind, variant, metadata)) in assets.iter().enumerate() {
        let create_response = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/v1/admin/static-assets",
                json!({
                    "id": id,
                    "name": format!("扩展资产 {}", index + 1),
                    "assetKind": asset_kind,
                    "variant": variant,
                    "position": {"x": index as f64 * 1.5, "y": 0.0, "z": index as f64 * -0.5},
                    "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                    "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                    "visible": true,
                    "metadata": metadata,
                    "createdAt": 0,
                    "updatedAt": 0
                }),
            ))
            .await
            .unwrap();

        assert_eq!(
            create_response.status(),
            StatusCode::OK,
            "asset kind {asset_kind} should be accepted by admin create"
        );
    }

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_response.status(), StatusCode::OK);

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    let site_static_assets = site_bootstrap_body["staticAssets"].as_array().unwrap();

    for (_, asset_kind, _, _) in assets {
        assert!(
            site_static_assets
                .iter()
                .any(|asset| asset["assetKind"] == json!(asset_kind)),
            "published bootstrap should retain asset kind {asset_kind}"
        );
    }
}

#[tokio::test]
async fn concurrent_publish_requests_return_conflict_while_publish_is_in_progress() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    harness.set_mode("sleep-success");
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let create_asset_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            json!({
              "id": "static-asset-publish-concurrent-01",
              "name": "并发发布测试罐体",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 10.0, "y": 0.0, "z": -5.0},
              "rotation": {"x": 0.0, "y": 0.4, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_asset_response.status(), StatusCode::OK);

    let first_publish_task = tokio::spawn({
        let app = app.clone();
        async move {
            app.oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/admin/publish")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
        }
    });

    tokio::time::sleep(Duration::from_millis(120)).await;

    let in_progress_status = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(in_progress_status.status(), StatusCode::OK);
    let in_progress_body = parse_json(in_progress_status).await;
    assert_eq!(in_progress_body["status"], json!("publishing"));
    assert!(
        in_progress_body["activePublishStartedAt"]
            .as_u64()
            .is_some(),
        "publishing status should expose active publish start time"
    );
    assert!(
        in_progress_body["activePublishHeartbeatAt"]
            .as_u64()
            .is_some(),
        "publishing status should expose active publish heartbeat time"
    );

    let second_publish = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let first_publish = first_publish_task.await.unwrap();
    assert_eq!(first_publish.status(), StatusCode::OK);
    assert_eq!(second_publish.status(), StatusCode::CONFLICT);

    let final_status = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(final_status.status(), StatusCode::OK);
    let final_status_body = parse_json(final_status).await;
    assert_eq!(final_status_body["status"], json!("published"));
    assert_eq!(final_status_body["hasUnpublishedChanges"], json!(false));
}

#[tokio::test]
async fn publish_updates_stable_package_alias_for_fallback_bootstrap_loading() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let scene_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/scene",
            json!({
              "id": "snapshot-alias-scene",
              "name": "稳定别名发布场景",
              "gridSize": 72,
              "gridDivisions": 36,
              "backgroundColor": "#162230",
              "ambientLightIntensity": 0.57,
              "showAxes": true,
              "showGrid": false,
              "cameraPosition": {"x": 24.0, "y": 18.0, "z": 20.0},
              "cameraTarget": {"x": 4.0, "y": 0.0, "z": -2.0}
            }),
        ))
        .await
        .unwrap();
    assert_eq!(scene_response.status(), StatusCode::OK);

    let publish_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_response.status(), StatusCode::OK);
    let publish_body = parse_json(publish_response).await;
    let versioned_package_url = publish_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .to_string();

    let stable_alias_path = harness.generated_root.join("published-scene-package.json");
    let stable_alias_payload = fs::read_to_string(&stable_alias_path).unwrap();
    let stable_alias_body = serde_json::from_str::<Value>(&stable_alias_payload).unwrap();
    assert_eq!(stable_alias_body["sceneId"], json!("snapshot-alias-scene"));
    assert_eq!(stable_alias_body["source"], json!("working-snapshot"));
    assert_eq!(
        stable_alias_body["sceneConfig"]["name"],
        json!("稳定别名发布场景")
    );
    assert_eq!(
        stable_alias_body["staticAssetManifestUrl"],
        json!(format!(
            "{}/chunk-manifest.json",
            versioned_package_url.trim_end_matches("/published-scene-package.json")
        ))
    );
}

#[tokio::test]
async fn failed_publish_keeps_previous_published_snapshot_and_reports_failure() {
    init_test_database_url();
    let harness = PublishTestHarness::new();
    let app = backend_core_rs::app::build_app_with_options(
        "http://localhost:3000",
        AppBuildOptions {
            publish_config: harness.publish_config(),
        },
    )
    .await
    .expect("app should build");

    let initial_asset_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            json!({
              "id": "static-asset-publish-stable-01",
              "name": "稳定发布罐体",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 18.0, "y": 0.0, "z": -9.0},
              "rotation": {"x": 0.0, "y": 0.1, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(initial_asset_response.status(), StatusCode::OK);

    let initial_publish = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_publish.status(), StatusCode::OK);
    let initial_publish_body = parse_json(initial_publish).await;
    let initial_package_url = initial_publish_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .to_string();
    let initial_published_version = initial_publish_body["publishedSceneVersion"]
        .as_u64()
        .unwrap();
    let initial_last_published_version = initial_publish_body["lastPublishedVersion"]
        .as_str()
        .unwrap()
        .to_string();

    let updated_asset_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/static-assets",
            json!({
              "id": "static-asset-publish-failing-02",
              "name": "失败发布期间新增罐体",
              "assetKind": "vertical-tank",
              "variant": "fixed-roof",
              "position": {"x": 28.0, "y": 0.0, "z": -14.0},
              "rotation": {"x": 0.0, "y": 0.7, "z": 0.0},
              "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(updated_asset_response.status(), StatusCode::OK);

    harness.set_mode("fail");
    let failed_publish = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(failed_publish.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let failed_publish_body = parse_json(failed_publish).await;
    assert!(failed_publish_body["error"]
        .as_str()
        .unwrap()
        .contains("forced publish failure"));

    let publish_status = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_status.status(), StatusCode::OK);
    let publish_status_body = parse_json(publish_status).await;
    assert_eq!(publish_status_body["status"], json!("failed"));
    assert_eq!(
        publish_status_body["publishedSceneVersion"],
        json!(initial_published_version)
    );
    assert_eq!(
        publish_status_body["publishedScene"]["packageUrl"],
        json!(initial_package_url)
    );
    assert_eq!(
        publish_status_body["lastPublishedVersion"],
        json!(initial_last_published_version)
    );
    assert!(publish_status_body["lastError"]
        .as_str()
        .unwrap()
        .contains("forced publish failure"));
    assert_eq!(publish_status_body["hasUnpublishedChanges"], json!(true));

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    let site_static_assets = site_bootstrap_body["staticAssets"].as_array().unwrap();
    assert_eq!(
        site_bootstrap_body["sceneVersion"],
        json!(initial_published_version)
    );
    assert_eq!(site_static_assets.len(), 1);
    assert_eq!(
        site_static_assets[0]["id"],
        json!("static-asset-publish-stable-01")
    );
    assert_eq!(
        site_bootstrap_body["publishedScene"]["packageUrl"],
        json!(initial_package_url)
    );
}

#[tokio::test]
async fn rule_validate_returns_errors_for_cycle_or_missing_config() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let invalid_rule = json!({
      "id": "rule-invalid-01",
      "name": "非法规则",
      "description": "带环且配置缺失",
      "enabled": true,
      "version": 1,
      "nodes": [
        {
          "id": "n1",
          "type": "trigger",
          "position": {"x": 0, "y": 0},
          "data": {"label": "trigger", "nodeType": "trigger-location", "config": {}, "description": null}
        },
        {
          "id": "n2",
          "type": "action",
          "position": {"x": 100, "y": 0},
          "data": {"label": "action", "nodeType": "action-alert", "config": {}, "description": null}
        }
      ],
      "edges": [
        {"id": "e1", "source": "n1", "target": "n2", "sourceHandle": null, "targetHandle": null},
        {"id": "e2", "source": "n2", "target": "n1", "sourceHandle": null, "targetHandle": null}
      ],
      "createdAt": 0,
      "updatedAt": 0
    });

    let response = app
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/rules/rule-invalid-01/validate",
            invalid_rule,
        ))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = parse_json(response).await;
    assert_eq!(body["valid"], json!(false));
    let errors = body["errors"].as_array().unwrap();
    assert!(errors
        .iter()
        .any(|item| item.as_str().unwrap().contains("cycles")));
    assert!(errors
        .iter()
        .any(|item| item.as_str().unwrap().contains("requires non-empty config")));
}

#[tokio::test]
async fn entity_category_and_archetype_crud_flow_is_exposed_via_bootstrap() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let category_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "机器人与自动化单元",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(category_response.status(), StatusCode::OK);

    let archetype_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "ignored-by-backend",
              "displayName": "巡检机器人 V1",
              "description": "可移动巡检机器人原型",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {
                "defaultStatus": "active"
              },
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(archetype_response.status(), StatusCode::OK);
    let archetype_body = parse_json(archetype_response).await;
    assert_eq!(archetype_body["categoryKey"], json!("robotics"));

    let bootstrap_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bootstrap_response.status(), StatusCode::OK);
    let bootstrap_body = parse_json(bootstrap_response).await;
    assert!(bootstrap_body["entityCategories"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["key"] == json!("robotics")));
    assert!(bootstrap_body["entityArchetypes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["key"] == json!("inspection-robot-v1")));

    let delete_category_while_in_use = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/entity-categories/category-robotics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_category_while_in_use.status(), StatusCode::CONFLICT);

    let delete_archetype = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/entity-archetypes/archetype-inspection-robot-v1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_archetype.status(), StatusCode::NO_CONTENT);

    let delete_category = app
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/entity-categories/category-robotics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_category.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn model_asset_upload_returns_persisted_asset_metadata() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let body = concat!(
        "--boundary\r\n",
        "Content-Disposition: form-data; name=\"file\"; filename=\"robot.fbx\"\r\n",
        "Content-Type: application/octet-stream\r\n\r\n",
        "Kaydara FBX Binary  \0\x1a\0fake",
        "\r\n--boundary--\r\n"
    );

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/model-assets/upload")
                .header(CONTENT_TYPE, "multipart/form-data; boundary=boundary")
                .body(Body::from(body.as_bytes().to_vec()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response_body = parse_json(response).await;
    assert_eq!(response_body["fileType"], json!("fbx"));
    assert_eq!(response_body["fileName"], json!("robot.fbx"));
    assert_eq!(response_body["fileSizeBytes"], json!(27));
    assert!(response_body["assetUrl"].as_str().unwrap().ends_with(".fbx"));
    assert_eq!(response_body["calibration"]["scale"]["x"], json!(1.0));
}

#[tokio::test]
async fn entity_archetype_rejects_remote_model_asset_urls() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let category_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "机器人与自动化单元",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(category_response.status(), StatusCode::OK);

    let archetype_response = app
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "可移动巡检机器人原型",
              "capabilities": {
                "hasModel": true,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "model": {
                "assetId": "asset-robot-1",
                "fileName": "robot.glb",
                "fileType": "glb",
                "assetUrl": "https://example.com/robot.glb",
                "calibration": {
                  "scale": { "x": 1, "y": 1, "z": 1 },
                  "rotation": { "x": 0, "y": 0, "z": 0 },
                  "translation": { "x": 0, "y": 0, "z": 0 },
                  "floorOffset": 0
                },
                "uploadedAt": 1
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(archetype_response.status(), StatusCode::BAD_REQUEST);
    let body = parse_json(archetype_response).await;
    assert!(body["error"]
        .as_str()
        .unwrap()
        .contains("/assets/entity-archetypes/"));
}

#[tokio::test]
async fn dynamic_entity_requires_existing_archetype_and_normalizes_category_key() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let category_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "机器人与自动化单元",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(category_response.status(), StatusCode::OK);

    let archetype_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "可移动巡检机器人原型",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(archetype_response.status(), StatusCode::OK);

    let create_entity_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-01",
              "type": "dynamic",
              "name": "巡检机器人 01",
              "position": { "x": 1, "y": 0, "z": 2 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-inspection-robot-v1",
              "categoryKey": "mismatched-category",
              "attributes": { "battery": 88 },
              "displayAttributes": { "archetype": "巡检机器人 V1" }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_entity_response.status(), StatusCode::OK);
    let create_entity_body = parse_json(create_entity_response).await;
    assert_eq!(create_entity_body["categoryKey"], json!("robotics"));

    let invalid_entity_response = app
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-invalid",
              "type": "dynamic",
              "name": "孤立原型机器人",
              "position": { "x": 1, "y": 0, "z": 2 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-missing",
              "categoryKey": "robotics",
              "attributes": {},
              "displayAttributes": {}
            }),
        ))
        .await
        .unwrap();
    assert_eq!(invalid_entity_response.status(), StatusCode::BAD_REQUEST);
    let invalid_body = parse_json(invalid_entity_response).await;
    assert!(invalid_body["error"]
        .as_str()
        .unwrap()
        .contains("does not exist"));
}

#[tokio::test]
async fn dynamic_entity_crud_is_reflected_in_site_bootstrap_without_publish() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_bootstrap = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_bootstrap.status(), StatusCode::OK);
    let initial_body = parse_json(initial_bootstrap).await;
    let initial_scene_version = initial_body["sceneVersion"].as_u64().unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "机器人与自动化单元",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "可移动巡检机器人原型",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let create_entity_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-live-01",
              "type": "dynamic",
              "name": "巡检机器人 Live 01",
              "position": { "x": 8, "y": 0, "z": 3 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-inspection-robot-v1",
              "categoryKey": "robotics",
              "attributes": { "battery": 91 },
              "displayAttributes": { "archetype": "巡检机器人 V1" }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_entity_response.status(), StatusCode::OK);

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    assert_eq!(
        site_bootstrap_body["sceneVersion"].as_u64().unwrap(),
        initial_scene_version + 1
    );
    assert!(site_bootstrap_body["entities"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entity| entity["id"] == json!("dynamic-robot-live-01")));
}

#[tokio::test]
async fn archetype_recategorization_rewrites_existing_dynamic_entity_category_keys() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    for (id, key, name) in [
        ("category-robotics", "robotics", "机器人"),
        ("category-autonomy", "autonomy", "自治设备"),
    ] {
        let response = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/v1/admin/entity-categories",
                json!({
                  "id": id,
                  "key": key,
                  "displayName": name,
                  "description": "",
                  "icon": "Bot",
                  "color": "#38bdf8",
                  "sortOrder": 10,
                  "createdAt": 0,
                  "updatedAt": 0
                }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    let response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-01",
              "type": "dynamic",
              "name": "巡检机器人 01",
              "position": { "x": 1, "y": 0, "z": 2 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-inspection-robot-v1",
              "categoryKey": "robotics",
              "attributes": {},
              "displayAttributes": { "category": "robotics" }
            }),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/entity-archetypes/archetype-inspection-robot-v1",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-autonomy",
              "categoryKey": "autonomy",
              "displayName": "巡检机器人 V1",
              "description": "",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let entities_response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/entities")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(entities_response.status(), StatusCode::OK);
    let entities_body = parse_json(entities_response).await;
    let dynamic_entity = entities_body
        .as_array()
        .unwrap()
        .iter()
        .find(|entity| entity["id"] == json!("dynamic-robot-01"))
        .unwrap();
    assert_eq!(dynamic_entity["categoryKey"], json!("autonomy"));
    assert_eq!(dynamic_entity["displayAttributes"]["category"], json!("autonomy"));
}

#[tokio::test]
async fn deleting_referenced_archetype_returns_conflict() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-01",
              "type": "dynamic",
              "name": "巡检机器人 01",
              "position": { "x": 1, "y": 0, "z": 2 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-inspection-robot-v1",
              "categoryKey": "robotics",
              "attributes": {},
              "displayAttributes": {}
            }),
        ))
        .await
        .unwrap();

    let delete_response = app
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/entity-archetypes/archetype-inspection-robot-v1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_response.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn category_key_rename_rewrites_dependent_archetypes_and_dynamic_entities() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-categories",
            json!({
              "id": "category-robotics",
              "key": "robotics",
              "displayName": "机器人",
              "description": "",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entity-archetypes",
            json!({
              "id": "archetype-inspection-robot-v1",
              "key": "inspection-robot-v1",
              "categoryId": "category-robotics",
              "categoryKey": "robotics",
              "displayName": "巡检机器人 V1",
              "description": "",
              "capabilities": {
                "hasModel": false,
                "movable": true,
                "bindable": true,
                "statusBearing": true,
                "detailFieldsVisible": true
              },
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();

    let _ = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/entities",
            json!({
              "id": "dynamic-robot-rename-01",
              "type": "dynamic",
              "name": "巡检机器人 Rename 01",
              "position": { "x": 3, "y": 0, "z": 4 },
              "rotation": { "x": 0, "y": 0, "z": 0 },
              "scale": { "x": 1, "y": 1, "z": 1 },
              "status": "active",
              "visible": true,
              "metadata": {},
              "createdAt": 0,
              "updatedAt": 0,
              "archetypeId": "archetype-inspection-robot-v1",
              "categoryKey": "robotics",
              "attributes": { "battery": 76, "archetypeKey": "inspection-robot-v1" },
              "displayAttributes": { "category": "robotics", "archetype": "巡检机器人 V1" }
            }),
        ))
        .await
        .unwrap();

    let update_category_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/entity-categories/category-robotics",
            json!({
              "id": "category-robotics",
              "key": "mobile-robotics",
              "displayName": "移动机器人",
              "description": "",
              "icon": "Bot",
              "color": "#38bdf8",
              "sortOrder": 10,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(update_category_response.status(), StatusCode::OK);

    let archetypes_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/entity-archetypes")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(archetypes_response.status(), StatusCode::OK);
    let archetypes_body = parse_json(archetypes_response).await;
    let archetype = archetypes_body
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == json!("archetype-inspection-robot-v1"))
        .unwrap();
    assert_eq!(archetype["categoryKey"], json!("mobile-robotics"));

    let entities_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/entities")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(entities_response.status(), StatusCode::OK);
    let entities_body = parse_json(entities_response).await;
    let entity = entities_body
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == json!("dynamic-robot-rename-01"))
        .unwrap();
    assert_eq!(entity["categoryKey"], json!("mobile-robotics"));
    assert_eq!(entity["displayAttributes"]["category"], json!("mobile-robotics"));

    let site_bootstrap = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(site_bootstrap.status(), StatusCode::OK);
    let site_bootstrap_body = parse_json(site_bootstrap).await;
    let site_entity = site_bootstrap_body["entities"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == json!("dynamic-robot-rename-01"))
        .unwrap();
    assert_eq!(site_entity["categoryKey"], json!("mobile-robotics"));
}

#[tokio::test]
async fn workspace_registry_supports_crud_and_homepage_switching() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

    let initial_home = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/home-workspace")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_home.status(), StatusCode::OK);
    let initial_home_body = parse_json(initial_home).await;
    assert_eq!(initial_home_body["isHomepage"], json!(true));

    let create_response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/admin/workspaces",
            json!({
              "id": "workspace-plant-b",
              "slug": "plant-b",
              "name": "厂区 B",
              "description": "第二套工作区",
              "isHomepage": false,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(create_response.status(), StatusCode::OK);

    let update_response = app
        .clone()
        .oneshot(json_request(
            Method::PUT,
            "/api/v1/admin/workspaces/workspace-plant-b",
            json!({
              "id": "workspace-plant-b",
              "slug": "plant-b",
              "name": "厂区 B",
              "description": "第二套工作区",
              "isHomepage": true,
              "createdAt": 0,
              "updatedAt": 0
            }),
        ))
        .await
        .unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/admin/workspaces")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = parse_json(list_response).await;
    assert!(list_body
        .as_array()
        .unwrap()
        .iter()
        .any(|workspace| workspace["id"] == json!("workspace-plant-b")));
    assert!(list_body
        .as_array()
        .unwrap()
        .iter()
        .filter(|workspace| workspace["isHomepage"] == json!(true))
        .count()
        == 1);

    let home_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/home-workspace")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(home_response.status(), StatusCode::OK);
    let home_body = parse_json(home_response).await;
    assert_eq!(home_body["id"], json!("workspace-plant-b"));

    let delete_default_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/api/v1/admin/workspaces/workspace-plant-b")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_default_response.status(), StatusCode::NO_CONTENT);

    let final_home = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/site/home-workspace")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(final_home.status(), StatusCode::OK);
    let final_home_body = parse_json(final_home).await;
    assert_eq!(final_home_body["isHomepage"], json!(true));
}

struct PublishTestHarness {
    root: PathBuf,
    generated_root: PathBuf,
    mode_file: PathBuf,
    bun_wrapper: PathBuf,
}

impl PublishTestHarness {
    fn new() -> Self {
        let root = unique_test_dir("publish-harness");
        let generated_root = root.join("generated-output");
        let mode_file = root.join("publish-mode.txt");
        let bun_wrapper = root.join("bun-wrapper.sh");

        fs::create_dir_all(&generated_root).unwrap();
        fs::write(&mode_file, "pass\n").unwrap();
        fs::write(
            &bun_wrapper,
            format!(
                "#!/bin/sh\nMODE=$(cat {} 2>/dev/null | tr -d '\\r\\n')\ncase \"$MODE\" in\n  sleep-success)\n    sleep 1\n    exec bun \"$@\"\n    ;;\n  fail)\n    echo \"forced publish failure\" >&2\n    exit 1\n    ;;\n  *)\n    exec bun \"$@\"\n    ;;\nesac\n",
                shell_single_quoted(&mode_file)
            ),
        )
        .unwrap();
        set_executable(&bun_wrapper);

        Self {
            root,
            generated_root,
            mode_file,
            bun_wrapper,
        }
    }

    fn publish_config(&self) -> PublishConfig {
        let mut config = PublishConfig::default();
        config.generated_root = self.generated_root.clone();
        config.bun_bin = self.bun_wrapper.to_string_lossy().into_owned();
        config
    }

    fn set_mode(&self, mode: &str) {
        fs::write(&self.mode_file, format!("{mode}\n")).unwrap();
    }
}

impl Drop for PublishTestHarness {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn json_request(method: Method, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

async fn parse_json(response: axum::response::Response) -> Value {
    let body = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&body).unwrap()
}

fn init_test_database_url() {
    std::env::set_var("DATABASE_URL", "sqlite::memory:");
}

fn unique_test_dir(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "backend-core-rs-{label}-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}

fn shell_single_quoted(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\"'\"'"))
}

fn set_executable(path: &Path) {
    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }

    #[cfg(not(unix))]
    {
        let _ = path;
        panic!("publish wrapper tests require unix permissions support");
    }
}
