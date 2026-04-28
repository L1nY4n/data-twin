use crate::contracts::{
    BootstrapResponse, EditorSaveRequest, EditorSaveResponse, PublishedSceneDescriptor,
    SceneConfig, SceneResponse,
};

use super::{PublishedStateRecord, Store, StoreError, WorkingSnapshot};

impl Store {
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
        self.workspace_save_editor_changes(&workspace_id, request)
            .await
    }
}
