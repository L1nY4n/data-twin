use axum::{
    body::Body,
    http::{header::CONTENT_TYPE, Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

#[tokio::test]
async fn scene_update_increments_scene_version_and_reflects_in_bootstrap() {
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
        scene_version + 1
    );
    assert_eq!(
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
    assert_eq!(static_assets.len(), 1);
    assert_eq!(static_assets[0]["rotation"]["y"], json!(0.8));

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
