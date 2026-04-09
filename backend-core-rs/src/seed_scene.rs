use std::collections::BTreeMap;

use crate::contracts::{
    AccessAction, AccessRule, CameraEntity, CameraType, ContractValue, Entity, EntityBase,
    EntityStatus, EquipmentEntity, GraphPosition, PersonEntity, RuleConfig, RuleEdge, RuleNode,
    RuleNodeData, RuleNodeType, SceneConfig, SensorEntity, SensorType, TimeRange, Vector3,
    VehicleEntity, VehicleRouteTrack, VehicleTrackPosition, VehicleType, ZoneEntity, ZoneType,
};

pub const SITE_ID: &str = "factory-demo-site";
const SCENE_ID: &str = "factory-demo-scene";
pub const SEEDED_TIMESTAMP: u64 = 1_775_000_000_000;
pub const SEEDED_SCENE_VERSION: u64 = 1;

pub struct SeedSnapshot {
    pub scene_version: u64,
    pub scene_config: SceneConfig,
    pub entities: Vec<Entity>,
    pub rules: Vec<RuleConfig>,
}

pub fn seed_snapshot() -> SeedSnapshot {
    SeedSnapshot {
        scene_version: SEEDED_SCENE_VERSION,
        scene_config: seed_scene_config(),
        entities: seed_entities(),
        rules: vec![seed_zone_warning_rule()],
    }
}

fn seed_scene_config() -> SceneConfig {
    SceneConfig {
        id: SCENE_ID.to_string(),
        name: "数字孪生演示场景".to_string(),
        grid_size: 100,
        grid_divisions: 100,
        background_color: "#0a0a0f".to_string(),
        ambient_light_intensity: 0.5,
        show_axes: false,
        show_grid: true,
        camera_position: Vector3 {
            x: 50.0,
            y: 50.0,
            z: 50.0,
        },
        camera_target: Vector3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
    }
}

fn seed_entities() -> Vec<Entity> {
    let mut entities = vec![
        Entity::Zone(seed_workshop_zone()),
        Entity::Person(seed_operator()),
    ];
    entities.extend(seed_forklifts().into_iter().map(Entity::Vehicle));
    entities.extend([
        Entity::Equipment(seed_cnc_equipment()),
        Entity::Sensor(seed_temperature_sensor()),
        Entity::Sensor(seed_gas_sensor()),
        Entity::Sensor(seed_pressure_sensor()),
        Entity::Camera(seed_gate_camera()),
        Entity::Camera(seed_yard_camera()),
    ]);
    entities
}

fn seed_workshop_zone() -> ZoneEntity {
    ZoneEntity {
        base: entity_base(
            "zone-workshop-01",
            "总装作业区",
            Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            EntityStatus::Active,
        ),
        boundary: vec![
            Vector3 {
                x: -12.0,
                y: 0.0,
                z: -10.0,
            },
            Vector3 {
                x: 12.0,
                y: 0.0,
                z: -10.0,
            },
            Vector3 {
                x: 12.0,
                y: 0.0,
                z: 10.0,
            },
            Vector3 {
                x: -12.0,
                y: 0.0,
                z: 10.0,
            },
        ],
        zone_type: ZoneType::Work,
        color: "#22c55e".to_string(),
        access_rules: vec![AccessRule {
            id: "access-workshop-operators".to_string(),
            allowed_roles: vec!["操作员".to_string(), "巡检员".to_string()],
            allowed_departments: vec!["生产部".to_string()],
            time_ranges: vec![TimeRange {
                start: SEEDED_TIMESTAMP,
                end: SEEDED_TIMESTAMP + 28_800_000,
                label: Some("白班".to_string()),
            }],
            action: AccessAction::Alert,
        }],
        capacity: Some(8),
        current_occupancy: Some(2),
    }
}

fn seed_operator() -> PersonEntity {
    PersonEntity {
        base: entity_base(
            "person-operator-01",
            "巡检员 A",
            Vector3 {
                x: -4.0,
                y: 0.0,
                z: 2.0,
            },
            EntityStatus::Active,
        ),
        role: "操作员".to_string(),
        department: "生产部".to_string(),
        avatar: None,
        schedule: vec![TimeRange {
            start: SEEDED_TIMESTAMP,
            end: SEEDED_TIMESTAMP + 28_800_000,
            label: Some("巡检班次".to_string()),
        }],
        current_activity: Some("巡检中".to_string()),
    }
}

fn seed_forklifts() -> Vec<VehicleEntity> {
    vec![
        seed_forklift(
            "vehicle-forklift-01",
            "叉车 01",
            "沪A12345",
            EntityStatus::Warning,
            90.0,
            2.6,
            560.0,
            build_forklift_route_track(
                "forklift-track-01",
                "装卸主环线",
                vec![
                    Vector3 { x: -92.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -28.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 36.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 96.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 86.0, y: 0.0, z: 30.0 },
                    Vector3 { x: 86.0, y: 0.0, z: 2.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 0.0, y: 0.0, z: -72.0 },
                    Vector3 { x: -88.0, y: 0.0, z: -72.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 2.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 30.0 },
                ],
            ),
        ),
        seed_forklift(
            "vehicle-forklift-02",
            "叉车 02",
            "沪A22346",
            EntityStatus::Active,
            180.0,
            2.2,
            820.0,
            build_forklift_route_track(
                "forklift-track-02",
                "货架补料线",
                vec![
                    Vector3 { x: -68.0, y: 0.0, z: 72.0 },
                    Vector3 { x: 68.0, y: 0.0, z: 72.0 },
                    Vector3 { x: 96.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 68.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 4.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -60.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -92.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 30.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 2.0 },
                ],
            ),
        ),
        seed_forklift(
            "vehicle-forklift-03",
            "叉车 03",
            "沪A32347",
            EntityStatus::Active,
            270.0,
            2.4,
            410.0,
            build_forklift_route_track(
                "forklift-track-03",
                "北侧周转线",
                vec![
                    Vector3 { x: -84.0, y: 0.0, z: -4.0 },
                    Vector3 { x: -36.0, y: 0.0, z: -4.0 },
                    Vector3 { x: 32.0, y: 0.0, z: -4.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -4.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -26.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 0.0, y: 0.0, z: -72.0 },
                    Vector3 { x: -88.0, y: 0.0, z: -72.0 },
                    Vector3 { x: -88.0, y: 0.0, z: -26.0 },
                ],
            ),
        ),
        seed_forklift(
            "vehicle-forklift-04",
            "叉车 04",
            "沪A42348",
            EntityStatus::Active,
            0.0,
            2.1,
            1230.0,
            build_forklift_route_track(
                "forklift-track-04",
                "西侧回库线",
                vec![
                    Vector3 { x: 0.0, y: 0.0, z: 32.0 },
                    Vector3 { x: 0.0, y: 0.0, z: 4.0 },
                    Vector3 { x: 0.0, y: 0.0, z: -24.0 },
                    Vector3 { x: 0.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 86.0, y: 0.0, z: 2.0 },
                    Vector3 { x: 68.0, y: 0.0, z: 54.0 },
                    Vector3 { x: 4.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -60.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 30.0 },
                ],
            ),
        ),
        seed_forklift(
            "vehicle-forklift-05",
            "叉车 05",
            "沪A52349",
            EntityStatus::Active,
            45.0,
            2.8,
            260.0,
            build_forklift_route_track(
                "forklift-track-05",
                "南北穿梭线",
                vec![
                    Vector3 { x: -88.0, y: 0.0, z: 30.0 },
                    Vector3 { x: -88.0, y: 0.0, z: 2.0 },
                    Vector3 { x: -88.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 0.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 86.0, y: 0.0, z: -72.0 },
                    Vector3 { x: 86.0, y: 0.0, z: 2.0 },
                    Vector3 { x: 86.0, y: 0.0, z: 30.0 },
                    Vector3 { x: 36.0, y: 0.0, z: 54.0 },
                    Vector3 { x: -28.0, y: 0.0, z: 54.0 },
                ],
            ),
        ),
    ]
}

fn seed_forklift(
    id: &str,
    name: &str,
    plate_number: &str,
    status: EntityStatus,
    heading: f32,
    speed: f32,
    current_load: f32,
    route_track: VehicleRouteTrack,
) -> VehicleEntity {
    let position = route_track.waypoints[0];
    let mut base = entity_base(id, name, position, status);
    base.rotation = Vector3 {
        x: 0.0,
        y: heading.to_radians(),
        z: 0.0,
    };

    VehicleEntity {
        base,
        plate_number: plate_number.to_string(),
        vehicle_type: VehicleType::Forklift,
        speed,
        heading,
        capacity: Some(2000.0),
        current_load: Some(current_load),
        track_position: Some(build_track_position(&route_track, 0, 0.0)),
        route_track: Some(route_track),
    }
}

fn build_forklift_route_track(
    track_id: &str,
    label: &str,
    waypoints: Vec<Vector3>,
) -> VehicleRouteTrack {
    VehicleRouteTrack {
        route_id: "factory-yard-circulation".to_string(),
        track_id: track_id.to_string(),
        label: label.to_string(),
        looped: true,
        waypoints,
    }
}

fn build_track_position(
    route_track: &VehicleRouteTrack,
    segment_index: u32,
    segment_progress: f32,
) -> VehicleTrackPosition {
    let next_waypoint_index = ((segment_index as usize + 1) % route_track.waypoints.len()) as u32;
    VehicleTrackPosition {
        route_id: route_track.route_id.clone(),
        track_id: route_track.track_id.clone(),
        segment_index,
        next_waypoint_index,
        segment_progress,
    }
}

fn seed_cnc_equipment() -> EquipmentEntity {
    let mut parameters = BTreeMap::new();
    parameters.insert("功率".to_string(), ContractValue::Number(78.0));
    parameters.insert("温度".to_string(), ContractValue::Number(62.0));
    parameters.insert("运行时间".to_string(), ContractValue::Number(1840.0));

    EquipmentEntity {
        base: entity_base(
            "equipment-cnc-01",
            "CNC 机床 01",
            Vector3 {
                x: -8.0,
                y: 0.0,
                z: -6.0,
            },
            EntityStatus::Active,
        ),
        model_id: None,
        model_url: None,
        parameters,
        alarms: Vec::new(),
        maintenance_schedule: None,
    }
}

fn seed_temperature_sensor() -> SensorEntity {
    SensorEntity {
        base: entity_base(
            "sensor-temp-reactor-01",
            "反应釜温度传感器 01",
            Vector3 {
                x: -6.5,
                y: 2.2,
                z: -5.0,
            },
            EntityStatus::Active,
        ),
        sensor_type: SensorType::Temperature,
        unit: "C".to_string(),
        reading: 68.5,
        threshold_min: Some(10.0),
        threshold_max: Some(75.0),
    }
}

fn seed_gas_sensor() -> SensorEntity {
    SensorEntity {
        base: entity_base(
            "sensor-gas-loading-01",
            "装卸区气体传感器 01",
            Vector3 {
                x: 13.5,
                y: 2.4,
                z: 6.0,
            },
            EntityStatus::Warning,
        ),
        sensor_type: SensorType::Gas,
        unit: "ppm".to_string(),
        reading: 41.2,
        threshold_min: Some(0.0),
        threshold_max: Some(45.0),
    }
}

fn seed_pressure_sensor() -> SensorEntity {
    SensorEntity {
        base: entity_base(
            "sensor-pressure-pump-01",
            "泵站压力传感器 01",
            Vector3 {
                x: 6.0,
                y: 1.8,
                z: -8.5,
            },
            EntityStatus::Active,
        ),
        sensor_type: SensorType::Pressure,
        unit: "bar".to_string(),
        reading: 5.8,
        threshold_min: Some(3.0),
        threshold_max: Some(8.0),
    }
}

fn seed_gate_camera() -> CameraEntity {
    CameraEntity {
        base: entity_base(
            "camera-gate-fixed-01",
            "南门固定摄像头 01",
            Vector3 {
                x: 18.0,
                y: 5.0,
                z: 1.5,
            },
            EntityStatus::Active,
        ),
        camera_type: CameraType::Fixed,
        stream_url: Some("rtsp://demo.local/cam/gate-fixed-01".to_string()),
        fov: 75.0,
        heading: 180.0,
        range: Some(30.0),
        recording: true,
    }
}

fn seed_yard_camera() -> CameraEntity {
    CameraEntity {
        base: entity_base(
            "camera-yard-ptz-01",
            "货场云台摄像头 01",
            Vector3 {
                x: 4.0,
                y: 6.0,
                z: 14.0,
            },
            EntityStatus::Active,
        ),
        camera_type: CameraType::Ptz,
        stream_url: Some("rtsp://demo.local/cam/yard-ptz-01".to_string()),
        fov: 95.0,
        heading: 225.0,
        range: Some(55.0),
        recording: true,
    }
}

fn seed_zone_warning_rule() -> RuleConfig {
    let mut trigger_config = BTreeMap::new();
    trigger_config.insert(
        "zoneId".to_string(),
        ContractValue::String("zone-workshop-01".to_string()),
    );
    trigger_config.insert(
        "entityId".to_string(),
        ContractValue::String("vehicle-forklift-01".to_string()),
    );
    trigger_config.insert("triggerRadius".to_string(), ContractValue::Number(6.0));

    let mut action_config = BTreeMap::new();
    action_config.insert(
        "level".to_string(),
        ContractValue::String("warning".to_string()),
    );
    action_config.insert(
        "message".to_string(),
        ContractValue::String("叉车接近作业区提醒".to_string()),
    );

    RuleConfig {
        id: "rule-zone-warning-01".to_string(),
        name: "叉车接近作业区提醒".to_string(),
        description: "当叉车接近总装作业区时，向值守人员发出预警。".to_string(),
        enabled: true,
        version: 1,
        nodes: vec![
            RuleNode {
                id: "node-trigger-zone-01".to_string(),
                kind: "input".to_string(),
                position: GraphPosition { x: 120.0, y: 140.0 },
                data: RuleNodeData {
                    label: "叉车接近作业区".to_string(),
                    node_type: RuleNodeType::TriggerLocation,
                    config: trigger_config,
                    description: Some("监听叉车与作业区的空间接近事件。".to_string()),
                },
            },
            RuleNode {
                id: "node-action-alert-01".to_string(),
                kind: "output".to_string(),
                position: GraphPosition { x: 380.0, y: 140.0 },
                data: RuleNodeData {
                    label: "触发预警".to_string(),
                    node_type: RuleNodeType::ActionAlert,
                    config: action_config,
                    description: Some("向现场大屏和前端告警面板推送提醒。".to_string()),
                },
            },
        ],
        edges: vec![RuleEdge {
            id: "edge-trigger-alert-01".to_string(),
            source: "node-trigger-zone-01".to_string(),
            target: "node-action-alert-01".to_string(),
            source_handle: None,
            target_handle: None,
        }],
        created_at: SEEDED_TIMESTAMP,
        updated_at: SEEDED_TIMESTAMP,
    }
}

fn entity_base(id: &str, name: &str, position: Vector3, status: EntityStatus) -> EntityBase {
    EntityBase {
        id: id.to_string(),
        name: name.to_string(),
        position,
        rotation: Vector3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
        scale: Vector3 {
            x: 1.0,
            y: 1.0,
            z: 1.0,
        },
        status,
        visible: true,
        metadata: BTreeMap::new(),
        created_at: SEEDED_TIMESTAMP,
        updated_at: SEEDED_TIMESTAMP,
    }
}
