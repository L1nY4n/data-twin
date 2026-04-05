use axum::{http::Request, Router};
use futures_util::StreamExt;
use serde_json::{json, Value};
use tokio::{
    net::TcpListener,
    task::JoinHandle,
    time::{timeout, Duration},
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error as TungsteniteError, Message},
    MaybeTlsStream, WebSocketStream,
};

const ALLOWED_ORIGIN: &str = "http://localhost:3000";
type TestSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::test]
async fn realtime_websocket_emits_seeded_event_sequence() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, ALLOWED_ORIGIN))
        .await
        .expect("websocket should connect");

    let expected_events = [
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_000_200_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 9.0, "y": 0.0, "z": -1.5},
                "rotation": {"x": 0.0, "y": 90.0, "z": 0.0},
                "speed": 3.2,
                "heading": 90.0
            }
        }),
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_000_400_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 8.4, "y": 0.0, "z": -0.7},
                "rotation": {"x": 0.0, "y": 98.0, "z": 0.0},
                "speed": 3.4,
                "heading": 98.0
            }
        }),
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_000_600_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 7.8, "y": 0.0, "z": 0.1},
                "rotation": {"x": 0.0, "y": 106.0, "z": 0.0},
                "speed": 3.1,
                "heading": 106.0
            }
        }),
        json!({
            "type": "status_update",
            "timestamp": 1_775_000_000_600_u64,
            "payload": {
                "entityId": "equipment-cnc-01",
                "status": "warning",
                "parameters": {
                    "cycleState": "warning",
                    "spindleLoad": 76.0
                }
            }
        }),
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_000_800_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 7.2, "y": 0.0, "z": 0.9},
                "rotation": {"x": 0.0, "y": 114.0, "z": 0.0},
                "speed": 2.9,
                "heading": 114.0
            }
        }),
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_001_000_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 9.0, "y": 0.0, "z": -1.5},
                "rotation": {"x": 0.0, "y": 90.0, "z": 0.0},
                "speed": 3.2,
                "heading": 90.0
            }
        }),
        json!({
            "type": "position_update",
            "timestamp": 1_775_000_001_200_u64,
            "payload": {
                "entityId": "vehicle-forklift-01",
                "position": {"x": 8.4, "y": 0.0, "z": -0.7},
                "rotation": {"x": 0.0, "y": 98.0, "z": 0.0},
                "speed": 3.4,
                "heading": 98.0
            }
        }),
        json!({
            "type": "status_update",
            "timestamp": 1_775_000_001_200_u64,
            "payload": {
                "entityId": "equipment-cnc-01",
                "status": "active",
                "parameters": {
                    "cycleState": "active",
                    "spindleLoad": 80.0
                }
            }
        }),
        json!({
            "type": "alarm",
            "timestamp": 1_775_000_001_200_u64,
            "payload": {
                "id": "alarm-workshop-zone-01",
                "level": "warning",
                "message": "Workshop zone proximity warning"
            }
        }),
    ];

    for expected_event in expected_events {
        assert_eq!(next_realtime_message(&mut socket).await, expected_event);
    }

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn realtime_websocket_rejects_invalid_origin() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let error = connect_async(websocket_request(&ws_url, "http://malicious.example"))
        .await
        .expect_err("websocket should reject mismatched origin");

    assert_forbidden_handshake(error, "invalid origin");

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn realtime_websocket_rejects_missing_origin() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let error = connect_async(&ws_url)
        .await
        .expect_err("websocket should reject a handshake without origin");

    assert_forbidden_handshake(error, "missing origin");

    server.abort();
    let _ = server.await;
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
    request
}

fn assert_forbidden_handshake(error: TungsteniteError, context: &str) {
    match error {
        TungsteniteError::Http(response) => {
            assert_eq!(response.status(), 403, "expected 403 for {context}");
        }
        other => panic!("expected HTTP rejection for {context}, got {other:?}"),
    }
}

async fn next_realtime_message(socket: &mut TestSocket) -> Value {
    timeout(Duration::from_secs(4), async {
        loop {
            let Some(frame) = socket.next().await else {
                panic!("websocket closed before the next realtime message was received");
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
    .expect("timed out waiting for a realtime message")
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
}
