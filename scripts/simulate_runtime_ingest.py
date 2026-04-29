#!/usr/bin/env python3
import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request


FORKLIFT_TRACKS = [
    {
        "entityId": "vehicle-forklift-01",
        "baseHeading": 90.0,
        "routeId": "factory-yard-circulation",
        "label": "装卸主环线",
        "track": {
            "trackId": "forklift-track-01",
            "looped": True,
            "waypoints": [
                {"x": -92.0, "y": 0.0, "z": 54.0},
                {"x": -28.0, "y": 0.0, "z": 54.0},
                {"x": 36.0, "y": 0.0, "z": 54.0},
                {"x": 96.0, "y": 0.0, "z": 54.0},
                {"x": 86.0, "y": 0.0, "z": 30.0},
                {"x": 86.0, "y": 0.0, "z": 2.0},
                {"x": 86.0, "y": 0.0, "z": -72.0},
                {"x": 0.0, "y": 0.0, "z": -72.0},
                {"x": -88.0, "y": 0.0, "z": -72.0},
                {"x": -88.0, "y": 0.0, "z": 2.0},
                {"x": -88.0, "y": 0.0, "z": 30.0},
            ],
        },
    },
    {
        "entityId": "vehicle-forklift-02",
        "baseHeading": 180.0,
        "routeId": "factory-yard-circulation",
        "label": "货架补料线",
        "track": {
            "trackId": "forklift-track-02",
            "looped": True,
            "waypoints": [
                {"x": -68.0, "y": 0.0, "z": 72.0},
                {"x": 68.0, "y": 0.0, "z": 72.0},
                {"x": 96.0, "y": 0.0, "z": 54.0},
                {"x": 68.0, "y": 0.0, "z": 54.0},
                {"x": 4.0, "y": 0.0, "z": 54.0},
                {"x": -60.0, "y": 0.0, "z": 54.0},
                {"x": -92.0, "y": 0.0, "z": 54.0},
                {"x": -88.0, "y": 0.0, "z": 30.0},
                {"x": -88.0, "y": 0.0, "z": 2.0},
            ],
        },
    },
    {
        "entityId": "vehicle-forklift-03",
        "baseHeading": 270.0,
        "routeId": "factory-yard-circulation",
        "label": "北侧周转线",
        "track": {
            "trackId": "forklift-track-03",
            "looped": True,
            "waypoints": [
                {"x": -84.0, "y": 0.0, "z": -4.0},
                {"x": -36.0, "y": 0.0, "z": -4.0},
                {"x": 32.0, "y": 0.0, "z": -4.0},
                {"x": 86.0, "y": 0.0, "z": -4.0},
                {"x": 86.0, "y": 0.0, "z": -26.0},
                {"x": 86.0, "y": 0.0, "z": -72.0},
                {"x": 0.0, "y": 0.0, "z": -72.0},
                {"x": -88.0, "y": 0.0, "z": -72.0},
                {"x": -88.0, "y": 0.0, "z": -26.0},
            ],
        },
    },
    {
        "entityId": "vehicle-forklift-04",
        "baseHeading": 0.0,
        "routeId": "factory-yard-circulation",
        "label": "西侧回库线",
        "track": {
            "trackId": "forklift-track-04",
            "looped": True,
            "waypoints": [
                {"x": 0.0, "y": 0.0, "z": 32.0},
                {"x": 0.0, "y": 0.0, "z": 4.0},
                {"x": 0.0, "y": 0.0, "z": -24.0},
                {"x": 0.0, "y": 0.0, "z": -72.0},
                {"x": 86.0, "y": 0.0, "z": -72.0},
                {"x": 86.0, "y": 0.0, "z": 2.0},
                {"x": 68.0, "y": 0.0, "z": 54.0},
                {"x": 4.0, "y": 0.0, "z": 54.0},
                {"x": -60.0, "y": 0.0, "z": 54.0},
                {"x": -88.0, "y": 0.0, "z": 30.0},
            ],
        },
    },
    {
        "entityId": "vehicle-forklift-05",
        "baseHeading": 45.0,
        "routeId": "factory-yard-circulation",
        "label": "南北穿梭线",
        "track": {
            "trackId": "forklift-track-05",
            "looped": True,
            "waypoints": [
                {"x": -88.0, "y": 0.0, "z": 30.0},
                {"x": -88.0, "y": 0.0, "z": 2.0},
                {"x": -88.0, "y": 0.0, "z": -72.0},
                {"x": 0.0, "y": 0.0, "z": -72.0},
                {"x": 86.0, "y": 0.0, "z": -72.0},
                {"x": 86.0, "y": 0.0, "z": 2.0},
                {"x": 86.0, "y": 0.0, "z": 30.0},
                {"x": 36.0, "y": 0.0, "z": 54.0},
                {"x": -28.0, "y": 0.0, "z": 54.0},
            ],
        },
    },
]

TRUCK_TRACKS = [
    {
        "entityId": "vehicle-truck-01",
        "vehicleType": "truck",
        "baseHeading": 0.0,
        "routeId": "factory-yard-logistics",
        "label": "装车道 A 环线",
        "track": {
            "trackId": "truck-track-01",
            "looped": True,
            "waypoints": [
                {"x": -44.0, "y": 0.0, "z": 54.0},
                {"x": -44.0, "y": 0.0, "z": 92.0},
                {"x": -12.0, "y": 0.0, "z": 92.0},
                {"x": -12.0, "y": 0.0, "z": 54.0},
            ],
        },
    },
    {
        "entityId": "vehicle-truck-02",
        "vehicleType": "truck",
        "baseHeading": 0.0,
        "routeId": "factory-yard-logistics",
        "label": "装车道 B 环线",
        "track": {
            "trackId": "truck-track-02",
            "looped": True,
            "waypoints": [
                {"x": 0.0, "y": 0.0, "z": 54.0},
                {"x": 0.0, "y": 0.0, "z": 96.0},
                {"x": 28.0, "y": 0.0, "z": 96.0},
                {"x": 28.0, "y": 0.0, "z": 54.0},
            ],
        },
    },
    {
        "entityId": "vehicle-truck-03",
        "vehicleType": "truck",
        "baseHeading": 0.0,
        "routeId": "factory-yard-logistics",
        "label": "装车道 C 环线",
        "track": {
            "trackId": "truck-track-03",
            "looped": True,
            "waypoints": [
                {"x": 44.0, "y": 0.0, "z": 54.0},
                {"x": 44.0, "y": 0.0, "z": 92.0},
                {"x": 76.0, "y": 0.0, "z": 92.0},
                {"x": 76.0, "y": 0.0, "z": 54.0},
            ],
        },
    },
]

VEHICLE_TRACKS = [*FORKLIFT_TRACKS, *TRUCK_TRACKS]


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Push simulated runtime events into /api/v1/runtime/ingest."
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:4000",
        help="Backend HTTP base URL. Default: http://localhost:4000",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.15,
        help="Seconds between pushes. Default: 0.15",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=0,
        help="Number of iterations to run. 0 means forever. Default: 0",
    )
    parser.add_argument(
        "--source",
        default="",
        help="Optional source label to attach to ingest payloads. Defaults to a unique process-scoped label.",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("RUNTIME_INGEST_TOKEN", ""),
        help="Optional runtime ingest token. Defaults to RUNTIME_INGEST_TOKEN env var.",
    )
    return parser


def interpolate_track_position(track: list[dict], segment_index: int, progress: float) -> dict:
    start = track[segment_index]
    end = track[(segment_index + 1) % len(track)]
    return {
        "x": round(start["x"] + (end["x"] - start["x"]) * progress, 3),
        "y": round(start["y"] + (end["y"] - start["y"]) * progress, 3),
        "z": round(start["z"] + (end["z"] - start["z"]) * progress, 3),
    }


def next_segment_index(segment_index: int, point_count: int, looped: bool) -> int:
    if point_count <= 0:
        return 0
    if segment_index >= point_count - 1:
        return 0 if looped else point_count - 1
    return segment_index + 1


def segment_length(start: dict, end: dict) -> float:
    return math.hypot(end["x"] - start["x"], end["z"] - start["z"])


def advance_route_position(
    points: list[dict],
    segment_index: int,
    segment_progress: float,
    speed: float,
    delta_seconds: float,
    looped: bool,
) -> tuple[int, float]:
    if len(points) < 2 or speed <= 0.0 or delta_seconds <= 0.0:
        return segment_index, segment_progress

    next_index = max(0, min(segment_index, len(points) - 1))
    next_progress = max(0.0, min(segment_progress, 1.0))
    remaining_distance = speed * delta_seconds

    while remaining_distance > 0.0:
        target_index = next_segment_index(next_index, len(points), looped)
        start = points[next_index]
        end = points[target_index]
        length = segment_length(start, end)

        if length <= 1e-6:
            if not looped and target_index == next_index:
                break
            next_index = target_index
            next_progress = 0.0
            continue

        remaining_on_segment = (1.0 - next_progress) * length
        if remaining_distance < remaining_on_segment:
            next_progress += remaining_distance / length
            next_progress = min(next_progress, 1.0)
            break

        remaining_distance -= remaining_on_segment

        if not looped and target_index == next_index:
            next_progress = 1.0
            break

        next_index = target_index
        next_progress = 0.0

    return next_index, round(next_progress, 6)


def build_route_states(track_descriptors: list[dict]) -> list[dict]:
    states: list[dict] = []
    for index, track_descriptor in enumerate(track_descriptors):
        point_count = len(track_descriptor["track"]["waypoints"])
        states.append(
            {
                "segmentIndex": (index * 2) % point_count,
                "segmentProgress": round((index * 0.17) % 1.0, 6),
                "direction": "forward",
            }
        )
    return states


def build_vehicle_event(
    track_descriptor: dict,
    route_state: dict,
    speed: float,
    timestamp_ms: int,
) -> dict:
    track = track_descriptor["track"]
    points = track["waypoints"]
    segment_index = route_state["segmentIndex"] % len(points)
    segment_progress = max(0.0, min(route_state["segmentProgress"], 1.0))
    position = interpolate_track_position(points, segment_index, segment_progress)
    next_point = points[(segment_index + 1) % len(points)]
    yaw_radians = math.atan2(next_point["x"] - position["x"], next_point["z"] - position["z"])
    heading = (math.degrees(yaw_radians) + 360) % 360

    return {
        "type": "position_update",
        "timestamp": timestamp_ms,
        "payload": {
            "entityId": track_descriptor["entityId"],
            "position": position,
            "rotation": {"x": 0.0, "y": round(yaw_radians, 6), "z": 0.0},
            "speed": round(speed, 3),
            "heading": round(heading, 3),
            "routeTrack": {
                "routeId": track_descriptor["routeId"],
                "trackId": track["trackId"],
                "label": track_descriptor["label"],
                "looped": track["looped"],
                "waypoints": points,
            },
            "trackPosition": {
                "routeId": track_descriptor["routeId"],
                "trackId": track["trackId"],
                "segmentIndex": segment_index,
                "nextWaypointIndex": (segment_index + 1) % len(points),
                "segmentProgress": round(segment_progress, 4),
            },
        },
    }


def resolve_track_speed(track_descriptor: dict, index: int, step: int) -> float:
    if track_descriptor.get("vehicleType") == "truck":
        return 1.35 + index * 0.08 + abs(math.sin(step / 7.0)) * 0.45
    return 2.0 + index * 0.2 + abs(math.sin(step / 5.0)) * 0.8


def build_events(
    step: int,
    timestamp_ms: int,
    delta_seconds: float,
    route_states: list[dict],
) -> list[dict]:
    reactor_temp = 62.0 + math.sin(step / 3.0) * 8.0
    gas_ppm = 28.0 + math.cos(step / 2.5) * 14.0
    pressure_bar = 5.5 + math.sin(step / 4.0) * 1.1
    pressure_warning = pressure_bar < 4.8 or pressure_bar > 6.4
    gas_warning = gas_ppm > 36.0
    temp_warning = reactor_temp > 68.0

    events = [
        *[
            build_vehicle_event(
                track_descriptor,
                route_states[index],
                resolve_track_speed(track_descriptor, index, step),
                timestamp_ms,
            )
            for index, track_descriptor in enumerate(VEHICLE_TRACKS)
        ],
        {
            "type": "status_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "status": "warning" if temp_warning else "active",
                "parameters": {
                    "reading": round(reactor_temp, 2),
                    "unit": "C",
                    "thresholdMin": 10.0,
                    "thresholdMax": 68.0,
                    "simulated": True,
                },
            },
        },
        {
            "type": "signal_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-temp-reactor-01",
                "source": "python-simulator",
                "connectorId": "simulated-plc-line-1",
                "signals": [
                    {
                        "id": "reactor-temp-pv",
                        "name": "ReactorTemperaturePV",
                        "path": "PLC/Line1/Reactor/TemperaturePV",
                        "label": "反应釜温度 PV",
                        "unit": "C",
                        "dataType": "float",
                        "direction": "input",
                        "value": round(reactor_temp, 2),
                        "quality": "uncertain" if temp_warning else "good",
                    }
                ],
            },
        },
        {
            "type": "status_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-gas-loading-01",
                "status": "warning" if gas_warning else "active",
                "parameters": {
                    "reading": round(gas_ppm, 2),
                    "unit": "ppm",
                    "thresholdMin": 0.0,
                    "thresholdMax": 36.0,
                    "simulated": True,
                },
            },
        },
        {
            "type": "signal_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-gas-loading-01",
                "source": "python-simulator",
                "connectorId": "simulated-plc-line-1",
                "signals": [
                    {
                        "id": "gas-ppm-pv",
                        "name": "LoadingGasPPM",
                        "path": "PLC/Loading/GasPPM",
                        "label": "装卸区气体浓度",
                        "unit": "ppm",
                        "dataType": "float",
                        "direction": "input",
                        "value": round(gas_ppm, 2),
                        "quality": "uncertain" if gas_warning else "good",
                    }
                ],
            },
        },
        {
            "type": "status_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-pressure-pump-01",
                "status": "warning" if pressure_warning else "active",
                "parameters": {
                    "reading": round(pressure_bar, 3),
                    "unit": "bar",
                    "thresholdMin": 4.8,
                    "thresholdMax": 6.4,
                    "simulated": True,
                },
            },
        },
        {
            "type": "signal_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "sensor-pressure-pump-01",
                "source": "python-simulator",
                "connectorId": "simulated-plc-line-1",
                "signals": [
                    {
                        "id": "pump-pressure-pv",
                        "name": "PumpPressurePV",
                        "path": "PLC/Pump/PressurePV",
                        "label": "泵出口压力",
                        "unit": "bar",
                        "dataType": "float",
                        "direction": "input",
                        "value": round(pressure_bar, 3),
                        "quality": "uncertain" if pressure_warning else "good",
                    }
                ],
            },
        },
    ]

    if step % 6 == 0:
        events.append(
            {
                "type": "alarm",
                "timestamp": timestamp_ms,
                "payload": {
                    "id": f"alarm-python-{step:04d}",
                    "level": "warning",
                    "message": "Python simulator proximity alarm",
                },
            }
        )

    if step % 9 == 0:
        events.append(
            {
                "type": "incident",
                "timestamp": timestamp_ms,
                "payload": {
                    "incident": {
                        "id": f"incident-python-{step:04d}",
                        "kind": "zone_intrusion",
                        "severity": "warning",
                        "title": "Python simulated zone intrusion",
                        "summary": "External runtime source reported an intrusion event",
                        "message": "External runtime source reported an intrusion event",
                        "primaryEntityId": "vehicle-forklift-03",
                        "entityIds": ["vehicle-forklift-03", "vehicle-forklift-04"],
                        "zoneId": "zone-workshop-01",
                        "zoneName": "总装作业区",
                        "cameraName": "固定枪机 01",
                        "citations": [
                            {
                                "id": f"citation-python-{step:04d}",
                                "label": "source",
                                "value": "python-simulator",
                            }
                        ],
                        "acknowledged": False,
                        "timestamp": timestamp_ms,
                    }
                },
            }
        )

    for index, track_descriptor in enumerate(VEHICLE_TRACKS):
        speed = resolve_track_speed(track_descriptor, index, step)
        next_segment_index_value, next_segment_progress = advance_route_position(
            track_descriptor["track"]["waypoints"],
            route_states[index]["segmentIndex"],
            route_states[index]["segmentProgress"],
            speed,
            delta_seconds,
            track_descriptor["track"]["looped"],
        )
        route_states[index]["segmentIndex"] = next_segment_index_value
        route_states[index]["segmentProgress"] = next_segment_progress

    return events


def post_events(base_url: str, source: str, events: list[dict], token: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-runtime-ingest-token"] = token

    request = urllib.request.Request(
        url=f"{base_url.rstrip('/')}/api/v1/runtime/ingest",
        data=json.dumps({"source": source, "events": events}).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    args = build_argument_parser().parse_args()
    step = 0
    source = args.source or f"python-simulator-{os.getpid()}"
    route_states = build_route_states(VEHICLE_TRACKS)
    last_tick_started_at = time.monotonic()

    print(
        f"[simulate_runtime_ingest] pushing to {args.base_url.rstrip('/')}/api/v1/runtime/ingest "
        f"every {args.interval:.2f}s"
    )

    while args.iterations == 0 or step < args.iterations:
        tick_started_at = time.monotonic()
        delta_seconds = 0.0 if step == 0 else max(tick_started_at - last_tick_started_at, 0.0)
        last_tick_started_at = tick_started_at
        timestamp_ms = int(time.time() * 1000)
        events = build_events(step, timestamp_ms, delta_seconds, route_states)
        try:
            response = post_events(args.base_url, source, events, args.token)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            print(f"[simulate_runtime_ingest] HTTP {error.code}: {body}", file=sys.stderr)
            return 1
        except urllib.error.URLError as error:
            print(f"[simulate_runtime_ingest] connection error: {error}", file=sys.stderr)
            return 1

        print(
            f"[simulate_runtime_ingest] step={step} accepted={response.get('acceptedCount')} "
            f"events={len(events)}"
        )

        step += 1
        time.sleep(max(args.interval, 0.05) + random.uniform(0.0, 0.08))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
