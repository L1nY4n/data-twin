use std::{env, io};

use backend_core_rs::app::build_app;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> io::Result<()> {
    init_tracing();

    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "4000".to_string());
    let allowed_origin =
        env::var("BACKEND_ALLOWED_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let app = build_app(&allowed_origin)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
    let bind_address = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_address).await?;

    info!(
        listening_url = %format!("http://{bind_address}"),
        allowed_origin = %allowed_origin,
        "backend-core-rs listening",
    );
    println!("Listening on http://{bind_address}");

    axum::serve(listener, app).await
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info"));

    tracing_subscriber::fmt().with_env_filter(filter).init();
}
