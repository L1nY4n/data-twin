use axum::{
    extract::{
        Path,
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, sync::{Arc, Mutex}};
use tokio::sync::broadcast;
use tracing::{debug, warn};

use crate::{
    app::AppState,
    contracts::{
        ConfigChangedPayload, ConfigChangedScope, PublishedSceneDescriptor, RealtimeEvent,
    },
};

#[derive(Clone)]
pub struct RealtimeState {
    broadcasters: Arc<Mutex<HashMap<String, broadcast::Sender<RealtimeEvent>>>>,
    allowed_origins: Vec<HeaderValue>,
}

impl RealtimeState {
    pub fn new(allowed_origins: Vec<HeaderValue>) -> Self {
        Self {
            broadcasters: Arc::new(Mutex::new(HashMap::new())),
            allowed_origins,
        }
    }

    fn sender_for(&self, workspace_id: &str) -> broadcast::Sender<RealtimeEvent> {
        let mut broadcasters = self
            .broadcasters
            .lock()
            .expect("realtime broadcaster mutex should not be poisoned");
        broadcasters
            .entry(workspace_id.to_string())
            .or_insert_with(|| {
                let (sender, _) = broadcast::channel(128);
                sender
            })
            .clone()
    }

    fn subscribe(&self, workspace_id: &str) -> broadcast::Receiver<RealtimeEvent> {
        self.sender_for(workspace_id).subscribe()
    }

    fn origin_allowed(&self, origin: Option<&HeaderValue>) -> bool {
        origin
            .map(|candidate| self.allowed_origins.iter().any(|allowed| allowed == candidate))
            .unwrap_or(false)
    }

    pub fn emit(&self, event: RealtimeEvent) {
        self.emit_for_workspace("global", event);
    }

    pub fn emit_for_workspace(&self, workspace_id: &str, event: RealtimeEvent) {
        let _ = self.sender_for(workspace_id).send(event);
    }

    pub fn emit_config_changed(
        &self,
        scene_version: u64,
        scope: ConfigChangedScope,
        published_scene: Option<PublishedSceneDescriptor>,
    ) {
        let timestamp = now_millis();
        self.emit(RealtimeEvent::ConfigChanged {
            timestamp,
            payload: ConfigChangedPayload {
                workspace_id: "global".to_string(),
                scene_version,
                changed_at: timestamp,
                scope,
                published_scene,
            },
        });
    }

    pub fn emit_config_changed_for_workspace(
        &self,
        workspace_id: &str,
        scene_version: u64,
        scope: ConfigChangedScope,
        published_scene: Option<PublishedSceneDescriptor>,
    ) {
        let timestamp = now_millis();
        self.emit_for_workspace(
            workspace_id,
            RealtimeEvent::ConfigChanged {
                timestamp,
                payload: ConfigChangedPayload {
                    workspace_id: workspace_id.to_string(),
                    scene_version,
                    changed_at: timestamp,
                    scope,
                    published_scene,
                },
            },
        );
    }
}

pub async fn realtime_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    if !state.realtime.origin_allowed(headers.get(header::ORIGIN)) {
        warn!(
            request_origin = ?headers.get(header::ORIGIN),
            allowed_origins = ?state.realtime.allowed_origins,
            "rejected websocket handshake due to invalid origin"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    let home_workspace_id = state
        .store
        .get_homepage_workspace()
        .await
        .map(|workspace| workspace.id)
        .unwrap_or_else(|_| "global".to_string());

    Ok(ws.on_upgrade(move |socket| {
        client_stream(socket, state.realtime.clone(), home_workspace_id)
    }))
}

pub async fn workspace_realtime_ws_handler(
    Path(workspace_id): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    if !state.realtime.origin_allowed(headers.get(header::ORIGIN)) {
        warn!(
            request_origin = ?headers.get(header::ORIGIN),
            allowed_origins = ?state.realtime.allowed_origins,
            "rejected websocket handshake due to invalid origin"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ws.on_upgrade(move |socket| {
        client_stream(socket, state.realtime.clone(), workspace_id)
    }))
}

async fn client_stream(socket: WebSocket, state: RealtimeState, workspace_id: String) {
    let mut subscription = state.subscribe(&workspace_id);

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            event = subscription.recv() => {
                match event {
                    Ok(event) => {
                        let message: String = match serde_json::to_string(&event) {
                            Ok(message) => message,
                            Err(error) => {
                                warn!(%error, "failed to serialize realtime event");
                                continue;
                            }
                        };

                        if sender.send(Message::Text(message)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        debug!(skipped, "websocket client lagged behind realtime stream");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            inbound = receiver.next() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        debug!(%error, "websocket client disconnected");
                        break;
                    }
                }
            }
        }
    }
}

pub(crate) fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}
