use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use tokio::task;
use uuid::Uuid;

use crate::{
    contracts::{PublishState, PublishStatusResponse, PublishedSceneDescriptor},
    store::{
        is_path_safe_workspace_slug, is_reserved_workspace_slug, PublishedStateRecord, Store,
        StoreError, WorkingSnapshot,
    },
};

const PUBLISH_LOCK_STALE_AFTER_MS: u64 = 120_000;
pub const PUBLISH_HEARTBEAT_INTERVAL_MS: u64 = 10_000;

#[derive(Clone, Debug)]
pub struct PublishConfig {
    pub repo_root: PathBuf,
    pub generated_root: PathBuf,
    pub export_script_path: PathBuf,
    pub public_base_url_root: String,
    pub bun_bin: String,
}

impl Default for PublishConfig {
    fn default() -> Self {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let bun_bin = env::var("PUBLISH_BUN_BIN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "bun".to_string());

        Self {
            generated_root: repo_root.join("public/generated/published-static"),
            export_script_path: repo_root.join("scripts/export-published-static-assets.ts"),
            public_base_url_root: "/generated/published-static".to_string(),
            repo_root,
            bun_bin,
        }
    }
}

#[derive(Clone, Default)]
pub struct PublishRuntime {
    active: Arc<AtomicBool>,
}

pub struct PublishLease {
    active: Arc<AtomicBool>,
}

impl Drop for PublishLease {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
    }
}

impl PublishRuntime {
    pub fn try_acquire(&self) -> Option<PublishLease> {
        self.active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| PublishLease {
                active: self.active.clone(),
            })
    }

    pub fn is_publishing(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }
}

#[derive(Debug)]
pub enum PublishError {
    Store(StoreError),
    Join(String),
    Io(std::io::Error),
    Parse(serde_json::Error),
    UnsafeWorkspaceSlug(String),
    CommandFailed(String),
}

impl std::fmt::Display for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Store(error) => write!(f, "{error}"),
            Self::Join(error) => write!(f, "publish task failed to join: {error}"),
            Self::Io(error) => write!(f, "publish filesystem error: {error}"),
            Self::Parse(error) => write!(f, "publish artifact parse error: {error}"),
            Self::UnsafeWorkspaceSlug(slug) => {
                write!(
                    f,
                    "workspace slug is not safe for published asset paths: {slug}"
                )
            }
            Self::CommandFailed(error) => write!(f, "publish build failed: {error}"),
        }
    }
}

impl std::error::Error for PublishError {}

impl From<StoreError> for PublishError {
    fn from(value: StoreError) -> Self {
        Self::Store(value)
    }
}

impl From<std::io::Error> for PublishError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for PublishError {
    fn from(value: serde_json::Error) -> Self {
        Self::Parse(value)
    }
}

#[derive(Debug)]
struct PublishBuildOutput {
    descriptor: PublishedSceneDescriptor,
    compiler_source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishedScenePackageIndex {
    scene_id: String,
    generated_at: String,
    static_asset_manifest_url: String,
    #[serde(default)]
    source: Option<String>,
}

pub async fn load_publish_status(
    store: &Store,
    runtime: &PublishRuntime,
) -> Result<PublishStatusResponse, StoreError> {
    let current_scene_version = store.scene_version().await?;
    let published = store.published_state().await?;
    let has_unpublished_changes = current_scene_version > published.published_scene_version;
    let failed_current_version = published.last_failure_scene_version
        == Some(current_scene_version)
        && has_unpublished_changes;

    let status = if runtime.is_publishing() || is_publish_lock_active(&published) {
        PublishState::Publishing
    } else if failed_current_version {
        PublishState::Failed
    } else if has_unpublished_changes {
        PublishState::SavedUnpublished
    } else {
        PublishState::Published
    };

    Ok(PublishStatusResponse {
        status,
        current_scene_version,
        published_scene_version: published.published_scene_version,
        has_unpublished_changes,
        active_publish_started_at: published.active_publish_started_at,
        active_publish_heartbeat_at: published.active_publish_heartbeat_at,
        last_published_at: published.last_published_at,
        last_published_version: published.last_published_version,
        last_error: published.last_publish_error,
        published_scene: published.published_scene,
        compiler_source: published.compiler_source,
    })
}

pub async fn load_publish_status_for_workspace(
    store: &Store,
    _runtime: &PublishRuntime,
    workspace_id: &str,
) -> Result<PublishStatusResponse, StoreError> {
    let current_scene_version = store.workspace_scene_version(workspace_id).await?;
    let published = store.workspace_published_state(workspace_id).await?;
    let has_unpublished_changes = current_scene_version > published.published_scene_version;
    let failed_current_version = published.last_failure_scene_version
        == Some(current_scene_version)
        && has_unpublished_changes;

    let status = if is_publish_lock_active(&published) {
        PublishState::Publishing
    } else if failed_current_version {
        PublishState::Failed
    } else if has_unpublished_changes {
        PublishState::SavedUnpublished
    } else {
        PublishState::Published
    };

    Ok(PublishStatusResponse {
        status,
        current_scene_version,
        published_scene_version: published.published_scene_version,
        has_unpublished_changes,
        active_publish_started_at: published.active_publish_started_at,
        active_publish_heartbeat_at: published.active_publish_heartbeat_at,
        last_published_at: published.last_published_at,
        last_published_version: published.last_published_version,
        last_error: published.last_publish_error,
        published_scene: published.published_scene,
        compiler_source: published.compiler_source,
    })
}

pub fn publish_lock_stale_after_ms() -> u64 {
    PUBLISH_LOCK_STALE_AFTER_MS
}

pub async fn publish_working_snapshot(
    store: &Store,
    snapshot: &WorkingSnapshot,
    config: &PublishConfig,
) -> Result<PublishedStateRecord, PublishError> {
    let version_slug = format!("{}-{}", snapshot.scene_version, current_publish_millis());
    let publish_config = config.clone();
    let snapshot_for_export = snapshot.clone();
    let build = task::spawn_blocking(move || {
        run_publish_export(
            &publish_config,
            &snapshot_for_export,
            &version_slug,
            "global",
        )
    })
    .await
    .map_err(|error| PublishError::Join(error.to_string()))??;

    store
        .promote_working_snapshot(snapshot, Some(build.descriptor), &build.compiler_source)
        .await
        .map_err(PublishError::Store)
}

pub async fn publish_working_snapshot_for_workspace(
    store: &Store,
    workspace_id: &str,
    workspace_slug: &str,
    snapshot: &WorkingSnapshot,
    config: &PublishConfig,
) -> Result<PublishedStateRecord, PublishError> {
    let version_slug = format!("{}-{}", snapshot.scene_version, current_publish_millis());
    let publish_config = config.clone();
    let snapshot_for_export = snapshot.clone();
    let workspace_slug = workspace_slug.to_string();
    validate_publish_user_workspace_slug(&workspace_slug)?;
    let build = task::spawn_blocking(move || {
        run_publish_export(
            &publish_config,
            &snapshot_for_export,
            &version_slug,
            &workspace_slug,
        )
    })
    .await
    .map_err(|error| PublishError::Join(error.to_string()))??;

    store
        .workspace_promote_working_snapshot(
            workspace_id,
            snapshot,
            Some(build.descriptor),
            &build.compiler_source,
        )
        .await
        .map_err(PublishError::Store)
}

fn run_publish_export(
    config: &PublishConfig,
    snapshot: &WorkingSnapshot,
    version_slug: &str,
    workspace_slug: &str,
) -> Result<PublishBuildOutput, PublishError> {
    validate_publish_workspace_slug(workspace_slug)?;

    let repo_root = &config.repo_root;
    let generated_root = &config.generated_root;
    let is_global_alias = workspace_slug == "global";
    let workspace_root = if is_global_alias {
        generated_root.clone()
    } else {
        generated_root.join("workspaces").join(workspace_slug)
    };
    let versions_root = workspace_root.join("versions");
    let final_dir = versions_root.join(version_slug);
    let temp_suffix = publish_temp_suffix(workspace_slug, version_slug);
    let temp_public_root = generated_root.join(format!(".tmp-publish-root-{temp_suffix}"));
    let temp_snapshot_path =
        generated_root.join(format!(".tmp-publish-snapshot-{temp_suffix}.json"));
    let temp_alias_path = workspace_root.join(format!(".tmp-publish-alias-{temp_suffix}.json"));
    let public_base_url = if is_global_alias {
        format!(
            "{}/versions/{version_slug}",
            config.public_base_url_root.trim_end_matches('/'),
        )
    } else {
        format!(
            "{}/workspaces/{workspace_slug}/versions/{version_slug}",
            config.public_base_url_root.trim_end_matches('/'),
        )
    };
    let temp_dir = temp_public_root.join(public_base_url.trim_start_matches('/'));

    if temp_public_root.exists() {
        fs::remove_dir_all(&temp_public_root)?;
    }
    if final_dir.exists() {
        return Err(PublishError::CommandFailed(format!(
            "publish version directory already exists: {}",
            final_dir.display()
        )));
    }

    fs::create_dir_all(&versions_root)?;
    fs::write(&temp_snapshot_path, serde_json::to_vec(snapshot)?)?;

    let output = Command::new(&config.bun_bin)
        .arg(&config.export_script_path)
        .arg(&temp_public_root)
        .arg("--base-url")
        .arg(&public_base_url)
        .arg("--scope")
        .arg(if is_global_alias {
            "campus"
        } else {
            "workspace"
        })
        .arg("--snapshot")
        .arg(&temp_snapshot_path)
        .current_dir(repo_root)
        .output()
        .map_err(|error| {
            cleanup_publish_temp_artifacts(&temp_public_root, &temp_snapshot_path);
            command_error(&config.bun_bin, error)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        cleanup_publish_temp_artifacts(&temp_public_root, &temp_snapshot_path);
        return Err(PublishError::CommandFailed(detail));
    }

    let package_url = format!("{public_base_url}/published-scene-package.json");
    finalize_publish_export(
        &temp_dir,
        &final_dir,
        &workspace_root,
        &temp_alias_path,
        &temp_public_root,
        &temp_snapshot_path,
        package_url,
    )
}

fn finalize_publish_export(
    temp_dir: &Path,
    final_dir: &Path,
    workspace_root: &Path,
    temp_alias_path: &Path,
    temp_public_root: &Path,
    temp_snapshot_path: &Path,
    package_url: String,
) -> Result<PublishBuildOutput, PublishError> {
    let package = read_published_scene_package(&temp_dir.join("published-scene-package.json"))
        .map_err(|error| {
            cleanup_publish_temp_artifacts(temp_public_root, temp_snapshot_path);
            error
        })?;

    fs::rename(temp_dir, final_dir).map_err(|error| {
        cleanup_publish_temp_artifacts(temp_public_root, temp_snapshot_path);
        PublishError::Io(error)
    })?;

    let final_package_path = final_dir.join("published-scene-package.json");
    fs::copy(&final_package_path, temp_alias_path).map_err(|error| {
        rollback_publish_finalize(
            final_dir,
            temp_alias_path,
            temp_public_root,
            temp_snapshot_path,
        );
        PublishError::Io(error)
    })?;
    fs::rename(
        temp_alias_path,
        workspace_root.join("published-scene-package.json"),
    )
    .map_err(|error| {
        rollback_publish_finalize(
            final_dir,
            temp_alias_path,
            temp_public_root,
            temp_snapshot_path,
        );
        PublishError::Io(error)
    })?;
    cleanup_publish_temp_artifacts(temp_public_root, temp_snapshot_path);

    Ok(PublishBuildOutput {
        descriptor: PublishedSceneDescriptor {
            package_url,
            package_version: package.generated_at.clone(),
            scene_id: package.scene_id,
            generated_at: package.generated_at,
            static_asset_manifest_url: package.static_asset_manifest_url,
        },
        compiler_source: package
            .source
            .unwrap_or_else(|| "campus-layout".to_string()),
    })
}

fn read_published_scene_package(
    package_path: &Path,
) -> Result<PublishedScenePackageIndex, PublishError> {
    let payload = fs::read_to_string(package_path)?;
    Ok(serde_json::from_str::<PublishedScenePackageIndex>(
        &payload,
    )?)
}

fn validate_publish_workspace_slug(workspace_slug: &str) -> Result<(), PublishError> {
    if !is_path_safe_workspace_slug(workspace_slug) {
        return Err(PublishError::UnsafeWorkspaceSlug(
            workspace_slug.to_string(),
        ));
    }
    Ok(())
}

fn validate_publish_user_workspace_slug(workspace_slug: &str) -> Result<(), PublishError> {
    validate_publish_workspace_slug(workspace_slug)?;
    if is_reserved_workspace_slug(workspace_slug) {
        return Err(PublishError::UnsafeWorkspaceSlug(
            workspace_slug.to_string(),
        ));
    }
    Ok(())
}

fn publish_temp_suffix(workspace_slug: &str, version_slug: &str) -> String {
    format!("{workspace_slug}-{version_slug}-{}", Uuid::new_v4())
}

fn command_error(bun_bin: &str, error: io::Error) -> PublishError {
    if error.kind() == io::ErrorKind::NotFound {
        PublishError::CommandFailed(format!(
            "publish tool not found: {bun_bin}; install Bun or set PUBLISH_BUN_BIN to an executable"
        ))
    } else {
        PublishError::Io(error)
    }
}

fn cleanup_publish_temp_artifacts(temp_public_root: &Path, temp_snapshot_path: &Path) {
    let _ = fs::remove_dir_all(temp_public_root);
    let _ = fs::remove_file(temp_snapshot_path);
}

fn rollback_publish_finalize(
    final_dir: &Path,
    temp_alias_path: &Path,
    temp_public_root: &Path,
    temp_snapshot_path: &Path,
) {
    let _ = fs::remove_dir_all(final_dir);
    let _ = fs::remove_file(temp_alias_path);
    cleanup_publish_temp_artifacts(temp_public_root, temp_snapshot_path);
}

pub async fn record_publish_failure(
    store: &Store,
    snapshot: &WorkingSnapshot,
    error: &PublishError,
) -> Result<(), StoreError> {
    store
        .record_publish_failure(snapshot.scene_version, &error.to_string())
        .await
}

pub async fn record_publish_failure_for_workspace(
    store: &Store,
    workspace_id: &str,
    snapshot: &WorkingSnapshot,
    error: &PublishError,
) -> Result<(), StoreError> {
    store
        .workspace_record_publish_failure(workspace_id, snapshot.scene_version, &error.to_string())
        .await
}

fn current_publish_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn is_publish_lock_active(published: &PublishedStateRecord) -> bool {
    let Some(_) = published.active_publish_token else {
        return false;
    };

    let heartbeat_at = published
        .active_publish_heartbeat_at
        .or(published.active_publish_started_at)
        .unwrap_or_default();

    now_millis().saturating_sub(heartbeat_at) <= PUBLISH_LOCK_STALE_AFTER_MS
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        cleanup_publish_temp_artifacts, command_error, finalize_publish_export,
        load_publish_status, publish_lock_stale_after_ms, publish_temp_suffix,
        validate_publish_user_workspace_slug, validate_publish_workspace_slug, PublishError,
        PublishRuntime,
    };
    use crate::store::Store;
    use std::io;

    #[tokio::test]
    async fn publish_status_uses_store_lock_across_runtime_instances() {
        std::env::set_var("DATABASE_URL", "sqlite::memory:");
        let store = Store::from_env().await.unwrap();
        let runtime = PublishRuntime::default();

        assert!(store
            .try_begin_publish(
                "token-live",
                super::now_millis(),
                publish_lock_stale_after_ms()
            )
            .await
            .unwrap());

        let status = load_publish_status(&store, &runtime).await.unwrap();
        assert_eq!(status.status, crate::contracts::PublishState::Publishing);
    }

    #[tokio::test]
    async fn stale_store_lock_does_not_report_publishing() {
        std::env::set_var("DATABASE_URL", "sqlite::memory:");
        let store = Store::from_env().await.unwrap();
        let runtime = PublishRuntime::default();

        assert!(store
            .try_begin_publish("token-stale", 1, publish_lock_stale_after_ms())
            .await
            .unwrap());

        let status = load_publish_status(&store, &runtime).await.unwrap();
        assert_ne!(status.status, crate::contracts::PublishState::Publishing);
    }

    #[test]
    fn publish_temp_suffixes_are_unique_for_parallel_workspace_exports() {
        let first = publish_temp_suffix("workspace-a", "42-1779440000000");
        let second = publish_temp_suffix("workspace-a", "42-1779440000000");

        assert_ne!(first, second);
        assert!(first.starts_with("workspace-a-42-1779440000000-"));
        assert!(!first.contains('/'));
        assert!(!first.contains('\\'));
    }

    #[test]
    fn publish_rejects_workspace_slugs_that_escape_asset_paths() {
        assert!(validate_publish_workspace_slug("global").is_ok());
        assert!(validate_publish_workspace_slug("workspace-a").is_ok());
        assert!(validate_publish_workspace_slug("workspace_a").is_ok());
        assert!(validate_publish_workspace_slug("Workspace-A").is_err());
        assert!(validate_publish_workspace_slug("plant/../../escape").is_err());
        assert!(validate_publish_workspace_slug("plant%2Fescape").is_err());
        assert!(validate_publish_workspace_slug("workspace with space").is_err());
        assert!(validate_publish_workspace_slug("..").is_err());
    }

    #[test]
    fn workspace_publish_rejects_reserved_global_alias_slug() {
        assert!(validate_publish_user_workspace_slug("workspace-a").is_ok());
        assert!(validate_publish_user_workspace_slug("global").is_err());
        assert!(validate_publish_user_workspace_slug("Global").is_err());
    }

    #[test]
    fn missing_publish_tool_reports_actionable_configuration_error() {
        let error = command_error("missing-bun-for-test", io::ErrorKind::NotFound.into());

        assert!(error
            .to_string()
            .contains("install Bun or set PUBLISH_BUN_BIN"));
    }

    #[test]
    fn finalize_publish_export_validates_package_before_promoting_version_dir() {
        let root = std::env::temp_dir().join(format!(
            "publish-finalize-parse-test-{}",
            uuid::Uuid::new_v4()
        ));
        let temp_public_root = root.join(".tmp-publish-root-test");
        let temp_snapshot_path = root.join(".tmp-publish-snapshot-test.json");
        let temp_dir =
            temp_public_root.join("generated/published-static/workspaces/ws/versions/v1");
        let workspace_root = root.join("published/workspaces/ws");
        let final_dir = workspace_root.join("versions/v1");
        let temp_alias_path = workspace_root.join(".tmp-publish-alias-test.json");

        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("published-scene-package.json"), "{}").unwrap();
        std::fs::write(&temp_snapshot_path, "{}").unwrap();

        let error = finalize_publish_export(
            &temp_dir,
            &final_dir,
            &workspace_root,
            &temp_alias_path,
            &temp_public_root,
            &temp_snapshot_path,
            "/generated/published-static/workspaces/ws/versions/v1/published-scene-package.json"
                .to_string(),
        )
        .unwrap_err();

        assert!(matches!(error, PublishError::Parse(_)));
        assert!(!final_dir.exists());
        assert!(!temp_public_root.exists());
        assert!(!temp_snapshot_path.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn finalize_publish_export_rolls_back_promoted_dir_when_alias_copy_fails() {
        let root = std::env::temp_dir().join(format!(
            "publish-finalize-copy-test-{}",
            uuid::Uuid::new_v4()
        ));
        let temp_public_root = root.join(".tmp-publish-root-test");
        let temp_snapshot_path = root.join(".tmp-publish-snapshot-test.json");
        let temp_dir =
            temp_public_root.join("generated/published-static/workspaces/ws/versions/v1");
        let final_dir = root.join("versions/v1");
        let workspace_root = root.join("workspace-root-file");
        let temp_alias_path = workspace_root.join(".tmp-publish-alias-test.json");

        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::create_dir_all(final_dir.parent().unwrap()).unwrap();
        std::fs::write(&workspace_root, "not a directory").unwrap();
        write_publish_package(&temp_dir);
        std::fs::write(&temp_snapshot_path, "{}").unwrap();

        let error = finalize_publish_export(
            &temp_dir,
            &final_dir,
            &workspace_root,
            &temp_alias_path,
            &temp_public_root,
            &temp_snapshot_path,
            "/generated/published-static/workspaces/ws/versions/v1/published-scene-package.json"
                .to_string(),
        )
        .unwrap_err();

        assert!(matches!(error, PublishError::Io(_)));
        assert!(!final_dir.exists());
        assert!(!temp_public_root.exists());
        assert!(!temp_snapshot_path.exists());
        assert!(!temp_alias_path.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cleanup_publish_temp_artifacts_removes_snapshot_and_root() {
        let root =
            std::env::temp_dir().join(format!("publish-cleanup-test-{}", uuid::Uuid::new_v4()));
        let temp_public_root = root.join(".tmp-publish-root-test");
        let temp_snapshot_path = root.join(".tmp-publish-snapshot-test.json");

        std::fs::create_dir_all(temp_public_root.join("nested")).unwrap();
        std::fs::write(temp_public_root.join("nested/asset.json"), "{}").unwrap();
        std::fs::write(&temp_snapshot_path, "{}").unwrap();

        cleanup_publish_temp_artifacts(&temp_public_root, &temp_snapshot_path);

        assert!(!temp_public_root.exists());
        assert!(!temp_snapshot_path.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    fn write_publish_package(temp_dir: &std::path::Path) {
        std::fs::write(
            temp_dir.join("published-scene-package.json"),
            r#"{
                "sceneId": "scene",
                "generatedAt": "2026-05-22T09:00:00.000Z",
                "staticAssetManifestUrl": "/generated/published-static/workspaces/ws/versions/v1/chunk-manifest.json",
                "source": "workspace-snapshot"
            }"#,
        )
        .unwrap();
    }
}
