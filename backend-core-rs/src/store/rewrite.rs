use std::collections::BTreeMap;

use sqlx::{Postgres, Row, Sqlite, Transaction};

use crate::contracts::{ContractValue, Entity, EntityArchetype};

use super::{
    helpers::{now_millis, sort_entities},
    persist_entity, persist_entity_sqlite, persist_workspace_state_postgres,
    persist_workspace_state_sqlite,
    persistence::{persist_entity_archetype, persist_entity_archetype_sqlite},
    MemoryStore, StoreError, WorkspaceState,
};

pub(super) fn cascade_category_key_update_memory(
    snapshot: &mut MemoryStore,
    category_id: &str,
    category_key: &str,
) {
    let mut affected_archetypes = Vec::new();
    for archetype in snapshot.entity_archetypes.values_mut() {
        if archetype.category_id != category_id {
            continue;
        }
        archetype.category_key = category_key.to_string();
        affected_archetypes.push((
            archetype.id.clone(),
            archetype.key.clone(),
            archetype.display_name.clone(),
        ));
    }

    if affected_archetypes.is_empty() {
        return;
    }

    rewrite_dynamic_entity_archetype_refs_workspace_states_memory(
        &mut snapshot.workspace_states,
        &affected_archetypes,
        category_key,
    );
}

pub(super) fn normalize_dynamic_entity_registry_refs_memory(
    entity: &mut Entity,
    entity_archetypes: &BTreeMap<String, EntityArchetype>,
) -> Result<(), StoreError> {
    let Entity::Dynamic(dynamic) = entity else {
        return Ok(());
    };
    if dynamic.archetype_id.trim().is_empty() {
        return Err(StoreError::Validation(
            "dynamic entity archetypeId must be non-empty".to_string(),
        ));
    }
    let Some(archetype) = entity_archetypes.get(&dynamic.archetype_id) else {
        return Err(StoreError::Validation(format!(
            "dynamic entity archetype {} does not exist",
            dynamic.archetype_id
        )));
    };
    dynamic.category_key = archetype.category_key.clone();
    Ok(())
}

pub(super) async fn normalize_dynamic_entity_registry_refs_postgres(
    tx: &mut Transaction<'_, Postgres>,
    entity: &mut Entity,
) -> Result<(), StoreError> {
    let Entity::Dynamic(dynamic) = entity else {
        return Ok(());
    };
    if dynamic.archetype_id.trim().is_empty() {
        return Err(StoreError::Validation(
            "dynamic entity archetypeId must be non-empty".to_string(),
        ));
    }
    let row =
        sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = $1 FOR UPDATE"#)
            .bind(&dynamic.archetype_id)
            .fetch_optional(&mut **tx)
            .await?;
    let Some(row) = row else {
        return Err(StoreError::Validation(format!(
            "dynamic entity archetype {} does not exist",
            dynamic.archetype_id
        )));
    };
    let archetype: EntityArchetype = serde_json::from_value(row.get("archetype_data"))?;
    dynamic.category_key = archetype.category_key;
    Ok(())
}

pub(super) async fn normalize_dynamic_entity_registry_refs_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    entity: &mut Entity,
) -> Result<(), StoreError> {
    let Entity::Dynamic(dynamic) = entity else {
        return Ok(());
    };
    if dynamic.archetype_id.trim().is_empty() {
        return Err(StoreError::Validation(
            "dynamic entity archetypeId must be non-empty".to_string(),
        ));
    }
    let row = sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = ?"#)
        .bind(&dynamic.archetype_id)
        .fetch_optional(&mut **tx)
        .await?;
    let Some(row) = row else {
        return Err(StoreError::Validation(format!(
            "dynamic entity archetype {} does not exist",
            dynamic.archetype_id
        )));
    };
    let archetype: EntityArchetype =
        serde_json::from_str(row.get::<String, _>("archetype_data").as_str())?;
    dynamic.category_key = archetype.category_key;
    Ok(())
}

pub(super) fn rewrite_dynamic_entity_archetype_refs(
    entity: &mut Entity,
    archetype_id: &str,
    archetype_key: &str,
    category_key: &str,
    display_name: &str,
) -> bool {
    let Entity::Dynamic(dynamic) = entity else {
        return false;
    };
    if dynamic.archetype_id != archetype_id {
        return false;
    }

    dynamic.category_key = category_key.to_string();
    dynamic.attributes.insert(
        "archetypeKey".to_string(),
        ContractValue::String(archetype_key.to_string()),
    );
    dynamic.display_attributes.insert(
        "category".to_string(),
        ContractValue::String(category_key.to_string()),
    );
    dynamic.display_attributes.insert(
        "archetype".to_string(),
        ContractValue::String(display_name.to_string()),
    );
    dynamic.base.metadata.insert(
        "archetypeDisplayName".to_string(),
        ContractValue::String(display_name.to_string()),
    );
    true
}

pub(super) fn sync_workspace_live_entity_roster(state: &mut WorkspaceState) {
    state.published_scene_version = state.scene_version;
    state.published_entities = state.entities.values().cloned().collect();
    sort_entities(&mut state.published_entities);
    state.published_updated_at = now_millis();
}

fn rewrite_dynamic_entity_archetype_refs_workspace_states_memory(
    workspace_states: &mut BTreeMap<String, WorkspaceState>,
    affected_archetypes: &[(String, String, String)],
    category_key: &str,
) {
    for state in workspace_states.values_mut() {
        let mut changed = false;
        for entity in state.entities.values_mut() {
            for (archetype_id, archetype_key, display_name) in affected_archetypes {
                changed |= rewrite_dynamic_entity_archetype_refs(
                    entity,
                    archetype_id,
                    archetype_key,
                    category_key,
                    display_name,
                );
            }
        }
        if changed {
            sync_workspace_live_entity_roster(state);
        }
    }
}

pub(super) async fn rewrite_dynamic_entity_archetype_refs_postgres(
    tx: &mut Transaction<'_, Postgres>,
    archetype_id: &str,
    archetype_key: &str,
    category_key: &str,
    display_name: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(r#"SELECT id, entity_data FROM entities WHERE entity_type = 'dynamic'"#)
        .fetch_all(&mut **tx)
        .await?;

    for row in rows {
        let value: serde_json::Value = row.get("entity_data");
        let mut entity: Entity = serde_json::from_value(value)?;
        if !rewrite_dynamic_entity_archetype_refs(
            &mut entity,
            archetype_id,
            archetype_key,
            category_key,
            display_name,
        ) {
            continue;
        }
        persist_entity(tx, &entity, true).await?;
    }

    let rows = sqlx::query(r#"SELECT workspace_id, state_data FROM workspace_states"#)
        .fetch_all(&mut **tx)
        .await?;
    for row in rows {
        let workspace_id: String = row.get("workspace_id");
        let value: serde_json::Value = row.get("state_data");
        let mut state: WorkspaceState = serde_json::from_value(value)?;
        let mut changed = false;
        for entity in state.entities.values_mut() {
            changed |= rewrite_dynamic_entity_archetype_refs(
                entity,
                archetype_id,
                archetype_key,
                category_key,
                display_name,
            );
        }
        if changed {
            sync_workspace_live_entity_roster(&mut state);
            persist_workspace_state_postgres(tx, &workspace_id, &state).await?;
        }
    }

    Ok(())
}

pub(super) async fn rewrite_dynamic_entity_archetype_refs_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    archetype_id: &str,
    archetype_key: &str,
    category_key: &str,
    display_name: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(r#"SELECT id, entity_data FROM entities WHERE entity_type = 'dynamic'"#)
        .fetch_all(&mut **tx)
        .await?;

    for row in rows {
        let value: String = row.get("entity_data");
        let mut entity: Entity = serde_json::from_str(&value)?;
        if !rewrite_dynamic_entity_archetype_refs(
            &mut entity,
            archetype_id,
            archetype_key,
            category_key,
            display_name,
        ) {
            continue;
        }
        persist_entity_sqlite(tx, &entity, true).await?;
    }

    let rows = sqlx::query(r#"SELECT workspace_id, state_data FROM workspace_states"#)
        .fetch_all(&mut **tx)
        .await?;
    for row in rows {
        let workspace_id: String = row.get("workspace_id");
        let value: String = row.get("state_data");
        let mut state: WorkspaceState = serde_json::from_str(&value)?;
        let mut changed = false;
        for entity in state.entities.values_mut() {
            changed |= rewrite_dynamic_entity_archetype_refs(
                entity,
                archetype_id,
                archetype_key,
                category_key,
                display_name,
            );
        }
        if changed {
            sync_workspace_live_entity_roster(&mut state);
            persist_workspace_state_sqlite(tx, &workspace_id, &state).await?;
        }
    }

    Ok(())
}

pub(super) async fn cascade_category_key_update_postgres(
    tx: &mut Transaction<'_, Postgres>,
    category_id: &str,
    category_key: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(
        r#"SELECT archetype_data FROM entity_archetypes WHERE category_id = $1 ORDER BY created_at ASC, id ASC"#,
    )
    .bind(category_id)
    .fetch_all(&mut **tx)
    .await?;

    for row in rows {
        let value: serde_json::Value = row.get("archetype_data");
        let mut archetype: EntityArchetype = serde_json::from_value(value)?;
        archetype.category_key = category_key.to_string();
        persist_entity_archetype(tx, &archetype, true).await?;
        rewrite_dynamic_entity_archetype_refs_postgres(
            tx,
            &archetype.id,
            &archetype.key,
            category_key,
            &archetype.display_name,
        )
        .await?;
    }

    Ok(())
}

pub(super) async fn cascade_category_key_update_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    category_id: &str,
    category_key: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(
        r#"SELECT archetype_data FROM entity_archetypes WHERE category_id = ? ORDER BY created_at ASC, id ASC"#,
    )
    .bind(category_id)
    .fetch_all(&mut **tx)
    .await?;

    for row in rows {
        let value: String = row.get("archetype_data");
        let mut archetype: EntityArchetype = serde_json::from_str(&value)?;
        archetype.category_key = category_key.to_string();
        persist_entity_archetype_sqlite(tx, &archetype, true).await?;
        rewrite_dynamic_entity_archetype_refs_sqlite(
            tx,
            &archetype.id,
            &archetype.key,
            category_key,
            &archetype.display_name,
        )
        .await?;
    }

    Ok(())
}

pub(super) async fn count_dynamic_entity_refs_postgres(
    tx: &mut Transaction<'_, Postgres>,
    archetype_id: &str,
) -> Result<i64, StoreError> {
    let rows = sqlx::query(r#"SELECT state_data FROM workspace_states"#)
        .fetch_all(&mut **tx)
        .await?;
    let mut count = 0_i64;
    for row in rows {
        let value: serde_json::Value = row.get("state_data");
        let state: WorkspaceState = serde_json::from_value(value)?;
        count += state
            .entities
            .values()
            .filter(|entity| matches!(entity, Entity::Dynamic(dynamic) if dynamic.archetype_id == archetype_id))
            .count() as i64;
    }
    Ok(count)
}

pub(super) async fn count_dynamic_entity_refs_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    archetype_id: &str,
) -> Result<i64, StoreError> {
    let rows = sqlx::query(r#"SELECT state_data FROM workspace_states"#)
        .fetch_all(&mut **tx)
        .await?;
    let mut count = 0_i64;
    for row in rows {
        let value: String = row.get("state_data");
        let state: WorkspaceState = serde_json::from_str(&value)?;
        count += state
            .entities
            .values()
            .filter(|entity| matches!(entity, Entity::Dynamic(dynamic) if dynamic.archetype_id == archetype_id))
            .count() as i64;
    }
    Ok(count)
}
