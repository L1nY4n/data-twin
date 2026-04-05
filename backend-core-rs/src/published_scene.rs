use std::{env, fs, path::PathBuf};

use serde::Deserialize;
use tracing::warn;

use crate::contracts::PublishedSceneDescriptor;

const DEFAULT_PUBLISHED_SCENE_PACKAGE_URL: &str =
    "/generated/published-static/published-scene-package.json";
const DEFAULT_PUBLISHED_SCENE_PACKAGE_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../public/generated/published-static/published-scene-package.json"
);

#[derive(Debug)]
enum PublishedSceneLoadError {
    Read(std::io::Error),
    Parse(serde_json::Error),
}

impl std::fmt::Display for PublishedSceneLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Read(error) => write!(f, "failed to read published scene package: {error}"),
            Self::Parse(error) => write!(f, "failed to parse published scene package: {error}"),
        }
    }
}

impl std::error::Error for PublishedSceneLoadError {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishedScenePackageIndex {
    scene_id: String,
    generated_at: String,
    static_asset_manifest_url: String,
}

pub fn load_published_scene_descriptor() -> Option<PublishedSceneDescriptor> {
    match read_published_scene_descriptor() {
        Ok(descriptor) => descriptor,
        Err(error) => {
            warn!(%error, "failed to load published scene runtime descriptor");
            None
        }
    }
}

fn read_published_scene_descriptor(
) -> Result<Option<PublishedSceneDescriptor>, PublishedSceneLoadError> {
    let package_path = resolve_published_scene_package_path();
    if !package_path.exists() {
        return Ok(None);
    }

    let payload = fs::read_to_string(package_path).map_err(PublishedSceneLoadError::Read)?;
    let package = serde_json::from_str::<PublishedScenePackageIndex>(&payload)
        .map_err(PublishedSceneLoadError::Parse)?;

    Ok(Some(PublishedSceneDescriptor {
        package_url: resolve_published_scene_package_url(),
        package_version: package.generated_at.clone(),
        scene_id: package.scene_id,
        generated_at: package.generated_at,
        static_asset_manifest_url: package.static_asset_manifest_url,
    }))
}

fn resolve_published_scene_package_path() -> PathBuf {
    env::var("PUBLISHED_SCENE_PACKAGE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_PUBLISHED_SCENE_PACKAGE_PATH))
}

fn resolve_published_scene_package_url() -> String {
    env::var("PUBLISHED_SCENE_PACKAGE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_PUBLISHED_SCENE_PACKAGE_URL.to_string())
}
