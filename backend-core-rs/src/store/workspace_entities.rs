use std::collections::BTreeMap;

use crate::contracts::{Entity, StaticAssetInstance};

use super::{
    helpers::{
        ensure_entity_create_defaults, ensure_entity_update_defaults,
        ensure_static_asset_create_defaults, ensure_static_asset_update_defaults, now_millis,
        set_entity_created_at, set_entity_id, sort_entities, sort_static_assets,
    },
    rewrite::{normalize_dynamic_entity_registry_refs_memory, sync_workspace_live_entity_roster},
    Store, StoreError,
};

impl Store {
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
        state
            .entities
            .insert(entity.id().to_string(), entity.clone());
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
}
