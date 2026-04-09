use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
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
    broadcaster: broadcast::Sender<RealtimeEvent>,
    allowed_origin: HeaderValue,
}

impl RealtimeState {
    pub fn new(allowed_origin: HeaderValue) -> Self {
        let (broadcaster, _) = broadcast::channel(128);

        Self {
            broadcaster,
            allowed_origin,
        }
    }

    fn subscribe(&self) -> broadcast::Receiver<RealtimeEvent> {
        self.broadcaster.subscribe()
    }

    fn origin_allowed(&self, origin: Option<&HeaderValue>) -> bool {
        origin == Some(&self.allowed_origin)
    }

    pub fn emit(&self, event: RealtimeEvent) {
        let _ = self.broadcaster.send(event);
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
                scene_version,
                changed_at: timestamp,
                scope,
                published_scene,
            },
        });
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
            allowed_origin = ?state.realtime.allowed_origin,
            "rejected websocket handshake due to invalid origin"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ws.on_upgrade(move |socket| client_stream(socket, state.realtime.clone())))
}

async fn client_stream(socket: WebSocket, state: RealtimeState) {
    let mut subscription = state.subscribe();

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
