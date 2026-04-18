#!/usr/bin/env python3
"""Import DXF-derived building-shell assets into the project's workspace database.

This script keeps the workflow database-native:

1. Optionally regenerate `static-assets.json` from a DXF without GLB output.
2. Create or update a dedicated workspace record in the current project database.
3. Replace that workspace's static assets with the imported building-shell assets.
4. Mirror the imported assets into the published workspace state so runtime bootstrap
   can read them immediately.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path("backend-core-rs/data/digital-twin.db")
DEFAULT_BACKEND_URL = "http://127.0.0.1:4000"
DEFAULT_WORKSPACE_ID = "jiazhuang-office"
DEFAULT_WORKSPACE_SLUG = "jiazhuang-office"
DEFAULT_WORKSPACE_NAME = "加庄办公室"
DEFAULT_WORKSPACE_DESCRIPTION = "Imported office floorplan workspace from DXF"
DEFAULT_OUTPUT_DIR = Path("public/generated/floorplans/jiazhuang-office")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--workspace-id", default=DEFAULT_WORKSPACE_ID)
    parser.add_argument("--workspace-slug", default=DEFAULT_WORKSPACE_SLUG)
    parser.add_argument("--workspace-name", default=DEFAULT_WORKSPACE_NAME)
    parser.add_argument("--workspace-description", default=DEFAULT_WORKSPACE_DESCRIPTION)
    parser.add_argument("--static-assets", type=Path, default=DEFAULT_OUTPUT_DIR / "static-assets.json")
    parser.add_argument("--dxf", type=Path, help="Optional DXF path to regenerate static-assets.json first")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory used when regenerating static-assets.json from DXF",
    )
    parser.add_argument(
        "--import-script",
        type=Path,
        default=Path("scripts/import_dxf_building_shell.py"),
        help="DXF to static-assets import script",
    )
    return parser.parse_args()


def now_ms() -> int:
    return int(time.time() * 1000)


def round6(value: float) -> float:
    return round(value, 6)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...]) -> None:
    conn.execute(sql, params)


def regenerate_static_assets(args: argparse.Namespace) -> Path:
    if args.dxf is None:
        return args.static_assets.resolve()

    output_dir = args.output_dir.resolve()
    command = [
        sys.executable,
        str(args.import_script.resolve()),
        "--input",
        str(args.dxf.resolve()),
        "--output-dir",
        str(output_dir),
        "--skip-glb",
    ]
    subprocess.run(command, check=True)
    return (output_dir / "static-assets.json").resolve()


def collect_scene_points(assets: list[dict[str, Any]]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for asset in assets:
        position = asset.get("position", {})
        x = float(position.get("x", 0.0))
        z = float(position.get("z", 0.0))
        points.append((x, z))

        metadata = asset.get("metadata", {})
        wall_start = metadata.get("wallStart")
        wall_end = metadata.get("wallEnd")
        if isinstance(wall_start, dict) and isinstance(wall_end, dict):
            points.append((float(wall_start.get("x", x)), float(wall_start.get("z", z))))
            points.append((float(wall_end.get("x", x)), float(wall_end.get("z", z))))
    return points


def build_scene_config(
    workspace_id: str,
    workspace_name: str,
    assets: list[dict[str, Any]],
    existing_scene_config: dict[str, Any] | None,
) -> dict[str, Any]:
    base = {
        "id": workspace_id,
        "name": workspace_name,
        "gridSize": 120,
        "gridDivisions": 60,
        "backgroundColor": "#0a0a0f",
        "ambientLightIntensity": 0.52,
        "showAxes": False,
        "showGrid": True,
        "cameraPosition": {"x": 18.0, "y": 18.0, "z": 24.0},
        "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0},
    }
    if isinstance(existing_scene_config, dict):
        base.update(existing_scene_config)
        base["id"] = workspace_id
        base["name"] = workspace_name

    points = collect_scene_points(assets)
    if not points:
        return base

    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_z = min(point[1] for point in points)
    max_z = max(point[1] for point in points)
    span_x = max_x - min_x
    span_z = max_z - min_z
    max_span = max(span_x, span_z, 12.0)
    center_x = (min_x + max_x) * 0.5
    center_z = (min_z + max_z) * 0.5

    grid_size = int(math.ceil((max_span + 20.0) / 20.0) * 20.0)
    grid_divisions = max(20, int(grid_size / 2))
    camera_y = max(16.0, max_span * 0.9)
    camera_x = center_x + max_span * 0.7
    camera_z = center_z + max_span * 0.95

    base["gridSize"] = grid_size
    base["gridDivisions"] = grid_divisions
    base["cameraPosition"] = {
        "x": round6(camera_x),
        "y": round6(camera_y),
        "z": round6(camera_z),
    }
    base["cameraTarget"] = {
        "x": round6(center_x),
        "y": 0.0,
        "z": round6(center_z),
    }
    return base


def build_workspace_record(
    existing_workspace: dict[str, Any] | None,
    workspace_id: str,
    workspace_slug: str,
    workspace_name: str,
    workspace_description: str,
    timestamp_ms: int,
) -> dict[str, Any]:
    if existing_workspace:
        created_at = int(existing_workspace.get("createdAt", timestamp_ms))
        is_homepage = bool(existing_workspace.get("isHomepage", False))
    else:
        created_at = timestamp_ms
        is_homepage = False
    return {
        "id": workspace_id,
        "slug": workspace_slug,
        "name": workspace_name,
        "description": workspace_description,
        "isHomepage": is_homepage,
        "createdAt": created_at,
        "updatedAt": timestamp_ms,
    }


def build_workspace_state(
    existing_state: dict[str, Any] | None,
    workspace_id: str,
    workspace_name: str,
    timestamp_ms: int,
) -> dict[str, Any]:
    existing_scene_config = existing_state.get("sceneConfig") if isinstance(existing_state, dict) else None
    version = (
        int(existing_state.get("sceneVersion", 0)) + 1
        if isinstance(existing_state, dict)
        else 1
    )

    scene_config = build_scene_config(workspace_id, workspace_name, [], existing_scene_config)

    def normalize_rule_map(raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, list):
            return {
                str(item["id"]): item
                for item in raw
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
        return {}

    def normalize_connector_map(raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, list):
            return {
                str(item["id"]): item
                for item in raw
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
        return {}

    def normalize_binding_map(raw: Any) -> dict[str, Any]:
        return raw if isinstance(raw, dict) else {}

    if isinstance(existing_state, dict):
        rules = normalize_rule_map(existing_state.get("rules", {}))
        connectors = normalize_connector_map(existing_state.get("connectors", {}))
        bindings = normalize_binding_map(existing_state.get("bindings", {}))
        alarms = existing_state.get("alarms", [])
        audit_events = existing_state.get("auditEvents", [])
    else:
        rules = {}
        connectors = {}
        bindings = {}
        alarms = []
        audit_events = []

    next_audit_events = list(audit_events)
    next_audit_events.append(
        {
            "action": "static_asset.import",
            "resourceType": "workspace",
            "resourceId": workspace_id,
            "actor": "system",
            "timestamp": timestamp_ms,
            "details": {
                "importedStaticAssetCount": 0,
                "importSource": "dxf-floorplan",
            },
        }
    )

    return {
        "sceneVersion": version,
        "sceneConfig": scene_config,
        "entities": {},
        "staticAssets": {},
        "publishedSceneVersion": version,
        "publishedSceneConfig": scene_config,
        "publishedEntities": [],
        "publishedStaticAssets": [],
        "publishedScene": None,
        "publishedCompilerSource": "dxf-db-import",
        "publishedUpdatedAt": timestamp_ms,
        "activePublishToken": None,
        "activePublishStartedAt": None,
        "activePublishHeartbeatAt": None,
        "lastPublishedAt": None,
        "lastPublishedVersion": None,
        "lastPublishError": None,
        "lastFailureSceneVersion": None,
        "lastFailureAt": None,
        "rules": rules,
        "alarms": alarms,
        "connectors": connectors,
        "bindings": bindings,
        "auditEvents": next_audit_events,
    }


def fetch_workspace_row(conn: sqlite3.Connection, workspace_id: str) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        "SELECT id, slug, is_homepage, workspace_data, created_at, updated_at FROM workspaces WHERE id = ?",
        (workspace_id,),
    ).fetchone()


def fetch_workspace_state_row(conn: sqlite3.Connection, workspace_id: str) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        "SELECT workspace_id, state_data, created_at, updated_at FROM workspace_states WHERE workspace_id = ?",
        (workspace_id,),
    ).fetchone()


def ensure_workspace_slug_available(conn: sqlite3.Connection, workspace_id: str, workspace_slug: str) -> None:
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id FROM workspaces WHERE slug = ? AND id <> ?",
        (workspace_slug, workspace_id),
    ).fetchone()
    if row is not None:
        raise SystemExit(
            f"workspace slug '{workspace_slug}' already exists on workspace '{row['id']}'"
        )


def persist_workspace(
    conn: sqlite3.Connection,
    workspace_record: dict[str, Any],
    state: dict[str, Any],
) -> None:
    workspace_id = workspace_record["id"]
    slug = workspace_record["slug"]
    is_homepage = 1 if workspace_record.get("isHomepage") else 0
    workspace_json = json.dumps(workspace_record, ensure_ascii=False, separators=(",", ":"))
    state_json = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    timestamp_ms = int(workspace_record["updatedAt"])

    existing_workspace = fetch_workspace_row(conn, workspace_id)
    existing_state = fetch_workspace_state_row(conn, workspace_id)

    if existing_workspace is None:
        save_json(
            conn,
            """
            INSERT INTO workspaces (id, slug, is_homepage, workspace_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                workspace_id,
                slug,
                is_homepage,
                workspace_json,
                int(workspace_record["createdAt"]),
                timestamp_ms,
            ),
        )
    else:
        save_json(
            conn,
            """
            UPDATE workspaces
            SET slug = ?, is_homepage = ?, workspace_data = ?, updated_at = ?
            WHERE id = ?
            """,
            (slug, is_homepage, workspace_json, timestamp_ms, workspace_id),
        )

    if existing_state is None:
        save_json(
            conn,
            """
            INSERT INTO workspace_states (workspace_id, state_data, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (workspace_id, state_json, timestamp_ms, timestamp_ms),
        )
    else:
        save_json(
            conn,
            """
            UPDATE workspace_states
            SET state_data = ?, updated_at = ?
            WHERE workspace_id = ?
            """,
            (state_json, timestamp_ms, workspace_id),
        )


def json_request(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        if not body:
            return {}
        return json.loads(body)


def upload_static_assets(backend_url: str, workspace_id: str, assets: list[dict[str, Any]]) -> None:
    base = backend_url.rstrip("/")
    for index, asset in enumerate(assets, start=1):
        url = f"{base}/api/v1/workspaces/{workspace_id}/static-assets"
        try:
            json_request(url, method="POST", payload=asset)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise SystemExit(
                f"failed to create static asset {asset.get('id')} at item {index}/{len(assets)}: "
                f"HTTP {error.code} {body}"
            ) from error


def sync_published_workspace_state(
    conn: sqlite3.Connection,
    workspace_id: str,
    workspace_name: str,
    timestamp_ms: int,
) -> tuple[int, int]:
    row = fetch_workspace_state_row(conn, workspace_id)
    if row is None:
        raise SystemExit(f"workspace state missing after asset import: {workspace_id}")

    state = json.loads(row["state_data"])
    static_assets_map = state.get("staticAssets", {})
    if not isinstance(static_assets_map, dict):
        raise SystemExit("workspace staticAssets is not a map after asset import")

    static_assets = list(static_assets_map.values())
    scene_config = build_scene_config(workspace_id, workspace_name, static_assets, state.get("sceneConfig"))
    state["sceneConfig"] = scene_config
    state["publishedSceneVersion"] = state["sceneVersion"]
    state["publishedSceneConfig"] = scene_config
    state["publishedEntities"] = list(state.get("entities", {}).values()) if isinstance(state.get("entities"), dict) else []
    state["publishedStaticAssets"] = static_assets
    state["publishedScene"] = None
    state["publishedCompilerSource"] = "dxf-db-import"
    state["publishedUpdatedAt"] = timestamp_ms
    state["lastPublishedAt"] = timestamp_ms
    state["lastPublishedVersion"] = f"dxf-import-{timestamp_ms}"
    state["lastPublishError"] = None
    state["lastFailureSceneVersion"] = None
    state["lastFailureAt"] = None

    audit_events = state.get("auditEvents", [])
    if isinstance(audit_events, list):
        audit_events.append(
            {
                "action": "static_asset.publish_sync",
                "resourceType": "workspace",
                "resourceId": workspace_id,
                "actor": "system",
                "timestamp": timestamp_ms,
                "details": {
                    "publishedStaticAssetCount": len(static_assets),
                },
            }
        )
        state["auditEvents"] = audit_events

    save_json(
        conn,
        """
        UPDATE workspace_states
        SET state_data = ?, updated_at = ?
        WHERE workspace_id = ?
        """,
        (
            json.dumps(state, ensure_ascii=False, separators=(",", ":")),
            timestamp_ms,
            workspace_id,
        ),
    )
    return int(state["sceneVersion"]), len(static_assets)


def main() -> int:
    args = parse_args()
    static_assets_path = regenerate_static_assets(args)
    assets = load_json(static_assets_path)
    if not isinstance(assets, list) or not assets:
        raise SystemExit(f"no static assets found in {static_assets_path}")

    db_path = args.db_path.resolve()
    if not db_path.exists():
        raise SystemExit(f"database not found: {db_path}")

    timestamp_ms = now_ms()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_workspace_slug_available(conn, args.workspace_id, args.workspace_slug)

        existing_workspace_row = fetch_workspace_row(conn, args.workspace_id)
        existing_state_row = fetch_workspace_state_row(conn, args.workspace_id)
        existing_workspace = (
            json.loads(existing_workspace_row["workspace_data"])
            if existing_workspace_row is not None
            else None
        )
        existing_state = (
            json.loads(existing_state_row["state_data"])
            if existing_state_row is not None
            else None
        )

        workspace_record = build_workspace_record(
            existing_workspace,
            args.workspace_id,
            args.workspace_slug,
            args.workspace_name,
            args.workspace_description,
            timestamp_ms,
        )
        state = build_workspace_state(
            existing_state,
            args.workspace_id,
            args.workspace_name,
            timestamp_ms,
        )

        with conn:
            persist_workspace(conn, workspace_record, state)
        upload_static_assets(args.backend_url, args.workspace_id, assets)
        with conn:
            final_scene_version, imported_count = sync_published_workspace_state(
                conn,
                args.workspace_id,
                args.workspace_name,
                now_ms(),
            )

        print(
            json.dumps(
                {
                    "status": "ok",
                    "workspaceId": args.workspace_id,
                    "workspaceSlug": args.workspace_slug,
                    "assetCount": imported_count,
                    "sceneVersion": final_scene_version,
                    "dbPath": str(db_path),
                    "staticAssetsPath": str(static_assets_path),
                },
                ensure_ascii=False,
            )
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
