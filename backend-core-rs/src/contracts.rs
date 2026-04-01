use std::collections::BTreeMap;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub site_id: String,
    pub scene_config: SceneConfig,
    pub entities: Vec<Entity>,
    pub rules: Vec<RuleConfig>,
    pub alarms: Vec<Alarm>,
    pub issued_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneConfig {
    pub id: String,
    pub name: String,
    pub grid_size: u32,
    pub grid_divisions: u32,
    pub background_color: String,
    pub ambient_light_intensity: f32,
    pub show_axes: bool,
    pub show_grid: bool,
    pub camera_position: Vector3,
    pub camera_target: Vector3,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Entity {
    Person(PersonEntity),
    Vehicle(VehicleEntity),
    Equipment(EquipmentEntity),
    Zone(ZoneEntity),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub role: String,
    pub department: String,
    pub schedule: Vec<TimeRange>,
    pub current_activity: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub plate_number: String,
    pub vehicle_type: VehicleType,
    pub speed: f32,
    pub heading: f32,
    pub capacity: Option<f32>,
    pub current_load: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub parameters: BTreeMap<String, ContractValue>,
    pub alarms: Vec<Alarm>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub boundary: Vec<Vector3>,
    pub zone_type: ZoneType,
    pub color: String,
    pub access_rules: Vec<AccessRule>,
    pub capacity: Option<u32>,
    pub current_occupancy: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityBase {
    pub id: String,
    pub name: String,
    pub position: Vector3,
    pub rotation: Vector3,
    pub scale: Vector3,
    pub status: EntityStatus,
    pub visible: bool,
    pub metadata: BTreeMap<String, ContractValue>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityStatus {
    Active,
    Inactive,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VehicleType {
    Car,
    Truck,
    Forklift,
    Agv,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ZoneType {
    Restricted,
    Work,
    Storage,
    Passage,
    Danger,
    Custom,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start: u64,
    pub end: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub level: AlarmLevel,
    pub message: String,
    pub timestamp: u64,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AlarmLevel {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessRule {
    pub id: String,
    pub allowed_roles: Vec<String>,
    pub allowed_departments: Vec<String>,
    pub time_ranges: Vec<TimeRange>,
    pub action: AccessAction,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AccessAction {
    Allow,
    Deny,
    Alert,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub nodes: Vec<RuleNode>,
    pub edges: Vec<RuleEdge>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNode {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub position: GraphPosition,
    pub data: RuleNodeData,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNodeData {
    pub label: String,
    pub node_type: RuleNodeType,
    pub config: BTreeMap<String, ContractValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuleNodeType {
    TriggerLocation,
    TriggerDevice,
    TriggerTime,
    TriggerManual,
    ConditionThreshold,
    ConditionTime,
    ConditionSpatial,
    LogicAnd,
    LogicOr,
    LogicNot,
    ActionAlert,
    ActionControl,
    ActionDispatch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum ContractValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Array(Vec<ContractValue>),
    Object(BTreeMap<String, ContractValue>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RealtimeEvent {
    PositionUpdate {
        timestamp: u64,
        payload: PositionUpdatePayload,
    },
    StatusUpdate {
        timestamp: u64,
        payload: StatusUpdatePayload,
    },
    Alarm {
        timestamp: u64,
        payload: AlarmEventPayload,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionUpdatePayload {
    pub entity_id: String,
    pub position: Vector3,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<Vector3>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdatePayload {
    pub entity_id: String,
    pub status: EntityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<BTreeMap<String, ContractValue>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmEventPayload {
    pub id: String,
    pub level: AlarmLevel,
    pub message: String,
}
