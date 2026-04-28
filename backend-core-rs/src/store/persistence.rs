use sqlx::{Postgres, Row, Sqlite, Transaction};
use uuid::Uuid;

use crate::{
    contracts::{Entity, EntityArchetype, PublishedSceneDescriptor, RuleConfig},
    seed_scene,
};

use super::{
    helpers::{now_millis, sort_entities},
    StoreError, WorkingSnapshot,
};

pub(super) async fn persist_entity_archetype(
    tx: &mut Transaction<'_, Postgres>,
    archetype: &EntityArchetype,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entity_archetypes
            SET archetype_key = $1, category_id = $2, category_key = $3, archetype_data = $4, created_at = $5, updated_at = $6
            WHERE id = $7
            "#,
        )
        .bind(&archetype.key)
        .bind(&archetype.category_id)
        .bind(&archetype.category_key)
        .bind(serde_json::to_value(archetype)?)
        .bind(archetype.created_at as i64)
        .bind(archetype.updated_at as i64)
        .bind(&archetype.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entity_archetypes (id, archetype_key, category_id, category_key, archetype_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(&archetype.id)
        .bind(&archetype.key)
        .bind(&archetype.category_id)
        .bind(&archetype.category_key)
        .bind(serde_json::to_value(archetype)?)
        .bind(archetype.created_at as i64)
        .bind(archetype.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub(super) async fn persist_entity_archetype_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    archetype: &EntityArchetype,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entity_archetypes
            SET archetype_key = ?, category_id = ?, category_key = ?, archetype_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&archetype.key)
        .bind(&archetype.category_id)
        .bind(&archetype.category_key)
        .bind(serde_json::to_string(archetype)?)
        .bind(archetype.created_at as i64)
        .bind(archetype.updated_at as i64)
        .bind(&archetype.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entity_archetypes (id, archetype_key, category_id, category_key, archetype_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&archetype.id)
        .bind(&archetype.key)
        .bind(&archetype.category_id)
        .bind(&archetype.category_key)
        .bind(serde_json::to_string(archetype)?)
        .bind(archetype.created_at as i64)
        .bind(archetype.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub(super) async fn persist_rule(
    tx: &mut Transaction<'_, Postgres>,
    rule: &RuleConfig,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE rules
            SET enabled = $1, version = $2, rule_data = $3, created_at = $4, updated_at = $5
            WHERE id = $6
            "#,
        )
        .bind(rule.enabled)
        .bind(rule.version as i32)
        .bind(serde_json::to_value(rule)?)
        .bind(rule.created_at as i64)
        .bind(rule.updated_at as i64)
        .bind(&rule.id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(r#"DELETE FROM rule_nodes WHERE rule_id = $1"#)
            .bind(&rule.id)
            .execute(&mut **tx)
            .await?;
        sqlx::query(r#"DELETE FROM rule_edges WHERE rule_id = $1"#)
            .bind(&rule.id)
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO rules (id, enabled, version, rule_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&rule.id)
        .bind(rule.enabled)
        .bind(rule.version as i32)
        .bind(serde_json::to_value(rule)?)
        .bind(rule.created_at as i64)
        .bind(rule.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    for node in &rule.nodes {
        sqlx::query(
            r#"
            INSERT INTO rule_nodes (id, rule_id, node_type, node_kind, position, data)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&node.id)
        .bind(&rule.id)
        .bind(format!("{:?}", node.data.node_type))
        .bind(&node.kind)
        .bind(serde_json::to_value(node.position.clone())?)
        .bind(serde_json::to_value(node.data.clone())?)
        .execute(&mut **tx)
        .await?;
    }

    for edge in &rule.edges {
        sqlx::query(
            r#"
            INSERT INTO rule_edges (id, rule_id, source_node_id, target_node_id, source_handle, target_handle)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&edge.id)
        .bind(&rule.id)
        .bind(&edge.source)
        .bind(&edge.target)
        .bind(&edge.source_handle)
        .bind(&edge.target_handle)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub(super) async fn persist_rule_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    rule: &RuleConfig,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE rules
            SET enabled = ?, version = ?, rule_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(rule.enabled)
        .bind(rule.version as i32)
        .bind(serde_json::to_string(rule)?)
        .bind(rule.created_at as i64)
        .bind(rule.updated_at as i64)
        .bind(&rule.id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(r#"DELETE FROM rule_nodes WHERE rule_id = ?"#)
            .bind(&rule.id)
            .execute(&mut **tx)
            .await?;
        sqlx::query(r#"DELETE FROM rule_edges WHERE rule_id = ?"#)
            .bind(&rule.id)
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO rules (id, enabled, version, rule_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&rule.id)
        .bind(rule.enabled)
        .bind(rule.version as i32)
        .bind(serde_json::to_string(rule)?)
        .bind(rule.created_at as i64)
        .bind(rule.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    for node in &rule.nodes {
        sqlx::query(
            r#"
            INSERT INTO rule_nodes (id, rule_id, node_type, node_kind, position, data)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&node.id)
        .bind(&rule.id)
        .bind(format!("{:?}", node.data.node_type))
        .bind(&node.kind)
        .bind(serde_json::to_string(&node.position)?)
        .bind(serde_json::to_string(&node.data)?)
        .execute(&mut **tx)
        .await?;
    }

    for edge in &rule.edges {
        sqlx::query(
            r#"
            INSERT INTO rule_edges (id, rule_id, source_node_id, target_node_id, source_handle, target_handle)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&edge.id)
        .bind(&rule.id)
        .bind(&edge.source)
        .bind(&edge.target)
        .bind(&edge.source_handle)
        .bind(&edge.target_handle)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub(super) async fn bump_scene_version_tx(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<u64, StoreError> {
    let row = sqlx::query(
        r#"
        UPDATE scene_configs
        SET scene_version = scene_version + 1, updated_at = $1
        WHERE site_id = $2
        RETURNING scene_version
        "#,
    )
    .bind(now_millis() as i64)
    .bind(seed_scene::SITE_ID)
    .fetch_one(&mut **tx)
    .await?;

    let scene_version: i64 = row.get("scene_version");
    Ok(scene_version as u64)
}

pub(super) async fn bump_scene_version_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<u64, StoreError> {
    sqlx::query(
        r#"
        UPDATE scene_configs
        SET scene_version = scene_version + 1, updated_at = ?
        WHERE site_id = ?
        "#,
    )
    .bind(now_millis() as i64)
    .bind(seed_scene::SITE_ID)
    .execute(&mut **tx)
    .await?;

    let scene_version: i64 =
        sqlx::query_scalar(r#"SELECT scene_version FROM scene_configs WHERE site_id = ?"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut **tx)
            .await?;

    Ok(scene_version as u64)
}

pub(super) async fn insert_audit_event(
    tx: &mut Transaction<'_, Postgres>,
    action: &str,
    resource_type: &str,
    resource_id: &str,
    payload: serde_json::Value,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        INSERT INTO audit_events (id, actor, action, resource_type, resource_id, payload, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind("system")
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(payload)
    .bind(now_millis() as i64)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub(super) async fn insert_audit_event_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    action: &str,
    resource_type: &str,
    resource_id: &str,
    payload: serde_json::Value,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        INSERT INTO audit_events (id, actor, action, resource_type, resource_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind("system")
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(serde_json::to_string(&payload)?)
    .bind(now_millis() as i64)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub(super) async fn upsert_published_state_postgres(
    tx: &mut Transaction<'_, Postgres>,
    snapshot: &WorkingSnapshot,
    published_scene: Option<&PublishedSceneDescriptor>,
    compiler_source: &str,
    updated_at: u64,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        INSERT INTO published_state (
            site_id,
            published_scene_version,
            scene_config,
            entities,
            static_assets,
            published_scene,
            compiler_source,
            updated_at,
            active_publish_token,
            active_publish_started_at,
            active_publish_heartbeat_at,
            last_published_at,
            last_published_version,
            last_publish_error,
            last_failure_scene_version,
            last_failure_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $8, $9, $10, $11, $12)
        ON CONFLICT (site_id) DO UPDATE
        SET
            published_scene_version = EXCLUDED.published_scene_version,
            scene_config = EXCLUDED.scene_config,
            entities = EXCLUDED.entities,
            static_assets = EXCLUDED.static_assets,
            published_scene = EXCLUDED.published_scene,
            compiler_source = EXCLUDED.compiler_source,
            updated_at = EXCLUDED.updated_at,
            active_publish_token = EXCLUDED.active_publish_token,
            active_publish_started_at = EXCLUDED.active_publish_started_at,
            active_publish_heartbeat_at = EXCLUDED.active_publish_heartbeat_at,
            last_published_at = EXCLUDED.last_published_at,
            last_published_version = EXCLUDED.last_published_version,
            last_publish_error = EXCLUDED.last_publish_error,
            last_failure_scene_version = EXCLUDED.last_failure_scene_version,
            last_failure_at = EXCLUDED.last_failure_at
        "#,
    )
    .bind(seed_scene::SITE_ID)
    .bind(snapshot.scene_version as i64)
    .bind(serde_json::to_value(&snapshot.scene_config)?)
    .bind(serde_json::to_value(&snapshot.entities)?)
    .bind(serde_json::to_value(&snapshot.static_assets)?)
    .bind(published_scene.map(serde_json::to_value).transpose()?)
    .bind(compiler_source)
    .bind(updated_at as i64)
    .bind(published_scene.map(|descriptor| descriptor.package_version.clone()))
    .bind(Option::<String>::None)
    .bind(Option::<i64>::None)
    .bind(Option::<i64>::None)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub(super) async fn upsert_published_state_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    snapshot: &WorkingSnapshot,
    published_scene: Option<&PublishedSceneDescriptor>,
    compiler_source: &str,
    updated_at: u64,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        INSERT INTO published_state (
            site_id,
            published_scene_version,
            scene_config,
            entities,
            static_assets,
            published_scene,
            compiler_source,
            updated_at,
            active_publish_token,
            active_publish_started_at,
            active_publish_heartbeat_at,
            last_published_at,
            last_published_version,
            last_publish_error,
            last_failure_scene_version,
            last_failure_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)
        ON CONFLICT(site_id) DO UPDATE SET
            published_scene_version = excluded.published_scene_version,
            scene_config = excluded.scene_config,
            entities = excluded.entities,
            static_assets = excluded.static_assets,
            published_scene = excluded.published_scene,
            compiler_source = excluded.compiler_source,
            updated_at = excluded.updated_at,
            active_publish_token = excluded.active_publish_token,
            active_publish_started_at = excluded.active_publish_started_at,
            active_publish_heartbeat_at = excluded.active_publish_heartbeat_at,
            last_published_at = excluded.last_published_at,
            last_published_version = excluded.last_published_version,
            last_publish_error = excluded.last_publish_error,
            last_failure_scene_version = excluded.last_failure_scene_version,
            last_failure_at = excluded.last_failure_at
        "#,
    )
    .bind(seed_scene::SITE_ID)
    .bind(snapshot.scene_version as i64)
    .bind(serde_json::to_string(&snapshot.scene_config)?)
    .bind(serde_json::to_string(&snapshot.entities)?)
    .bind(serde_json::to_string(&snapshot.static_assets)?)
    .bind(published_scene.map(serde_json::to_string).transpose()?)
    .bind(compiler_source)
    .bind(updated_at as i64)
    .bind(updated_at as i64)
    .bind(published_scene.map(|descriptor| descriptor.package_version.clone()))
    .bind(Option::<String>::None)
    .bind(Option::<i64>::None)
    .bind(Option::<i64>::None)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub(super) async fn sync_live_entity_roster_postgres(
    tx: &mut Transaction<'_, Postgres>,
    updated_at: u64,
) -> Result<(), StoreError> {
    let rows = sqlx::query(r#"SELECT entity_data FROM entities ORDER BY created_at ASC, id ASC"#)
        .fetch_all(&mut **tx)
        .await?;
    let mut entities: Vec<Entity> = rows
        .into_iter()
        .map(|row| {
            let value: serde_json::Value = row.get("entity_data");
            serde_json::from_value(value).map_err(StoreError::from)
        })
        .collect::<Result<Vec<_>, _>>()?;
    sort_entities(&mut entities);

    let scene_version = sqlx::query_scalar::<_, i64>(
        r#"SELECT scene_version FROM scene_configs WHERE site_id = $1"#,
    )
    .bind(seed_scene::SITE_ID)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE published_state
        SET entities = $1, published_scene_version = $2, updated_at = $3
        WHERE site_id = $4
        "#,
    )
    .bind(serde_json::to_value(&entities)?)
    .bind(scene_version)
    .bind(updated_at as i64)
    .bind(seed_scene::SITE_ID)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub(super) async fn sync_live_entity_roster_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    updated_at: u64,
) -> Result<(), StoreError> {
    let rows = sqlx::query(r#"SELECT entity_data FROM entities ORDER BY created_at ASC, id ASC"#)
        .fetch_all(&mut **tx)
        .await?;
    let mut entities: Vec<Entity> = rows
        .into_iter()
        .map(|row| {
            let value: String = row.get("entity_data");
            serde_json::from_str(&value).map_err(StoreError::from)
        })
        .collect::<Result<Vec<_>, _>>()?;
    sort_entities(&mut entities);

    let scene_version = sqlx::query_scalar::<_, i64>(
        r#"SELECT scene_version FROM scene_configs WHERE site_id = ?"#,
    )
    .bind(seed_scene::SITE_ID)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE published_state
        SET entities = ?, published_scene_version = ?, updated_at = ?
        WHERE site_id = ?
        "#,
    )
    .bind(serde_json::to_string(&entities)?)
    .bind(scene_version)
    .bind(updated_at as i64)
    .bind(seed_scene::SITE_ID)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
