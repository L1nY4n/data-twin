use std::{env, io};

use backend_core_rs::app::build_app;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> io::Result<()> {
    init_tracing();

    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "4000".to_string());
    let allowed_origin = env::var("BACKEND_ALLOWED_ORIGIN")
        .unwrap_or_else(|_| {
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001".to_string()
        });
    let app = build_app(&allowed_origin)
        .await
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
    let bind_address = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_address).await?;

    info!("Listening on http://{bind_address}");

    axum::serve(listener, app).await
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info"));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(io::stdout)
        .init();
}
