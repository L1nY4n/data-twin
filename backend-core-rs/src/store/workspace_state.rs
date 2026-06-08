use std::collections::BTreeMap;

use sqlx::{
    PgConnection, PgPool, Postgres, Row, Sqlite, SqliteConnection, SqlitePool, Transaction,
};

use crate::{
    contracts::{
        DataConnector, Entity, EntityBinding, PublishedSceneDescriptor, RuleConfig, SceneConfig,
        StaticAssetInstance, WorkspaceRecord,
    },
    seed_scene,
};

use super::{
    helpers::{now_millis, sort_entities, sort_static_assets},
    persist_workspace_state_postgres, persist_workspace_state_sqlite, StoreError, WorkspaceState,
};

pub(super) async fn load_workspace_state_postgres(
    pool: &PgPool,
    workspace_id: &str,
) -> Result<Option<WorkspaceState>, StoreError> {
    let row = sqlx::query(r#"SELECT state_data FROM workspace_states WHERE workspace_id = $1"#)
        .bind(workspace_id)
        .fetch_optional(pool)
        .await?;

    match row {
        Some(row) => {
            let value: serde_json::Value = row.get("state_data");
            Ok(Some(serde_json::from_value(value)?))
        }
        None => Ok(None),
    }
}

pub(super) async fn load_workspace_state_sqlite(
    pool: &SqlitePool,
    workspace_id: &str,
) -> Result<Option<WorkspaceState>, StoreError> {
    let row = sqlx::query(r#"SELECT state_data FROM workspace_states WHERE workspace_id = ?"#)
        .bind(workspace_id)
        .fetch_optional(pool)
        .await?;

    match row {
        Some(row) => {
            let value: String = row.get("state_data");
            Ok(Some(serde_json::from_str(&value)?))
        }
        None => Ok(None),
    }
}

pub(super) async fn backfill_workspace_states_postgres(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<(), StoreError> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM workspace_states"#)
        .fetch_one(&mut **tx)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let workspace_row = sqlx::query(
        r#"
        SELECT workspace_data
        FROM workspaces
        WHERE is_homepage = true
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        "#,
    )
    .fetch_optional(&mut **tx)
    .await?;

    let Some(workspace_row) = workspace_row else {
        return Ok(());
    };

    let workspace: WorkspaceRecord = serde_json::from_value(workspace_row.get("workspace_data"))?;
    let state = load_legacy_workspace_state_postgres(&mut **tx, &workspace).await?;
    persist_workspace_state_postgres(tx, &workspace.id, &state).await
}

pub(super) async fn backfill_workspace_states_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<(), StoreError> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM workspace_states"#)
        .fetch_one(&mut **tx)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let workspace_row = sqlx::query(
        r#"
        SELECT workspace_data
        FROM workspaces
        WHERE is_homepage = 1
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        "#,
    )
    .fetch_optional(&mut **tx)
    .await?;

    let Some(workspace_row) = workspace_row else {
        return Ok(());
    };

    let workspace: WorkspaceRecord =
        serde_json::from_str(workspace_row.get::<String, _>("workspace_data").as_str())?;
    let state = load_legacy_workspace_state_sqlite(&mut **tx, &workspace).await?;
    persist_workspace_state_sqlite(tx, &workspace.id, &state).await
}

pub(super) async fn load_legacy_workspace_state_postgres(
    tx: &mut PgConnection,
    workspace: &WorkspaceRecord,
) -> Result<WorkspaceState, StoreError> {
    let scene_row =
        sqlx::query(r#"SELECT scene_version, scene_config FROM scene_configs WHERE site_id = $1"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;
    let scene_version = scene_row.get::<i64, _>("scene_version") as u64;
    let mut scene_config: SceneConfig = serde_json::from_value(scene_row.get("scene_config"))?;
    scene_config.id = workspace.id.clone();
    if scene_config.name.trim().is_empty() {
        scene_config.name = workspace.name.clone();
    }

    let mut entities: Vec<Entity> = sqlx::query(r#"SELECT entity_data FROM entities"#)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| serde_json::from_value(row.get("entity_data")).map_err(StoreError::from))
        .collect::<Result<Vec<_>, _>>()?;
    let mut static_assets: Vec<StaticAssetInstance> =
        sqlx::query(r#"SELECT asset_data FROM static_assets"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| serde_json::from_value(row.get("asset_data")).map_err(StoreError::from))
            .collect::<Result<Vec<_>, _>>()?;
    let rules: Vec<RuleConfig> = sqlx::query(r#"SELECT rule_data FROM rules"#)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| serde_json::from_value(row.get("rule_data")).map_err(StoreError::from))
        .collect::<Result<Vec<_>, _>>()?;
    let connectors: Vec<DataConnector> =
        sqlx::query(r#"SELECT connector_data FROM data_connectors"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| serde_json::from_value(row.get("connector_data")).map_err(StoreError::from))
            .collect::<Result<Vec<_>, _>>()?;
    let bindings_list: Vec<EntityBinding> =
        sqlx::query(r#"SELECT binding_data FROM entity_bindings"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| serde_json::from_value(row.get("binding_data")).map_err(StoreError::from))
            .collect::<Result<Vec<_>, _>>()?;
    let published_row = sqlx::query(
        r#"
        SELECT published_scene_version, scene_config, entities, static_assets, published_scene,
               compiler_source, updated_at, active_publish_token, active_publish_started_at,
               active_publish_heartbeat_at, last_published_at, last_published_version,
               last_publish_error, last_failure_scene_version, last_failure_at
        FROM published_state
        WHERE site_id = $1
        "#,
    )
    .bind(seed_scene::SITE_ID)
    .fetch_optional(&mut *tx)
    .await?;

    sort_entities(&mut entities);
    sort_static_assets(&mut static_assets);
    let bindings = bindings_list.into_iter().fold(
        BTreeMap::<String, Vec<EntityBinding>>::new(),
        |mut acc, binding| {
            acc.entry(binding.entity_id.clone())
                .or_default()
                .push(binding);
            acc
        },
    );

    let (
        published_scene_version,
        published_scene_config,
        published_entities,
        published_static_assets,
        published_scene,
        published_compiler_source,
        published_updated_at,
        active_publish_token,
        active_publish_started_at,
        active_publish_heartbeat_at,
        last_published_at,
        last_published_version,
        last_publish_error,
        last_failure_scene_version,
        last_failure_at,
    ) = if let Some(row) = published_row {
        let mut published_scene_config: SceneConfig =
            serde_json::from_value(row.get("scene_config"))?;
        published_scene_config.id = workspace.id.clone();
        (
            row.get::<i64, _>("published_scene_version") as u64,
            published_scene_config,
            serde_json::from_value::<Vec<Entity>>(row.get("entities"))?,
            serde_json::from_value::<Vec<StaticAssetInstance>>(row.get("static_assets"))?,
            row.get::<Option<serde_json::Value>, _>("published_scene")
                .map(serde_json::from_value::<PublishedSceneDescriptor>)
                .transpose()?,
            row.get("compiler_source"),
            row.get::<i64, _>("updated_at") as u64,
            row.get("active_publish_token"),
            row.get::<Option<i64>, _>("active_publish_started_at")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("active_publish_heartbeat_at")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("last_published_at")
                .map(|value| value as u64),
            row.get("last_published_version"),
            row.get("last_publish_error"),
            row.get::<Option<i64>, _>("last_failure_scene_version")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("last_failure_at")
                .map(|value| value as u64),
        )
    } else {
        (
            scene_version,
            scene_config.clone(),
            entities.clone(),
            static_assets.clone(),
            None,
            "legacy-backfill".to_string(),
            now_millis(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
    };

    Ok(WorkspaceState {
        scene_version,
        scene_config,
        entities: entities
            .into_iter()
            .map(|entity| (entity.id().to_string(), entity))
            .collect(),
        static_assets: static_assets
            .into_iter()
            .map(|asset| (asset.id.clone(), asset))
            .collect(),
        floor_plan_basemaps: Vec::new(),
        published_scene_version,
        published_scene_config,
        published_entities,
        published_static_assets,
        published_scene,
        published_compiler_source,
        published_updated_at,
        active_publish_token,
        active_publish_started_at,
        active_publish_heartbeat_at,
        last_published_at,
        last_published_version,
        last_publish_error,
        last_failure_scene_version,
        last_failure_at,
        rules: rules
            .into_iter()
            .map(|rule| (rule.id.clone(), rule))
            .collect(),
        alarms: Vec::new(),
        connectors: connectors
            .into_iter()
            .map(|connector| (connector.id.clone(), connector))
            .collect(),
        bindings,
        audit_events: Vec::new(),
    })
}

pub(super) async fn load_legacy_workspace_state_sqlite(
    tx: &mut SqliteConnection,
    workspace: &WorkspaceRecord,
) -> Result<WorkspaceState, StoreError> {
    let scene_row =
        sqlx::query(r#"SELECT scene_version, scene_config FROM scene_configs WHERE site_id = ?"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;
    let scene_version = scene_row.get::<i64, _>("scene_version") as u64;
    let mut scene_config: SceneConfig =
        serde_json::from_str(scene_row.get::<String, _>("scene_config").as_str())?;
    scene_config.id = workspace.id.clone();
    if scene_config.name.trim().is_empty() {
        scene_config.name = workspace.name.clone();
    }

    let mut entities: Vec<Entity> = sqlx::query(r#"SELECT entity_data FROM entities"#)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| {
            serde_json::from_str(row.get::<String, _>("entity_data").as_str())
                .map_err(StoreError::from)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut static_assets: Vec<StaticAssetInstance> =
        sqlx::query(r#"SELECT asset_data FROM static_assets"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| {
                serde_json::from_str(row.get::<String, _>("asset_data").as_str())
                    .map_err(StoreError::from)
            })
            .collect::<Result<Vec<_>, _>>()?;
    let rules: Vec<RuleConfig> = sqlx::query(r#"SELECT rule_data FROM rules"#)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| {
            serde_json::from_str(row.get::<String, _>("rule_data").as_str())
                .map_err(StoreError::from)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let connectors: Vec<DataConnector> =
        sqlx::query(r#"SELECT connector_data FROM data_connectors"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| {
                serde_json::from_str(row.get::<String, _>("connector_data").as_str())
                    .map_err(StoreError::from)
            })
            .collect::<Result<Vec<_>, _>>()?;
    let bindings_list: Vec<EntityBinding> =
        sqlx::query(r#"SELECT binding_data FROM entity_bindings"#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|row| {
                serde_json::from_str(row.get::<String, _>("binding_data").as_str())
                    .map_err(StoreError::from)
            })
            .collect::<Result<Vec<_>, _>>()?;
    let published_row = sqlx::query(
        r#"
        SELECT published_scene_version, scene_config, entities, static_assets, published_scene,
               compiler_source, updated_at, active_publish_token, active_publish_started_at,
               active_publish_heartbeat_at, last_published_at, last_published_version,
               last_publish_error, last_failure_scene_version, last_failure_at
        FROM published_state
        WHERE site_id = ?
        "#,
    )
    .bind(seed_scene::SITE_ID)
    .fetch_optional(&mut *tx)
    .await?;

    sort_entities(&mut entities);
    sort_static_assets(&mut static_assets);
    let bindings = bindings_list.into_iter().fold(
        BTreeMap::<String, Vec<EntityBinding>>::new(),
        |mut acc, binding| {
            acc.entry(binding.entity_id.clone())
                .or_default()
                .push(binding);
            acc
        },
    );

    let (
        published_scene_version,
        published_scene_config,
        published_entities,
        published_static_assets,
        published_scene,
        published_compiler_source,
        published_updated_at,
        active_publish_token,
        active_publish_started_at,
        active_publish_heartbeat_at,
        last_published_at,
        last_published_version,
        last_publish_error,
        last_failure_scene_version,
        last_failure_at,
    ) = if let Some(row) = published_row {
        let mut published_scene_config: SceneConfig =
            serde_json::from_str(row.get::<String, _>("scene_config").as_str())?;
        published_scene_config.id = workspace.id.clone();
        (
            row.get::<i64, _>("published_scene_version") as u64,
            published_scene_config,
            serde_json::from_str::<Vec<Entity>>(row.get::<String, _>("entities").as_str())?,
            serde_json::from_str::<Vec<StaticAssetInstance>>(
                row.get::<String, _>("static_assets").as_str(),
            )?,
            row.get::<Option<String>, _>("published_scene")
                .map(|value| serde_json::from_str::<PublishedSceneDescriptor>(&value))
                .transpose()?,
            row.get("compiler_source"),
            row.get::<i64, _>("updated_at") as u64,
            row.get("active_publish_token"),
            row.get::<Option<i64>, _>("active_publish_started_at")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("active_publish_heartbeat_at")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("last_published_at")
                .map(|value| value as u64),
            row.get("last_published_version"),
            row.get("last_publish_error"),
            row.get::<Option<i64>, _>("last_failure_scene_version")
                .map(|value| value as u64),
            row.get::<Option<i64>, _>("last_failure_at")
                .map(|value| value as u64),
        )
    } else {
        (
            scene_version,
            scene_config.clone(),
            entities.clone(),
            static_assets.clone(),
            None,
            "legacy-backfill".to_string(),
            now_millis(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
    };

    Ok(WorkspaceState {
        scene_version,
        scene_config,
        entities: entities
            .into_iter()
            .map(|entity| (entity.id().to_string(), entity))
            .collect(),
        static_assets: static_assets
            .into_iter()
            .map(|asset| (asset.id.clone(), asset))
            .collect(),
        floor_plan_basemaps: Vec::new(),
        published_scene_version,
        published_scene_config,
        published_entities,
        published_static_assets,
        published_scene,
        published_compiler_source,
        published_updated_at,
        active_publish_token,
        active_publish_started_at,
        active_publish_heartbeat_at,
        last_published_at,
        last_published_version,
        last_publish_error,
        last_failure_scene_version,
        last_failure_at,
        rules: rules
            .into_iter()
            .map(|rule| (rule.id.clone(), rule))
            .collect(),
        alarms: Vec::new(),
        connectors: connectors
            .into_iter()
            .map(|connector| (connector.id.clone(), connector))
            .collect(),
        bindings,
        audit_events: Vec::new(),
    })
}
