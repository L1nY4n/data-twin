use axum::{
    body::Body,
    http::{header::CONTENT_TYPE, Method, Request},
    Router,
};
use futures_util::StreamExt;
use serde_json::{json, Value};
use tokio::{
    net::TcpListener,
    task::JoinHandle,
    time::{timeout, Duration},
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
    MaybeTlsStream, WebSocketStream,
};
use tower::ServiceExt;

const ALLOWED_ORIGIN: &str = "http://localhost:3000";
const RUNTIME_INGEST_TOKEN: &str = "test-runtime-ingest-token";
const REALTIME_ACCESS_TOKEN: &str = "test-realtime-access-token";
const ADMIN_API_TOKEN: &str = "test-admin-api-token";
type TestSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::test]
async fn runtime_ingest_relays_supported_events_to_websocket_clients() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");
    let update_app = app.clone();

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, ALLOWED_ORIGIN))
        .await
        .expect("websocket should connect");

    let response = update_app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": [
                            {
                                "type": "position_update",
                                "timestamp": 1234567890_u64,
                                "payload": {
                                    "entityId": "vehicle-forklift-01",
                                    "position": { "x": 7.5, "y": 0.0, "z": -0.5 },
                                    "rotation": { "x": 0.0, "y": 102.0, "z": 0.0 },
                                    "speed": 2.8,
                                    "heading": 102.0,
                                    "routeTrack": {
                                        "routeId": "factory-yard-circulation",
                                        "trackId": "forklift-track-live",
                                        "label": "实时装卸线",
                                        "looped": true,
                                        "waypoints": [
                                            { "x": 7.5, "y": 0.0, "z": -0.5 },
                                            { "x": 12.0, "y": 0.0, "z": 3.0 },
                                            { "x": 18.0, "y": 0.0, "z": 3.0 }
                                        ]
                                    },
                                    "trackPosition": {
                                        "routeId": "factory-yard-circulation",
                                        "trackId": "forklift-track-live",
                                        "segmentIndex": 0,
                                        "nextWaypointIndex": 1,
                                        "segmentProgress": 0.42
                                    }
                                }
                            },
                            {
                                "type": "status_update",
                                "timestamp": 1234567891_u64,
                                "payload": {
                                    "entityId": "sensor-temp-reactor-01",
                                    "status": "warning",
                                    "parameters": {
                                        "reading": 88.5,
                                        "thresholdMax": 68.0,
                                        "simulated": true
                                    }
                                }
                            },
                            {
                                "type": "signal_update",
                                "timestamp": 12345678915_u64,
                                "payload": {
                                    "entityId": "sensor-temp-reactor-01",
                                    "source": "rust-test-simulator",
                                    "connectorId": "simulated-plc-line-1",
                                    "signals": [
                                        {
                                            "id": "reactor-temp-pv",
                                            "name": "ReactorTemperaturePV",
                                            "path": "PLC/Line1/Reactor/TemperaturePV",
                                            "label": "反应釜温度 PV",
                                            "unit": "C",
                                            "dataType": "float",
                                            "direction": "input",
                                            "value": 88.5,
                                            "quality": "uncertain"
                                        }
                                    ]
                                }
                            },
                            {
                                "type": "alarm",
                                "timestamp": 1234567892_u64,
                                "payload": {
                                    "id": "alarm-sim-01",
                                    "level": "warning",
                                    "message": "simulated alarm"
                                }
                            },
                            {
                                "type": "incident",
                                "timestamp": 1234567893_u64,
                                "payload": {
                                    "incident": {
                                        "id": "incident-sim-01",
                                        "kind": "near_miss",
                                        "severity": "warning",
                                        "title": "simulated incident",
                                        "summary": "simulated incident summary",
                                        "message": "simulated incident message",
                                        "primaryEntityId": "vehicle-forklift-01",
                                        "entityIds": ["vehicle-forklift-01"],
                                        "citations": [
                                            {
                                                "id": "citation-sim-01",
                                                "label": "source",
                                                "value": "python-simulator"
                                            }
                                        ],
                                        "acknowledged": false,
                                        "timestamp": 1234567893_u64
                                    }
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);

    let body = parse_json(response).await;
    assert_eq!(body["source"], json!("python-simulator"));
    assert_eq!(body["acceptedCount"], json!(5));

    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "position_update",
            "timestamp": 1234567890_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": { "x": 7.5, "y": 0.0, "z": -0.5 },
                "rotation": { "x": 0.0, "y": 102.0, "z": 0.0 },
                "speed": 2.8,
                "heading": 102.0,
                "routeTrack": {
                    "routeId": "factory-yard-circulation",
                    "trackId": "forklift-track-live",
                    "label": "实时装卸线",
                    "looped": true,
                    "waypoints": [
                        { "x": 7.5, "y": 0.0, "z": -0.5 },
                        { "x": 12.0, "y": 0.0, "z": 3.0 },
                        { "x": 18.0, "y": 0.0, "z": 3.0 }
                    ]
                },
                "trackPosition": {
                    "routeId": "factory-yard-circulation",
                    "trackId": "forklift-track-live",
                    "segmentIndex": 0,
                    "nextWaypointIndex": 1,
                    "segmentProgress": 0.42
                }
            }
        })
    );
    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "status_update",
            "timestamp": 1234567891_u64,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "status": "warning",
                "parameters": {
                    "reading": 88.5,
                    "thresholdMax": 68.0,
                    "simulated": true
                }
            }
        })
    );
    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "signal_update",
            "timestamp": 12345678915_u64,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "source": "rust-test-simulator",
                "connectorId": "simulated-plc-line-1",
                "signals": [
                    {
                        "id": "reactor-temp-pv",
                        "name": "ReactorTemperaturePV",
                        "path": "PLC/Line1/Reactor/TemperaturePV",
                        "label": "反应釜温度 PV",
                        "unit": "C",
                        "dataType": "float",
                        "direction": "input",
                        "value": 88.5,
                        "quality": "uncertain"
                    }
                ]
            }
        })
    );
    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "alarm",
            "timestamp": 1234567892_u64,
            "payload": {
                "id": "alarm-sim-01",
                "level": "warning",
                "message": "simulated alarm"
            }
        })
    );
    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "incident",
            "timestamp": 1234567893_u64,
            "payload": {
                "incident": {
                    "id": "incident-sim-01",
                    "kind": "near_miss",
                    "severity": "warning",
                    "title": "simulated incident",
                    "summary": "simulated incident summary",
                    "message": "simulated incident message",
                    "primaryEntityId": "vehicle-forklift-01",
                    "entityIds": ["vehicle-forklift-01"],
                    "citations": [
                        {
                            "id": "citation-sim-01",
                            "label": "source",
                            "value": "python-simulator"
                        }
                    ],
                    "acknowledged": false,
                    "timestamp": 1234567893_u64
                }
            }
        })
    );

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn runtime_ingest_accepts_dense_movement_batch_with_repeated_entity_refs() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let events = (0..500)
        .map(|index| {
            json!({
                "type": "position_update",
                "timestamp": 2234567890_u64 + index,
                "payload": {
                    "entityId": "vehicle-forklift-01",
                    "position": { "x": 7.5 + index as f64 * 0.01, "y": 0.0, "z": -0.5 },
                    "rotation": { "x": 0.0, "y": 102.0, "z": 0.0 },
                    "speed": 2.8,
                    "heading": 102.0
                }
            })
        })
        .collect::<Vec<Value>>();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "dense-python-simulator",
                        "events": events
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 200);
    let body = parse_json(response).await;
    assert_eq!(body["acceptedCount"], json!(500));
}

#[tokio::test]
async fn runtime_ingest_relays_dense_movement_batch_as_one_websocket_message() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");
    let update_app = app.clone();

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, ALLOWED_ORIGIN))
        .await
        .expect("websocket should connect");

    let events = (0..500)
        .map(|index| {
            json!({
                "type": "position_update",
                "timestamp": 3234567890_u64 + index,
                "payload": {
                    "entityId": "vehicle-forklift-01",
                    "position": { "x": 8.5 + index as f64 * 0.01, "y": 0.0, "z": -0.5 },
                    "rotation": { "x": 0.0, "y": 102.0, "z": 0.0 },
                    "speed": 2.8,
                    "heading": 102.0
                }
            })
        })
        .collect::<Vec<Value>>();

    let response = update_app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "dense-python-simulator",
                        "events": events
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    let frame = next_realtime_binary_frame(&mut socket).await;
    assert_eq!(&frame[0..4], b"DTPF");
    assert_eq!(frame[4], 1);
    assert_eq!(frame[5], 1);
    let count = u32::from_le_bytes(frame[16..20].try_into().unwrap());
    assert_eq!(count, 500);
    assert!(
        (first_pose_frame_yaw(&frame) - (102.0_f32 * std::f32::consts::PI / 180.0)).abs() < 0.001
    );
    assert!(
        String::from_utf8_lossy(&frame).contains("vehicle-forklift-01"),
        "binary pose frame should carry entity ids"
    );

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn runtime_ingest_keeps_mixed_route_movement_batch_on_binary_pose_path() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");
    let update_app = app.clone();

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, ALLOWED_ORIGIN))
        .await
        .expect("websocket should connect");

    let mut events = vec![json!({
        "type": "status_update",
        "timestamp": 4234567889_u64,
        "payload": {
            "entityId": "sensor-temp-reactor-01",
            "status": "active",
            "parameters": {
                "reading": 62.5,
                "simulated": true
            }
        }
    })];
    events.extend(
        (0..18)
            .map(|index| {
                json!({
                    "type": "position_update",
                    "timestamp": 4234567890_u64 + index,
                    "payload": {
                        "entityId": "vehicle-forklift-01",
                        "position": { "x": 7.5 + index as f64 * 0.01, "y": 0.0, "z": -0.5 },
                        "rotation": { "x": 0.0, "y": 5.0, "z": 0.0 },
                        "speed": 2.8,
                        "heading": 5.0,
                        "routeTrack": {
                            "routeId": "factory-yard-circulation",
                            "trackId": "forklift-track-live",
                            "label": "实时装卸线",
                            "looped": true,
                            "waypoints": [
                                { "x": 7.5, "y": 0.0, "z": -0.5 },
                                { "x": 12.0, "y": 0.0, "z": 3.0 },
                                { "x": 18.0, "y": 0.0, "z": 3.0 }
                            ]
                        },
                        "trackPosition": {
                            "routeId": "factory-yard-circulation",
                            "trackId": "forklift-track-live",
                            "segmentIndex": 0,
                            "nextWaypointIndex": 1,
                            "segmentProgress": 0.42
                        }
                    }
                })
            })
            .collect::<Vec<Value>>(),
    );
    events.push(json!({
        "type": "status_update",
        "timestamp": 4234567999_u64,
        "payload": {
            "entityId": "sensor-temp-reactor-01",
            "status": "warning",
            "parameters": {
                "reading": 88.5,
                "simulated": true
            }
        }
    }));

    let response = update_app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "mixed-python-simulator",
                        "events": events
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "status_update",
            "timestamp": 4234567889_u64,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "status": "active",
                "parameters": {
                    "reading": 62.5,
                    "simulated": true
                }
            }
        })
    );

    let frame = next_realtime_binary_frame(&mut socket).await;
    assert_eq!(&frame[0..4], b"DTPF");
    assert_eq!(u32::from_le_bytes(frame[16..20].try_into().unwrap()), 18);
    assert!(
        (first_pose_frame_yaw(&frame) - (5.0_f32 * std::f32::consts::PI / 180.0)).abs() < 0.001
    );
    assert!(
        String::from_utf8_lossy(&frame).contains("vehicle-forklift-01"),
        "route-bearing movement events should still enter the binary pose frame"
    );

    assert_eq!(
        next_realtime_message(&mut socket).await,
        json!({
            "type": "status_update",
            "timestamp": 4234567999_u64,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "status": "warning",
                "parameters": {
                    "reading": 88.5,
                    "simulated": true
                }
            }
        })
    );

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn runtime_ingest_rejects_empty_source() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "",
                        "events": [
                            {
                                "type": "alarm",
                                "payload": {
                                    "id": "alarm-empty-source",
                                    "level": "warning",
                                    "message": "invalid"
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 400);
    let body = parse_json(response).await;
    assert_eq!(body["error"], json!("source is required"));
}

#[tokio::test]
async fn runtime_ingest_rejects_empty_event_batch() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": []
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 400);
    let body = parse_json(response).await;
    assert_eq!(
        body["error"],
        json!("at least one runtime event is required")
    );
}

#[tokio::test]
async fn runtime_ingest_rejects_invalid_token() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", "wrong-token")
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": [
                            {
                                "type": "alarm",
                                "payload": {
                                    "id": "alarm-invalid-token",
                                    "level": "warning",
                                    "message": "invalid"
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 401);
    let body = parse_json(response).await;
    assert_eq!(body["error"], json!("runtime ingest token is invalid"));
}

#[tokio::test]
async fn runtime_ingest_rejects_duplicate_events_within_replay_window() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let request_body = json!({
        "source": "python-simulator",
        "events": [
            {
                "type": "alarm",
                "timestamp": 1234567890_u64,
                "payload": {
                    "id": "alarm-duplicate",
                    "level": "warning",
                    "message": "duplicate"
                }
            }
        ]
    })
    .to_string();

    let first = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(request_body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first.status(), 200);

    let second = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(request_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(second.status(), 409);
    let body = parse_json(second).await;
    assert_eq!(
        body["error"],
        json!("duplicate runtime event detected within replay window")
    );
}

#[tokio::test]
async fn runtime_ingest_rejects_duplicate_events_inside_one_batch() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": [
                            {
                                "type": "alarm",
                                "timestamp": 1234567890_u64,
                                "payload": {
                                    "id": "alarm-duplicate-in-batch",
                                    "level": "warning",
                                    "message": "duplicate"
                                }
                            },
                            {
                                "type": "alarm",
                                "timestamp": 1234567890_u64,
                                "payload": {
                                    "id": "alarm-duplicate-in-batch",
                                    "level": "warning",
                                    "message": "duplicate"
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 409);
    let body = parse_json(response).await;
    assert_eq!(
        body["error"],
        json!("duplicate runtime event detected within replay window")
    );
}

#[tokio::test]
async fn runtime_ingest_replay_protection_is_workspace_scoped() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let create_workspace = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/workspaces")
                .header(CONTENT_TYPE, "application/json")
                .header("x-admin-api-token", ADMIN_API_TOKEN)
                .body(Body::from(
                    json!({
                        "id": "workspace-runtime-b",
                        "slug": "workspace-runtime-b",
                        "name": "Runtime Workspace B",
                        "description": "secondary runtime ingest workspace",
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
    assert_eq!(create_workspace.status(), 200);

    let request_body = json!({
        "source": "python-simulator",
        "events": [
            {
                "type": "alarm",
                "timestamp": 1234567890_u64,
                "payload": {
                    "id": "alarm-cross-workspace",
                    "level": "warning",
                    "message": "same payload in two workspaces"
                }
            }
        ]
    })
    .to_string();

    for uri in [
        "/api/v1/workspaces/factory-demo-scene/runtime/ingest",
        "/api/v1/workspaces/workspace-runtime-b/runtime/ingest",
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(uri)
                    .header(CONTENT_TYPE, "application/json")
                    .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                    .body(Body::from(request_body.clone()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
    }
}

#[tokio::test]
async fn runtime_ingest_rejects_sources_that_exceed_request_rate_limit() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    for index in 0..120 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/runtime/ingest")
                    .header(CONTENT_TYPE, "application/json")
                    .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                    .body(Body::from(
                        json!({
                            "source": "rate-limit-source",
                            "events": [
                                {
                                    "type": "alarm",
                                    "timestamp": 1234567890_u64 + index,
                                    "payload": {
                                        "id": format!("alarm-rate-{}", index),
                                        "level": "warning",
                                        "message": "burst"
                                    }
                                }
                            ]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
    }

    let overflow = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "rate-limit-source",
                        "events": [
                            {
                                "type": "alarm",
                                "timestamp": 1234569000_u64,
                                "payload": {
                                    "id": "alarm-rate-overflow",
                                    "level": "warning",
                                    "message": "overflow"
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(overflow.status(), 429);
    let body = parse_json(overflow).await;
    assert_eq!(
        body["error"],
        json!("runtime ingest rate limit exceeded for workspace factory-demo-scene")
    );
}

#[tokio::test]
async fn runtime_ingest_rate_limit_cannot_be_bypassed_by_rotating_source() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    for index in 0..120 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/runtime/ingest")
                    .header(CONTENT_TYPE, "application/json")
                    .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                    .body(Body::from(
                        json!({
                            "source": format!("rotating-source-{}", index),
                            "events": [
                                {
                                    "type": "alarm",
                                    "timestamp": 2234567890_u64 + index,
                                    "payload": {
                                        "id": format!("alarm-rotating-rate-{}", index),
                                        "level": "warning",
                                        "message": "burst"
                                    }
                                }
                            ]
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
    }

    let overflow = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "rotating-source-overflow",
                        "events": [
                            {
                                "type": "alarm",
                                "timestamp": 2234569000_u64,
                                "payload": {
                                    "id": "alarm-rotating-rate-overflow",
                                    "level": "warning",
                                    "message": "overflow"
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(overflow.status(), 429);
}

#[tokio::test]
async fn runtime_ingest_rejects_oversized_incident_payload() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": [
                            {
                                "type": "incident",
                                "payload": {
                                    "incident": {
                                        "id": "incident-big-01",
                                        "message": "x".repeat(20_000)
                                    }
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 413);
    let body = parse_json(response).await;
    assert_eq!(body["error"], json!("incident payload exceeds 16384 bytes"));
}

#[tokio::test]
async fn runtime_ingest_rejects_malformed_incident_payload() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app(ALLOWED_ORIGIN)
        .await
        .expect("app should build");

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/runtime/ingest")
                .header(CONTENT_TYPE, "application/json")
                .header("x-runtime-ingest-token", RUNTIME_INGEST_TOKEN)
                .body(Body::from(
                    json!({
                        "source": "python-simulator",
                        "events": [
                            {
                                "type": "incident",
                                "payload": {
                                    "incident": {
                                        "id": "incident-invalid-01",
                                        "severity": "warning"
                                    }
                                }
                            }
                        ]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 400);
    let body = parse_json(response).await;
    assert_eq!(
        body["error"],
        json!("incident.eventType or incident.kind must be a non-empty string")
    );
}

async fn parse_json(response: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should read");
    serde_json::from_slice(&bytes).expect("response should be valid json")
}

async fn next_realtime_message(socket: &mut TestSocket) -> Value {
    timeout(Duration::from_secs(4), async {
        loop {
            let Some(frame) = socket.next().await else {
                panic!("websocket closed before the next runtime ingest event was received");
            };

            match frame.expect("websocket frame should be valid") {
                Message::Text(text) => {
                    return serde_json::from_str::<Value>(&text)
                        .expect("websocket text should be valid json");
                }
                Message::Binary(bytes) => {
                    return serde_json::from_slice::<Value>(&bytes)
                        .expect("websocket binary should be valid json");
                }
                Message::Close(frame) => {
                    panic!("websocket closed unexpectedly: {frame:?}");
                }
                Message::Ping(_) | Message::Pong(_) => {}
                Message::Frame(_) => {}
            }
        }
    })
    .await
    .expect("timed out waiting for a runtime ingest websocket message")
}

async fn next_realtime_binary_frame(socket: &mut TestSocket) -> Vec<u8> {
    timeout(Duration::from_secs(4), async {
        loop {
            let Some(frame) = socket.next().await else {
                panic!("websocket closed before the next runtime ingest frame was received");
            };

            match frame.expect("websocket frame should be valid") {
                Message::Binary(bytes) => return bytes,
                Message::Text(text) => {
                    panic!("expected binary pose frame, got websocket text: {text}");
                }
                Message::Close(frame) => {
                    panic!("websocket closed unexpectedly: {frame:?}");
                }
                Message::Ping(_) | Message::Pong(_) => {}
                Message::Frame(_) => {}
            }
        }
    })
    .await
    .expect("timed out waiting for a runtime ingest websocket binary frame")
}

fn first_pose_frame_yaw(frame: &[u8]) -> f32 {
    let id_byte_length = u16::from_le_bytes(frame[20..22].try_into().unwrap()) as usize;
    let yaw_offset = 20 + 2 + id_byte_length + 2 + 1 + 1 + 8 + 12;
    f32::from_le_bytes(frame[yaw_offset..yaw_offset + 4].try_into().unwrap())
}

fn websocket_request(ws_url: &str, origin: &str) -> Request<()> {
    let mut request = ws_url
        .into_client_request()
        .expect("websocket url should build a request");
    request.headers_mut().insert(
        "Origin",
        origin
            .parse()
            .expect("origin should be a valid header value"),
    );
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {REALTIME_ACCESS_TOKEN}")
            .parse()
            .expect("token should be a valid header value"),
    );
    request
}

async fn spawn_app(app: Router) -> (String, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("ephemeral listener should bind");
    let address = listener
        .local_addr()
        .expect("listener should expose a local address");
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("test server should run");
    });

    (format!("http://{address}"), server)
}

fn init_test_database_url() {
    std::env::set_var("DATABASE_URL", "sqlite::memory:");
    std::env::set_var("BACKEND_ADMIN_API_TOKEN", ADMIN_API_TOKEN);
    std::env::set_var("RUNTIME_INGEST_TOKEN", RUNTIME_INGEST_TOKEN);
    std::env::set_var("BACKEND_REALTIME_ACCESS_TOKEN", REALTIME_ACCESS_TOKEN);
}
