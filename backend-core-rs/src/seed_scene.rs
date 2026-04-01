use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::contracts::{
    AccessAction, AccessRule, BootstrapResponse, ContractValue, Entity, EntityBase, EntityStatus,
    EquipmentEntity, GraphPosition, PersonEntity, RuleConfig, RuleEdge, RuleNode, RuleNodeData,
    RuleNodeType, SceneConfig, TimeRange, Vector3, VehicleEntity, VehicleType, ZoneEntity,
    ZoneType,
};

const SITE_ID: &str = "factory-demo-site";
const SCENE_ID: &str = "factory-demo-scene";
const SEEDED_TIMESTAMP: u64 = 1_775_000_000_000;

pub fn build_bootstrap_response() -> BootstrapResponse {
    BootstrapResponse {
        site_id: SITE_ID.to_string(),
        scene_config: seed_scene_config(),
        entities: seed_entities(),
        rules: vec![seed_zone_warning_rule()],
        alarms: Vec::new(),
        issued_at: issued_at_now(),
    }
}

fn seed_scene_config() -> SceneConfig {
    SceneConfig {
        id: SCENE_ID.to_string(),
        name: "工厂演示场景".to_string(),
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
    vec![
        Entity::Zone(seed_workshop_zone()),
        Entity::Person(seed_operator()),
        Entity::Vehicle(seed_forklift()),
        Entity::Equipment(seed_cnc_equipment()),
    ]
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
        schedule: vec![TimeRange {
            start: SEEDED_TIMESTAMP,
            end: SEEDED_TIMESTAMP + 28_800_000,
            label: Some("巡检班次".to_string()),
        }],
        current_activity: Some("巡检中".to_string()),
    }
}

fn seed_forklift() -> VehicleEntity {
    VehicleEntity {
        base: entity_base(
            "vehicle-forklift-01",
            "叉车 01",
            Vector3 {
                x: 9.0,
                y: 0.0,
                z: -1.5,
            },
            EntityStatus::Warning,
        ),
        plate_number: "沪A12345".to_string(),
        vehicle_type: VehicleType::Forklift,
        speed: 3.2,
        heading: 90.0,
        capacity: Some(2000.0),
        current_load: Some(560.0),
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
        parameters,
        alarms: Vec::new(),
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

fn issued_at_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}
