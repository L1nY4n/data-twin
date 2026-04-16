use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    path::Path,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use sqlx::{
    postgres::PgPoolOptions, sqlite::SqlitePoolOptions, Executor, PgConnection, PgPool,
    Postgres, Row, Sqlite, SqliteConnection, SqlitePool, Transaction,
};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    contracts::{
        Alarm, ArchetypeModelAsset, AuditEventRecord, BootstrapResponse, ContractValue,
        DataConnector, EditorSaveMode, EditorSaveRequest, EditorSaveResponse, Entity,
        EntityArchetype, EntityBinding, EntityCategory, EntityStatus, ModelAssetFileType,
        PublishedSceneDescriptor, RuleConfig, RuleValidationResponse, SceneConfig,
        SceneResponse, StaticAssetInstance, Vector3, WorkspaceRecord,
    },
    published_scene::load_published_scene_descriptor,
    seed_scene,
};

const DEFAULT_SQLITE_URL: &str = "sqlite://./data/digital-twin.db?mode=rwc";
const MANAGED_ARCHETYPE_ASSET_PREFIX: &str = "/assets/entity-archetypes/";

#[derive(Debug)]
pub enum StoreError {
    Database(sqlx::Error),
    Serialization(serde_json::Error),
    Validation(String),
    Conflict(String),
    SceneVersionConflict { expected: u64, actual: u64 },
    NotFound(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Database(error) => write!(f, "database error: {error}"),
            Self::Serialization(error) => write!(f, "serialization error: {error}"),
            Self::Validation(message) => write!(f, "validation error: {message}"),
            Self::Conflict(message) => write!(f, "conflict: {message}"),
            Self::SceneVersionConflict { expected, actual } => write!(
                f,
                "conflict: editor save is based on scene version {expected}, but the current version is {actual}; reload the editor and retry"
            ),
            Self::NotFound(message) => write!(f, "not found: {message}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<sqlx::Error> for StoreError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value)
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serialization(value)
    }
}

#[derive(Clone)]
pub struct Store {
    backend: StoreBackend,
}

#[derive(Clone)]
enum StoreBackend {
    Memory(Arc<RwLock<MemoryStore>>),
    Postgres(Arc<PostgresStore>),
    Sqlite(Arc<SqliteStore>),
}

#[derive(Clone)]
struct PostgresStore {
    pool: PgPool,
}

#[derive(Clone)]
struct SqliteStore {
    pool: SqlitePool,
}

#[derive(Debug, Clone)]
struct MemoryStore {
    scene_version: u64,
    scene_config: SceneConfig,
    entities: BTreeMap<String, Entity>,
    static_assets: BTreeMap<String, StaticAssetInstance>,
    published_scene_version: u64,
    published_scene_config: SceneConfig,
    published_entities: Vec<Entity>,
    published_static_assets: Vec<StaticAssetInstance>,
    published_scene: Option<PublishedSceneDescriptor>,
    published_compiler_source: String,
    published_updated_at: u64,
    active_publish_token: Option<String>,
    active_publish_started_at: Option<u64>,
    active_publish_heartbeat_at: Option<u64>,
    last_published_at: Option<u64>,
    last_published_version: Option<String>,
    last_publish_error: Option<String>,
    last_failure_scene_version: Option<u64>,
    last_failure_at: Option<u64>,
    rules: BTreeMap<String, RuleConfig>,
    alarms: Vec<Alarm>,
    connectors: BTreeMap<String, DataConnector>,
    bindings: BTreeMap<String, Vec<EntityBinding>>,
    entity_categories: BTreeMap<String, EntityCategory>,
    entity_archetypes: BTreeMap<String, EntityArchetype>,
    workspaces: BTreeMap<String, WorkspaceRecord>,
    workspace_states: BTreeMap<String, WorkspaceState>,
    audit_events: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceState {
    scene_version: u64,
    scene_config: SceneConfig,
    entities: BTreeMap<String, Entity>,
    static_assets: BTreeMap<String, StaticAssetInstance>,
    published_scene_version: u64,
    published_scene_config: SceneConfig,
    published_entities: Vec<Entity>,
    published_static_assets: Vec<StaticAssetInstance>,
    published_scene: Option<PublishedSceneDescriptor>,
    published_compiler_source: String,
    published_updated_at: u64,
    active_publish_token: Option<String>,
    active_publish_started_at: Option<u64>,
    active_publish_heartbeat_at: Option<u64>,
    last_published_at: Option<u64>,
    last_published_version: Option<String>,
    last_publish_error: Option<String>,
    last_failure_scene_version: Option<u64>,
    last_failure_at: Option<u64>,
    rules: BTreeMap<String, RuleConfig>,
    alarms: Vec<Alarm>,
    connectors: BTreeMap<String, DataConnector>,
    bindings: BTreeMap<String, Vec<EntityBinding>>,
    audit_events: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingSnapshot {
    pub scene_version: u64,
    pub scene_config: SceneConfig,
    pub entities: Vec<Entity>,
    pub static_assets: Vec<StaticAssetInstance>,
}

#[derive(Debug, Clone)]
pub struct PublishedStateRecord {
    pub published_scene_version: u64,
    pub scene_config: SceneConfig,
    pub entities: Vec<Entity>,
    pub static_assets: Vec<StaticAssetInstance>,
    pub published_scene: Option<PublishedSceneDescriptor>,
    pub compiler_source: String,
    pub updated_at: u64,
    pub active_publish_token: Option<String>,
    pub active_publish_started_at: Option<u64>,
    pub active_publish_heartbeat_at: Option<u64>,
    pub last_published_at: Option<u64>,
    pub last_published_version: Option<String>,
    pub last_publish_error: Option<String>,
    pub last_failure_scene_version: Option<u64>,
    pub last_failure_at: Option<u64>,
}

impl MemoryStore {
    fn seeded() -> Self {
        let snapshot = seed_scene::seed_snapshot();
        let published_scene = load_published_scene_descriptor();
        let now = now_millis();
        let default_workspace = WorkspaceRecord {
            id: snapshot.scene_config.id.clone(),
            slug: snapshot.scene_config.id.clone(),
            name: snapshot.scene_config.name.clone(),
            description: Some("默认工作区".to_string()),
            is_homepage: true,
            created_at: now,
            updated_at: now,
        };
        let mut published_entities = snapshot.entities.clone();
        let mut published_static_assets = Vec::new();
        sort_entities(&mut published_entities);
        sort_static_assets(&mut published_static_assets);
        let workspace_state = create_seed_workspace_state(&default_workspace);

        Self {
            scene_version: snapshot.scene_version,
            scene_config: snapshot.scene_config.clone(),
            entities: snapshot
                .entities
                .into_iter()
                .map(|entity| (entity.id().to_string(), entity))
                .collect(),
            static_assets: BTreeMap::new(),
            published_scene_version: snapshot.scene_version,
            published_scene_config: snapshot.scene_config,
            published_entities,
            published_static_assets,
            published_scene: published_scene.clone(),
            published_compiler_source: "campus-layout".to_string(),
            published_updated_at: now,
            active_publish_token: None,
            active_publish_started_at: None,
            active_publish_heartbeat_at: None,
            last_published_at: Some(now),
            last_published_version: published_scene
                .as_ref()
                .map(|descriptor| descriptor.package_version.clone()),
            last_publish_error: None,
            last_failure_scene_version: None,
            last_failure_at: None,
            rules: snapshot
                .rules
                .into_iter()
                .map(|rule| (rule.id.clone(), rule))
                .collect(),
            alarms: Vec::new(),
            connectors: BTreeMap::new(),
            bindings: BTreeMap::new(),
            entity_categories: BTreeMap::new(),
            entity_archetypes: BTreeMap::new(),
            workspaces: BTreeMap::from([(default_workspace.id.clone(), default_workspace)]),
            workspace_states: BTreeMap::from([(
                workspace_state.scene_config.id.clone(),
                workspace_state,
            )]),
            audit_events: Vec::new(),
        }
    }
}

fn create_seed_workspace_state(workspace: &WorkspaceRecord) -> WorkspaceState {
    let snapshot = seed_scene::seed_snapshot();
    let now = now_millis();
    let mut scene_config = snapshot.scene_config.clone();
    scene_config.id = workspace.id.clone();
    scene_config.name = workspace.name.clone();

    let mut published_entities = snapshot.entities.clone();
    let mut published_static_assets = Vec::new();
    sort_entities(&mut published_entities);
    sort_static_assets(&mut published_static_assets);

    WorkspaceState {
        scene_version: snapshot.scene_version,
        scene_config: scene_config.clone(),
        entities: snapshot
            .entities
            .into_iter()
            .map(|entity| (entity.id().to_string(), entity))
            .collect(),
        static_assets: BTreeMap::new(),
        published_scene_version: snapshot.scene_version,
        published_scene_config: scene_config,
        published_entities,
        published_static_assets,
        published_scene: None,
        published_compiler_source: "workspace-seed".to_string(),
        published_updated_at: now,
        active_publish_token: None,
        active_publish_started_at: None,
        active_publish_heartbeat_at: None,
        last_published_at: None,
        last_published_version: None,
        last_publish_error: None,
        last_failure_scene_version: None,
        last_failure_at: None,
        rules: snapshot
            .rules
            .into_iter()
            .map(|rule| (rule.id.clone(), rule))
            .collect(),
        alarms: Vec::new(),
        connectors: BTreeMap::new(),
        bindings: BTreeMap::new(),
        audit_events: Vec::new(),
    }
}

impl Store {
    pub async fn from_env() -> Result<Self, StoreError> {
        if let Ok(url) = env::var("DATABASE_URL") {
            if !url.trim().is_empty() {
                return Self::from_database_url(url.trim()).await;
            }
        }

        let default_sqlite_url = env::var("DEFAULT_SQLITE_URL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_SQLITE_URL.to_string());
        Self::from_database_url(&default_sqlite_url).await
    }

    pub(crate) async fn from_database_url(url: &str) -> Result<Self, StoreError> {
        if is_memory_backend_url(url) {
            return Ok(Self::memory_backend());
        }

        if is_sqlite_url(url) {
            ensure_sqlite_parent_dir(url)?;
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect(url)
                .await?;
            setup_sqlite(&pool).await?;

            Ok(Self {
                backend: StoreBackend::Sqlite(Arc::new(SqliteStore { pool })),
            })
        } else {
            let pool = PgPoolOptions::new()
                .max_connections(10)
                .connect(url)
                .await?;
            setup_postgres(&pool).await?;

            Ok(Self {
                backend: StoreBackend::Postgres(Arc::new(PostgresStore { pool })),
            })
        }
    }

    fn memory_backend() -> Self {
        Self {
            backend: StoreBackend::Memory(Arc::new(RwLock::new(MemoryStore::seeded()))),
        }
    }

    async fn ensure_workspace_state(
        &self,
        workspace_id: &str,
    ) -> Result<(WorkspaceRecord, WorkspaceState), StoreError> {
        let workspace = self
            .get_workspace(workspace_id)
            .await?
            .ok_or_else(|| StoreError::NotFound(format!("workspace {workspace_id}")))?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let state = snapshot
                    .workspace_states
                    .entry(workspace_id.to_string())
                    .or_insert_with(|| create_seed_workspace_state(&workspace))
                    .clone();
                Ok((workspace, state))
            }
            StoreBackend::Postgres(store) => {
                let maybe_state = load_workspace_state_postgres(&store.pool, workspace_id).await?;
                let state = if let Some(state) = maybe_state {
                    state
                } else {
                    let state = create_seed_workspace_state(&workspace);
                    let mut tx = store.pool.begin().await?;
                    persist_workspace_state_postgres(&mut tx, workspace_id, &state).await?;
                    tx.commit().await?;
                    state
                };
                Ok((workspace, state))
            }
            StoreBackend::Sqlite(store) => {
                let maybe_state = load_workspace_state_sqlite(&store.pool, workspace_id).await?;
                let state = if let Some(state) = maybe_state {
                    state
                } else {
                    let state = create_seed_workspace_state(&workspace);
                    let mut tx = store.pool.begin().await?;
                    persist_workspace_state_sqlite(&mut tx, workspace_id, &state).await?;
                    tx.commit().await?;
                    state
                };
                Ok((workspace, state))
            }
        }
    }

    async fn persist_workspace_state(
        &self,
        workspace_id: &str,
        state: &WorkspaceState,
    ) -> Result<(), StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                store
                    .write()
                    .await
                    .workspace_states
                    .insert(workspace_id.to_string(), state.clone());
                Ok(())
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                persist_workspace_state_postgres(&mut tx, workspace_id, state).await?;
                tx.commit().await?;
                Ok(())
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                persist_workspace_state_sqlite(&mut tx, workspace_id, state).await?;
                tx.commit().await?;
                Ok(())
            }
        }
    }

    pub async fn get_workspace_by_slug(
        &self,
        slug: &str,
    ) -> Result<Option<WorkspaceRecord>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store
                .read()
                .await
                .workspaces
                .values()
                .find(|workspace| workspace.slug == slug)
                .cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE slug = $1"#)
                    .bind(slug)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("workspace_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE slug = ?"#)
                    .bind(slug)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: String = row.get("workspace_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn workspace_bootstrap(
        &self,
        workspace_id: &str,
    ) -> Result<BootstrapResponse, StoreError> {
        let (workspace, state) = self.ensure_workspace_state(workspace_id).await?;
        let entity_categories = self.list_entity_categories().await?;
        let entity_archetypes = self.list_entity_archetypes().await?;

        Ok(BootstrapResponse {
            site_id: seed_scene::SITE_ID.to_string(),
            workspace_id: workspace.id,
            workspace_slug: workspace.slug,
            workspace_name: workspace.name,
            scene_version: state.published_scene_version,
            scene_config: state.published_scene_config.clone(),
            entities: state.published_entities.clone(),
            static_assets: state.published_static_assets.clone(),
            entity_categories,
            entity_archetypes,
            rules: state.rules.values().cloned().collect(),
            alarms: state.alarms.clone(),
            published_scene: state.published_scene.clone(),
            issued_at: now_millis(),
        })
    }

    pub async fn workspace_editor_bootstrap(
        &self,
        workspace_id: &str,
    ) -> Result<BootstrapResponse, StoreError> {
        let (workspace, state) = self.ensure_workspace_state(workspace_id).await?;
        let entity_categories = self.list_entity_categories().await?;
        let entity_archetypes = self.list_entity_archetypes().await?;

        Ok(BootstrapResponse {
            site_id: seed_scene::SITE_ID.to_string(),
            workspace_id: workspace.id,
            workspace_slug: workspace.slug,
            workspace_name: workspace.name,
            scene_version: state.scene_version,
            scene_config: state.scene_config.clone(),
            entities: state.entities.values().cloned().collect(),
            static_assets: state.static_assets.values().cloned().collect(),
            entity_categories,
            entity_archetypes,
            rules: state.rules.values().cloned().collect(),
            alarms: state.alarms.clone(),
            published_scene: state.published_scene.clone(),
            issued_at: now_millis(),
        })
    }

    pub async fn workspace_get_scene(
        &self,
        workspace_id: &str,
    ) -> Result<SceneResponse, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(SceneResponse {
            scene_version: state.scene_version,
            scene_config: state.scene_config,
        })
    }

    pub async fn workspace_update_scene(
        &self,
        workspace_id: &str,
        config: SceneConfig,
    ) -> Result<SceneResponse, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        state.scene_config = config.clone();
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "scene.update",
            "resourceType": "scene",
            "resourceId": workspace_id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;

        Ok(SceneResponse {
            scene_version: state.scene_version,
            scene_config: config,
        })
    }

    pub async fn workspace_load_working_snapshot(
        &self,
        workspace_id: &str,
    ) -> Result<WorkingSnapshot, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(WorkingSnapshot {
            scene_version: state.scene_version,
            scene_config: state.scene_config,
            entities: state.entities.values().cloned().collect(),
            static_assets: state.static_assets.values().cloned().collect(),
        })
    }

    pub async fn workspace_published_state(
        &self,
        workspace_id: &str,
    ) -> Result<PublishedStateRecord, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(PublishedStateRecord {
            published_scene_version: state.published_scene_version,
            scene_config: state.published_scene_config,
            entities: state.published_entities,
            static_assets: state.published_static_assets,
            published_scene: state.published_scene,
            compiler_source: state.published_compiler_source,
            updated_at: state.published_updated_at,
            active_publish_token: state.active_publish_token,
            active_publish_started_at: state.active_publish_started_at,
            active_publish_heartbeat_at: state.active_publish_heartbeat_at,
            last_published_at: state.last_published_at,
            last_published_version: state.last_published_version,
            last_publish_error: state.last_publish_error,
            last_failure_scene_version: state.last_failure_scene_version,
            last_failure_at: state.last_failure_at,
        })
    }

    pub async fn ensure_legacy_published_state_alias(&self) -> Result<(), StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        let published = self.workspace_published_state(&workspace_id).await?;

        match &self.backend {
            StoreBackend::Memory(_) => Ok(()),
            StoreBackend::Postgres(store) => {
                let count: i64 = sqlx::query_scalar(
                    r#"SELECT COUNT(*) FROM published_state WHERE site_id = $1"#,
                )
                .bind(seed_scene::SITE_ID)
                .fetch_one(&store.pool)
                .await?;
                if count > 0 {
                    return Ok(());
                }
                let mut tx = store.pool.begin().await?;
                upsert_published_state_postgres(
                    &mut tx,
                    &WorkingSnapshot {
                        scene_version: published.published_scene_version,
                        scene_config: published.scene_config.clone(),
                        entities: published.entities.clone(),
                        static_assets: published.static_assets.clone(),
                    },
                    published.published_scene.as_ref(),
                    &published.compiler_source,
                    published.updated_at,
                )
                .await?;
                tx.commit().await?;
                Ok(())
            }
            StoreBackend::Sqlite(store) => {
                let count: i64 = sqlx::query_scalar(
                    r#"SELECT COUNT(*) FROM published_state WHERE site_id = ?"#,
                )
                .bind(seed_scene::SITE_ID)
                .fetch_one(&store.pool)
                .await?;
                if count > 0 {
                    return Ok(());
                }
                let mut tx = store.pool.begin().await?;
                upsert_published_state_sqlite(
                    &mut tx,
                    &WorkingSnapshot {
                        scene_version: published.published_scene_version,
                        scene_config: published.scene_config.clone(),
                        entities: published.entities.clone(),
                        static_assets: published.static_assets.clone(),
                    },
                    published.published_scene.as_ref(),
                    &published.compiler_source,
                    published.updated_at,
                )
                .await?;
                tx.commit().await?;
                Ok(())
            }
        }
    }

    pub async fn workspace_scene_version(&self, workspace_id: &str) -> Result<u64, StoreError> {
        Ok(self.workspace_get_scene(workspace_id).await?.scene_version)
    }

    pub async fn workspace_has_entity(
        &self,
        workspace_id: &str,
        entity_id: &str,
    ) -> Result<bool, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.entities.contains_key(entity_id))
    }

    pub async fn workspace_save_editor_changes(
        &self,
        workspace_id: &str,
        request: EditorSaveRequest,
    ) -> Result<EditorSaveResponse, StoreError> {
        validate_editor_save_request(&request)?;

        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        ensure_expected_scene_version(request.expected_scene_version, state.scene_version)?;
        let response_scene_config = request
            .scene_config
            .clone()
            .unwrap_or_else(|| state.scene_config.clone());
        let mut saved_entity = None;
        let mut saved_static_asset = None;

        if let Some(scene_config) = request.scene_config.clone() {
            state.scene_config = scene_config;
            state.audit_events.push(serde_json::json!({
                "action": "scene.update",
                "resourceType": "scene",
                "resourceId": workspace_id,
                "actor": "system",
                "timestamp": now_millis()
            }));
        }

        if let Some(entity_save) = request.entity {
            let action = match entity_save.mode {
                EditorSaveMode::Create => "entity.create",
                EditorSaveMode::Update => "entity.update",
            };
            let entity = match entity_save.mode {
                EditorSaveMode::Create => {
                    let mut entity = entity_save.entity;
                    ensure_entity_create_defaults(&mut entity, now_millis());
                    if state.entities.contains_key(entity.id()) {
                        return Err(StoreError::Validation(format!(
                            "entity {} already exists",
                            entity.id()
                        )));
                    }
                    state
                        .entities
                        .insert(entity.id().to_string(), entity.clone());
                    entity
                }
                EditorSaveMode::Update => {
                    let mut entity = entity_save.entity;
                    let entity_id = entity.id().to_string();
                    let Some(existing) = state.entities.get(&entity_id) else {
                        return Err(StoreError::NotFound(format!("entity {entity_id}")));
                    };
                    set_entity_id(&mut entity, &entity_id);
                    ensure_entity_update_defaults(&mut entity, now_millis());
                    set_entity_created_at(&mut entity, existing.created_at());
                    state.entities.insert(entity_id.clone(), entity.clone());
                    entity
                }
            };
            state.audit_events.push(serde_json::json!({
                "action": action,
                "resourceType": "entity",
                "resourceId": entity.id(),
                "actor": "system",
                "timestamp": now_millis()
            }));
            saved_entity = Some(entity);
        }

        if let Some(static_asset_save) = request.static_asset {
            let action = match static_asset_save.mode {
                EditorSaveMode::Create => "static_asset.create",
                EditorSaveMode::Update => "static_asset.update",
            };
            let asset = match static_asset_save.mode {
                EditorSaveMode::Create => {
                    let mut asset = static_asset_save.static_asset;
                    ensure_static_asset_create_defaults(&mut asset, now_millis());
                    if state.static_assets.contains_key(&asset.id) {
                        return Err(StoreError::Validation(format!(
                            "static asset {} already exists",
                            asset.id
                        )));
                    }
                    state.static_assets.insert(asset.id.clone(), asset.clone());
                    asset
                }
                EditorSaveMode::Update => {
                    let mut asset = static_asset_save.static_asset;
                    let asset_id = asset.id.clone();
                    let Some(existing) = state.static_assets.get(&asset_id) else {
                        return Err(StoreError::NotFound(format!("static asset {asset_id}")));
                    };
                    ensure_static_asset_update_defaults(&mut asset, now_millis());
                    asset.created_at = existing.created_at;
                    state.static_assets.insert(asset_id.clone(), asset.clone());
                    asset
                }
            };
            state.audit_events.push(serde_json::json!({
                "action": action,
                "resourceType": "static_asset",
                "resourceId": asset.id.clone(),
                "actor": "system",
                "timestamp": now_millis()
            }));
            saved_static_asset = Some(asset);
        }

        state.scene_version += 1;
        self.persist_workspace_state(workspace_id, &state).await?;

        Ok(EditorSaveResponse {
            scene_version: state.scene_version,
            scene_config: response_scene_config,
            saved_entity,
            saved_static_asset,
        })
    }

    pub async fn workspace_try_begin_publish(
        &self,
        workspace_id: &str,
        publish_token: &str,
        started_at: u64,
        stale_after: u64,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let stale_before = started_at.saturating_sub(stale_after);
        let lock_stale = state
            .active_publish_heartbeat_at
            .or(state.active_publish_started_at)
            .map(|heartbeat| heartbeat <= stale_before)
            .unwrap_or(true);

        if state.active_publish_token.is_some() && !lock_stale {
            return Ok(false);
        }

        state.active_publish_token = Some(publish_token.to_string());
        state.active_publish_started_at = Some(started_at);
        state.active_publish_heartbeat_at = Some(started_at);
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(true)
    }

    pub async fn workspace_refresh_publish_heartbeat(
        &self,
        workspace_id: &str,
        publish_token: &str,
        heartbeat_at: u64,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        if state.active_publish_token.as_deref() != Some(publish_token) {
            return Ok(false);
        }
        state.active_publish_heartbeat_at = Some(heartbeat_at);
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(true)
    }

    pub async fn workspace_promote_working_snapshot(
        &self,
        workspace_id: &str,
        snapshot: &WorkingSnapshot,
        published_scene: Option<PublishedSceneDescriptor>,
        compiler_source: &str,
    ) -> Result<PublishedStateRecord, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let updated_at = now_millis();
        let last_published_version = published_scene
            .as_ref()
            .map(|descriptor| descriptor.package_version.clone());

        state.published_scene_version = snapshot.scene_version;
        state.published_scene_config = snapshot.scene_config.clone();
        state.published_entities = snapshot.entities.clone();
        state.published_static_assets = snapshot.static_assets.clone();
        state.published_scene = published_scene.clone();
        state.published_compiler_source = compiler_source.to_string();
        state.published_updated_at = updated_at;
        state.active_publish_token = None;
        state.active_publish_started_at = None;
        state.active_publish_heartbeat_at = None;
        state.last_published_at = Some(updated_at);
        state.last_published_version = last_published_version.clone();
        state.last_publish_error = None;
        state.last_failure_scene_version = None;
        state.last_failure_at = None;

        self.persist_workspace_state(workspace_id, &state).await?;

        Ok(PublishedStateRecord {
            published_scene_version: snapshot.scene_version,
            scene_config: snapshot.scene_config.clone(),
            entities: snapshot.entities.clone(),
            static_assets: snapshot.static_assets.clone(),
            published_scene,
            compiler_source: compiler_source.to_string(),
            updated_at,
            active_publish_token: None,
            active_publish_started_at: None,
            active_publish_heartbeat_at: None,
            last_published_at: Some(updated_at),
            last_published_version,
            last_publish_error: None,
            last_failure_scene_version: None,
            last_failure_at: None,
        })
    }

    pub async fn workspace_record_publish_failure(
        &self,
        workspace_id: &str,
        scene_version: u64,
        error_message: &str,
    ) -> Result<(), StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let failed_at = now_millis();
        state.active_publish_token = None;
        state.active_publish_started_at = None;
        state.active_publish_heartbeat_at = None;
        state.last_publish_error = Some(error_message.to_string());
        state.last_failure_scene_version = Some(scene_version);
        state.last_failure_at = Some(failed_at);
        self.persist_workspace_state(workspace_id, &state).await
    }

    pub async fn workspace_list_entities(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<Entity>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        let mut entities: Vec<Entity> = state.entities.values().cloned().collect();
        sort_entities(&mut entities);
        Ok(entities)
    }

    pub async fn workspace_get_entity(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<Option<Entity>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.entities.get(id).cloned())
    }

    pub async fn workspace_create_entity(
        &self,
        workspace_id: &str,
        mut entity: Entity,
    ) -> Result<Entity, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let archetypes = self
            .list_entity_archetypes()
            .await?
            .into_iter()
            .map(|archetype| (archetype.id.clone(), archetype))
            .collect::<BTreeMap<_, _>>();
        ensure_entity_create_defaults(&mut entity, now_millis());
        normalize_dynamic_entity_registry_refs_memory(&mut entity, &archetypes)?;
        if state.entities.contains_key(entity.id()) {
            return Err(StoreError::Validation(format!(
                "entity {} already exists",
                entity.id()
            )));
        }
        state.entities.insert(entity.id().to_string(), entity.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "entity.create",
            "resourceType": "entity",
            "resourceId": entity.id(),
            "actor": "system",
            "timestamp": now_millis()
        }));
        sync_workspace_live_entity_roster(&mut state);
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(entity)
    }

    pub async fn workspace_update_entity(
        &self,
        workspace_id: &str,
        id: &str,
        mut entity: Entity,
    ) -> Result<Entity, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let archetypes = self
            .list_entity_archetypes()
            .await?
            .into_iter()
            .map(|archetype| (archetype.id.clone(), archetype))
            .collect::<BTreeMap<_, _>>();
        let Some(existing) = state.entities.get(id) else {
            return Err(StoreError::NotFound(format!("entity {id}")));
        };
        set_entity_id(&mut entity, id);
        ensure_entity_update_defaults(&mut entity, now_millis());
        normalize_dynamic_entity_registry_refs_memory(&mut entity, &archetypes)?;
        set_entity_created_at(&mut entity, existing.created_at());
        state.entities.insert(id.to_string(), entity.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "entity.update",
            "resourceType": "entity",
            "resourceId": id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        sync_workspace_live_entity_roster(&mut state);
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(entity)
    }

    pub async fn workspace_delete_entity(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let removed = state.entities.remove(id).is_some();
        if removed {
            state.bindings.remove(id);
            state.scene_version += 1;
            state.audit_events.push(serde_json::json!({
                "action": "entity.delete",
                "resourceType": "entity",
                "resourceId": id,
                "actor": "system",
                "timestamp": now_millis()
            }));
            sync_workspace_live_entity_roster(&mut state);
            self.persist_workspace_state(workspace_id, &state).await?;
        }
        Ok(removed)
    }

    pub async fn workspace_list_static_assets(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<StaticAssetInstance>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        let mut assets: Vec<StaticAssetInstance> = state.static_assets.values().cloned().collect();
        sort_static_assets(&mut assets);
        Ok(assets)
    }

    pub async fn workspace_get_static_asset(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<Option<StaticAssetInstance>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.static_assets.get(id).cloned())
    }

    pub async fn workspace_create_static_asset(
        &self,
        workspace_id: &str,
        mut asset: StaticAssetInstance,
    ) -> Result<StaticAssetInstance, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        ensure_static_asset_create_defaults(&mut asset, now_millis());
        if state.static_assets.contains_key(&asset.id) {
            return Err(StoreError::Validation(format!(
                "static asset {} already exists",
                asset.id
            )));
        }
        state.static_assets.insert(asset.id.clone(), asset.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "static_asset.create",
            "resourceType": "static_asset",
            "resourceId": asset.id.clone(),
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(asset)
    }

    pub async fn workspace_update_static_asset(
        &self,
        workspace_id: &str,
        id: &str,
        mut asset: StaticAssetInstance,
    ) -> Result<StaticAssetInstance, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let Some(existing) = state.static_assets.get(id) else {
            return Err(StoreError::NotFound(format!("static asset {id}")));
        };
        ensure_static_asset_update_defaults(&mut asset, now_millis());
        asset.id = id.to_string();
        asset.created_at = existing.created_at;
        state.static_assets.insert(id.to_string(), asset.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "static_asset.update",
            "resourceType": "static_asset",
            "resourceId": id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(asset)
    }

    pub async fn workspace_delete_static_asset(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let removed = state.static_assets.remove(id).is_some();
        if removed {
            state.scene_version += 1;
            state.audit_events.push(serde_json::json!({
                "action": "static_asset.delete",
                "resourceType": "static_asset",
                "resourceId": id,
                "actor": "system",
                "timestamp": now_millis()
            }));
            self.persist_workspace_state(workspace_id, &state).await?;
        }
        Ok(removed)
    }

    pub async fn workspace_list_connectors(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<DataConnector>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.connectors.values().cloned().collect())
    }

    pub async fn workspace_create_connector(
        &self,
        workspace_id: &str,
        mut connector: DataConnector,
    ) -> Result<DataConnector, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        if connector.id.trim().is_empty() {
            connector.id = Uuid::new_v4().to_string();
        }
        let now = now_millis();
        connector.created_at = now;
        connector.updated_at = now;
        if state.connectors.contains_key(&connector.id) {
            return Err(StoreError::Validation(format!(
                "connector {} already exists",
                connector.id
            )));
        }
        state.connectors.insert(connector.id.clone(), connector.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "connector.create",
            "resourceType": "connector",
            "resourceId": connector.id.clone(),
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(connector)
    }

    pub async fn workspace_update_connector(
        &self,
        workspace_id: &str,
        id: &str,
        mut connector: DataConnector,
    ) -> Result<DataConnector, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let Some(existing) = state.connectors.get(id) else {
            return Err(StoreError::NotFound(format!("connector {id}")));
        };
        connector.id = id.to_string();
        if connector.name.trim().is_empty() {
            connector.name = existing.name.clone();
        }
        connector.created_at = existing.created_at;
        connector.updated_at = now_millis();
        connector.created_at = existing.created_at;
        state.connectors.insert(id.to_string(), connector.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "connector.update",
            "resourceType": "connector",
            "resourceId": id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(connector)
    }

    pub async fn workspace_delete_connector(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let removed = state.connectors.remove(id).is_some();
        if removed {
            for bindings in state.bindings.values_mut() {
                bindings.retain(|binding| binding.connector_id != id);
            }
            state.scene_version += 1;
            state.audit_events.push(serde_json::json!({
                "action": "connector.delete",
                "resourceType": "connector",
                "resourceId": id,
                "actor": "system",
                "timestamp": now_millis()
            }));
            self.persist_workspace_state(workspace_id, &state).await?;
        }
        Ok(removed)
    }

    pub async fn workspace_list_bindings_by_entity(
        &self,
        workspace_id: &str,
        entity_id: &str,
    ) -> Result<Vec<EntityBinding>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.bindings.get(entity_id).cloned().unwrap_or_default())
    }

    pub async fn workspace_replace_entity_bindings(
        &self,
        workspace_id: &str,
        entity_id: &str,
        mut bindings: Vec<EntityBinding>,
    ) -> Result<Vec<EntityBinding>, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        if !state.entities.contains_key(entity_id) {
            return Err(StoreError::NotFound(format!("entity {entity_id}")));
        }

        let now = now_millis();
        let mut seen_connector_ids = HashSet::new();
        for binding in &bindings {
            if !seen_connector_ids.insert(binding.connector_id.clone()) {
                return Err(StoreError::Validation(format!(
                    "duplicate connector {} in bindings",
                    binding.connector_id
                )));
            }
            if !state.connectors.contains_key(&binding.connector_id) {
                return Err(StoreError::Validation(format!(
                    "connector {} does not exist",
                    binding.connector_id
                )));
            }
        }

        for binding in &mut bindings {
            binding.entity_id = entity_id.to_string();
            if binding.binding_id.trim().is_empty() {
                binding.binding_id = Uuid::new_v4().to_string();
            }
            binding.created_at = now;
            binding.updated_at = now;
        }

        state.bindings.insert(entity_id.to_string(), bindings.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "binding.replace",
            "resourceType": "binding",
            "resourceId": entity_id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(bindings)
    }

    pub async fn workspace_list_rules(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<RuleConfig>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.rules.values().cloned().collect())
    }

    pub async fn workspace_get_rule(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<Option<RuleConfig>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.rules.get(id).cloned())
    }

    pub async fn workspace_create_rule(
        &self,
        workspace_id: &str,
        mut rule: RuleConfig,
    ) -> Result<RuleConfig, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        if rule.id.trim().is_empty() {
            rule.id = Uuid::new_v4().to_string();
        }
        let now = now_millis();
        rule.created_at = now;
        rule.updated_at = now;
        if state.rules.contains_key(&rule.id) {
            return Err(StoreError::Validation(format!("rule {} already exists", rule.id)));
        }
        state.rules.insert(rule.id.clone(), rule.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "rule.create",
            "resourceType": "rule",
            "resourceId": rule.id.clone(),
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(rule)
    }

    pub async fn workspace_update_rule(
        &self,
        workspace_id: &str,
        id: &str,
        mut rule: RuleConfig,
    ) -> Result<RuleConfig, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let Some(existing) = state.rules.get(id) else {
            return Err(StoreError::NotFound(format!("rule {id}")));
        };
        rule.id = id.to_string();
        if rule.name.trim().is_empty() {
            rule.name = existing.name.clone();
        }
        rule.created_at = existing.created_at;
        rule.updated_at = now_millis();
        state.rules.insert(id.to_string(), rule.clone());
        state.scene_version += 1;
        state.audit_events.push(serde_json::json!({
            "action": "rule.update",
            "resourceType": "rule",
            "resourceId": id,
            "actor": "system",
            "timestamp": now_millis()
        }));
        self.persist_workspace_state(workspace_id, &state).await?;
        Ok(rule)
    }

    pub async fn workspace_delete_rule(
        &self,
        workspace_id: &str,
        id: &str,
    ) -> Result<bool, StoreError> {
        let (_, mut state) = self.ensure_workspace_state(workspace_id).await?;
        let removed = state.rules.remove(id).is_some();
        if removed {
            state.scene_version += 1;
            state.audit_events.push(serde_json::json!({
                "action": "rule.delete",
                "resourceType": "rule",
                "resourceId": id,
                "actor": "system",
                "timestamp": now_millis()
            }));
            self.persist_workspace_state(workspace_id, &state).await?;
        }
        Ok(removed)
    }

    pub async fn workspace_list_alarms(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<Alarm>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.alarms)
    }

    pub async fn workspace_binding_count(&self, workspace_id: &str) -> Result<u64, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        Ok(state.bindings.values().map(|items| items.len() as u64).sum())
    }

    pub async fn workspace_list_audit_events(
        &self,
        workspace_id: &str,
        limit: usize,
    ) -> Result<Vec<AuditEventRecord>, StoreError> {
        let (_, state) = self.ensure_workspace_state(workspace_id).await?;
        let mut events = state
            .audit_events
            .iter()
            .enumerate()
            .rev()
            .take(limit)
            .map(|(index, value)| map_memory_audit_event(index, value))
            .collect::<Vec<_>>();
        events.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(events)
    }

    pub async fn bootstrap(&self) -> Result<BootstrapResponse, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_bootstrap(&workspace_id).await
    }

    pub async fn editor_bootstrap(&self) -> Result<BootstrapResponse, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_editor_bootstrap(&workspace_id).await
    }

    pub async fn load_working_snapshot(&self) -> Result<WorkingSnapshot, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_load_working_snapshot(&workspace_id).await
    }

    pub async fn published_state(&self) -> Result<PublishedStateRecord, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_published_state(&workspace_id).await
    }

    pub async fn published_scene_descriptor(
        &self,
    ) -> Result<Option<PublishedSceneDescriptor>, StoreError> {
        Ok(self.published_state().await?.published_scene)
    }

    pub async fn promote_working_snapshot(
        &self,
        snapshot: &WorkingSnapshot,
        published_scene: Option<PublishedSceneDescriptor>,
        compiler_source: &str,
    ) -> Result<PublishedStateRecord, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_promote_working_snapshot(
            &workspace_id,
            snapshot,
            published_scene,
            compiler_source,
        )
        .await
    }

    pub async fn record_publish_failure(
        &self,
        scene_version: u64,
        error_message: &str,
    ) -> Result<(), StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_record_publish_failure(&workspace_id, scene_version, error_message)
            .await
    }

    pub async fn try_begin_publish(
        &self,
        publish_token: &str,
        started_at: u64,
        stale_after: u64,
    ) -> Result<bool, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_try_begin_publish(&workspace_id, publish_token, started_at, stale_after)
            .await
    }

    pub async fn refresh_publish_heartbeat(
        &self,
        publish_token: &str,
        heartbeat_at: u64,
    ) -> Result<bool, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_refresh_publish_heartbeat(&workspace_id, publish_token, heartbeat_at)
            .await
    }

    pub async fn get_scene(&self) -> Result<SceneResponse, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_get_scene(&workspace_id).await
    }

    pub async fn update_scene(&self, config: SceneConfig) -> Result<SceneResponse, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_update_scene(&workspace_id, config).await
    }

    pub async fn save_editor_changes(
        &self,
        request: EditorSaveRequest,
    ) -> Result<EditorSaveResponse, StoreError> {
        let workspace_id = self.get_homepage_workspace().await?.id;
        self.workspace_save_editor_changes(&workspace_id, request).await
    }

    pub async fn list_entities(&self) -> Result<Vec<Entity>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let snapshot = store.read().await;
                let mut entities: Vec<Entity> = snapshot.entities.values().cloned().collect();
                sort_entities(&mut entities);
                Ok(entities)
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT entity_data FROM entities ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut entities: Vec<Entity> = rows
                    .into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("entity_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_entities(&mut entities);
                Ok(entities)
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT entity_data FROM entities ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut entities: Vec<Entity> = rows
                    .into_iter()
                    .map(|row| {
                        let value: String = row.get("entity_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_entities(&mut entities);
                Ok(entities)
            }
        }
    }

    pub async fn get_entity(&self, id: &str) -> Result<Option<Entity>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.entities.get(id).cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT entity_data FROM entities WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("entity_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT entity_data FROM entities WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: String = row.get("entity_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn create_entity(&self, mut entity: Entity) -> Result<Entity, StoreError> {
        let now = now_millis();
        ensure_entity_create_defaults(&mut entity, now);

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                normalize_dynamic_entity_registry_refs_memory(&mut entity, &snapshot.entity_archetypes)?;
                if snapshot.entities.contains_key(entity.id()) {
                    return Err(StoreError::Validation(format!(
                        "entity {} already exists",
                        entity.id()
                    )));
                }
                snapshot
                    .entities
                    .insert(entity.id().to_string(), entity.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity.create",
                    "resourceId": entity.id(),
                    "actor": "system",
                    "timestamp": now
                }));
                snapshot.published_scene_version = snapshot.scene_version;
                snapshot.published_entities = snapshot.entities.values().cloned().collect();
                sort_entities(&mut snapshot.published_entities);
                snapshot.published_updated_at = now;
                Ok(entity)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                normalize_dynamic_entity_registry_refs_postgres(&mut tx, &mut entity).await?;
                persist_entity(&mut tx, &entity, false).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                sync_live_entity_roster_postgres(&mut tx, now).await?;
                insert_audit_event(
                    &mut tx,
                    "entity.create",
                    "entity",
                    entity.id(),
                    serde_json::to_value(&entity)?,
                )
                .await?;
                tx.commit().await?;
                Ok(entity)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                normalize_dynamic_entity_registry_refs_sqlite(&mut tx, &mut entity).await?;
                persist_entity_sqlite(&mut tx, &entity, false).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                sync_live_entity_roster_sqlite(&mut tx, now).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity.create",
                    "entity",
                    entity.id(),
                    serde_json::to_value(&entity)?,
                )
                .await?;
                tx.commit().await?;
                Ok(entity)
            }
        }
    }

    pub async fn update_entity(&self, id: &str, mut entity: Entity) -> Result<Entity, StoreError> {
        set_entity_id(&mut entity, id);
        ensure_entity_update_defaults(&mut entity, now_millis());

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                normalize_dynamic_entity_registry_refs_memory(&mut entity, &snapshot.entity_archetypes)?;
                let Some(existing) = snapshot.entities.get(id) else {
                    return Err(StoreError::NotFound(format!("entity {id}")));
                };

                let created_at = existing.created_at();
                set_entity_created_at(&mut entity, created_at);
                snapshot.entities.insert(id.to_string(), entity.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity.update",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                snapshot.published_scene_version = snapshot.scene_version;
                snapshot.published_entities = snapshot.entities.values().cloned().collect();
                sort_entities(&mut snapshot.published_entities);
                snapshot.published_updated_at = now_millis();
                Ok(entity)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                normalize_dynamic_entity_registry_refs_postgres(&mut tx, &mut entity).await?;
                let existing_row = sqlx::query(r#"SELECT entity_data FROM entities WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;

                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity {id}")));
                };

                let existing: Entity = serde_json::from_value(existing_row.get("entity_data"))?;
                set_entity_created_at(&mut entity, existing.created_at());
                persist_entity(&mut tx, &entity, true).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                sync_live_entity_roster_postgres(&mut tx, now_millis()).await?;
                insert_audit_event(
                    &mut tx,
                    "entity.update",
                    "entity",
                    id,
                    serde_json::to_value(&entity)?,
                )
                .await?;
                tx.commit().await?;
                Ok(entity)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                normalize_dynamic_entity_registry_refs_sqlite(&mut tx, &mut entity).await?;
                let existing_row = sqlx::query(r#"SELECT entity_data FROM entities WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;

                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity {id}")));
                };

                let existing: Entity =
                    serde_json::from_str(existing_row.get::<String, _>("entity_data").as_str())?;
                set_entity_created_at(&mut entity, existing.created_at());
                persist_entity_sqlite(&mut tx, &entity, true).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                sync_live_entity_roster_sqlite(&mut tx, now_millis()).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity.update",
                    "entity",
                    id,
                    serde_json::to_value(&entity)?,
                )
                .await?;
                tx.commit().await?;
                Ok(entity)
            }
        }
    }

    pub async fn delete_entity(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.entities.remove(id).is_none() {
                    return Ok(false);
                }
                snapshot.bindings.remove(id);
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity.delete",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                snapshot.published_scene_version = snapshot.scene_version;
                snapshot.published_entities = snapshot.entities.values().cloned().collect();
                sort_entities(&mut snapshot.published_entities);
                snapshot.published_updated_at = now_millis();
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM entity_bindings WHERE entity_id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM entities WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_tx(&mut tx).await?;
                sync_live_entity_roster_postgres(&mut tx, now_millis()).await?;
                insert_audit_event(
                    &mut tx,
                    "entity.delete",
                    "entity",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM entity_bindings WHERE entity_id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM entities WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_sqlite(&mut tx).await?;
                sync_live_entity_roster_sqlite(&mut tx, now_millis()).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity.delete",
                    "entity",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_static_assets(&self) -> Result<Vec<StaticAssetInstance>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let snapshot = store.read().await;
                let mut static_assets: Vec<StaticAssetInstance> =
                    snapshot.static_assets.values().cloned().collect();
                sort_static_assets(&mut static_assets);
                Ok(static_assets)
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT asset_data FROM static_assets ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut static_assets: Vec<StaticAssetInstance> = rows
                    .into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("asset_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_static_assets(&mut static_assets);
                Ok(static_assets)
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT asset_data FROM static_assets ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut static_assets: Vec<StaticAssetInstance> = rows
                    .into_iter()
                    .map(|row| {
                        let value: String = row.get("asset_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_static_assets(&mut static_assets);
                Ok(static_assets)
            }
        }
    }

    pub async fn get_static_asset(
        &self,
        id: &str,
    ) -> Result<Option<StaticAssetInstance>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.static_assets.get(id).cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT asset_data FROM static_assets WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("asset_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT asset_data FROM static_assets WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: String = row.get("asset_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn create_static_asset(
        &self,
        mut asset: StaticAssetInstance,
    ) -> Result<StaticAssetInstance, StoreError> {
        let now = now_millis();
        ensure_static_asset_create_defaults(&mut asset, now);

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.static_assets.contains_key(&asset.id) {
                    return Err(StoreError::Validation(format!(
                        "static asset {} already exists",
                        asset.id
                    )));
                }
                snapshot
                    .static_assets
                    .insert(asset.id.clone(), asset.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "static_asset.create",
                    "resourceType": "static_asset",
                    "resourceId": asset.id.clone(),
                    "actor": "system",
                    "timestamp": now
                }));
                Ok(asset)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                persist_static_asset(&mut tx, &asset, false).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "static_asset.create",
                    "static_asset",
                    &asset.id,
                    serde_json::to_value(&asset)?,
                )
                .await?;
                tx.commit().await?;
                Ok(asset)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                persist_static_asset_sqlite(&mut tx, &asset, false).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "static_asset.create",
                    "static_asset",
                    &asset.id,
                    serde_json::to_value(&asset)?,
                )
                .await?;
                tx.commit().await?;
                Ok(asset)
            }
        }
    }

    pub async fn update_static_asset(
        &self,
        id: &str,
        mut asset: StaticAssetInstance,
    ) -> Result<StaticAssetInstance, StoreError> {
        asset.id = id.to_string();
        ensure_static_asset_update_defaults(&mut asset, now_millis());

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.static_assets.get(id) else {
                    return Err(StoreError::NotFound(format!("static asset {id}")));
                };

                asset.created_at = existing.created_at;
                snapshot.static_assets.insert(id.to_string(), asset.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "static_asset.update",
                    "resourceType": "static_asset",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(asset)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT asset_data FROM static_assets WHERE id = $1"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;

                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("static asset {id}")));
                };

                let existing: StaticAssetInstance =
                    serde_json::from_value(existing_row.get("asset_data"))?;
                asset.created_at = existing.created_at;
                persist_static_asset(&mut tx, &asset, true).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "static_asset.update",
                    "static_asset",
                    id,
                    serde_json::to_value(&asset)?,
                )
                .await?;
                tx.commit().await?;
                Ok(asset)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT asset_data FROM static_assets WHERE id = ?"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;

                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("static asset {id}")));
                };

                let existing: StaticAssetInstance =
                    serde_json::from_str(existing_row.get::<String, _>("asset_data").as_str())?;
                asset.created_at = existing.created_at;
                persist_static_asset_sqlite(&mut tx, &asset, true).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "static_asset.update",
                    "static_asset",
                    id,
                    serde_json::to_value(&asset)?,
                )
                .await?;
                tx.commit().await?;
                Ok(asset)
            }
        }
    }

    pub async fn delete_static_asset(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.static_assets.remove(id).is_none() {
                    return Ok(false);
                }
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "static_asset.delete",
                    "resourceType": "static_asset",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let deleted = sqlx::query(r#"DELETE FROM static_assets WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "static_asset.delete",
                    "static_asset",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let deleted = sqlx::query(r#"DELETE FROM static_assets WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "static_asset.delete",
                    "static_asset",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_connectors(&self) -> Result<Vec<DataConnector>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                Ok(store.read().await.connectors.values().cloned().collect())
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT connector_data FROM data_connectors ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("connector_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect()
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT connector_data FROM data_connectors ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: String = row.get("connector_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect()
            }
        }
    }

    pub async fn create_connector(
        &self,
        mut connector: DataConnector,
    ) -> Result<DataConnector, StoreError> {
        let now = now_millis();
        if connector.id.trim().is_empty() {
            connector.id = Uuid::new_v4().to_string();
        }
        connector.created_at = now;
        connector.updated_at = now;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.connectors.contains_key(&connector.id) {
                    return Err(StoreError::Validation(format!(
                        "connector {} already exists",
                        connector.id
                    )));
                }
                snapshot
                    .connectors
                    .insert(connector.id.clone(), connector.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "connector.create",
                    "resourceId": connector.id,
                    "timestamp": now,
                    "actor": "system"
                }));
                Ok(connector)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(
                    r#"
                    INSERT INTO data_connectors (id, enabled, connector_data, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5)
                    "#,
                )
                .bind(&connector.id)
                .bind(connector.enabled)
                .bind(serde_json::to_value(&connector)?)
                .bind(connector.created_at as i64)
                .bind(connector.updated_at as i64)
                .execute(&mut *tx)
                .await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "connector.create",
                    "connector",
                    &connector.id,
                    serde_json::to_value(&connector)?,
                )
                .await?;
                tx.commit().await?;
                Ok(connector)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(
                    r#"
                    INSERT INTO data_connectors (id, enabled, connector_data, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&connector.id)
                .bind(connector.enabled)
                .bind(serde_json::to_string(&connector)?)
                .bind(connector.created_at as i64)
                .bind(connector.updated_at as i64)
                .execute(&mut *tx)
                .await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "connector.create",
                    "connector",
                    &connector.id,
                    serde_json::to_value(&connector)?,
                )
                .await?;
                tx.commit().await?;
                Ok(connector)
            }
        }
    }

    pub async fn update_connector(
        &self,
        id: &str,
        mut connector: DataConnector,
    ) -> Result<DataConnector, StoreError> {
        connector.id = id.to_string();
        connector.updated_at = now_millis();

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.connectors.get(id) else {
                    return Err(StoreError::NotFound(format!("connector {id}")));
                };
                connector.created_at = existing.created_at;
                snapshot
                    .connectors
                    .insert(id.to_string(), connector.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "connector.update",
                    "resourceId": id,
                    "timestamp": now_millis(),
                    "actor": "system"
                }));
                Ok(connector)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing =
                    sqlx::query(r#"SELECT connector_data FROM data_connectors WHERE id = $1"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;

                let Some(existing) = existing else {
                    return Err(StoreError::NotFound(format!("connector {id}")));
                };
                let previous: DataConnector =
                    serde_json::from_value(existing.get("connector_data"))?;
                connector.created_at = previous.created_at;
                sqlx::query(
                    r#"
                    UPDATE data_connectors
                    SET enabled = $1, connector_data = $2, updated_at = $3
                    WHERE id = $4
                    "#,
                )
                .bind(connector.enabled)
                .bind(serde_json::to_value(&connector)?)
                .bind(connector.updated_at as i64)
                .bind(id)
                .execute(&mut *tx)
                .await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "connector.update",
                    "connector",
                    id,
                    serde_json::to_value(&connector)?,
                )
                .await?;
                tx.commit().await?;
                Ok(connector)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing =
                    sqlx::query(r#"SELECT connector_data FROM data_connectors WHERE id = ?"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;

                let Some(existing) = existing else {
                    return Err(StoreError::NotFound(format!("connector {id}")));
                };
                let previous: DataConnector =
                    serde_json::from_str(existing.get::<String, _>("connector_data").as_str())?;
                connector.created_at = previous.created_at;
                sqlx::query(
                    r#"
                    UPDATE data_connectors
                    SET enabled = ?, connector_data = ?, updated_at = ?
                    WHERE id = ?
                    "#,
                )
                .bind(connector.enabled)
                .bind(serde_json::to_string(&connector)?)
                .bind(connector.updated_at as i64)
                .bind(id)
                .execute(&mut *tx)
                .await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "connector.update",
                    "connector",
                    id,
                    serde_json::to_value(&connector)?,
                )
                .await?;
                tx.commit().await?;
                Ok(connector)
            }
        }
    }

    pub async fn delete_connector(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.connectors.remove(id).is_none() {
                    return Ok(false);
                }

                for bindings in snapshot.bindings.values_mut() {
                    bindings.retain(|binding| binding.connector_id != id);
                }

                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "connector.delete",
                    "resourceId": id,
                    "timestamp": now_millis(),
                    "actor": "system"
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM entity_bindings WHERE connector_id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM data_connectors WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "connector.delete",
                    "connector",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM entity_bindings WHERE connector_id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM data_connectors WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "connector.delete",
                    "connector",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_bindings_by_entity(
        &self,
        entity_id: &str,
    ) -> Result<Vec<EntityBinding>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store
                .read()
                .await
                .bindings
                .get(entity_id)
                .cloned()
                .unwrap_or_default()),
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"
                    SELECT binding_data FROM entity_bindings
                    WHERE entity_id = $1
                    ORDER BY created_at ASC, binding_id ASC
                    "#,
                )
                .bind(entity_id)
                .fetch_all(&store.pool)
                .await?;

                rows.into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("binding_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect()
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"
                    SELECT binding_data FROM entity_bindings
                    WHERE entity_id = ?
                    ORDER BY created_at ASC, binding_id ASC
                    "#,
                )
                .bind(entity_id)
                .fetch_all(&store.pool)
                .await?;

                rows.into_iter()
                    .map(|row| {
                        let value: String = row.get("binding_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect()
            }
        }
    }

    pub async fn replace_entity_bindings(
        &self,
        entity_id: &str,
        mut bindings: Vec<EntityBinding>,
    ) -> Result<Vec<EntityBinding>, StoreError> {
        let now = now_millis();

        let mut seen_connector_ids = HashSet::new();
        for binding in &bindings {
            if !seen_connector_ids.insert(binding.connector_id.clone()) {
                return Err(StoreError::Validation(format!(
                    "duplicate connector {} in bindings",
                    binding.connector_id
                )));
            }
        }

        for binding in &mut bindings {
            binding.entity_id = entity_id.to_string();
            if binding.binding_id.trim().is_empty() {
                binding.binding_id = Uuid::new_v4().to_string();
            }
            binding.created_at = now;
            binding.updated_at = now;
        }

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if !snapshot.entities.contains_key(entity_id) {
                    return Err(StoreError::NotFound(format!("entity {entity_id}")));
                }

                for binding in &bindings {
                    if !snapshot.connectors.contains_key(&binding.connector_id) {
                        return Err(StoreError::Validation(format!(
                            "connector {} does not exist",
                            binding.connector_id
                        )));
                    }
                }

                snapshot
                    .bindings
                    .insert(entity_id.to_string(), bindings.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "binding.replace",
                    "resourceId": entity_id,
                    "timestamp": now,
                    "actor": "system"
                }));
                Ok(bindings)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;

                let exists =
                    sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM entities WHERE id = $1"#)
                        .bind(entity_id)
                        .fetch_one(&mut *tx)
                        .await?;
                if exists == 0 {
                    return Err(StoreError::NotFound(format!("entity {entity_id}")));
                }

                for binding in &bindings {
                    let connector_exists = sqlx::query_scalar::<_, i64>(
                        r#"SELECT COUNT(*) FROM data_connectors WHERE id = $1"#,
                    )
                    .bind(&binding.connector_id)
                    .fetch_one(&mut *tx)
                    .await?;
                    if connector_exists == 0 {
                        return Err(StoreError::Validation(format!(
                            "connector {} does not exist",
                            binding.connector_id
                        )));
                    }
                }

                sqlx::query(r#"DELETE FROM entity_bindings WHERE entity_id = $1"#)
                    .bind(entity_id)
                    .execute(&mut *tx)
                    .await?;

                for binding in &bindings {
                    sqlx::query(
                        r#"
                        INSERT INTO entity_bindings (
                            binding_id, entity_id, connector_id, source_path, mapping, enabled, binding_data, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        "#,
                    )
                    .bind(&binding.binding_id)
                    .bind(&binding.entity_id)
                    .bind(&binding.connector_id)
                    .bind(&binding.source_path)
                    .bind(binding.mapping.clone())
                    .bind(binding.enabled)
                    .bind(serde_json::to_value(binding)?)
                    .bind(binding.created_at as i64)
                    .bind(binding.updated_at as i64)
                    .execute(&mut *tx)
                    .await?;
                }

                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "binding.replace",
                    "binding",
                    entity_id,
                    serde_json::to_value(&bindings)?,
                )
                .await?;
                tx.commit().await?;
                Ok(bindings)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;

                let exists =
                    sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM entities WHERE id = ?"#)
                        .bind(entity_id)
                        .fetch_one(&mut *tx)
                        .await?;
                if exists == 0 {
                    return Err(StoreError::NotFound(format!("entity {entity_id}")));
                }

                for binding in &bindings {
                    let connector_exists = sqlx::query_scalar::<_, i64>(
                        r#"SELECT COUNT(*) FROM data_connectors WHERE id = ?"#,
                    )
                    .bind(&binding.connector_id)
                    .fetch_one(&mut *tx)
                    .await?;
                    if connector_exists == 0 {
                        return Err(StoreError::Validation(format!(
                            "connector {} does not exist",
                            binding.connector_id
                        )));
                    }
                }

                sqlx::query(r#"DELETE FROM entity_bindings WHERE entity_id = ?"#)
                    .bind(entity_id)
                    .execute(&mut *tx)
                    .await?;

                for binding in &bindings {
                    sqlx::query(
                        r#"
                        INSERT INTO entity_bindings (
                            binding_id, entity_id, connector_id, source_path, mapping, enabled, binding_data, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        "#,
                    )
                    .bind(&binding.binding_id)
                    .bind(&binding.entity_id)
                    .bind(&binding.connector_id)
                    .bind(&binding.source_path)
                    .bind(serde_json::to_string(&binding.mapping)?)
                    .bind(binding.enabled)
                    .bind(serde_json::to_string(binding)?)
                    .bind(binding.created_at as i64)
                    .bind(binding.updated_at as i64)
                    .execute(&mut *tx)
                    .await?;
                }

                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "binding.replace",
                    "binding",
                    entity_id,
                    serde_json::to_value(&bindings)?,
                )
                .await?;
                tx.commit().await?;
                Ok(bindings)
            }
        }
    }

    pub async fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let snapshot = store.read().await;
                let mut workspaces: Vec<WorkspaceRecord> =
                    snapshot.workspaces.values().cloned().collect();
                sort_workspaces(&mut workspaces);
                Ok(workspaces)
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT workspace_data FROM workspaces ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut workspaces: Vec<WorkspaceRecord> = rows
                    .into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("workspace_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_workspaces(&mut workspaces);
                Ok(workspaces)
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT workspace_data FROM workspaces ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut workspaces: Vec<WorkspaceRecord> = rows
                    .into_iter()
                    .map(|row| {
                        let value: String = row.get("workspace_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_workspaces(&mut workspaces);
                Ok(workspaces)
            }
        }
    }

    pub async fn get_workspace(&self, id: &str) -> Result<Option<WorkspaceRecord>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.workspaces.get(id).cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("workspace_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: String = row.get("workspace_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn get_homepage_workspace(&self) -> Result<WorkspaceRecord, StoreError> {
        let workspaces = self.list_workspaces().await?;
        workspaces
            .iter()
            .find(|workspace| workspace.is_homepage)
            .cloned()
            .or_else(|| workspaces.into_iter().next())
            .ok_or_else(|| StoreError::NotFound("homepage workspace".to_string()))
    }

    pub async fn create_workspace(
        &self,
        mut workspace: WorkspaceRecord,
    ) -> Result<WorkspaceRecord, StoreError> {
        let now = now_millis();
        ensure_workspace_create_defaults(&mut workspace, now);
        validate_workspace(&workspace)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.workspaces.contains_key(&workspace.id) {
                    return Err(StoreError::Validation(format!(
                        "workspace {} already exists",
                        workspace.id
                    )));
                }
                if snapshot
                    .workspaces
                    .values()
                    .any(|existing| existing.slug == workspace.slug)
                {
                    return Err(StoreError::Validation(format!(
                        "workspace slug {} already exists",
                        workspace.slug
                    )));
                }
                if workspace.is_homepage {
                    for entry in snapshot.workspaces.values_mut() {
                        entry.is_homepage = false;
                    }
                }
                let workspace_state = create_seed_workspace_state(&workspace);
                snapshot
                    .workspaces
                    .insert(workspace.id.clone(), workspace.clone());
                snapshot
                    .workspace_states
                    .insert(workspace.id.clone(), workspace_state);
                snapshot.audit_events.push(serde_json::json!({
                    "action": "workspace.create",
                    "resourceId": workspace.id.clone(),
                    "actor": "system",
                    "timestamp": now
                }));
                Ok(workspace)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM workspaces WHERE id = $1 OR slug = $2"#,
                )
                .bind(&workspace.id)
                .bind(&workspace.slug)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "workspace {} or slug {} already exists",
                        workspace.id, workspace.slug
                    )));
                }
                if workspace.is_homepage {
                    sqlx::query(r#"UPDATE workspaces SET is_homepage = false, workspace_data = jsonb_set(workspace_data, '{isHomepage}', 'false'::jsonb)"#)
                        .execute(&mut *tx)
                        .await?;
                }
                persist_workspace(&mut tx, &workspace, false).await?;
                persist_workspace_state_postgres(
                    &mut tx,
                    &workspace.id,
                    &create_seed_workspace_state(&workspace),
                )
                .await?;
                insert_audit_event(
                    &mut tx,
                    "workspace.create",
                    "workspace",
                    &workspace.id,
                    serde_json::to_value(&workspace)?,
                )
                .await?;
                tx.commit().await?;
                Ok(workspace)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM workspaces WHERE id = ? OR slug = ?"#,
                )
                .bind(&workspace.id)
                .bind(&workspace.slug)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "workspace {} or slug {} already exists",
                        workspace.id, workspace.slug
                    )));
                }
                if workspace.is_homepage {
                    let rows = sqlx::query(r#"SELECT id, workspace_data FROM workspaces"#)
                        .fetch_all(&mut *tx)
                        .await?;
                    for row in rows {
                        let value: String = row.get("workspace_data");
                        let mut current: WorkspaceRecord = serde_json::from_str(&value)?;
                        current.is_homepage = false;
                        persist_workspace_sqlite(&mut tx, &current, true).await?;
                    }
                }
                persist_workspace_sqlite(&mut tx, &workspace, false).await?;
                persist_workspace_state_sqlite(
                    &mut tx,
                    &workspace.id,
                    &create_seed_workspace_state(&workspace),
                )
                .await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "workspace.create",
                    "workspace",
                    &workspace.id,
                    serde_json::to_value(&workspace)?,
                )
                .await?;
                tx.commit().await?;
                Ok(workspace)
            }
        }
    }

    pub async fn update_workspace(
        &self,
        id: &str,
        mut workspace: WorkspaceRecord,
    ) -> Result<WorkspaceRecord, StoreError> {
        workspace.id = id.to_string();
        ensure_workspace_update_defaults(&mut workspace, now_millis());
        validate_workspace(&workspace)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.workspaces.get(id) else {
                    return Err(StoreError::NotFound(format!("workspace {id}")));
                };
                if snapshot
                    .workspaces
                    .values()
                    .any(|entry| entry.id != id && entry.slug == workspace.slug)
                {
                    return Err(StoreError::Validation(format!(
                        "workspace slug {} already exists",
                        workspace.slug
                    )));
                }
                workspace.created_at = existing.created_at;
                if workspace.is_homepage {
                    for entry in snapshot.workspaces.values_mut() {
                        entry.is_homepage = false;
                    }
                }
                snapshot.workspaces.insert(id.to_string(), workspace.clone());
                snapshot.audit_events.push(serde_json::json!({
                    "action": "workspace.update",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(workspace)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("workspace {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM workspaces WHERE slug = $1 AND id <> $2"#,
                )
                .bind(&workspace.slug)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "workspace slug {} already exists",
                        workspace.slug
                    )));
                }
                let existing: WorkspaceRecord =
                    serde_json::from_value(existing_row.get("workspace_data"))?;
                workspace.created_at = existing.created_at;
                if workspace.is_homepage {
                    sqlx::query(r#"UPDATE workspaces SET is_homepage = false, workspace_data = jsonb_set(workspace_data, '{isHomepage}', 'false'::jsonb)"#)
                        .execute(&mut *tx)
                        .await?;
                }
                persist_workspace(&mut tx, &workspace, true).await?;
                insert_audit_event(
                    &mut tx,
                    "workspace.update",
                    "workspace",
                    id,
                    serde_json::to_value(&workspace)?,
                )
                .await?;
                tx.commit().await?;
                Ok(workspace)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("workspace {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM workspaces WHERE slug = ? AND id <> ?"#,
                )
                .bind(&workspace.slug)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "workspace slug {} already exists",
                        workspace.slug
                    )));
                }
                let existing: WorkspaceRecord =
                    serde_json::from_str(existing_row.get::<String, _>("workspace_data").as_str())?;
                workspace.created_at = existing.created_at;
                if workspace.is_homepage {
                    let rows = sqlx::query(r#"SELECT id, workspace_data FROM workspaces"#)
                        .fetch_all(&mut *tx)
                        .await?;
                    for row in rows {
                        let value: String = row.get("workspace_data");
                        let mut current: WorkspaceRecord = serde_json::from_str(&value)?;
                        current.is_homepage = false;
                        persist_workspace_sqlite(&mut tx, &current, true).await?;
                    }
                }
                persist_workspace_sqlite(&mut tx, &workspace, true).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "workspace.update",
                    "workspace",
                    id,
                    serde_json::to_value(&workspace)?,
                )
                .await?;
                tx.commit().await?;
                Ok(workspace)
            }
        }
    }

    pub async fn delete_workspace(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.workspaces.len() <= 1 {
                    return Err(StoreError::Conflict(
                        "cannot delete the last workspace".to_string(),
                    ));
                }
                let removed = snapshot.workspaces.remove(id);
                let Some(removed) = removed else {
                    return Ok(false);
                };
                snapshot.workspace_states.remove(id);
                if removed.is_homepage {
                    if let Some((_, next)) = snapshot.workspaces.iter_mut().next() {
                        next.is_homepage = true;
                    }
                }
                snapshot.audit_events.push(serde_json::json!({
                    "action": "workspace.delete",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let count = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM workspaces"#)
                    .fetch_one(&mut *tx)
                    .await?;
                if count <= 1 {
                    return Err(StoreError::Conflict(
                        "cannot delete the last workspace".to_string(),
                    ));
                }
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;
                let Some(row) = row else {
                    tx.rollback().await?;
                    return Ok(false);
                };
                let removed: WorkspaceRecord = serde_json::from_value(row.get("workspace_data"))?;
                let deleted = sqlx::query(r#"DELETE FROM workspaces WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                sqlx::query(r#"DELETE FROM workspace_states WHERE workspace_id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                if removed.is_homepage {
                    let promote_row = sqlx::query(r#"SELECT workspace_data FROM workspaces ORDER BY created_at ASC, id ASC LIMIT 1"#)
                        .fetch_optional(&mut *tx)
                        .await?;
                    if let Some(promote_row) = promote_row {
                        let mut workspace: WorkspaceRecord = serde_json::from_value(promote_row.get("workspace_data"))?;
                        workspace.is_homepage = true;
                        persist_workspace(&mut tx, &workspace, true).await?;
                    }
                }
                insert_audit_event(
                    &mut tx,
                    "workspace.delete",
                    "workspace",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let count = sqlx::query_scalar::<_, i64>(r#"SELECT COUNT(*) FROM workspaces"#)
                    .fetch_one(&mut *tx)
                    .await?;
                if count <= 1 {
                    return Err(StoreError::Conflict(
                        "cannot delete the last workspace".to_string(),
                    ));
                }
                let row = sqlx::query(r#"SELECT workspace_data FROM workspaces WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;
                let Some(row) = row else {
                    tx.rollback().await?;
                    return Ok(false);
                };
                let removed: WorkspaceRecord =
                    serde_json::from_str(row.get::<String, _>("workspace_data").as_str())?;
                let deleted = sqlx::query(r#"DELETE FROM workspaces WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                sqlx::query(r#"DELETE FROM workspace_states WHERE workspace_id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                if removed.is_homepage {
                    let promote_row = sqlx::query(r#"SELECT workspace_data FROM workspaces ORDER BY created_at ASC, id ASC LIMIT 1"#)
                        .fetch_optional(&mut *tx)
                        .await?;
                    if let Some(promote_row) = promote_row {
                        let value: String = promote_row.get("workspace_data");
                        let mut workspace: WorkspaceRecord = serde_json::from_str(&value)?;
                        workspace.is_homepage = true;
                        persist_workspace_sqlite(&mut tx, &workspace, true).await?;
                    }
                }
                insert_audit_event_sqlite(
                    &mut tx,
                    "workspace.delete",
                    "workspace",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_entity_categories(&self) -> Result<Vec<EntityCategory>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let snapshot = store.read().await;
                let mut categories: Vec<EntityCategory> =
                    snapshot.entity_categories.values().cloned().collect();
                sort_entity_categories(&mut categories);
                Ok(categories)
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT category_data FROM entity_categories ORDER BY sort_order ASC, created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut categories: Vec<EntityCategory> = rows
                    .into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("category_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_entity_categories(&mut categories);
                Ok(categories)
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT category_data FROM entity_categories ORDER BY sort_order ASC, created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;

                let mut categories: Vec<EntityCategory> = rows
                    .into_iter()
                    .map(|row| {
                        let value: String = row.get("category_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                sort_entity_categories(&mut categories);
                Ok(categories)
            }
        }
    }

    pub async fn get_entity_category(
        &self,
        id: &str,
    ) -> Result<Option<EntityCategory>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.entity_categories.get(id).cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT category_data FROM entity_categories WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("category_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT category_data FROM entity_categories WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;

                match row {
                    Some(row) => {
                        let value: String = row.get("category_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn create_entity_category(
        &self,
        mut category: EntityCategory,
    ) -> Result<EntityCategory, StoreError> {
        let now = now_millis();
        ensure_entity_category_create_defaults(&mut category, now);
        validate_entity_category(&category)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.entity_categories.contains_key(&category.id) {
                    return Err(StoreError::Validation(format!(
                        "entity category {} already exists",
                        category.id
                    )));
                }
                if snapshot
                    .entity_categories
                    .values()
                    .any(|existing| existing.key == category.key)
                {
                    return Err(StoreError::Validation(format!(
                        "entity category key {} already exists",
                        category.key
                    )));
                }

                snapshot
                    .entity_categories
                    .insert(category.id.clone(), category.clone());
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_category.create",
                    "resourceId": category.id.clone(),
                    "actor": "system",
                    "timestamp": now
                }));
                Ok(category)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_categories WHERE id = $1 OR category_key = $2"#,
                )
                .bind(&category.id)
                .bind(&category.key)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity category {} or key {} already exists",
                        category.id, category.key
                    )));
                }

                persist_entity_category(&mut tx, &category, false).await?;
                insert_audit_event(
                    &mut tx,
                    "entity_category.create",
                    "entity_category",
                    &category.id,
                    serde_json::to_value(&category)?,
                )
                .await?;
                tx.commit().await?;
                Ok(category)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_categories WHERE id = ? OR category_key = ?"#,
                )
                .bind(&category.id)
                .bind(&category.key)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity category {} or key {} already exists",
                        category.id, category.key
                    )));
                }

                persist_entity_category_sqlite(&mut tx, &category, false).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_category.create",
                    "entity_category",
                    &category.id,
                    serde_json::to_value(&category)?,
                )
                .await?;
                tx.commit().await?;
                Ok(category)
            }
        }
    }

    pub async fn update_entity_category(
        &self,
        id: &str,
        mut category: EntityCategory,
    ) -> Result<EntityCategory, StoreError> {
        category.id = id.to_string();
        ensure_entity_category_update_defaults(&mut category, now_millis());
        validate_entity_category(&category)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.entity_categories.get(id) else {
                    return Err(StoreError::NotFound(format!("entity category {id}")));
                };
                if snapshot
                    .entity_categories
                    .values()
                    .any(|entry| entry.id != id && entry.key == category.key)
                {
                    return Err(StoreError::Validation(format!(
                        "entity category key {} already exists",
                        category.key
                    )));
                }

                category.created_at = existing.created_at;
                snapshot
                    .entity_categories
                    .insert(id.to_string(), category.clone());
                cascade_category_key_update_memory(&mut snapshot, id, &category.key);
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_category.update",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(category)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT category_data FROM entity_categories WHERE id = $1"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity category {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_categories WHERE category_key = $1 AND id <> $2"#,
                )
                .bind(&category.key)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity category key {} already exists",
                        category.key
                    )));
                }

                let existing: EntityCategory =
                    serde_json::from_value(existing_row.get("category_data"))?;
                category.created_at = existing.created_at;
                persist_entity_category(&mut tx, &category, true).await?;
                cascade_category_key_update_postgres(&mut tx, id, &category.key).await?;
                sync_live_entity_roster_postgres(&mut tx, now_millis()).await?;
                insert_audit_event(
                    &mut tx,
                    "entity_category.update",
                    "entity_category",
                    id,
                    serde_json::to_value(&category)?,
                )
                .await?;
                tx.commit().await?;
                Ok(category)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT category_data FROM entity_categories WHERE id = ?"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity category {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_categories WHERE category_key = ? AND id <> ?"#,
                )
                .bind(&category.key)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity category key {} already exists",
                        category.key
                    )));
                }

                let existing: EntityCategory =
                    serde_json::from_str(existing_row.get::<String, _>("category_data").as_str())?;
                category.created_at = existing.created_at;
                persist_entity_category_sqlite(&mut tx, &category, true).await?;
                cascade_category_key_update_sqlite(&mut tx, id, &category.key).await?;
                sync_live_entity_roster_sqlite(&mut tx, now_millis()).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_category.update",
                    "entity_category",
                    id,
                    serde_json::to_value(&category)?,
                )
                .await?;
                tx.commit().await?;
                Ok(category)
            }
        }
    }

    pub async fn delete_entity_category(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot
                    .entity_archetypes
                    .values()
                    .any(|archetype| archetype.category_id == id)
                {
                    return Err(StoreError::Conflict(format!(
                        "entity category {id} still has archetypes"
                    )));
                }
                if snapshot.entity_categories.remove(id).is_none() {
                    return Ok(false);
                }
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_category.delete",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let archetype_count = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE category_id = $1"#,
                )
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if archetype_count > 0 {
                    return Err(StoreError::Conflict(format!(
                        "entity category {id} still has archetypes"
                    )));
                }
                let deleted = sqlx::query(r#"DELETE FROM entity_categories WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                insert_audit_event(
                    &mut tx,
                    "entity_category.delete",
                    "entity_category",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let archetype_count = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE category_id = ?"#,
                )
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if archetype_count > 0 {
                    return Err(StoreError::Conflict(format!(
                        "entity category {id} still has archetypes"
                    )));
                }
                let deleted = sqlx::query(r#"DELETE FROM entity_categories WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_category.delete",
                    "entity_category",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_entity_archetypes(&self) -> Result<Vec<EntityArchetype>, StoreError> {
        let categories = self.list_entity_categories().await?;
        let category_key_by_id: HashMap<String, String> = categories
            .into_iter()
            .map(|category| (category.id, category.key))
            .collect();

        let mut archetypes = match &self.backend {
            StoreBackend::Memory(store) => store
                .read()
                .await
                .entity_archetypes
                .values()
                .cloned()
                .collect::<Vec<_>>(),
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"SELECT archetype_data FROM entity_archetypes ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("archetype_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"SELECT archetype_data FROM entity_archetypes ORDER BY created_at ASC, id ASC"#,
                )
                .fetch_all(&store.pool)
                .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: String = row.get("archetype_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?
            }
        };

        for archetype in &mut archetypes {
            if let Some(category_key) = category_key_by_id.get(&archetype.category_id) {
                archetype.category_key = category_key.clone();
            }
        }
        sort_entity_archetypes(&mut archetypes);
        Ok(archetypes)
    }

    pub async fn get_entity_archetype(
        &self,
        id: &str,
    ) -> Result<Option<EntityArchetype>, StoreError> {
        let mut archetype = match &self.backend {
            StoreBackend::Memory(store) => store.read().await.entity_archetypes.get(id).cloned(),
            StoreBackend::Postgres(store) => {
                let row =
                    sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = $1"#)
                        .bind(id)
                        .fetch_optional(&store.pool)
                        .await?;
                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("archetype_data");
                        Some(serde_json::from_value(value)?)
                    }
                    None => None,
                }
            }
            StoreBackend::Sqlite(store) => {
                let row =
                    sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = ?"#)
                        .bind(id)
                        .fetch_optional(&store.pool)
                        .await?;
                match row {
                    Some(row) => {
                        let value: String = row.get("archetype_data");
                        Some(serde_json::from_str(&value)?)
                    }
                    None => None,
                }
            }
        };

        if let Some(current) = &mut archetype {
            if let Some(category) = self.get_entity_category(&current.category_id).await? {
                current.category_key = category.key;
            }
        }

        Ok(archetype)
    }

    pub async fn create_entity_archetype(
        &self,
        mut archetype: EntityArchetype,
    ) -> Result<EntityArchetype, StoreError> {
        let now = now_millis();
        ensure_entity_archetype_create_defaults(&mut archetype, now);

        let category = self
            .get_entity_category(&archetype.category_id)
            .await?
            .ok_or_else(|| {
                StoreError::Validation(format!(
                    "entity category {} not found",
                    archetype.category_id
                ))
            })?;
        archetype.category_key = category.key;
        validate_entity_archetype(&archetype)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.entity_archetypes.contains_key(&archetype.id) {
                    return Err(StoreError::Validation(format!(
                        "entity archetype {} already exists",
                        archetype.id
                    )));
                }
                if snapshot
                    .entity_archetypes
                    .values()
                    .any(|existing| existing.key == archetype.key)
                {
                    return Err(StoreError::Validation(format!(
                        "entity archetype key {} already exists",
                        archetype.key
                    )));
                }
                snapshot
                    .entity_archetypes
                    .insert(archetype.id.clone(), archetype.clone());
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_archetype.create",
                    "resourceId": archetype.id.clone(),
                    "actor": "system",
                    "timestamp": now
                }));
                Ok::<EntityArchetype, StoreError>(archetype)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE id = $1 OR archetype_key = $2"#,
                )
                .bind(&archetype.id)
                .bind(&archetype.key)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity archetype {} or key {} already exists",
                        archetype.id, archetype.key
                    )));
                }
                persist_entity_archetype(&mut tx, &archetype, false).await?;
                insert_audit_event(
                    &mut tx,
                    "entity_archetype.create",
                    "entity_archetype",
                    &archetype.id,
                    serde_json::to_value(&archetype)?,
                )
                .await?;
                tx.commit().await?;
                Ok::<EntityArchetype, StoreError>(archetype)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE id = ? OR archetype_key = ?"#,
                )
                .bind(&archetype.id)
                .bind(&archetype.key)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity archetype {} or key {} already exists",
                        archetype.id, archetype.key
                    )));
                }
                persist_entity_archetype_sqlite(&mut tx, &archetype, false).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_archetype.create",
                    "entity_archetype",
                    &archetype.id,
                    serde_json::to_value(&archetype)?,
                )
                .await?;
                tx.commit().await?;
                Ok::<EntityArchetype, StoreError>(archetype)
            }
        }
    }

    pub async fn update_entity_archetype(
        &self,
        id: &str,
        mut archetype: EntityArchetype,
    ) -> Result<EntityArchetype, StoreError> {
        archetype.id = id.to_string();
        ensure_entity_archetype_update_defaults(&mut archetype, now_millis());

        let category = self
            .get_entity_category(&archetype.category_id)
            .await?
            .ok_or_else(|| {
                StoreError::Validation(format!(
                    "entity category {} not found",
                    archetype.category_id
                ))
            })?;
        archetype.category_key = category.key;
        validate_entity_archetype(&archetype)?;

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.entity_archetypes.get(id) else {
                    return Err(StoreError::NotFound(format!("entity archetype {id}")));
                };
                if snapshot
                    .entity_archetypes
                    .values()
                    .any(|entry| entry.id != id && entry.key == archetype.key)
                {
                    return Err(StoreError::Validation(format!(
                        "entity archetype key {} already exists",
                        archetype.key
                    )));
                }
                archetype.created_at = existing.created_at;
                snapshot
                    .entity_archetypes
                    .insert(id.to_string(), archetype.clone());
                for entity in snapshot.entities.values_mut() {
                    rewrite_dynamic_entity_archetype_refs(
                        entity,
                        &archetype.id,
                        &archetype.key,
                        &archetype.category_key,
                        &archetype.display_name,
                    );
                }
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_archetype.update",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                snapshot.published_entities = snapshot.entities.values().cloned().collect();
                sort_entities(&mut snapshot.published_entities);
                snapshot.published_updated_at = now_millis();
                Ok::<EntityArchetype, StoreError>(archetype)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = $1"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity archetype {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE archetype_key = $1 AND id <> $2"#,
                )
                .bind(&archetype.key)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity archetype key {} already exists",
                        archetype.key
                    )));
                }
                let existing: EntityArchetype =
                    serde_json::from_value(existing_row.get("archetype_data"))?;
                archetype.created_at = existing.created_at;
                persist_entity_archetype(&mut tx, &archetype, true).await?;
                rewrite_dynamic_entity_archetype_refs_postgres(
                    &mut tx,
                    &archetype.id,
                    &archetype.key,
                    &archetype.category_key,
                    &archetype.display_name,
                )
                .await?;
                sync_live_entity_roster_postgres(&mut tx, now_millis()).await?;
                insert_audit_event(
                    &mut tx,
                    "entity_archetype.update",
                    "entity_archetype",
                    id,
                    serde_json::to_value(&archetype)?,
                )
                .await?;
                tx.commit().await?;
                Ok::<EntityArchetype, StoreError>(archetype)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing_row =
                    sqlx::query(r#"SELECT archetype_data FROM entity_archetypes WHERE id = ?"#)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;
                let Some(existing_row) = existing_row else {
                    return Err(StoreError::NotFound(format!("entity archetype {id}")));
                };
                let duplicate = sqlx::query_scalar::<_, i64>(
                    r#"SELECT COUNT(*) FROM entity_archetypes WHERE archetype_key = ? AND id <> ?"#,
                )
                .bind(&archetype.key)
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
                if duplicate > 0 {
                    return Err(StoreError::Validation(format!(
                        "entity archetype key {} already exists",
                        archetype.key
                    )));
                }
                let existing: EntityArchetype = serde_json::from_str(
                    existing_row.get::<String, _>("archetype_data").as_str(),
                )?;
                archetype.created_at = existing.created_at;
                persist_entity_archetype_sqlite(&mut tx, &archetype, true).await?;
                rewrite_dynamic_entity_archetype_refs_sqlite(
                    &mut tx,
                    &archetype.id,
                    &archetype.key,
                    &archetype.category_key,
                    &archetype.display_name,
                )
                .await?;
                sync_live_entity_roster_sqlite(&mut tx, now_millis()).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_archetype.update",
                    "entity_archetype",
                    id,
                    serde_json::to_value(&archetype)?,
                )
                .await?;
                tx.commit().await?;
                Ok::<EntityArchetype, StoreError>(archetype)
            }
        }
    }

    pub async fn delete_entity_archetype(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot
                    .entities
                    .values()
                    .any(|entity| matches!(entity, Entity::Dynamic(dynamic) if dynamic.archetype_id == id))
                {
                    return Err(StoreError::Conflict(format!(
                        "entity archetype {id} is still referenced by dynamic entities"
                    )));
                }
                if snapshot.entity_archetypes.remove(id).is_none() {
                    return Ok(false);
                }
                snapshot.audit_events.push(serde_json::json!({
                    "action": "entity_archetype.delete",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing = sqlx::query_scalar::<_, String>(
                    r#"SELECT id FROM entity_archetypes WHERE id = $1 FOR UPDATE"#,
                )
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
                if existing.is_none() {
                    tx.rollback().await?;
                    return Ok(false);
                }
                let in_use = count_dynamic_entity_refs_postgres(&mut tx, id).await?;
                if in_use > 0 {
                    tx.rollback().await?;
                    return Err(StoreError::Conflict(format!(
                        "entity archetype {id} is still referenced by dynamic entities"
                    )));
                }
                let deleted = sqlx::query(r#"DELETE FROM entity_archetypes WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                insert_audit_event(
                    &mut tx,
                    "entity_archetype.delete",
                    "entity_archetype",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing = sqlx::query_scalar::<_, String>(
                    r#"SELECT id FROM entity_archetypes WHERE id = ?"#,
                )
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
                if existing.is_none() {
                    tx.rollback().await?;
                    return Ok(false);
                }
                let in_use = count_dynamic_entity_refs_sqlite(&mut tx, id).await?;
                if in_use > 0 {
                    tx.rollback().await?;
                    return Err(StoreError::Conflict(format!(
                        "entity archetype {id} is still referenced by dynamic entities"
                    )));
                }
                let deleted = sqlx::query(r#"DELETE FROM entity_archetypes WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }
                insert_audit_event_sqlite(
                    &mut tx,
                    "entity_archetype.delete",
                    "entity_archetype",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_rules(&self) -> Result<Vec<RuleConfig>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.rules.values().cloned().collect()),
            StoreBackend::Postgres(store) => {
                let rows =
                    sqlx::query(r#"SELECT rule_data FROM rules ORDER BY created_at ASC, id ASC"#)
                        .fetch_all(&store.pool)
                        .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: serde_json::Value = row.get("rule_data");
                        serde_json::from_value(value).map_err(StoreError::from)
                    })
                    .collect()
            }
            StoreBackend::Sqlite(store) => {
                let rows =
                    sqlx::query(r#"SELECT rule_data FROM rules ORDER BY created_at ASC, id ASC"#)
                        .fetch_all(&store.pool)
                        .await?;
                rows.into_iter()
                    .map(|row| {
                        let value: String = row.get("rule_data");
                        serde_json::from_str(&value).map_err(StoreError::from)
                    })
                    .collect()
            }
        }
    }

    pub async fn get_rule(&self, id: &str) -> Result<Option<RuleConfig>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.rules.get(id).cloned()),
            StoreBackend::Postgres(store) => {
                let row = sqlx::query(r#"SELECT rule_data FROM rules WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;
                match row {
                    Some(row) => {
                        let value: serde_json::Value = row.get("rule_data");
                        Ok(Some(serde_json::from_value(value)?))
                    }
                    None => Ok(None),
                }
            }
            StoreBackend::Sqlite(store) => {
                let row = sqlx::query(r#"SELECT rule_data FROM rules WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&store.pool)
                    .await?;
                match row {
                    Some(row) => {
                        let value: String = row.get("rule_data");
                        Ok(Some(serde_json::from_str(&value)?))
                    }
                    None => Ok(None),
                }
            }
        }
    }

    pub async fn create_rule(&self, mut rule: RuleConfig) -> Result<RuleConfig, StoreError> {
        let now = now_millis();
        if rule.id.trim().is_empty() {
            rule.id = Uuid::new_v4().to_string();
        }
        rule.created_at = now;
        rule.updated_at = now;
        if rule.version == 0 {
            rule.version = 1;
        }

        let validation = validate_rule_graph(&rule);
        if !validation.valid {
            return Err(StoreError::Validation(validation.errors.join("; ")));
        }

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.rules.contains_key(&rule.id) {
                    return Err(StoreError::Validation(format!(
                        "rule {} already exists",
                        rule.id
                    )));
                }
                snapshot.rules.insert(rule.id.clone(), rule.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "rule.create",
                    "resourceId": rule.id,
                    "actor": "system",
                    "timestamp": now
                }));
                Ok(rule)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                persist_rule(&mut tx, &rule, false).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "rule.create",
                    "rule",
                    &rule.id,
                    serde_json::to_value(&rule)?,
                )
                .await?;
                tx.commit().await?;
                Ok(rule)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                persist_rule_sqlite(&mut tx, &rule, false).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "rule.create",
                    "rule",
                    &rule.id,
                    serde_json::to_value(&rule)?,
                )
                .await?;
                tx.commit().await?;
                Ok(rule)
            }
        }
    }

    pub async fn update_rule(
        &self,
        id: &str,
        mut rule: RuleConfig,
    ) -> Result<RuleConfig, StoreError> {
        rule.id = id.to_string();
        rule.updated_at = now_millis();

        let validation = validate_rule_graph(&rule);
        if !validation.valid {
            return Err(StoreError::Validation(validation.errors.join("; ")));
        }

        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                let Some(existing) = snapshot.rules.get(id) else {
                    return Err(StoreError::NotFound(format!("rule {id}")));
                };
                rule.created_at = existing.created_at;
                rule.version = existing.version + 1;
                snapshot.rules.insert(id.to_string(), rule.clone());
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "rule.update",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(rule)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                let existing = sqlx::query(r#"SELECT rule_data FROM rules WHERE id = $1"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;

                let Some(existing) = existing else {
                    return Err(StoreError::NotFound(format!("rule {id}")));
                };

                let existing_rule: RuleConfig = serde_json::from_value(existing.get("rule_data"))?;
                rule.created_at = existing_rule.created_at;
                rule.version = existing_rule.version + 1;

                persist_rule(&mut tx, &rule, true).await?;
                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "rule.update",
                    "rule",
                    id,
                    serde_json::to_value(&rule)?,
                )
                .await?;
                tx.commit().await?;
                Ok(rule)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                let existing = sqlx::query(r#"SELECT rule_data FROM rules WHERE id = ?"#)
                    .bind(id)
                    .fetch_optional(&mut *tx)
                    .await?;

                let Some(existing) = existing else {
                    return Err(StoreError::NotFound(format!("rule {id}")));
                };

                let existing_rule: RuleConfig =
                    serde_json::from_str(existing.get::<String, _>("rule_data").as_str())?;
                rule.created_at = existing_rule.created_at;
                rule.version = existing_rule.version + 1;

                persist_rule_sqlite(&mut tx, &rule, true).await?;
                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "rule.update",
                    "rule",
                    id,
                    serde_json::to_value(&rule)?,
                )
                .await?;
                tx.commit().await?;
                Ok(rule)
            }
        }
    }

    pub async fn delete_rule(&self, id: &str) -> Result<bool, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut snapshot = store.write().await;
                if snapshot.rules.remove(id).is_none() {
                    return Ok(false);
                }
                snapshot.scene_version += 1;
                snapshot.audit_events.push(serde_json::json!({
                    "action": "rule.delete",
                    "resourceId": id,
                    "actor": "system",
                    "timestamp": now_millis()
                }));
                Ok(true)
            }
            StoreBackend::Postgres(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM rule_nodes WHERE rule_id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query(r#"DELETE FROM rule_edges WHERE rule_id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM rules WHERE id = $1"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_tx(&mut tx).await?;
                insert_audit_event(
                    &mut tx,
                    "rule.delete",
                    "rule",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
            StoreBackend::Sqlite(store) => {
                let mut tx = store.pool.begin().await?;
                sqlx::query(r#"DELETE FROM rule_nodes WHERE rule_id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query(r#"DELETE FROM rule_edges WHERE rule_id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                let deleted = sqlx::query(r#"DELETE FROM rules WHERE id = ?"#)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();

                if deleted == 0 {
                    tx.rollback().await?;
                    return Ok(false);
                }

                let _ = bump_scene_version_sqlite(&mut tx).await?;
                insert_audit_event_sqlite(
                    &mut tx,
                    "rule.delete",
                    "rule",
                    id,
                    serde_json::json!({ "id": id }),
                )
                .await?;
                tx.commit().await?;
                Ok(true)
            }
        }
    }

    pub async fn list_alarms(&self) -> Result<Vec<Alarm>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store.read().await.alarms.clone()),
            StoreBackend::Postgres(_store) => Ok(Vec::new()),
            StoreBackend::Sqlite(_store) => Ok(Vec::new()),
        }
    }

    pub async fn binding_count(&self) -> Result<u64, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => Ok(store
                .read()
                .await
                .bindings
                .values()
                .map(|items| items.len() as u64)
                .sum()),
            StoreBackend::Postgres(store) => {
                let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM entity_bindings"#)
                    .fetch_one(&store.pool)
                    .await?;
                Ok(count as u64)
            }
            StoreBackend::Sqlite(store) => {
                let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM entity_bindings"#)
                    .fetch_one(&store.pool)
                    .await?;
                Ok(count as u64)
            }
        }
    }

    pub async fn list_audit_events(
        &self,
        limit: usize,
    ) -> Result<Vec<AuditEventRecord>, StoreError> {
        match &self.backend {
            StoreBackend::Memory(store) => {
                let mut events = store
                    .read()
                    .await
                    .audit_events
                    .iter()
                    .enumerate()
                    .rev()
                    .take(limit)
                    .map(|(index, value)| map_memory_audit_event(index, value))
                    .collect::<Vec<_>>();
                events.sort_by(|left, right| right.created_at.cmp(&left.created_at));
                Ok(events)
            }
            StoreBackend::Postgres(store) => {
                let rows = sqlx::query(
                    r#"
                    SELECT id, actor, action, resource_type, resource_id, payload, created_at
                    FROM audit_events
                    ORDER BY created_at DESC, id DESC
                    LIMIT $1
                    "#,
                )
                .bind(limit as i64)
                .fetch_all(&store.pool)
                .await?;

                rows.into_iter()
                    .map(|row| {
                        Ok(AuditEventRecord {
                            id: row.get("id"),
                            actor: row.get("actor"),
                            action: row.get("action"),
                            resource_type: row.get("resource_type"),
                            resource_id: row.get("resource_id"),
                            payload: row.get("payload"),
                            created_at: row.get::<i64, _>("created_at") as u64,
                        })
                    })
                    .collect()
            }
            StoreBackend::Sqlite(store) => {
                let rows = sqlx::query(
                    r#"
                    SELECT id, actor, action, resource_type, resource_id, payload, created_at
                    FROM audit_events
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    "#,
                )
                .bind(limit as i64)
                .fetch_all(&store.pool)
                .await?;

                rows.into_iter()
                    .map(|row| {
                        let payload: String = row.get("payload");
                        Ok(AuditEventRecord {
                            id: row.get("id"),
                            actor: row.get("actor"),
                            action: row.get("action"),
                            resource_type: row.get("resource_type"),
                            resource_id: row.get("resource_id"),
                            payload: serde_json::from_str(&payload)?,
                            created_at: row.get::<i64, _>("created_at") as u64,
                        })
                    })
                    .collect()
            }
        }
    }

    pub fn validate_rule(&self, rule: &RuleConfig) -> RuleValidationResponse {
        validate_rule_graph(rule)
    }

    pub async fn scene_version(&self) -> Result<u64, StoreError> {
        Ok(self.get_scene().await?.scene_version)
    }
}

pub fn validate_rule_graph(rule: &RuleConfig) -> RuleValidationResponse {
    let mut errors: Vec<String> = Vec::new();

    if rule.nodes.is_empty() {
        errors.push("rule must contain at least one node".to_string());
    }
    if rule.edges.is_empty() {
        errors.push("rule must contain at least one edge".to_string());
    }

    let mut node_map = HashMap::new();
    for node in &rule.nodes {
        node_map.insert(node.id.clone(), node);
    }

    let mut incoming: HashMap<String, usize> = HashMap::new();
    let mut outgoing: HashMap<String, usize> = HashMap::new();
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();

    for edge in &rule.edges {
        if !node_map.contains_key(&edge.source) {
            errors.push(format!(
                "edge {} source {} does not exist",
                edge.id, edge.source
            ));
            continue;
        }
        if !node_map.contains_key(&edge.target) {
            errors.push(format!(
                "edge {} target {} does not exist",
                edge.id, edge.target
            ));
            continue;
        }

        *outgoing.entry(edge.source.clone()).or_insert(0) += 1;
        *incoming.entry(edge.target.clone()).or_insert(0) += 1;
        adjacency
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }

    let trigger_count = rule
        .nodes
        .iter()
        .filter(|node| node.data.node_type.is_trigger())
        .count();
    let action_count = rule
        .nodes
        .iter()
        .filter(|node| node.data.node_type.is_action())
        .count();

    if trigger_count == 0 {
        errors.push("rule must contain at least one trigger node".to_string());
    }
    if action_count == 0 {
        errors.push("rule must contain at least one action node".to_string());
    }

    for node in &rule.nodes {
        let in_degree = incoming.get(&node.id).copied().unwrap_or(0);
        let out_degree = outgoing.get(&node.id).copied().unwrap_or(0);
        if in_degree == 0 && out_degree == 0 {
            errors.push(format!("node {} is isolated", node.id));
        }

        if node.data.node_type.is_trigger() {
            if in_degree > 0 {
                errors.push(format!(
                    "trigger node {} cannot have incoming edges",
                    node.id
                ));
            }
            if out_degree == 0 {
                errors.push(format!("trigger node {} must have outgoing edges", node.id));
            }
        }

        if node.data.node_type.is_action() {
            if out_degree > 0 {
                errors.push(format!(
                    "action node {} cannot have outgoing edges",
                    node.id
                ));
            }
            if in_degree == 0 {
                errors.push(format!("action node {} must have incoming edges", node.id));
            }
        }

        if node.data.node_type.requires_config() && node.data.config.is_empty() {
            errors.push(format!("node {} requires non-empty config", node.id));
        }
    }

    if has_cycle(&rule.nodes, &adjacency) {
        errors.push("rule graph must not contain cycles".to_string());
    }

    RuleValidationResponse {
        valid: errors.is_empty(),
        errors,
    }
}

fn has_cycle(
    nodes: &[crate::contracts::RuleNode],
    adjacency: &HashMap<String, Vec<String>>,
) -> bool {
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Mark {
        Visiting,
        Visited,
    }

    fn dfs(
        node_id: &str,
        marks: &mut HashMap<String, Mark>,
        adjacency: &HashMap<String, Vec<String>>,
    ) -> bool {
        if let Some(mark) = marks.get(node_id) {
            return *mark == Mark::Visiting;
        }

        marks.insert(node_id.to_string(), Mark::Visiting);
        if let Some(targets) = adjacency.get(node_id) {
            for target in targets {
                if dfs(target, marks, adjacency) {
                    return true;
                }
            }
        }
        marks.insert(node_id.to_string(), Mark::Visited);
        false
    }

    let mut marks = HashMap::new();
    for node in nodes {
        if !marks.contains_key(&node.id) && dfs(&node.id, &mut marks, adjacency) {
            return true;
        }
    }

    false
}

async fn setup_postgres(pool: &PgPool) -> Result<(), StoreError> {
    let mut tx = pool.begin().await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS scene_configs (
            site_id TEXT PRIMARY KEY,
            scene_version BIGINT NOT NULL,
            scene_config JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            status TEXT NOT NULL,
            entity_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS static_assets (
            id TEXT PRIMARY KEY,
            asset_kind TEXT NOT NULL,
            visible BOOLEAN NOT NULL,
            asset_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_categories (
            id TEXT PRIMARY KEY,
            category_key TEXT NOT NULL UNIQUE,
            sort_order INT NOT NULL,
            category_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            is_homepage BOOLEAN NOT NULL,
            workspace_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS workspace_states (
            workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
            state_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_archetypes (
            id TEXT PRIMARY KEY,
            archetype_key TEXT NOT NULL UNIQUE,
            category_id TEXT NOT NULL REFERENCES entity_categories(id) ON DELETE RESTRICT,
            category_key TEXT NOT NULL,
            archetype_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_zone_vertices (
            entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            vertex_order INT NOT NULL,
            point JSONB NOT NULL,
            PRIMARY KEY (entity_id, vertex_order)
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS data_connectors (
            id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL,
            connector_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_bindings (
            binding_id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            connector_id TEXT NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
            source_path TEXT NOT NULL,
            mapping JSONB NOT NULL,
            enabled BOOLEAN NOT NULL,
            binding_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            UNIQUE(entity_id, connector_id)
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL,
            version INT NOT NULL,
            rule_data JSONB NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rule_nodes (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            node_type TEXT NOT NULL,
            node_kind TEXT NOT NULL,
            position JSONB NOT NULL,
            data JSONB NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rule_edges (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            source_node_id TEXT NOT NULL,
            target_node_id TEXT NOT NULL,
            source_handle TEXT,
            target_handle TEXT
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at BIGINT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS published_state (
            site_id TEXT PRIMARY KEY,
            published_scene_version BIGINT NOT NULL,
            scene_config JSONB NOT NULL,
            entities JSONB NOT NULL,
            static_assets JSONB NOT NULL,
            published_scene JSONB,
            compiler_source TEXT NOT NULL,
            updated_at BIGINT NOT NULL,
            active_publish_token TEXT,
            active_publish_started_at BIGINT,
            active_publish_heartbeat_at BIGINT,
            last_published_at BIGINT,
            last_published_version TEXT,
            last_publish_error TEXT,
            last_failure_scene_version BIGINT,
            last_failure_at BIGINT
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_entities_type_status ON entities(entity_type, status)"#,
    )
    .await?;
    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_static_assets_kind_visible ON static_assets(asset_kind, visible)"#,
    )
    .await?;
    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_entity_archetypes_category_id ON entity_archetypes(category_id)"#,
    )
    .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_bindings_entity_connector ON entity_bindings(entity_id, connector_id)"#)
        .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_rule_nodes_rule_id ON rule_nodes(rule_id)"#)
        .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_rule_edges_rule_id ON rule_edges(rule_id)"#)
        .await?;

    let seeded_rows: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM scene_configs WHERE site_id = $1"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;

    if seeded_rows == 0 {
        let snapshot = seed_scene::seed_snapshot();
        let now = now_millis() as i64;
        let published_scene = load_published_scene_descriptor();
        sqlx::query(
            r#"
            INSERT INTO scene_configs (site_id, scene_version, scene_config, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(seed_scene::SITE_ID)
        .bind(snapshot.scene_version as i64)
        .bind(serde_json::to_value(&snapshot.scene_config)?)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        let workspace = WorkspaceRecord {
            id: snapshot.scene_config.id.clone(),
            slug: snapshot.scene_config.id.clone(),
            name: snapshot.scene_config.name.clone(),
            description: Some("默认工作区".to_string()),
            is_homepage: true,
            created_at: now as u64,
            updated_at: now as u64,
        };
        persist_workspace(&mut tx, &workspace, false).await?;

        for entity in &snapshot.entities {
            persist_entity(&mut tx, entity, false).await?;
        }

        for rule in &snapshot.rules {
            persist_rule(&mut tx, rule, false).await?;
        }

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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10, NULL, NULL, NULL)
            "#,
        )
        .bind(seed_scene::SITE_ID)
        .bind(snapshot.scene_version as i64)
        .bind(serde_json::to_value(&snapshot.scene_config)?)
        .bind(serde_json::to_value(&snapshot.entities)?)
        .bind(serde_json::to_value(Vec::<StaticAssetInstance>::new())?)
        .bind(
            published_scene
                .as_ref()
                .map(serde_json::to_value)
                .transpose()?,
        )
        .bind("campus-layout")
        .bind(now)
        .bind(now)
        .bind(
            published_scene
                .as_ref()
                .map(|descriptor| descriptor.package_version.clone()),
        )
        .execute(&mut *tx)
        .await?;
    }

    let workspace_rows: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM workspaces"#)
            .fetch_one(&mut *tx)
            .await?;
    if workspace_rows == 0 {
        let row = sqlx::query(r#"SELECT scene_config FROM scene_configs WHERE site_id = $1"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;
        let scene_config: SceneConfig = serde_json::from_value(row.get("scene_config"))?;
        let workspace = WorkspaceRecord {
            id: scene_config.id.clone(),
            slug: scene_config.id.clone(),
            name: scene_config.name.clone(),
            description: Some("默认工作区".to_string()),
            is_homepage: true,
            created_at: now_millis(),
            updated_at: now_millis(),
        };
        persist_workspace(&mut tx, &workspace, false).await?;
    }

    backfill_workspace_states_postgres(&mut tx).await?;

    tx.commit().await?;
    Ok(())
}

async fn setup_sqlite(pool: &SqlitePool) -> Result<(), StoreError> {
    let mut tx = pool.begin().await?;

    tx.execute("PRAGMA foreign_keys = ON").await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS scene_configs (
            site_id TEXT PRIMARY KEY,
            scene_version INTEGER NOT NULL,
            scene_config TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            status TEXT NOT NULL,
            entity_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS static_assets (
            id TEXT PRIMARY KEY,
            asset_kind TEXT NOT NULL,
            visible INTEGER NOT NULL,
            asset_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_categories (
            id TEXT PRIMARY KEY,
            category_key TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL,
            category_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            is_homepage INTEGER NOT NULL,
            workspace_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS workspace_states (
            workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
            state_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_archetypes (
            id TEXT PRIMARY KEY,
            archetype_key TEXT NOT NULL UNIQUE,
            category_id TEXT NOT NULL REFERENCES entity_categories(id) ON DELETE RESTRICT,
            category_key TEXT NOT NULL,
            archetype_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_zone_vertices (
            entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            vertex_order INTEGER NOT NULL,
            point TEXT NOT NULL,
            PRIMARY KEY (entity_id, vertex_order)
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS data_connectors (
            id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL,
            connector_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS entity_bindings (
            binding_id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            connector_id TEXT NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
            source_path TEXT NOT NULL,
            mapping TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            binding_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(entity_id, connector_id)
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL,
            version INTEGER NOT NULL,
            rule_data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rule_nodes (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            node_type TEXT NOT NULL,
            node_kind TEXT NOT NULL,
            position TEXT NOT NULL,
            data TEXT NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS rule_edges (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
            source_node_id TEXT NOT NULL,
            target_node_id TEXT NOT NULL,
            source_handle TEXT,
            target_handle TEXT
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"
        CREATE TABLE IF NOT EXISTS published_state (
            site_id TEXT PRIMARY KEY,
            published_scene_version INTEGER NOT NULL,
            scene_config TEXT NOT NULL,
            entities TEXT NOT NULL,
            static_assets TEXT NOT NULL,
            published_scene TEXT,
            compiler_source TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            active_publish_token TEXT,
            active_publish_started_at INTEGER,
            active_publish_heartbeat_at INTEGER,
            last_published_at INTEGER,
            last_published_version TEXT,
            last_publish_error TEXT,
            last_failure_scene_version INTEGER,
            last_failure_at INTEGER
        )
        "#,
    )
    .await?;

    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_entities_type_status ON entities(entity_type, status)"#,
    )
    .await?;
    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_static_assets_kind_visible ON static_assets(asset_kind, visible)"#,
    )
    .await?;
    tx.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_entity_archetypes_category_id ON entity_archetypes(category_id)"#,
    )
    .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_bindings_entity_connector ON entity_bindings(entity_id, connector_id)"#)
        .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_rule_nodes_rule_id ON rule_nodes(rule_id)"#)
        .await?;
    tx.execute(r#"CREATE INDEX IF NOT EXISTS idx_rule_edges_rule_id ON rule_edges(rule_id)"#)
        .await?;

    let seeded_rows: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM scene_configs WHERE site_id = ?"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;

    if seeded_rows == 0 {
        let snapshot = seed_scene::seed_snapshot();
        let now = now_millis() as i64;
        let published_scene = load_published_scene_descriptor();
        sqlx::query(
            r#"
            INSERT INTO scene_configs (site_id, scene_version, scene_config, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(seed_scene::SITE_ID)
        .bind(snapshot.scene_version as i64)
        .bind(serde_json::to_string(&snapshot.scene_config)?)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;

        let workspace = WorkspaceRecord {
            id: snapshot.scene_config.id.clone(),
            slug: snapshot.scene_config.id.clone(),
            name: snapshot.scene_config.name.clone(),
            description: Some("默认工作区".to_string()),
            is_homepage: true,
            created_at: now as u64,
            updated_at: now as u64,
        };
        persist_workspace_sqlite(&mut tx, &workspace, false).await?;

        for entity in &snapshot.entities {
            persist_entity_sqlite(&mut tx, entity, false).await?;
        }

        for rule in &snapshot.rules {
            persist_rule_sqlite(&mut tx, rule, false).await?;
        }

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL)
            "#,
        )
        .bind(seed_scene::SITE_ID)
        .bind(snapshot.scene_version as i64)
        .bind(serde_json::to_string(&snapshot.scene_config)?)
        .bind(serde_json::to_string(&snapshot.entities)?)
        .bind(serde_json::to_string(&Vec::<StaticAssetInstance>::new())?)
        .bind(
            published_scene
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
        )
        .bind("campus-layout")
        .bind(now)
        .bind(now)
        .bind(
            published_scene
                .as_ref()
                .map(|descriptor| descriptor.package_version.clone()),
        )
        .execute(&mut *tx)
        .await?;
    }

    let workspace_rows: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM workspaces"#)
            .fetch_one(&mut *tx)
            .await?;
    if workspace_rows == 0 {
        let row = sqlx::query(r#"SELECT scene_config FROM scene_configs WHERE site_id = ?"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut *tx)
            .await?;
        let scene_config: SceneConfig =
            serde_json::from_str(row.get::<String, _>("scene_config").as_str())?;
        let workspace = WorkspaceRecord {
            id: scene_config.id.clone(),
            slug: scene_config.id.clone(),
            name: scene_config.name.clone(),
            description: Some("默认工作区".to_string()),
            is_homepage: true,
            created_at: now_millis(),
            updated_at: now_millis(),
        };
        persist_workspace_sqlite(&mut tx, &workspace, false).await?;
    }

    backfill_workspace_states_sqlite(&mut tx).await?;

    tx.commit().await?;
    Ok(())
}

async fn persist_entity(
    tx: &mut Transaction<'_, Postgres>,
    entity: &Entity,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entities
            SET entity_type = $1, status = $2, entity_data = $3, created_at = $4, updated_at = $5
            WHERE id = $6
            "#,
        )
        .bind(entity.entity_type())
        .bind(status_to_str(&entity.status()))
        .bind(serde_json::to_value(entity)?)
        .bind(entity.created_at() as i64)
        .bind(entity.updated_at() as i64)
        .bind(entity.id())
        .execute(&mut **tx)
        .await?;

        sqlx::query(r#"DELETE FROM entity_zone_vertices WHERE entity_id = $1"#)
            .bind(entity.id())
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entities (id, entity_type, status, entity_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(entity.id())
        .bind(entity.entity_type())
        .bind(status_to_str(&entity.status()))
        .bind(serde_json::to_value(entity)?)
        .bind(entity.created_at() as i64)
        .bind(entity.updated_at() as i64)
        .execute(&mut **tx)
        .await?;
    }

    if let Entity::Zone(zone) = entity {
        for (index, point) in zone.boundary.iter().enumerate() {
            sqlx::query(
                r#"
                INSERT INTO entity_zone_vertices (entity_id, vertex_order, point)
                VALUES ($1, $2, $3)
                "#,
            )
            .bind(entity.id())
            .bind(index as i32)
            .bind(serde_json::to_value(point)?)
            .execute(&mut **tx)
            .await?;
        }
    }

    Ok(())
}

async fn persist_entity_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    entity: &Entity,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entities
            SET entity_type = ?, status = ?, entity_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(entity.entity_type())
        .bind(status_to_str(&entity.status()))
        .bind(serde_json::to_string(entity)?)
        .bind(entity.created_at() as i64)
        .bind(entity.updated_at() as i64)
        .bind(entity.id())
        .execute(&mut **tx)
        .await?;

        sqlx::query(r#"DELETE FROM entity_zone_vertices WHERE entity_id = ?"#)
            .bind(entity.id())
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entities (id, entity_type, status, entity_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(entity.id())
        .bind(entity.entity_type())
        .bind(status_to_str(&entity.status()))
        .bind(serde_json::to_string(entity)?)
        .bind(entity.created_at() as i64)
        .bind(entity.updated_at() as i64)
        .execute(&mut **tx)
        .await?;
    }

    if let Entity::Zone(zone) = entity {
        for (index, point) in zone.boundary.iter().enumerate() {
            sqlx::query(
                r#"
                INSERT INTO entity_zone_vertices (entity_id, vertex_order, point)
                VALUES (?, ?, ?)
                "#,
            )
            .bind(entity.id())
            .bind(index as i32)
            .bind(serde_json::to_string(point)?)
            .execute(&mut **tx)
            .await?;
        }
    }

    Ok(())
}

async fn persist_static_asset(
    tx: &mut Transaction<'_, Postgres>,
    asset: &StaticAssetInstance,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE static_assets
            SET asset_kind = $1, visible = $2, asset_data = $3, created_at = $4, updated_at = $5
            WHERE id = $6
            "#,
        )
        .bind(static_asset_kind_to_str(asset))
        .bind(asset.visible)
        .bind(serde_json::to_value(asset)?)
        .bind(asset.created_at as i64)
        .bind(asset.updated_at as i64)
        .bind(&asset.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO static_assets (id, asset_kind, visible, asset_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&asset.id)
        .bind(static_asset_kind_to_str(asset))
        .bind(asset.visible)
        .bind(serde_json::to_value(asset)?)
        .bind(asset.created_at as i64)
        .bind(asset.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn persist_static_asset_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    asset: &StaticAssetInstance,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE static_assets
            SET asset_kind = ?, visible = ?, asset_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(static_asset_kind_to_str(asset))
        .bind(asset.visible)
        .bind(serde_json::to_string(asset)?)
        .bind(asset.created_at as i64)
        .bind(asset.updated_at as i64)
        .bind(&asset.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO static_assets (id, asset_kind, visible, asset_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&asset.id)
        .bind(static_asset_kind_to_str(asset))
        .bind(asset.visible)
        .bind(serde_json::to_string(asset)?)
        .bind(asset.created_at as i64)
        .bind(asset.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn persist_entity_category(
    tx: &mut Transaction<'_, Postgres>,
    category: &EntityCategory,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entity_categories
            SET category_key = $1, sort_order = $2, category_data = $3, created_at = $4, updated_at = $5
            WHERE id = $6
            "#,
        )
        .bind(&category.key)
        .bind(category.sort_order)
        .bind(serde_json::to_value(category)?)
        .bind(category.created_at as i64)
        .bind(category.updated_at as i64)
        .bind(&category.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entity_categories (id, category_key, sort_order, category_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&category.id)
        .bind(&category.key)
        .bind(category.sort_order)
        .bind(serde_json::to_value(category)?)
        .bind(category.created_at as i64)
        .bind(category.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn persist_workspace(
    tx: &mut Transaction<'_, Postgres>,
    workspace: &WorkspaceRecord,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE workspaces
            SET slug = $1, is_homepage = $2, workspace_data = $3, created_at = $4, updated_at = $5
            WHERE id = $6
            "#,
        )
        .bind(&workspace.slug)
        .bind(workspace.is_homepage)
        .bind(serde_json::to_value(workspace)?)
        .bind(workspace.created_at as i64)
        .bind(workspace.updated_at as i64)
        .bind(&workspace.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO workspaces (id, slug, is_homepage, workspace_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.slug)
        .bind(workspace.is_homepage)
        .bind(serde_json::to_value(workspace)?)
        .bind(workspace.created_at as i64)
        .bind(workspace.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn persist_entity_category_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    category: &EntityCategory,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE entity_categories
            SET category_key = ?, sort_order = ?, category_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&category.key)
        .bind(category.sort_order)
        .bind(serde_json::to_string(category)?)
        .bind(category.created_at as i64)
        .bind(category.updated_at as i64)
        .bind(&category.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO entity_categories (id, category_key, sort_order, category_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&category.id)
        .bind(&category.key)
        .bind(category.sort_order)
        .bind(serde_json::to_string(category)?)
        .bind(category.created_at as i64)
        .bind(category.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn persist_workspace_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    workspace: &WorkspaceRecord,
    replace: bool,
) -> Result<(), StoreError> {
    if replace {
        sqlx::query(
            r#"
            UPDATE workspaces
            SET slug = ?, is_homepage = ?, workspace_data = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&workspace.slug)
        .bind(workspace.is_homepage)
        .bind(serde_json::to_string(workspace)?)
        .bind(workspace.created_at as i64)
        .bind(workspace.updated_at as i64)
        .bind(&workspace.id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO workspaces (id, slug, is_homepage, workspace_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.slug)
        .bind(workspace.is_homepage)
        .bind(serde_json::to_string(workspace)?)
        .bind(workspace.created_at as i64)
        .bind(workspace.updated_at as i64)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn load_workspace_state_postgres(
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

async fn load_workspace_state_sqlite(
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

async fn persist_workspace_state_postgres(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    state: &WorkspaceState,
) -> Result<(), StoreError> {
    let now = now_millis() as i64;
    sqlx::query(
        r#"
        INSERT INTO workspace_states (workspace_id, state_data, created_at, updated_at)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (workspace_id) DO UPDATE
        SET state_data = EXCLUDED.state_data,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(workspace_id)
    .bind(serde_json::to_value(state)?)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn persist_workspace_state_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    workspace_id: &str,
    state: &WorkspaceState,
) -> Result<(), StoreError> {
    let now = now_millis() as i64;
    sqlx::query(
        r#"
        INSERT INTO workspace_states (workspace_id, state_data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
            state_data = excluded.state_data,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(workspace_id)
    .bind(serde_json::to_string(state)?)
    .bind(now)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn backfill_workspace_states_postgres(
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

async fn backfill_workspace_states_sqlite(
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

async fn load_legacy_workspace_state_postgres(
    tx: &mut PgConnection,
    workspace: &WorkspaceRecord,
) -> Result<WorkspaceState, StoreError> {
    let scene_row = sqlx::query(
        r#"SELECT scene_version, scene_config FROM scene_configs WHERE site_id = $1"#,
    )
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
            .map(|row| {
                serde_json::from_value(row.get("connector_data")).map_err(StoreError::from)
            })
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
            acc.entry(binding.entity_id.clone()).or_default().push(binding);
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
        let mut published_scene_config: SceneConfig = serde_json::from_value(row.get("scene_config"))?;
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
        rules: rules.into_iter().map(|rule| (rule.id.clone(), rule)).collect(),
        alarms: Vec::new(),
        connectors: connectors
            .into_iter()
            .map(|connector| (connector.id.clone(), connector))
            .collect(),
        bindings,
        audit_events: Vec::new(),
    })
}

async fn load_legacy_workspace_state_sqlite(
    tx: &mut SqliteConnection,
    workspace: &WorkspaceRecord,
) -> Result<WorkspaceState, StoreError> {
    let scene_row = sqlx::query(
        r#"SELECT scene_version, scene_config FROM scene_configs WHERE site_id = ?"#,
    )
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
            acc.entry(binding.entity_id.clone()).or_default().push(binding);
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
        rules: rules.into_iter().map(|rule| (rule.id.clone(), rule)).collect(),
        alarms: Vec::new(),
        connectors: connectors
            .into_iter()
            .map(|connector| (connector.id.clone(), connector))
            .collect(),
        bindings,
        audit_events: Vec::new(),
    })
}

async fn persist_entity_archetype(
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

async fn persist_entity_archetype_sqlite(
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

async fn persist_scene_config(
    tx: &mut Transaction<'_, Postgres>,
    scene_config: &SceneConfig,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        UPDATE scene_configs
        SET scene_config = $1, updated_at = $2
        WHERE site_id = $3
        "#,
    )
    .bind(serde_json::to_value(scene_config)?)
    .bind(now_millis() as i64)
    .bind(seed_scene::SITE_ID)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn persist_scene_config_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    scene_config: &SceneConfig,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        UPDATE scene_configs
        SET scene_config = ?, updated_at = ?
        WHERE site_id = ?
        "#,
    )
    .bind(serde_json::to_string(scene_config)?)
    .bind(now_millis() as i64)
    .bind(seed_scene::SITE_ID)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn persist_rule(
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

async fn persist_rule_sqlite(
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

async fn bump_scene_version_tx(tx: &mut Transaction<'_, Postgres>) -> Result<u64, StoreError> {
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

async fn bump_scene_version_sqlite(tx: &mut Transaction<'_, Sqlite>) -> Result<u64, StoreError> {
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

async fn current_scene_version_tx(tx: &mut Transaction<'_, Postgres>) -> Result<u64, StoreError> {
    let scene_version: i64 =
        sqlx::query_scalar(r#"SELECT scene_version FROM scene_configs WHERE site_id = $1"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut **tx)
            .await?;

    Ok(scene_version as u64)
}

async fn current_scene_version_sqlite(tx: &mut Transaction<'_, Sqlite>) -> Result<u64, StoreError> {
    let scene_version: i64 =
        sqlx::query_scalar(r#"SELECT scene_version FROM scene_configs WHERE site_id = ?"#)
            .bind(seed_scene::SITE_ID)
            .fetch_one(&mut **tx)
            .await?;

    Ok(scene_version as u64)
}

fn ensure_expected_scene_version(expected: u64, actual: u64) -> Result<(), StoreError> {
    if expected == actual {
        return Ok(());
    }

    Err(StoreError::SceneVersionConflict { expected, actual })
}

fn validate_editor_save_request(request: &EditorSaveRequest) -> Result<(), StoreError> {
    if request.scene_config.is_none() && request.entity.is_none() && request.static_asset.is_none()
    {
        return Err(StoreError::Validation(
            "editor save requires at least one scene or selection change".to_string(),
        ));
    }

    if request.entity.is_some() && request.static_asset.is_some() {
        return Err(StoreError::Validation(
            "editor save accepts either an entity draft or a static asset draft, not both"
                .to_string(),
        ));
    }

    Ok(())
}

async fn insert_audit_event(
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

async fn insert_audit_event_sqlite(
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

async fn upsert_published_state_postgres(
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

async fn upsert_published_state_sqlite(
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

async fn sync_live_entity_roster_postgres(
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

async fn sync_live_entity_roster_sqlite(
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

fn cascade_category_key_update_memory(
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

fn normalize_dynamic_entity_registry_refs_memory(
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

async fn normalize_dynamic_entity_registry_refs_postgres(
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
    let row = sqlx::query(
        r#"SELECT archetype_data FROM entity_archetypes WHERE id = $1 FOR UPDATE"#,
    )
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

async fn normalize_dynamic_entity_registry_refs_sqlite(
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

fn rewrite_dynamic_entity_archetype_refs(
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

fn sync_workspace_live_entity_roster(state: &mut WorkspaceState) {
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

async fn rewrite_dynamic_entity_archetype_refs_postgres(
    tx: &mut Transaction<'_, Postgres>,
    archetype_id: &str,
    archetype_key: &str,
    category_key: &str,
    display_name: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(
        r#"SELECT id, entity_data FROM entities WHERE entity_type = 'dynamic'"#,
    )
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

async fn rewrite_dynamic_entity_archetype_refs_sqlite(
    tx: &mut Transaction<'_, Sqlite>,
    archetype_id: &str,
    archetype_key: &str,
    category_key: &str,
    display_name: &str,
) -> Result<(), StoreError> {
    let rows = sqlx::query(
        r#"SELECT id, entity_data FROM entities WHERE entity_type = 'dynamic'"#,
    )
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

async fn cascade_category_key_update_postgres(
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

async fn cascade_category_key_update_sqlite(
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

async fn count_dynamic_entity_refs_postgres(
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

async fn count_dynamic_entity_refs_sqlite(
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

fn map_memory_audit_event(index: usize, value: &serde_json::Value) -> AuditEventRecord {
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

fn is_sqlite_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    normalized.starts_with("sqlite:") || normalized.starts_with("file:")
}

fn is_memory_backend_url(url: &str) -> bool {
    matches!(
        url.trim().to_ascii_lowercase().as_str(),
        "memory" | "memory://" | "in-memory"
    )
}

fn ensure_sqlite_parent_dir(url: &str) -> Result<(), StoreError> {
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

fn sqlite_file_path_from_url(url: &str) -> Option<String> {
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

fn status_to_str(status: &EntityStatus) -> &'static str {
    match status {
        EntityStatus::Active => "active",
        EntityStatus::Inactive => "inactive",
        EntityStatus::Warning => "warning",
        EntityStatus::Error => "error",
    }
}

fn static_asset_kind_to_str(asset: &StaticAssetInstance) -> &'static str {
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

fn sort_entities(entities: &mut [Entity]) {
    entities.sort_by(|left, right| {
        entity_sort_rank(left)
            .cmp(&entity_sort_rank(right))
            .then_with(|| left.id().cmp(right.id()))
    });
}

fn sort_static_assets(static_assets: &mut [StaticAssetInstance]) {
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

fn ensure_entity_create_defaults(entity: &mut Entity, now: u64) {
    if entity.id().trim().is_empty() {
        set_entity_id(entity, &Uuid::new_v4().to_string());
    }
    set_entity_created_at(entity, now);
    set_entity_updated_at(entity, now);
}

fn ensure_entity_update_defaults(entity: &mut Entity, now: u64) {
    set_entity_updated_at(entity, now);
    if entity.created_at() == 0 {
        set_entity_created_at(entity, now);
    }
}

fn ensure_static_asset_create_defaults(asset: &mut StaticAssetInstance, now: u64) {
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

fn ensure_static_asset_update_defaults(asset: &mut StaticAssetInstance, now: u64) {
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

fn set_entity_id(entity: &mut Entity, id: &str) {
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

fn set_entity_created_at(entity: &mut Entity, created_at: u64) {
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

fn set_entity_updated_at(entity: &mut Entity, updated_at: u64) {
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

fn sort_entity_categories(categories: &mut [EntityCategory]) {
    categories.sort_by(|left, right| {
        left.sort_order
            .cmp(&right.sort_order)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn sort_workspaces(workspaces: &mut [WorkspaceRecord]) {
    workspaces.sort_by(|left, right| {
        right
            .is_homepage
            .cmp(&left.is_homepage)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn ensure_workspace_create_defaults(workspace: &mut WorkspaceRecord, now: u64) {
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

fn ensure_workspace_update_defaults(workspace: &mut WorkspaceRecord, now: u64) {
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

fn validate_workspace(workspace: &WorkspaceRecord) -> Result<(), StoreError> {
    if workspace.slug.trim().is_empty() {
        return Err(StoreError::Validation(
            "workspace slug must be non-empty".to_string(),
        ));
    }
    if workspace.name.trim().is_empty() {
        return Err(StoreError::Validation(
            "workspace name must be non-empty".to_string(),
        ));
    }
    Ok(())
}

fn sort_entity_archetypes(archetypes: &mut [EntityArchetype]) {
    archetypes.sort_by(|left, right| {
        left.category_key
            .cmp(&right.category_key)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn ensure_entity_category_create_defaults(category: &mut EntityCategory, now: u64) {
    if category.id.trim().is_empty() {
        category.id = Uuid::new_v4().to_string();
    }
    if category.display_name.trim().is_empty() {
        category.display_name = category.key.clone();
    }
    category.created_at = now;
    category.updated_at = now;
}

fn ensure_entity_category_update_defaults(category: &mut EntityCategory, now: u64) {
    if category.display_name.trim().is_empty() {
        category.display_name = category.key.clone();
    }
    if category.created_at == 0 {
        category.created_at = now;
    }
    category.updated_at = now;
}

fn validate_entity_category(category: &EntityCategory) -> Result<(), StoreError> {
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

fn ensure_entity_archetype_create_defaults(archetype: &mut EntityArchetype, now: u64) {
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

fn ensure_entity_archetype_update_defaults(archetype: &mut EntityArchetype, now: u64) {
    if archetype.display_name.trim().is_empty() {
        archetype.display_name = archetype.key.clone();
    }
    archetype.capabilities.has_model = archetype.model.is_some();
    if archetype.created_at == 0 {
        archetype.created_at = now;
    }
    archetype.updated_at = now;
}

fn validate_entity_archetype(archetype: &EntityArchetype) -> Result<(), StoreError> {
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

fn validate_managed_archetype_model_asset(model: &ArchetypeModelAsset) -> Result<(), StoreError> {
    if !model.asset_url.starts_with(MANAGED_ARCHETYPE_ASSET_PREFIX) {
        return Err(StoreError::Validation(
            "entity archetype model assetUrl must stay within the managed /assets/entity-archetypes/ path".to_string(),
        ));
    }
    if model.asset_url.contains("..") || model.asset_url.contains("://") || model.asset_url.contains('\\') {
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

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}

#[allow(dead_code)]
fn _vector_to_json(point: Vector3) -> serde_json::Value {
    serde_json::json!({ "x": point.x, "y": point.y, "z": point.z })
}

#[cfg(test)]
mod tests {
    use super::Store;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[tokio::test]
    async fn publish_lock_requires_expiry_before_another_owner_can_acquire() {
        let store = Store::memory_backend();

        assert!(store.try_begin_publish("token-a", 1_000, 50).await.unwrap());
        assert!(!store.try_begin_publish("token-b", 1_020, 50).await.unwrap());
        assert!(store
            .refresh_publish_heartbeat("token-a", 1_030)
            .await
            .unwrap());
        assert!(!store.try_begin_publish("token-b", 1_070, 50).await.unwrap());
        assert!(store.try_begin_publish("token-b", 1_081, 50).await.unwrap());
    }

    #[tokio::test]
    async fn publish_lock_heartbeat_rejects_non_owner_tokens() {
        let store = Store::memory_backend();

        assert!(store
            .try_begin_publish("token-a", 5_000, 500)
            .await
            .unwrap());
        assert!(!store
            .refresh_publish_heartbeat("token-b", 5_050)
            .await
            .unwrap());
        assert!(store
            .refresh_publish_heartbeat("token-a", 5_100)
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn sqlite_publish_lock_coordinates_across_store_instances() {
        let (url, db_root) = unique_sqlite_url("publish-lock-coordination");
        let store_a = Store::from_database_url(&url).await.unwrap();
        let store_b = Store::from_database_url(&url).await.unwrap();

        assert!(store_a
            .try_begin_publish("token-a", 10_000, 1_000)
            .await
            .unwrap());
        assert!(!store_b
            .try_begin_publish("token-b", 10_010, 1_000)
            .await
            .unwrap());

        store_a
            .record_publish_failure(10_000, "forced test failure")
            .await
            .unwrap();
        assert!(store_b
            .try_begin_publish("token-b", 10_020, 1_000)
            .await
            .unwrap());

        drop(store_a);
        drop(store_b);
        let _ = fs::remove_dir_all(db_root);
    }

    fn unique_sqlite_url(label: &str) -> (String, PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "backend-core-rs-store-test-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let db_path = root.join("store.sqlite3");
        let url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
        (url, root)
    }
}
