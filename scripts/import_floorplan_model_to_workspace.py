#!/usr/bin/env python3
"""Attach a DXF-generated GLB model to a workspace as a dynamic entity archetype."""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

DEFAULT_BACKEND_URL = "http://127.0.0.1:4000"
DEFAULT_DB_PATH = Path("backend-core-rs/data/digital-twin.db")
DEFAULT_OUTPUT_DIR = Path("public/generated/floorplans/jiazhuang-office")
DEFAULT_WORKSPACE_ID = "jiazhuang-office"
DEFAULT_CATEGORY_ID = "category-building-model"
DEFAULT_CATEGORY_KEY = "building-model"
DEFAULT_ARCHETYPE_ID = "archetype-jiazhuang-office-model"
DEFAULT_ARCHETYPE_KEY = "jiazhuang-office-model"
DEFAULT_ENTITY_ID = "dynamic-jiazhuang-office-model"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--workspace-id", default=DEFAULT_WORKSPACE_ID)
    parser.add_argument("--workspace-name", default="加庄办公室")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dxf", type=Path, help="Optional DXF path to regenerate the GLB first")
    parser.add_argument(
        "--import-script",
        type=Path,
        default=Path("scripts/import_dxf_building_shell.py"),
        help="DXF to GLB import script",
    )
    return parser.parse_args()


def now_ms() -> int:
    return int(time.time() * 1000)


def round6(value: float) -> float:
    return round(value, 6)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def json_request(
    url: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> Any:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        if not body:
            return None
        return json.loads(body)


def multipart_upload(url: str, file_path: Path) -> dict[str, Any]:
    boundary = f"----CodexBoundary{uuid.uuid4().hex}"
    file_bytes = file_path.read_bytes()
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode()
    )
    body.extend(b"Content-Type: model/gltf-binary\r\n\r\n")
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def regenerate_glb(args: argparse.Namespace) -> tuple[Path, Path]:
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if args.dxf is not None:
        command = [
            sys.executable,
            str(args.import_script.resolve()),
            "--input",
            str(args.dxf.resolve()),
            "--output-dir",
            str(output_dir),
        ]
        subprocess.run(command, check=True)
    glb_path = output_dir / "scene.glb"
    metadata_path = output_dir / "scene-metadata.json"
    if not glb_path.exists():
        raise SystemExit(f"GLB not found: {glb_path}")
    if not metadata_path.exists():
        raise SystemExit(f"scene metadata not found: {metadata_path}")
    return glb_path, metadata_path


def ensure_category(base_url: str) -> dict[str, Any]:
    categories = json_request(f"{base_url}/api/v1/admin/entity-categories") or []
    for category in categories:
        if category.get("id") == DEFAULT_CATEGORY_ID or category.get("key") == DEFAULT_CATEGORY_KEY:
            return category
    payload = {
        "id": DEFAULT_CATEGORY_ID,
        "key": DEFAULT_CATEGORY_KEY,
        "displayName": "建筑模型",
        "description": "DXF / CAD 导入的建筑整模",
        "icon": "building",
        "color": "#60a5fa",
        "sortOrder": 100,
        "createdAt": 0,
        "updatedAt": 0,
    }
    return json_request(f"{base_url}/api/v1/admin/entity-categories", method="POST", payload=payload)


def build_archetype_payload(
    category: dict[str, Any],
    model_asset: dict[str, Any],
    metadata: dict[str, Any],
) -> dict[str, Any]:
    final_bbox = metadata["final_bbox"]
    bounds = {
        "width": round6(float(final_bbox["max_x"]) - float(final_bbox["min_x"])),
        "height": round6(float(final_bbox["max_y"]) - float(final_bbox["min_y"])),
        "depth": round6(float(final_bbox["max_z"]) - float(final_bbox["min_z"])),
    }
    model_asset = dict(model_asset)
    calibration = dict(model_asset["calibration"])
    calibration["bounds"] = bounds
    calibration["thumbnailUrl"] = None
    model_asset["calibration"] = calibration

    return {
        "id": DEFAULT_ARCHETYPE_ID,
        "key": DEFAULT_ARCHETYPE_KEY,
        "categoryId": category["id"],
        "categoryKey": category["key"],
        "displayName": "加庄办公室整模",
        "description": "由 DXF 图纸生成的办公室 GLB 整体模型",
        "capabilities": {
            "hasModel": True,
            "movable": True,
            "bindable": False,
            "statusBearing": False,
            "detailFieldsVisible": True,
        },
        "model": model_asset,
        "metadata": {
            "importSource": "dxf-floorplan",
            "workspaceId": DEFAULT_WORKSPACE_ID,
            "floorplanModel": True,
            "outputGlb": metadata.get("output_glb"),
        },
        "createdAt": 0,
        "updatedAt": 0,
    }


def ensure_archetype(base_url: str, category: dict[str, Any], model_asset: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    payload = build_archetype_payload(category, model_asset, metadata)
    archetypes = json_request(f"{base_url}/api/v1/admin/entity-archetypes") or []
    for archetype in archetypes:
        if archetype.get("id") == DEFAULT_ARCHETYPE_ID or archetype.get("key") == DEFAULT_ARCHETYPE_KEY:
            return json_request(
                f"{base_url}/api/v1/admin/entity-archetypes/{archetype['id']}",
                method="PUT",
                payload=payload,
            )
    return json_request(f"{base_url}/api/v1/admin/entity-archetypes", method="POST", payload=payload)


def create_or_update_model_entity(base_url: str, workspace_id: str, archetype: dict[str, Any]) -> dict[str, Any]:
    bootstrap = json_request(f"{base_url}/api/v1/workspaces/{workspace_id}/editor/bootstrap")
    entities = bootstrap.get("entities", [])
    now = now_ms()
    payload = {
        "type": "dynamic",
        "id": DEFAULT_ENTITY_ID,
        "name": archetype["displayName"],
        "position": {"x": 0.0, "y": 0.0, "z": 0.0},
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
        "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
        "status": "active",
        "visible": True,
        "metadata": {
            "archetypeDisplayName": archetype["displayName"],
            "workspaceRole": "primary-floorplan-model",
        },
        "createdAt": now,
        "updatedAt": now,
        "archetypeId": archetype["id"],
        "categoryKey": archetype["categoryKey"],
        "attributes": {
            "archetypeKey": archetype["key"],
        },
        "displayAttributes": {
            "archetype": archetype["displayName"],
            "category": archetype["categoryKey"],
        },
    }
    exists = any(entity.get("id") == DEFAULT_ENTITY_ID for entity in entities)
    if exists:
        return json_request(
            f"{base_url}/api/v1/workspaces/{workspace_id}/entities/{DEFAULT_ENTITY_ID}",
            method="PUT",
            payload=payload,
        )
    return json_request(
        f"{base_url}/api/v1/workspaces/{workspace_id}/entities",
        method="POST",
        payload=payload,
    )


def sync_workspace_to_model_only(
    db_path: Path,
    workspace_id: str,
    workspace_name: str,
    metadata: dict[str, Any],
    dynamic_entity_id: str,
) -> tuple[int, int]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT state_data FROM workspace_states WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        if row is None:
            raise SystemExit(f"workspace state not found: {workspace_id}")
        state = json.loads(row["state_data"])
        entities_map = state.get("entities", {})
        if not isinstance(entities_map, dict):
            raise SystemExit("workspace entities is not a map")
        if dynamic_entity_id not in entities_map:
            raise SystemExit(f"dynamic entity {dynamic_entity_id} missing from workspace")

        final_bbox = metadata["final_bbox"]
        width = float(final_bbox["max_x"]) - float(final_bbox["min_x"])
        depth = float(final_bbox["max_z"]) - float(final_bbox["min_z"])
        height = float(final_bbox["max_y"]) - float(final_bbox["min_y"])
        max_span = max(width, depth, 12.0)

        scene_config = dict(state["sceneConfig"])
        scene_config["id"] = workspace_id
        scene_config["name"] = workspace_name
        scene_config["gridSize"] = max(60, int(((max_span + 20.0) // 20 + 1) * 20))
        scene_config["gridDivisions"] = max(30, int(scene_config["gridSize"] / 2))
        scene_config["cameraPosition"] = {
            "x": round6(max_span * 0.66),
            "y": round6(max(16.0, height * 4.0 + 8.0)),
            "z": round6(max_span * 0.9),
        }
        scene_config["cameraTarget"] = {"x": 0.0, "y": 0.0, "z": 0.0}

        timestamp = now_ms()
        state["sceneVersion"] = int(state.get("sceneVersion", 0)) + 1
        state["sceneConfig"] = scene_config
        state["staticAssets"] = {}
        state["publishedSceneVersion"] = state["sceneVersion"]
        state["publishedSceneConfig"] = scene_config
        state["publishedEntities"] = list(entities_map.values())
        state["publishedStaticAssets"] = []
        state["publishedScene"] = None
        state["publishedCompilerSource"] = "dxf-floorplan-model"
        state["publishedUpdatedAt"] = timestamp
        state["lastPublishedAt"] = timestamp
        state["lastPublishedVersion"] = f"dxf-model-{timestamp}"
        state["lastPublishError"] = None
        state["lastFailureSceneVersion"] = None
        state["lastFailureAt"] = None
        audit_events = state.get("auditEvents", [])
        if isinstance(audit_events, list):
            audit_events.append(
                {
                    "action": "workspace.floorplan_model.activate",
                    "resourceType": "workspace",
                    "resourceId": workspace_id,
                    "actor": "system",
                    "timestamp": timestamp,
                    "details": {
                        "dynamicEntityId": dynamic_entity_id,
                        "clearedStaticAssets": True,
                    },
                }
            )
            state["auditEvents"] = audit_events

        with conn:
            conn.execute(
                "UPDATE workspace_states SET state_data = ?, updated_at = ? WHERE workspace_id = ?",
                (
                    json.dumps(state, ensure_ascii=False, separators=(",", ":")),
                    timestamp,
                    workspace_id,
                ),
            )
        return int(state["sceneVersion"]), len(state["publishedEntities"])
    finally:
        conn.close()


def main() -> int:
    args = parse_args()
    base_url = args.backend_url.rstrip("/")
    glb_path, metadata_path = regenerate_glb(args)
    metadata = load_json(metadata_path)
    model_asset = multipart_upload(f"{base_url}/api/v1/admin/model-assets/upload", glb_path)
    category = ensure_category(base_url)
    archetype = ensure_archetype(base_url, category, model_asset, metadata)
    entity = create_or_update_model_entity(base_url, args.workspace_id, archetype)
    scene_version, published_entities = sync_workspace_to_model_only(
        args.db_path.resolve(),
        args.workspace_id,
        args.workspace_name,
        metadata,
        entity["id"],
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "workspaceId": args.workspace_id,
                "modelAssetUrl": archetype["model"]["assetUrl"],
                "archetypeId": archetype["id"],
                "entityId": entity["id"],
                "sceneVersion": scene_version,
                "publishedEntities": published_entities,
                "glbPath": str(glb_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
