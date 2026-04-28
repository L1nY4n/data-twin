use std::collections::HashSet;

use uuid::Uuid;

use crate::contracts::{Alarm, AuditEventRecord, DataConnector, EntityBinding, RuleConfig};

use super::{helpers::now_millis, map_memory_audit_event, Store, StoreError};

impl Store {
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
        state
            .connectors
            .insert(connector.id.clone(), connector.clone());
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

        state
            .bindings
            .insert(entity_id.to_string(), bindings.clone());
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
            return Err(StoreError::Validation(format!(
                "rule {} already exists",
                rule.id
            )));
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
        Ok(state
            .bindings
            .values()
            .map(|items| items.len() as u64)
            .sum())
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
}
