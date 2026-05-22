use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use uuid::Uuid;

use crate::contracts::{
    ArchetypeModelAsset, AuditEventRecord, Entity, EntityArchetype, EntityCategory, EntityStatus,
    ModelAssetFileType, StaticAssetInstance, WorkspaceRecord,
};

use super::{StoreError, MANAGED_ARCHETYPE_ASSET_PREFIX};

const RESERVED_WORKSPACE_SLUGS: &[&str] = &["global"];

pub(super) fn map_memory_audit_event(index: usize, value: &serde_json::Value) -> AuditEventRecord {
    let action = value
        .get("action")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown");
    let resource_type = value
        .get("resourceType")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .or_else(|| action.split('.').next().map(str::to_string))
        .unwrap_or_else(|| "system".to_string());
    let resource_id = value
        .get("resourceId")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let created_at = value
        .get("timestamp")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();

    AuditEventRecord {
        id: value
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("memory-audit-{index}")),
        actor: value
            .get("actor")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("system")
            .to_string(),
        action: action.to_string(),
        resource_type,
        resource_id,
        payload: value.clone(),
        created_at,
    }
}

pub(super) fn is_sqlite_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    normalized.starts_with("sqlite:") || normalized.starts_with("file:")
}

pub(super) fn is_memory_backend_url(url: &str) -> bool {
    matches!(
        url.trim().to_ascii_lowercase().as_str(),
        "memory" | "memory://" | "in-memory"
    )
}

pub(super) fn ensure_sqlite_parent_dir(url: &str) -> Result<(), StoreError> {
    let Some(path) = sqlite_file_path_from_url(url) else {
        return Ok(());
    };

    let Some(parent) = Path::new(&path).parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    fs::create_dir_all(parent).map_err(|error| {
        StoreError::Validation(format!(
            "failed to create sqlite parent directory {}: {}",
            parent.display(),
            error
        ))
    })?;

    Ok(())
}

pub(super) fn sqlite_file_path_from_url(url: &str) -> Option<String> {
    if !is_sqlite_url(url) {
        return None;
    }

    let without_prefix = &url.trim()["sqlite:".len()..];
    let without_query = without_prefix
        .split_once('?')
        .map(|(value, _)| value)
        .unwrap_or(without_prefix)
        .trim();
    if without_query.is_empty() || without_query.eq_ignore_ascii_case(":memory:") {
        return None;
    }

    if let Some(rest) = without_query.strip_prefix("//") {
        if rest.is_empty() || rest.eq_ignore_ascii_case(":memory:") {
            return None;
        }
        return Some(rest.to_string());
    }

    Some(without_query.to_string())
}

pub(super) fn status_to_str(status: &EntityStatus) -> &'static str {
    match status {
        EntityStatus::Active => "active",
        EntityStatus::Inactive => "inactive",
        EntityStatus::Warning => "warning",
        EntityStatus::Error => "error",
    }
}

pub(super) fn static_asset_kind_to_str(asset: &StaticAssetInstance) -> &'static str {
    match asset.asset_kind {
        crate::contracts::StaticAssetKind::ProcessTrain => "process-train",
        crate::contracts::StaticAssetKind::PipeRack => "pipe-rack",
        crate::contracts::StaticAssetKind::VerticalTank => "vertical-tank",
        crate::contracts::StaticAssetKind::SphereTank => "sphere-tank",
        crate::contracts::StaticAssetKind::PumpManifold => "pump-manifold",
        crate::contracts::StaticAssetKind::ServiceBuilding => "service-building",
        crate::contracts::StaticAssetKind::WallSystem => "wall-system",
        crate::contracts::StaticAssetKind::DoorSystem => "door-system",
        crate::contracts::StaticAssetKind::WindowSystem => "window-system",
        crate::contracts::StaticAssetKind::SecurityDevice => "security-device",
        crate::contracts::StaticAssetKind::SmartSensor => "smart-sensor",
        crate::contracts::StaticAssetKind::SmartControl => "smart-control",
    }
}

pub(super) fn sort_entities(entities: &mut [Entity]) {
    entities.sort_by(|left, right| {
        entity_sort_rank(left)
            .cmp(&entity_sort_rank(right))
            .then_with(|| left.id().cmp(right.id()))
    });
}

pub(super) fn sort_static_assets(static_assets: &mut [StaticAssetInstance]) {
    static_assets.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn entity_sort_rank(entity: &Entity) -> u8 {
    match entity {
        Entity::Zone(_) => 0,
        Entity::Person(_) => 1,
        Entity::Vehicle(_) => 2,
        Entity::Equipment(_) => 3,
        Entity::Sensor(_) => 4,
        Entity::Camera(_) => 5,
        Entity::Dynamic(_) => 6,
    }
}

pub(super) fn ensure_entity_create_defaults(entity: &mut Entity, now: u64) {
    if entity.id().trim().is_empty() {
        set_entity_id(entity, &Uuid::new_v4().to_string());
    }
    set_entity_created_at(entity, now);
    set_entity_updated_at(entity, now);
}

pub(super) fn ensure_entity_update_defaults(entity: &mut Entity, now: u64) {
    set_entity_updated_at(entity, now);
    if entity.created_at() == 0 {
        set_entity_created_at(entity, now);
    }
}

pub(super) fn ensure_static_asset_create_defaults(asset: &mut StaticAssetInstance, now: u64) {
    if asset.id.trim().is_empty() {
        asset.id = Uuid::new_v4().to_string();
    }
    if asset.name.trim().is_empty() {
        asset.name = asset.id.clone();
    }
    if asset.scale.x == 0.0 {
        asset.scale.x = 1.0;
    }
    if asset.scale.y == 0.0 {
        asset.scale.y = 1.0;
    }
    if asset.scale.z == 0.0 {
        asset.scale.z = 1.0;
    }
    asset.created_at = now;
    asset.updated_at = now;
}

pub(super) fn ensure_static_asset_update_defaults(asset: &mut StaticAssetInstance, now: u64) {
    if asset.name.trim().is_empty() {
        asset.name = asset.id.clone();
    }
    if asset.scale.x == 0.0 {
        asset.scale.x = 1.0;
    }
    if asset.scale.y == 0.0 {
        asset.scale.y = 1.0;
    }
    if asset.scale.z == 0.0 {
        asset.scale.z = 1.0;
    }
    if asset.created_at == 0 {
        asset.created_at = now;
    }
    asset.updated_at = now;
}

pub(super) fn set_entity_id(entity: &mut Entity, id: &str) {
    match entity {
        Entity::Person(item) => item.base.id = id.to_string(),
        Entity::Vehicle(item) => item.base.id = id.to_string(),
        Entity::Equipment(item) => item.base.id = id.to_string(),
        Entity::Sensor(item) => item.base.id = id.to_string(),
        Entity::Camera(item) => item.base.id = id.to_string(),
        Entity::Zone(item) => item.base.id = id.to_string(),
        Entity::Dynamic(item) => item.base.id = id.to_string(),
    }
}

pub(super) fn set_entity_created_at(entity: &mut Entity, created_at: u64) {
    match entity {
        Entity::Person(item) => item.base.created_at = created_at,
        Entity::Vehicle(item) => item.base.created_at = created_at,
        Entity::Equipment(item) => item.base.created_at = created_at,
        Entity::Sensor(item) => item.base.created_at = created_at,
        Entity::Camera(item) => item.base.created_at = created_at,
        Entity::Zone(item) => item.base.created_at = created_at,
        Entity::Dynamic(item) => item.base.created_at = created_at,
    }
}

pub(super) fn set_entity_updated_at(entity: &mut Entity, updated_at: u64) {
    match entity {
        Entity::Person(item) => item.base.updated_at = updated_at,
        Entity::Vehicle(item) => item.base.updated_at = updated_at,
        Entity::Equipment(item) => item.base.updated_at = updated_at,
        Entity::Sensor(item) => item.base.updated_at = updated_at,
        Entity::Camera(item) => item.base.updated_at = updated_at,
        Entity::Zone(item) => item.base.updated_at = updated_at,
        Entity::Dynamic(item) => item.base.updated_at = updated_at,
    }
}

pub(super) fn sort_entity_categories(categories: &mut [EntityCategory]) {
    categories.sort_by(|left, right| {
        left.sort_order
            .cmp(&right.sort_order)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

pub(super) fn sort_workspaces(workspaces: &mut [WorkspaceRecord]) {
    workspaces.sort_by(|left, right| {
        right
            .is_homepage
            .cmp(&left.is_homepage)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

pub(super) fn ensure_workspace_create_defaults(workspace: &mut WorkspaceRecord, now: u64) {
    if workspace.id.trim().is_empty() {
        workspace.id = Uuid::new_v4().to_string();
    }
    if workspace.slug.trim().is_empty() {
        workspace.slug = workspace.id.clone();
    }
    if workspace.name.trim().is_empty() {
        workspace.name = workspace.slug.clone();
    }
    workspace.created_at = now;
    workspace.updated_at = now;
}

pub(super) fn ensure_workspace_update_defaults(workspace: &mut WorkspaceRecord, now: u64) {
    if workspace.slug.trim().is_empty() {
        workspace.slug = workspace.id.clone();
    }
    if workspace.name.trim().is_empty() {
        workspace.name = workspace.slug.clone();
    }
    if workspace.created_at == 0 {
        workspace.created_at = now;
    }
    workspace.updated_at = now;
}

pub(crate) fn is_path_safe_workspace_slug(workspace_slug: &str) -> bool {
    !workspace_slug.is_empty()
        && workspace_slug.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_')
        })
}

pub(crate) fn is_reserved_workspace_slug(workspace_slug: &str) -> bool {
    RESERVED_WORKSPACE_SLUGS
        .iter()
        .any(|reserved| workspace_slug.eq_ignore_ascii_case(reserved))
}

pub(super) fn workspace_slugs_match(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
}

pub(super) fn validate_workspace(workspace: &WorkspaceRecord) -> Result<(), StoreError> {
    if !is_path_safe_workspace_slug(&workspace.slug) {
        return Err(StoreError::Validation(
            "workspace slug must contain only lowercase ASCII letters, numbers, '-' or '_'"
                .to_string(),
        ));
    }
    if is_reserved_workspace_slug(&workspace.slug) {
        return Err(StoreError::Validation(format!(
            "workspace slug {} is reserved",
            workspace.slug
        )));
    }
    if workspace.name.trim().is_empty() {
        return Err(StoreError::Validation(
            "workspace name must be non-empty".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn sort_entity_archetypes(archetypes: &mut [EntityArchetype]) {
    archetypes.sort_by(|left, right| {
        left.category_key
            .cmp(&right.category_key)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

pub(super) fn ensure_entity_category_create_defaults(category: &mut EntityCategory, now: u64) {
    if category.id.trim().is_empty() {
        category.id = Uuid::new_v4().to_string();
    }
    if category.display_name.trim().is_empty() {
        category.display_name = category.key.clone();
    }
    category.created_at = now;
    category.updated_at = now;
}

pub(super) fn ensure_entity_category_update_defaults(category: &mut EntityCategory, now: u64) {
    if category.display_name.trim().is_empty() {
        category.display_name = category.key.clone();
    }
    if category.created_at == 0 {
        category.created_at = now;
    }
    category.updated_at = now;
}

pub(super) fn validate_entity_category(category: &EntityCategory) -> Result<(), StoreError> {
    if category.key.trim().is_empty() {
        return Err(StoreError::Validation(
            "entity category key must be non-empty".to_string(),
        ));
    }
    if category.display_name.trim().is_empty() {
        return Err(StoreError::Validation(
            "entity category displayName must be non-empty".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn ensure_entity_archetype_create_defaults(archetype: &mut EntityArchetype, now: u64) {
    if archetype.id.trim().is_empty() {
        archetype.id = Uuid::new_v4().to_string();
    }
    if archetype.display_name.trim().is_empty() {
        archetype.display_name = archetype.key.clone();
    }
    archetype.capabilities.has_model = archetype.model.is_some();
    archetype.created_at = now;
    archetype.updated_at = now;
}

pub(super) fn ensure_entity_archetype_update_defaults(archetype: &mut EntityArchetype, now: u64) {
    if archetype.display_name.trim().is_empty() {
        archetype.display_name = archetype.key.clone();
    }
    archetype.capabilities.has_model = archetype.model.is_some();
    if archetype.created_at == 0 {
        archetype.created_at = now;
    }
    archetype.updated_at = now;
}

pub(super) fn validate_entity_archetype(archetype: &EntityArchetype) -> Result<(), StoreError> {
    if archetype.key.trim().is_empty() {
        return Err(StoreError::Validation(
            "entity archetype key must be non-empty".to_string(),
        ));
    }
    if archetype.display_name.trim().is_empty() {
        return Err(StoreError::Validation(
            "entity archetype displayName must be non-empty".to_string(),
        ));
    }
    if archetype.category_id.trim().is_empty() {
        return Err(StoreError::Validation(
            "entity archetype categoryId must be non-empty".to_string(),
        ));
    }
    if let Some(model) = &archetype.model {
        validate_managed_archetype_model_asset(model)?;
    }
    Ok(())
}

pub(super) fn validate_managed_archetype_model_asset(
    model: &ArchetypeModelAsset,
) -> Result<(), StoreError> {
    if !model.asset_url.starts_with(MANAGED_ARCHETYPE_ASSET_PREFIX) {
        return Err(StoreError::Validation(
            "entity archetype model assetUrl must stay within the managed /assets/entity-archetypes/ path".to_string(),
        ));
    }
    if model.asset_url.contains("..")
        || model.asset_url.contains("://")
        || model.asset_url.contains('\\')
    {
        return Err(StoreError::Validation(
            "entity archetype model assetUrl must be a normalized managed local path".to_string(),
        ));
    }

    let expected_suffix = match model.file_type {
        ModelAssetFileType::Glb => ".glb",
        ModelAssetFileType::Fbx => ".fbx",
    };
    if !model.asset_url.ends_with(expected_suffix) {
        return Err(StoreError::Validation(format!(
            "entity archetype model assetUrl must end with {expected_suffix}"
        )));
    }

    Ok(())
}

pub(super) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}
