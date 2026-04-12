use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub site_id: String,
    pub scene_version: u64,
    pub scene_config: SceneConfig,
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub static_assets: Vec<StaticAssetInstance>,
    #[serde(default)]
    pub entity_categories: Vec<EntityCategory>,
    #[serde(default)]
    pub entity_archetypes: Vec<EntityArchetype>,
    pub rules: Vec<RuleConfig>,
    pub alarms: Vec<Alarm>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_scene: Option<PublishedSceneDescriptor>,
    pub issued_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedSceneDescriptor {
    pub package_url: String,
    pub package_version: String,
    pub scene_id: String,
    pub generated_at: String,
    pub static_asset_manifest_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneResponse {
    pub scene_version: u64,
    pub scene_config: SceneConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EditorSaveMode {
    Create,
    Update,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorEntitySave {
    pub mode: EditorSaveMode,
    pub entity: Entity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorStaticAssetSave {
    pub mode: EditorSaveMode,
    pub static_asset: StaticAssetInstance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSaveRequest {
    pub expected_scene_version: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_config: Option<SceneConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<EditorEntitySave>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub static_asset: Option<EditorStaticAssetSave>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSaveResponse {
    pub scene_version: u64,
    pub scene_config: SceneConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saved_entity: Option<Entity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saved_static_asset: Option<StaticAssetInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminOverviewResponse {
    pub scene_version: u64,
    pub entity_count: u64,
    pub rule_count: u64,
    pub connector_count: u64,
    pub binding_count: u64,
    pub unacknowledged_alarm_count: u64,
    #[serde(default)]
    pub recent_change_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishStatusResponse {
    pub status: PublishState,
    pub current_scene_version: u64,
    pub published_scene_version: u64,
    pub has_unpublished_changes: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_publish_started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_publish_heartbeat_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_published_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_published_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_scene: Option<PublishedSceneDescriptor>,
    pub compiler_source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PublishState {
    Published,
    SavedUnpublished,
    Publishing,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticAssetInstance {
    pub id: String,
    pub name: String,
    pub asset_kind: StaticAssetKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    pub position: Vector3,
    pub rotation: Vector3,
    pub scale: Vector3,
    pub visible: bool,
    #[serde(default)]
    pub metadata: BTreeMap<String, ContractValue>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StaticAssetKind {
    ProcessTrain,
    PipeRack,
    VerticalTank,
    SphereTank,
    PumpManifold,
    ServiceBuilding,
    WallSystem,
    DoorSystem,
    WindowSystem,
    SecurityDevice,
    SmartSensor,
    SmartControl,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityCategory {
    pub id: String,
    pub key: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelAssetFileType {
    Glb,
    Fbx,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeModelBounds {
    pub width: f32,
    pub height: f32,
    pub depth: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeModelCalibration {
    pub scale: Vector3,
    pub rotation: Vector3,
    pub translation: Vector3,
    #[serde(default)]
    pub floor_offset: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bounds: Option<ArchetypeModelBounds>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeModelAsset {
    pub asset_id: String,
    pub file_name: String,
    pub file_type: ModelAssetFileType,
    pub asset_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_size_bytes: Option<u64>,
    pub calibration: ArchetypeModelCalibration,
    pub uploaded_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypeCapabilities {
    #[serde(default)]
    pub has_model: bool,
    #[serde(default)]
    pub movable: bool,
    #[serde(default)]
    pub bindable: bool,
    #[serde(default)]
    pub status_bearing: bool,
    #[serde(default)]
    pub detail_fields_visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityArchetype {
    pub id: String,
    pub key: String,
    pub category_id: String,
    pub category_key: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub capabilities: ArchetypeCapabilities,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ArchetypeModelAsset>,
    #[serde(default)]
    pub metadata: BTreeMap<String, ContractValue>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Entity {
    Person(PersonEntity),
    Vehicle(VehicleEntity),
    Equipment(EquipmentEntity),
    Sensor(SensorEntity),
    Camera(CameraEntity),
    Zone(ZoneEntity),
    Dynamic(DynamicEntity),
}

impl Entity {
    pub fn id(&self) -> &str {
        match self {
            Self::Person(entity) => &entity.base.id,
            Self::Vehicle(entity) => &entity.base.id,
            Self::Equipment(entity) => &entity.base.id,
            Self::Sensor(entity) => &entity.base.id,
            Self::Camera(entity) => &entity.base.id,
            Self::Zone(entity) => &entity.base.id,
            Self::Dynamic(entity) => &entity.base.id,
        }
    }

    pub fn entity_type(&self) -> &'static str {
        match self {
            Self::Person(_) => "person",
            Self::Vehicle(_) => "vehicle",
            Self::Equipment(_) => "equipment",
            Self::Sensor(_) => "sensor",
            Self::Camera(_) => "camera",
            Self::Zone(_) => "zone",
            Self::Dynamic(_) => "dynamic",
        }
    }

    pub fn status(&self) -> EntityStatus {
        match self {
            Self::Person(entity) => entity.base.status.clone(),
            Self::Vehicle(entity) => entity.base.status.clone(),
            Self::Equipment(entity) => entity.base.status.clone(),
            Self::Sensor(entity) => entity.base.status.clone(),
            Self::Camera(entity) => entity.base.status.clone(),
            Self::Zone(entity) => entity.base.status.clone(),
            Self::Dynamic(entity) => entity.base.status.clone(),
        }
    }

    pub fn created_at(&self) -> u64 {
        match self {
            Self::Person(entity) => entity.base.created_at,
            Self::Vehicle(entity) => entity.base.created_at,
            Self::Equipment(entity) => entity.base.created_at,
            Self::Sensor(entity) => entity.base.created_at,
            Self::Camera(entity) => entity.base.created_at,
            Self::Zone(entity) => entity.base.created_at,
            Self::Dynamic(entity) => entity.base.created_at,
        }
    }

    pub fn updated_at(&self) -> u64 {
        match self {
            Self::Person(entity) => entity.base.updated_at,
            Self::Vehicle(entity) => entity.base.updated_at,
            Self::Equipment(entity) => entity.base.updated_at,
            Self::Sensor(entity) => entity.base.updated_at,
            Self::Camera(entity) => entity.base.updated_at,
            Self::Zone(entity) => entity.base.updated_at,
            Self::Dynamic(entity) => entity.base.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub role: String,
    pub department: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub schedule: Vec<TimeRange>,
    #[serde(default)]
    pub current_activity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub plate_number: String,
    pub vehicle_type: VehicleType,
    pub speed: f32,
    pub heading: f32,
    #[serde(default)]
    pub capacity: Option<f32>,
    #[serde(default)]
    pub current_load: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route_track: Option<VehicleRouteTrack>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_position: Option<VehicleTrackPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleRouteTrack {
    pub route_id: String,
    pub track_id: String,
    pub label: String,
    #[serde(default)]
    pub looped: bool,
    pub waypoints: Vec<Vector3>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleTrackPosition {
    pub route_id: String,
    pub track_id: String,
    pub segment_index: u32,
    pub next_waypoint_index: u32,
    pub segment_progress: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub model_url: Option<String>,
    #[serde(default)]
    pub parameters: BTreeMap<String, ContractValue>,
    #[serde(default)]
    pub alarms: Vec<Alarm>,
    #[serde(default)]
    pub maintenance_schedule: Option<Vec<TimeRange>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub sensor_type: SensorType,
    pub unit: String,
    pub reading: f32,
    #[serde(default)]
    pub threshold_min: Option<f32>,
    #[serde(default)]
    pub threshold_max: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub camera_type: CameraType,
    #[serde(default)]
    pub stream_url: Option<String>,
    pub fov: f32,
    pub heading: f32,
    #[serde(default)]
    pub range: Option<f32>,
    #[serde(default = "default_recording")]
    pub recording: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub boundary: Vec<Vector3>,
    pub zone_type: ZoneType,
    pub color: String,
    #[serde(default)]
    pub access_rules: Vec<AccessRule>,
    #[serde(default)]
    pub capacity: Option<u32>,
    #[serde(default)]
    pub current_occupancy: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicEntity {
    #[serde(flatten)]
    pub base: EntityBase,
    pub archetype_id: String,
    pub category_key: String,
    #[serde(default)]
    pub attributes: BTreeMap<String, ContractValue>,
    #[serde(default)]
    pub display_attributes: BTreeMap<String, ContractValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityBase {
    pub id: String,
    pub name: String,
    pub position: Vector3,
    pub rotation: Vector3,
    pub scale: Vector3,
    pub status: EntityStatus,
    pub visible: bool,
    #[serde(default)]
    pub metadata: BTreeMap<String, ContractValue>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntityStatus {
    Active,
    Inactive,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VehicleType {
    Car,
    Truck,
    Forklift,
    Agv,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SensorType {
    Temperature,
    Pressure,
    Flow,
    Gas,
    Level,
    Humidity,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CameraType {
    Fixed,
    Dome,
    Ptz,
    Thermal,
}

fn default_recording() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ZoneType {
    Restricted,
    Work,
    Storage,
    Passage,
    Danger,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start: u64,
    pub end: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub level: AlarmLevel,
    pub message: String,
    pub timestamp: u64,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlarmLevel {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessRule {
    pub id: String,
    #[serde(default)]
    pub allowed_roles: Vec<String>,
    #[serde(default)]
    pub allowed_departments: Vec<String>,
    #[serde(default)]
    pub time_ranges: Vec<TimeRange>,
    pub action: AccessAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AccessAction {
    Allow,
    Deny,
    Alert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    #[serde(default)]
    pub nodes: Vec<RuleNode>,
    #[serde(default)]
    pub edges: Vec<RuleEdge>,
    #[serde(default = "default_rule_version")]
    pub version: u32,
    pub created_at: u64,
    pub updated_at: u64,
}

fn default_rule_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNode {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub position: GraphPosition,
    pub data: RuleNodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNodeData {
    pub label: String,
    pub node_type: RuleNodeType,
    #[serde(default)]
    pub config: BTreeMap<String, ContractValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl RuleNodeType {
    pub fn is_trigger(&self) -> bool {
        matches!(
            self,
            Self::TriggerLocation | Self::TriggerDevice | Self::TriggerTime | Self::TriggerManual
        )
    }

    pub fn is_action(&self) -> bool {
        matches!(
            self,
            Self::ActionAlert | Self::ActionControl | Self::ActionDispatch
        )
    }

    pub fn requires_config(&self) -> bool {
        !matches!(self, Self::LogicAnd | Self::LogicOr | Self::LogicNot)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ContractValue {
    Null,
    String(String),
    Number(f64),
    Boolean(bool),
    Array(Vec<ContractValue>),
    Object(BTreeMap<String, ContractValue>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataConnector {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub endpoint: String,
    #[serde(default)]
    pub auth_config: serde_json::Value,
    pub enabled: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityBinding {
    pub binding_id: String,
    pub entity_id: String,
    pub connector_id: String,
    pub source_path: String,
    #[serde(default)]
    pub mapping: serde_json::Value,
    pub enabled: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleValidationResponse {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventRecord {
    pub id: String,
    pub actor: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: String,
    pub payload: serde_json::Value,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    Incident {
        timestamp: u64,
        payload: IncidentEventPayload,
    },
    ConfigChanged {
        timestamp: u64,
        payload: ConfigChangedPayload,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route_track: Option<VehicleRouteTrack>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_position: Option<VehicleTrackPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdatePayload {
    pub entity_id: String,
    pub status: EntityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<BTreeMap<String, ContractValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmEventPayload {
    pub id: String,
    pub level: AlarmLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentEventPayload {
    pub incident: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeIngestRequest {
    pub source: String,
    pub events: Vec<RuntimeIngestEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeIngestEvent {
    PositionUpdate {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timestamp: Option<u64>,
        payload: PositionUpdatePayload,
    },
    StatusUpdate {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timestamp: Option<u64>,
        payload: StatusUpdatePayload,
    },
    Alarm {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timestamp: Option<u64>,
        payload: AlarmEventPayload,
    },
    Incident {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timestamp: Option<u64>,
        payload: IncidentEventPayload,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeIngestResponse {
    pub source: String,
    pub accepted_count: usize,
    pub received_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigChangedPayload {
    pub scene_version: u64,
    pub changed_at: u64,
    pub scope: ConfigChangedScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_scene: Option<PublishedSceneDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigChangedScope {
    Scene,
    Entity,
    StaticAsset,
    Binding,
    Rule,
    Publish,
}
