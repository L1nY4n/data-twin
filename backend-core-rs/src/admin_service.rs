use crate::{
    contracts::{AdminOverviewResponse, Alarm, AuditEventRecord},
    store::{Store, StoreError},
};

pub async fn load_admin_overview(store: &Store) -> Result<AdminOverviewResponse, StoreError> {
    let scene_version = store.scene_version().await?;
    let entities = store.list_entities().await?;
    let rules = store.list_rules().await?;
    let connectors = store.list_connectors().await?;
    let binding_count = store.binding_count().await?;
    let alarms = store.list_alarms().await?;
    let recent_change_at = store
        .list_audit_events(1)
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
