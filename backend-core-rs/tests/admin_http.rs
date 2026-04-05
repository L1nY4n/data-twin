use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
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
    assert_eq!(initial_overview_body["entityCount"], json!(9));
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
async fn publish_promotes_working_changes_into_site_bootstrap_and_status() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");

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
    assert_eq!(publish_body["compilerSource"], json!("campus-layout"));
    assert!(publish_body["lastPublishedVersion"].is_string());
    assert!(publish_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .contains("/generated/published-static/versions/"));

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
    assert!(site_bootstrap_body["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .contains("/generated/published-static/versions/"));
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

    let first_publish = app.clone().oneshot(
        Request::builder()
            .method(Method::POST)
            .uri("/api/v1/admin/publish")
            .body(Body::empty())
            .unwrap(),
    );
    let second_publish = app.clone().oneshot(
        Request::builder()
            .method(Method::POST)
            .uri("/api/v1/admin/publish")
            .body(Body::empty())
            .unwrap(),
    );

    let (first_publish, second_publish) = tokio::join!(first_publish, second_publish);
    let first_publish = first_publish.unwrap();
    let second_publish = second_publish.unwrap();
    let statuses = [first_publish.status(), second_publish.status()];

    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::OK)
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::CONFLICT)
            .count(),
        1
    );

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
