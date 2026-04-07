use std::{
    env, fs,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use tokio::task;

use crate::{
    contracts::{PublishState, PublishStatusResponse, PublishedSceneDescriptor},
    store::{PublishedStateRecord, Store, StoreError, WorkingSnapshot},
};

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
    CommandFailed(String),
}

impl std::fmt::Display for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Store(error) => write!(f, "{error}"),
            Self::Join(error) => write!(f, "publish task failed to join: {error}"),
            Self::Io(error) => write!(f, "publish filesystem error: {error}"),
            Self::Parse(error) => write!(f, "publish artifact parse error: {error}"),
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

    let status = if runtime.is_publishing() {
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
        last_published_at: published.last_published_at,
        last_published_version: published.last_published_version,
        last_error: published.last_publish_error,
        published_scene: published.published_scene,
        compiler_source: published.compiler_source,
    })
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
        run_publish_export(&publish_config, &snapshot_for_export, &version_slug)
    })
    .await
    .map_err(|error| PublishError::Join(error.to_string()))??;

    store
        .promote_working_snapshot(snapshot, Some(build.descriptor), &build.compiler_source)
        .await
        .map_err(PublishError::Store)
}

fn run_publish_export(
    config: &PublishConfig,
    snapshot: &WorkingSnapshot,
    version_slug: &str,
) -> Result<PublishBuildOutput, PublishError> {
    let repo_root = &config.repo_root;
    let generated_root = &config.generated_root;
    let versions_root = generated_root.join("versions");
    let final_dir = versions_root.join(version_slug);
    let temp_public_root = generated_root.join(format!(".tmp-publish-root-{version_slug}"));
    let temp_snapshot_path =
        generated_root.join(format!(".tmp-publish-snapshot-{version_slug}.json"));
    let public_base_url = format!(
        "{}/versions/{version_slug}",
        config.public_base_url_root.trim_end_matches('/')
    );
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
        .arg("--snapshot")
        .arg(&temp_snapshot_path)
        .current_dir(repo_root)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        let _ = fs::remove_dir_all(&temp_public_root);
        let _ = fs::remove_file(&temp_snapshot_path);
        return Err(PublishError::CommandFailed(detail));
    }

    fs::rename(&temp_dir, &final_dir)?;
    fs::copy(
        final_dir.join("published-scene-package.json"),
        generated_root.join("published-scene-package.json"),
    )?;
    let _ = fs::remove_dir_all(&temp_public_root);
    let _ = fs::remove_file(&temp_snapshot_path);

    let package_path = final_dir.join("published-scene-package.json");
    let package_url = format!("{public_base_url}/published-scene-package.json");
    let payload = fs::read_to_string(&package_path)?;
    let package = serde_json::from_str::<PublishedScenePackageIndex>(&payload)?;

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

pub async fn record_publish_failure(
    store: &Store,
    snapshot: &WorkingSnapshot,
    error: &PublishError,
) -> Result<(), StoreError> {
    store
        .record_publish_failure(snapshot.scene_version, &error.to_string())
        .await
}

fn current_publish_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
