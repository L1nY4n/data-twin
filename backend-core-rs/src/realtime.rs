use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use tokio::{
    sync::broadcast,
    time::{interval, MissedTickBehavior},
};
use tracing::{debug, warn};

use crate::contracts::{
    AlarmEventPayload, AlarmLevel, ContractValue, EntityStatus, PositionUpdatePayload,
    RealtimeEvent, StatusUpdatePayload, Vector3,
};

const TICK_INTERVAL: Duration = Duration::from_millis(200);
const REALTIME_BASE_TIMESTAMP: u64 = 1_775_000_000_000;
const FORKLIFT_ID: &str = "vehicle-forklift-01";
const EQUIPMENT_ID: &str = "equipment-cnc-01";

#[derive(Clone)]
pub struct RealtimeState {
    broadcaster: broadcast::Sender<RealtimeEvent>,
    ticker_started: Arc<AtomicBool>,
    allowed_origin: HeaderValue,
}

impl RealtimeState {
    pub fn new(allowed_origin: HeaderValue) -> Self {
        let (broadcaster, _) = broadcast::channel(32);

        Self {
            broadcaster,
            ticker_started: Arc::new(AtomicBool::new(false)),
            allowed_origin,
        }
    }

    fn subscribe(&self) -> broadcast::Receiver<RealtimeEvent> {
        self.broadcaster.subscribe()
    }

    fn origin_allowed(&self, origin: Option<&HeaderValue>) -> bool {
        origin == Some(&self.allowed_origin)
    }

    fn ensure_ticker_started(&self) {
        if self
            .ticker_started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            let broadcaster = self.broadcaster.clone();
            tokio::spawn(async move {
                run_deterministic_ticker(broadcaster).await;
            });
        }
    }
}

pub async fn realtime_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<RealtimeState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    if !state.origin_allowed(headers.get(header::ORIGIN)) {
        warn!(
            request_origin = ?headers.get(header::ORIGIN),
            allowed_origin = ?state.allowed_origin,
            "rejected websocket handshake due to invalid origin"
        );
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ws.on_upgrade(move |socket| client_stream(socket, state)))
}

async fn client_stream(socket: WebSocket, state: RealtimeState) {
    let mut subscription = state.subscribe();
    state.ensure_ticker_started();

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

async fn run_deterministic_ticker(broadcaster: broadcast::Sender<RealtimeEvent>) {
    let mut tick = 0_u64;
    let mut timer = interval(TICK_INTERVAL);
    timer.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        timer.tick().await;
        tick += 1;
        let timestamp = REALTIME_BASE_TIMESTAMP + tick * TICK_INTERVAL.as_millis() as u64;

        let path_index = ((tick - 1) as usize) % forklift_path().len();
        let position = forklift_path()[path_index];
        let rotation = Vector3 {
            x: 0.0,
            y: forklift_headings()[path_index],
            z: 0.0,
        };

        let _ = broadcaster.send(RealtimeEvent::PositionUpdate {
            timestamp,
            payload: PositionUpdatePayload {
                entity_id: FORKLIFT_ID.to_string(),
                position,
                rotation: Some(rotation),
                speed: Some(forklift_speeds()[path_index]),
                heading: Some(forklift_headings()[path_index]),
            },
        });

        if tick.is_multiple_of(3) {
            let status = if (tick / 3) % 2 == 1 {
                EntityStatus::Warning
            } else {
                EntityStatus::Active
            };

            let mut parameters = BTreeMap::new();
            parameters.insert(
                "spindleLoad".to_string(),
                ContractValue::Number(72.0 + (tick / 3 % 3) as f64 * 4.0),
            );
            parameters.insert(
                "cycleState".to_string(),
                ContractValue::String(match status {
                    EntityStatus::Warning => "warning".to_string(),
                    _ => "active".to_string(),
                }),
            );

            let _ = broadcaster.send(RealtimeEvent::StatusUpdate {
                timestamp,
                payload: StatusUpdatePayload {
                    entity_id: EQUIPMENT_ID.to_string(),
                    status,
                    parameters: Some(parameters),
                },
            });
        }

        if tick.is_multiple_of(6) {
            let _ = broadcaster.send(RealtimeEvent::Alarm {
                timestamp,
                payload: AlarmEventPayload {
                    id: format!("alarm-workshop-zone-{:02}", tick / 6),
                    level: AlarmLevel::Warning,
                    message: "Workshop zone proximity warning".to_string(),
                },
            });
        }
    }
}

fn forklift_path() -> [Vector3; 4] {
    [
        Vector3 {
            x: 9.0,
            y: 0.0,
            z: -1.5,
        },
        Vector3 {
            x: 8.4,
            y: 0.0,
            z: -0.7,
        },
        Vector3 {
            x: 7.8,
            y: 0.0,
            z: 0.1,
        },
        Vector3 {
            x: 7.2,
            y: 0.0,
            z: 0.9,
        },
    ]
}

fn forklift_headings() -> [f32; 4] {
    [90.0, 98.0, 106.0, 114.0]
}

fn forklift_speeds() -> [f32; 4] {
    [3.2, 3.4, 3.1, 2.9]
}
