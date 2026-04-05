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

type TestSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::test]
async fn admin_write_pushes_config_changed_event() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");
    let update_app = app.clone();

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, "http://localhost:3000"))
        .await
        .expect("websocket should connect");

    let payload = json!({
      "id": "factory-demo-scene",
      "name": "配置变更测试",
      "gridSize": 100,
      "gridDivisions": 100,
      "backgroundColor": "#0a0a0f",
      "ambientLightIntensity": 0.5,
      "showAxes": false,
      "showGrid": true,
      "cameraPosition": {"x": 50.0, "y": 50.0, "z": 50.0},
      "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0}
    });

    let response = update_app
        .oneshot(
            Request::builder()
                .method(Method::PUT)
                .uri("/api/v1/admin/scene")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);

    let event = next_config_changed(&mut socket).await;
    assert_eq!(event["type"], json!("config_changed"));
    assert_eq!(event["payload"]["scope"], json!("scene"));
    assert!(event["payload"]["sceneVersion"].as_u64().unwrap() >= 2);
    assert_eq!(
        event["payload"]["publishedScene"]["packageUrl"],
        json!("/generated/published-static/published-scene-package.json")
    );
    assert_eq!(
        event["payload"]["publishedScene"]["staticAssetManifestUrl"],
        json!("/generated/published-static/chunk-manifest.json")
    );
    assert!(event["payload"]["publishedScene"]["packageVersion"].is_string());

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn static_asset_write_pushes_config_changed_event() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");
    let update_app = app.clone();

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, "http://localhost:3000"))
        .await
        .expect("websocket should connect");

    let payload = json!({
      "id": "static-asset-rack-01",
      "name": "西区管廊 A",
      "assetKind": "pipe-rack",
      "variant": "west-header",
      "position": {"x": -52.0, "y": 0.0, "z": -18.0},
      "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
      "visible": true,
      "metadata": {},
      "createdAt": 0,
      "updatedAt": 0
    });

    let response = update_app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/static-assets")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);

    let event = next_config_changed(&mut socket).await;
    assert_eq!(event["type"], json!("config_changed"));
    assert_eq!(event["payload"]["scope"], json!("static_asset"));
    assert!(event["payload"]["sceneVersion"].as_u64().unwrap() >= 2);

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn publish_pushes_publish_scoped_config_changed_event() {
    init_test_database_url();
    let app = backend_core_rs::app::build_app("http://localhost:3000")
        .await
        .expect("app should build");
    let update_app = app.clone();

    let create_response = update_app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/static-assets")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                      "id": "static-asset-ws-publish-01",
                      "name": "发布 websocket 罐体",
                      "assetKind": "vertical-tank",
                      "variant": "fixed-roof",
                      "position": {"x": 12.0, "y": 0.0, "z": -6.0},
                      "rotation": {"x": 0.0, "y": 0.6, "z": 0.0},
                      "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                      "visible": true,
                      "metadata": {},
                      "createdAt": 0,
                      "updatedAt": 0
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_response.status(), 200);

    let (base_url, server) = spawn_app(app).await;
    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, "http://localhost:3000"))
        .await
        .expect("websocket should connect");

    let publish_response = update_app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/admin/publish")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(publish_response.status(), 200);

    let event = next_config_changed(&mut socket).await;
    assert_eq!(event["type"], json!("config_changed"));
    assert_eq!(event["payload"]["scope"], json!("publish"));
    assert!(event["payload"]["publishedScene"]["packageUrl"]
        .as_str()
        .unwrap()
        .contains("/generated/published-static/versions/"));
    assert!(event["payload"]["publishedScene"]["packageVersion"].is_string());

    server.abort();
    let _ = server.await;
}

async fn next_config_changed(socket: &mut TestSocket) -> Value {
    timeout(Duration::from_secs(6), async {
        loop {
            let Some(frame) = socket.next().await else {
                panic!("websocket closed before receiving config_changed event");
            };

            let json = match frame.expect("frame should be valid") {
                Message::Text(text) => serde_json::from_str::<Value>(&text).unwrap(),
                Message::Binary(bytes) => serde_json::from_slice::<Value>(&bytes).unwrap(),
                Message::Close(frame) => panic!("socket closed unexpectedly: {frame:?}"),
                Message::Ping(_) | Message::Pong(_) => continue,
                Message::Frame(_) => continue,
            };

            if json["type"] == "config_changed" {
                return json;
            }
        }
    })
    .await
    .expect("timed out waiting for config_changed event")
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
