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
        "track": {
            "id": "forklift-track-01",
            "loop": True,
            "points": [
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
        "track": {
            "id": "forklift-track-02",
            "loop": True,
            "points": [
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
        "track": {
            "id": "forklift-track-03",
            "loop": True,
            "points": [
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
        "track": {
            "id": "forklift-track-04",
            "loop": True,
            "points": [
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
        "track": {
            "id": "forklift-track-05",
            "loop": True,
            "points": [
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
        default=1.0,
        help="Seconds between pushes. Default: 1.0",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=0,
        help="Number of iterations to run. 0 means forever. Default: 0",
    )
    parser.add_argument(
        "--source",
        default="python-simulator",
        help="Source label to attach to ingest payloads.",
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


def build_forklift_event(track_descriptor: dict, index: int, step: int, timestamp_ms: int) -> dict:
    track = track_descriptor["track"]
    points = track["points"]
    segment_index = (step + index * 2) % len(points)
    segment_progress = ((step * 0.23) + index * 0.17) % 1
    position = interpolate_track_position(points, segment_index, segment_progress)
    next_point = points[(segment_index + 1) % len(points)]
    heading = (
        math.degrees(math.atan2(next_point["x"] - position["x"], next_point["z"] - position["z"]))
        + 360
    ) % 360

    return {
        "type": "position_update",
        "timestamp": timestamp_ms,
        "payload": {
            "entityId": track_descriptor["entityId"],
            "position": position,
            "rotation": {"x": 0.0, "y": round(heading, 3), "z": 0.0},
            "speed": round(2.0 + index * 0.2 + abs(math.sin(step / 5.0)) * 0.8, 3),
            "heading": round(heading, 3),
            "routeTrack": track,
            "trackPosition": {
                "trackId": track["id"],
                "segmentIndex": segment_index,
                "segmentProgress": round(segment_progress, 4),
                "target": next_point,
                "direction": "forward",
            },
        },
    }


def build_events(step: int, timestamp_ms: int) -> list[dict]:
    spindle_load = 72.0 + (step % 4) * 4.5
    equipment_warning = step % 5 in (2, 3)
    reactor_temp = 62.0 + math.sin(step / 3.0) * 8.0
    gas_ppm = 28.0 + math.cos(step / 2.5) * 14.0
    pressure_bar = 5.5 + math.sin(step / 4.0) * 1.1
    pressure_warning = pressure_bar < 4.8 or pressure_bar > 6.4
    gas_warning = gas_ppm > 36.0
    temp_warning = reactor_temp > 68.0

    events = [
        *[
            build_forklift_event(track_descriptor, index, step, timestamp_ms)
            for index, track_descriptor in enumerate(FORKLIFT_TRACKS)
        ],
        {
            "type": "status_update",
            "timestamp": timestamp_ms,
            "payload": {
                "entityId": "equipment-cnc-01",
                "status": "warning" if equipment_warning else "active",
                "parameters": {
                    "cycleState": "warning" if equipment_warning else "active",
                    "spindleLoad": spindle_load,
                    "reactorTemp": round(reactor_temp, 2),
                    "simulated": True,
                },
            },
        },
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

    print(
        f"[simulate_runtime_ingest] pushing to {args.base_url.rstrip('/')}/api/v1/runtime/ingest "
        f"every {args.interval:.2f}s"
    )

    while args.iterations == 0 or step < args.iterations:
        timestamp_ms = int(time.time() * 1000)
        events = build_events(step, timestamp_ms)
        try:
            response = post_events(args.base_url, args.source, events, args.token)
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
