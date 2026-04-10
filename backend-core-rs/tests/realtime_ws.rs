use axum::{http::Request, Router};
use tokio::{net::TcpListener, task::JoinHandle};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error as TungsteniteError},
};

const ALLOWED_ORIGIN: &str = "http://localhost:3000";

#[tokio::test]
async fn realtime_websocket_accepts_valid_origin() {
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

    socket
        .close(None)
        .await
        .expect("socket should close cleanly");

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn realtime_websocket_accepts_secondary_origin_when_multiple_origins_are_configured() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app("http://localhost:3000,http://127.0.0.1:3000")
            .await
            .expect("valid allowed origins should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let (mut socket, _) = connect_async(websocket_request(&ws_url, "http://127.0.0.1:3000"))
        .await
        .expect("websocket should connect for the secondary configured origin");

    socket
        .close(None)
        .await
        .expect("socket should close cleanly");

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
