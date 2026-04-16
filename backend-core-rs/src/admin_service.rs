use crate::{
    contracts::{AdminOverviewResponse, Alarm, AuditEventRecord},
    store::{Store, StoreError},
};

pub async fn load_admin_overview(store: &Store) -> Result<AdminOverviewResponse, StoreError> {
    let workspace = store.get_homepage_workspace().await?;
    let scene_version = store.workspace_scene_version(&workspace.id).await?;
    let entities = store.workspace_list_entities(&workspace.id).await?;
    let rules = store.workspace_list_rules(&workspace.id).await?;
    let connectors = store.workspace_list_connectors(&workspace.id).await?;
    let binding_count = store.workspace_binding_count(&workspace.id).await?;
    let alarms = store.workspace_list_alarms(&workspace.id).await?;
    let recent_change_at = store
        .workspace_list_audit_events(&workspace.id, 1)
        .await?
        .into_iter()
        .next()
        .map(|event| event.created_at);

    Ok(AdminOverviewResponse {
        scene_version,
        entity_count: entities.len() as u64,
        rule_count: rules.len() as u64,
        connector_count: connectors.len() as u64,
        binding_count,
        unacknowledged_alarm_count: alarms.iter().filter(|alarm| !alarm.acknowledged).count()
            as u64,
        recent_change_at,
    })
}

pub async fn load_admin_alarms(store: &Store) -> Result<Vec<Alarm>, StoreError> {
    store.list_alarms().await
}

pub async fn load_audit_events(
    store: &Store,
    limit: usize,
) -> Result<Vec<AuditEventRecord>, StoreError> {
    store.list_audit_events(limit).await
}
