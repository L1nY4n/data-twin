use axum::{http::Request, Router};
use serde_json::Value;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinHandle,
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error as TungsteniteError},
};

const ALLOWED_ORIGIN: &str = "http://localhost:3000";
const REALTIME_ACCESS_TOKEN: &str = "test-realtime-access-token";

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

#[tokio::test]
async fn realtime_websocket_rejects_missing_access_token() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let error = connect_async(websocket_request_without_token(&ws_url, ALLOWED_ORIGIN))
        .await
        .expect_err("websocket should reject missing access token");

    match error {
        TungsteniteError::Http(response) => {
            assert_eq!(
                response.status(),
                401,
                "expected 401 for missing access token"
            );
        }
        other => panic!("expected HTTP rejection for missing access token, got {other:?}"),
    }

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn realtime_websocket_accepts_server_issued_ticket_without_exposing_static_secret() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    let ticket_body = post_realtime_ticket(&base_url)
        .await
        .expect("ticket request should complete");
    let ticket = ticket_body["token"]
        .as_str()
        .expect("ticket response should include token");

    let ws_url = format!("{}/ws/realtime", base_url.replace("http", "ws"));
    let mut request = websocket_request_without_token(&ws_url, ALLOWED_ORIGIN);
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        format!("dt-realtime-token, {ticket}")
            .parse()
            .expect("ticket should be a valid websocket protocol value"),
    );
    let (mut socket, _) = connect_async(request)
        .await
        .expect("websocket should connect with server-issued ticket");

    socket
        .close(None)
        .await
        .expect("socket should close cleanly");

    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn realtime_ticket_endpoint_rate_limits_repeated_scope() {
    init_test_database_url();
    let (base_url, server) = spawn_app(
        backend_core_rs::app::build_app(ALLOWED_ORIGIN)
            .await
            .expect("valid allowed origin should build the app"),
    )
    .await;

    for _ in 0..60 {
        let (status, _) = post_realtime_ticket_response(&base_url, Some("same-browser-session"))
            .await
            .expect("ticket request should complete");
        assert_eq!(status, 200);
    }

    let (status, body) = post_realtime_ticket_response(&base_url, Some("same-browser-session"))
        .await
        .expect("rate-limited ticket request should complete");
    assert_eq!(status, 429);
    assert_eq!(
        body["error"].as_str(),
        Some("realtime ticket rate limit exceeded"),
        "repeated ticket requests from one scope should be bounded"
    );

    server.abort();
    let _ = server.await;
}

async fn post_realtime_ticket(base_url: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let (status, body) = post_realtime_ticket_response(base_url, None).await?;
    if status != 200 {
        return Err(format!("ticket request failed with status {status}: {body}").into());
    }
    Ok(body)
}

async fn post_realtime_ticket_response(
    base_url: &str,
    ticket_scope: Option<&str>,
) -> Result<(u16, Value), Box<dyn std::error::Error>> {
    let address = base_url
        .strip_prefix("http://")
        .ok_or("test helper only supports http:// URLs")?;
    let mut stream = TcpStream::connect(address).await?;
    let scope_header = ticket_scope
        .map(|scope| format!("x-realtime-ticket-scope: {scope}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "POST /api/v1/realtime/ticket HTTP/1.1\r\nHost: {address}\r\nx-realtime-access-token: {REALTIME_ACCESS_TOKEN}\r\n{scope_header}Content-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await?;
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await?;
    let response = String::from_utf8(bytes)?;
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return Err("ticket response did not contain a body".into());
    };
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or("ticket response did not include an HTTP status")?;
    Ok((status, serde_json::from_str(body)?))
}

fn websocket_request(ws_url: &str, origin: &str) -> Request<()> {
    let mut request = websocket_request_without_token(ws_url, origin);
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {REALTIME_ACCESS_TOKEN}")
            .parse()
            .expect("token should be a valid header value"),
    );
    request
}

fn websocket_request_without_token(ws_url: &str, origin: &str) -> Request<()> {
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
    std::env::set_var("BACKEND_REALTIME_ACCESS_TOKEN", REALTIME_ACCESS_TOKEN);
}
