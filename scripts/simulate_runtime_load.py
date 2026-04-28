#!/usr/bin/env python3

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_BASE_URL = "http://localhost:4000"
DEFAULT_TOKEN = os.environ.get("RUNTIME_INGEST_TOKEN", "")
DEFAULT_ADMIN_TOKEN = os.environ.get("BACKEND_ADMIN_API_TOKEN", "")
MAX_BACKEND_BATCH_SIZE = 512


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Push dense moving-entity runtime load through the backend ingest endpoint."
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--workspace-id", default="")
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    parser.add_argument("--admin-token", default=DEFAULT_ADMIN_TOKEN)
    parser.add_argument("--source", default="")
    parser.add_argument("--moving-count", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=MAX_BACKEND_BATCH_SIZE)
    parser.add_argument("--interval", type=float, default=0.25)
    parser.add_argument("--iterations", type=int, default=0)
    parser.add_argument("--seed", type=int, default=20260426)
    parser.add_argument(
        "--provision-missing",
        action="store_true",
        help="Create synthetic person/vehicle entities through the admin API when bootstrap has fewer actors than --moving-count.",
    )
    return parser


def request_json(url: str, token: str = "") -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["x-runtime-ingest-token"] = token
    request = urllib.request.Request(url=url, headers=headers, method="GET")
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json(url: str, body: dict, token: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-runtime-ingest-token"] = token
    request = urllib.request.Request(
        url=url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def post_admin_json(url: str, body: dict, admin_token: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if admin_token:
        headers["x-admin-api-token"] = admin_token
    request = urllib.request.Request(
        url=url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def bootstrap_url(base_url: str, workspace_id: str) -> str:
    root = base_url.rstrip("/")
    if workspace_id:
        encoded = urllib.parse.quote(workspace_id, safe="")
        return f"{root}/api/v1/workspaces/{encoded}/runtime/bootstrap"
    return f"{root}/api/v1/site/bootstrap"


def ingest_url(base_url: str, workspace_id: str) -> str:
    root = base_url.rstrip("/")
    if workspace_id:
        encoded = urllib.parse.quote(workspace_id, safe="")
        return f"{root}/api/v1/workspaces/{encoded}/runtime/ingest"
    return f"{root}/api/v1/runtime/ingest"


def admin_entities_url(base_url: str, workspace_id: str) -> str:
    root = base_url.rstrip("/")
    if workspace_id:
        encoded = urllib.parse.quote(workspace_id, safe="")
        return f"{root}/api/v1/workspaces/{encoded}/entities"
    return f"{root}/api/v1/admin/entities"


def pick_moving_entities(payload: dict, moving_count: int) -> list[dict]:
    entities = payload.get("entities", [])
    moving = [
        entity
        for entity in entities
        if entity.get("visible", True) and entity.get("type") in ("person", "vehicle")
    ]
    if not moving:
        raise RuntimeError("bootstrap payload does not contain visible person or vehicle entities")
    return moving[: max(1, moving_count)]


def generated_position(index: int) -> dict:
    lane = index % 20
    row = index // 20
    return {
        "x": round(-120.0 + lane * 12.0, 3),
        "y": 0.0,
        "z": round(-80.0 + (row % 20) * 10.0, 3),
    }


def synthetic_person(index: int) -> dict:
    return {
        "type": "person",
        "id": f"runtime-load-person-{index:04d}",
        "name": f"Runtime Load Person {index:04d}",
        "position": generated_position(index),
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
        "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
        "status": "active",
        "visible": True,
        "metadata": {"runtimeLoadSynthetic": True},
        "createdAt": 0,
        "updatedAt": 0,
        "role": "load-test",
        "department": "simulation",
        "avatar": None,
        "schedule": [],
        "currentActivity": "runtime load simulation",
    }


def synthetic_vehicle(index: int) -> dict:
    return {
        "type": "vehicle",
        "id": f"runtime-load-vehicle-{index:04d}",
        "name": f"Runtime Load Vehicle {index:04d}",
        "position": generated_position(index + 10_000),
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
        "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
        "status": "active",
        "visible": True,
        "metadata": {"runtimeLoadSynthetic": True},
        "createdAt": 0,
        "updatedAt": 0,
        "plateNumber": f"LOAD-{index:04d}",
        "vehicleType": "forklift",
        "speed": 0.0,
        "heading": 0.0,
        "capacity": 1000.0,
        "currentLoad": 0.0,
    }


def provision_missing_entities(
    base_url: str,
    workspace_id: str,
    admin_token: str,
    existing_entities: list[dict],
    target_count: int,
) -> list[dict]:
    existing_ids = {
        entity.get("id")
        for entity in existing_entities
        if isinstance(entity.get("id"), str)
    }
    created: list[dict] = []
    target_url = admin_entities_url(base_url, workspace_id)
    index = 0

    while len(existing_entities) + len(created) < target_count:
        index += 1
        entity = (
            synthetic_vehicle(index)
            if (len(existing_entities) + len(created)) % 3 == 0
            else synthetic_person(index)
        )
        if entity["id"] in existing_ids:
            continue
        try:
            created_entity = post_admin_json(target_url, entity, admin_token)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            print(
                f"[simulate_runtime_load] failed to provision {entity['id']} via {target_url}: "
                f"HTTP {error.code}: {body}",
                file=sys.stderr,
            )
            raise
        existing_ids.add(entity["id"])
        created.append(created_entity)

    return created


def vector(entity: dict, key: str, fallback: dict) -> dict:
    value = entity.get(key)
    if not isinstance(value, dict):
        return dict(fallback)
    return {
        "x": float(value.get("x", fallback["x"])),
        "y": float(value.get("y", fallback["y"])),
        "z": float(value.get("z", fallback["z"])),
    }


def create_actor_states(entities: list[dict], seed: int) -> list[dict]:
    rng = random.Random(seed)
    states = []
    for index, entity in enumerate(entities):
        speed = 0.9 + rng.random() * (2.4 if entity.get("type") == "vehicle" else 1.2)
        angle = rng.random() * math.tau
        states.append(
            {
                "entity": entity,
                "position": vector(entity, "position", {"x": 0.0, "y": 0.0, "z": 0.0}),
                "speed": speed,
                "vx": math.sin(angle) * speed,
                "vz": math.cos(angle) * speed,
                "phase": index * 0.37,
            }
        )
    return states


def advance_actor(state: dict, dt: float, step: int) -> dict:
    position = state["position"]
    wobble = math.sin(step * 0.13 + state["phase"]) * 0.2
    position["x"] += (state["vx"] + wobble) * dt
    position["z"] += (state["vz"] - wobble) * dt

    if position["x"] < -390 or position["x"] > 390:
        state["vx"] *= -1
        position["x"] = max(-390, min(390, position["x"]))
    if position["z"] < -170 or position["z"] > 390:
        state["vz"] *= -1
        position["z"] = max(-170, min(390, position["z"]))

    yaw = math.atan2(state["vx"], state["vz"])
    heading = (math.degrees(yaw) + 360) % 360
    return {
        "position": {
            "x": round(position["x"], 3),
            "y": round(position["y"], 3),
            "z": round(position["z"], 3),
        },
        "rotation": {"x": 0.0, "y": round(yaw, 6), "z": 0.0},
        "speed": round(abs(state["speed"]), 3),
        "heading": round(heading, 3),
    }


def build_events(states: list[dict], step: int, dt: float, timestamp_ms: int) -> list[dict]:
    events = []
    for state in states:
        entity = state["entity"]
        pose = advance_actor(state, dt, step)
        payload = {
            "entityId": entity["id"],
            "position": pose["position"],
            "rotation": pose["rotation"],
        }
        if entity.get("type") == "vehicle":
            payload["speed"] = pose["speed"]
            payload["heading"] = pose["heading"]

        events.append(
            {
                "type": "position_update",
                "timestamp": timestamp_ms,
                "payload": payload,
            }
        )
    return events


def chunks(values: list[dict], size: int):
    for offset in range(0, len(values), size):
        yield offset // size, values[offset : offset + size]


def main() -> int:
    args = build_argument_parser().parse_args()
    batch_size = max(1, min(args.batch_size, MAX_BACKEND_BATCH_SIZE))
    source = args.source or f"runtime-load-{os.getpid()}"
    boot = request_json(bootstrap_url(args.base_url, args.workspace_id))
    entities = pick_moving_entities(boot, args.moving_count)
    if len(entities) < args.moving_count:
        if args.provision_missing:
            print(
                f"[simulate_runtime_load] provisioning {args.moving_count - len(entities)} "
                f"synthetic actors through admin API"
            )
            entities.extend(
                provision_missing_entities(
                    args.base_url,
                    args.workspace_id,
                    args.admin_token,
                    entities,
                    args.moving_count,
                )
            )
        else:
            print(
                f"[simulate_runtime_load] bootstrap exposes only {len(entities)} moving actors; "
                f"use --provision-missing to create {args.moving_count} synthetic load-test actors",
                file=sys.stderr,
            )
    entities = entities[: max(1, args.moving_count)]
    states = create_actor_states(entities, args.seed)
    target_url = ingest_url(args.base_url, args.workspace_id)
    step = 0
    last_tick = time.monotonic()

    print(
        f"[simulate_runtime_load] actors={len(states)} batchSize={batch_size} "
        f"target={target_url} interval={args.interval:.2f}s"
    )

    while args.iterations == 0 or step < args.iterations:
        started = time.monotonic()
        dt = max(started - last_tick, args.interval)
        last_tick = started
        timestamp_ms = int(time.time() * 1000)
        events = build_events(states, step, dt, timestamp_ms)
        accepted = 0

        try:
            for chunk_index, batch in chunks(events, batch_size):
                response = post_json(
                    target_url,
                    {
                        "source": f"{source}:chunk-{chunk_index}",
                        "events": batch,
                    },
                    args.token,
                )
                accepted += int(response.get("acceptedCount", 0))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            print(f"[simulate_runtime_load] HTTP {error.code}: {body}")
            return 1
        except urllib.error.URLError as error:
            print(f"[simulate_runtime_load] connection error: {error}")
            return 1

        print(f"[simulate_runtime_load] step={step} accepted={accepted} events={len(events)}")
        step += 1
        elapsed = time.monotonic() - started
        time.sleep(max(args.interval - elapsed, 0.05))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
