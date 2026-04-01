use axum::Router;
use futures_util::StreamExt;
use serde_json::Value;
use tokio::{
    net::TcpListener,
    task::JoinHandle,
    time::{timeout, Duration},
};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn realtime_websocket_emits_position_update_for_seeded_forklift() {
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app("http://localhost:3000")
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(&ws_url)
        .await
        .expect("websocket should connect");

    let message = timeout(Duration::from_secs(4), async {
        loop {
            let Some(frame) = socket.next().await else {
                panic!("websocket closed before any realtime message was received");
            };

            match frame.expect("websocket frame should be valid") {
                Message::Text(text) => {
                    let payload = serde_json::from_str::<Value>(&text)
                        .expect("websocket text should be valid json");
                    if payload["type"] == "position_update" {
                        return payload;
                    }
                }
                Message::Binary(bytes) => {
                    let payload = serde_json::from_slice::<Value>(&bytes)
                        .expect("websocket binary should be valid json");
                    if payload["type"] == "position_update" {
                        return payload;
                    }
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
    .expect("timed out waiting for a realtime message");

    assert_eq!(message["type"], "position_update");
    assert_eq!(message["payload"]["entityId"], "vehicle-forklift-01");
    assert!(message["payload"]["position"]["x"].is_number());
    assert!(message["payload"]["position"]["y"].is_number());
    assert!(message["payload"]["position"]["z"].is_number());

    server.abort();
    let _ = server.await;
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
