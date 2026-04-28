#!/usr/bin/env python3
"""Import a floorplan DXF into project-compatible building-shell static assets.

This script generates two output lanes:

1. `static-assets.json` for the workspace's `StaticAssetInstance[]` schema.
2. Optional GLB + preview artifacts by reusing the DXF-to-GLB skill script when available.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import ezdxf

WALL_CATALOG = {
    "catalogId": "wall-system-solid-wall",
    "assetKind": "wall-system",
    "variant": "solid-wall",
    "domain": "building-shell",
    "subcategory": "wall",
    "placementMode": "floor",
    "tags": ["building", "wall", "dxf-import"],
    "dimensions": {"width": 6.0, "depth": 0.28, "height": 3.2},
}

DOOR_SINGLE_CATALOG = {
    "catalogId": "door-system-single-swing",
    "assetKind": "door-system",
    "variant": "single-swing",
    "domain": "building-shell",
    "subcategory": "door",
    "placementMode": "opening-hosted",
    "tags": ["building", "door", "single-swing", "dxf-import"],
    "dimensions": {"width": 1.1, "depth": 0.16, "height": 2.3},
}

DOOR_DOUBLE_CATALOG = {
    "catalogId": "door-system-double-swing",
    "assetKind": "door-system",
    "variant": "double-swing",
    "domain": "building-shell",
    "subcategory": "door",
    "placementMode": "opening-hosted",
    "tags": ["building", "door", "double-swing", "dxf-import"],
    "dimensions": {"width": 1.8, "depth": 0.18, "height": 2.4},
}

WINDOW_CATALOG = {
    "catalogId": "window-system-casement-window",
    "assetKind": "window-system",
    "variant": "casement-window",
    "domain": "building-shell",
    "subcategory": "window",
    "placementMode": "opening-hosted",
    "tags": ["building", "window", "casement-window", "dxf-import"],
    "dimensions": {"width": 1.8, "depth": 0.18, "height": 1.6},
}

DEFAULT_GEOMETRY = {
    "door_mode": "block",
    "center_mode": "grounded-xz",
    "unit_scale": 0.001,
    "uniform_scale": 1.0,
    "wall_height_m": 3.2,
    "door_height_m": 2.3,
    "wall_thickness_mm": 280.0,
    "column_thickness_mm": 280.0,
    "ground_thickness_m": 0.08,
    "ground_margin_m": 0.6,
    "window_pad_mm": 20.0,
}

OPENING_HOST_Y = {
    "door": 0.0,
    "window": 1.2,
}

EPSILON = 1e-6


@dataclass
class Footprint:
    x0: float
    y0: float
    x1: float
    y1: float
    semantic: str
    source: str
    segment: tuple[float, float, float, float] | None = None
    thickness: float | None = None

    @property
    def area(self) -> float:
        return max(0.0, (self.x1 - self.x0) * (self.y1 - self.y0))


@dataclass
class BuildStats:
    wall_count: int = 0
    door_count: int = 0
    window_count: int = 0
    pruned_wall_overlap_count: int = 0


@dataclass
class WallPlacement:
    asset_id: str
    name: str
    position_x: float
    position_z: float
    rotation_y: float
    length_m: float
    thickness_m: float
    source: str
    axis: str
    start_x: float
    start_z: float
    end_x: float
    end_z: float


@dataclass
class OpeningPlacement:
    kind: str
    block_name: str
    center_x: float
    center_z: float
    width_m: float
    axis: str
    bbox_x0: float
    bbox_y0: float
    bbox_x1: float
    bbox_y1: float


def now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def round6(value: float) -> float:
    return round(value, 6)


def normalize_angle_radians(value: float) -> float:
    while value <= -math.pi:
        value += math.tau
    while value > math.pi:
        value -= math.tau
    return value


def segment_bbox(x1: float, y1: float, x2: float, y2: float, thickness: float) -> tuple[float, float, float, float]:
    half = thickness / 2.0
    if abs(y1 - y2) < EPSILON:
        xa, xb = min(x1, x2), max(x1, x2)
        ya, yb = y1 - half, y1 + half
    elif abs(x1 - x2) < EPSILON:
        xa, xb = x1 - half, x1 + half
        ya, yb = min(y1, y2), max(y1, y2)
    else:
        xa, xb = min(x1, x2) - half, max(x1, x2) + half
        ya, yb = min(y1, y2) - half, max(y1, y2) + half
    return xa, ya, xb, yb


def oriented_segment_bbox(
    x1: float, y1: float, x2: float, y2: float, thickness: float
) -> tuple[float, float, float, float]:
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    if length <= EPSILON:
        return x1, y1, x1, y1

    half = thickness / 2.0
    nx = -dy / length * half
    ny = dx / length * half
    corners = [
        (x1 + nx, y1 + ny),
        (x1 - nx, y1 - ny),
        (x2 + nx, y2 + ny),
        (x2 - nx, y2 - ny),
    ]
    xs = [point[0] for point in corners]
    ys = [point[1] for point in corners]
    return min(xs), min(ys), max(xs), max(ys)


def append_line_footprint(
    footprints: list[Footprint],
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    thickness: float,
    semantic: str,
    source: str,
) -> None:
    if abs(x1 - x2) < EPSILON and abs(y1 - y2) < EPSILON:
        return
    is_axis_aligned = abs(y1 - y2) < EPSILON or abs(x1 - x2) < EPSILON
    if is_axis_aligned:
        xa, ya, xb, yb = segment_bbox(x1, y1, x2, y2, thickness)
        segment = None
        segment_thickness = None
    else:
        xa, ya, xb, yb = oriented_segment_bbox(x1, y1, x2, y2, thickness)
        segment = (x1, y1, x2, y2)
        segment_thickness = thickness
    if xb - xa <= EPSILON or yb - ya <= EPSILON:
        return
    footprints.append(
        Footprint(
            x0=xa,
            y0=ya,
            x1=xb,
            y1=yb,
            semantic=semantic,
            source=source,
            segment=segment,
            thickness=segment_thickness,
        )
    )


def overlap_area_2d(a: Footprint, b: Footprint) -> float:
    ix = max(0.0, min(a.x1, b.x1) - max(a.x0, b.x0))
    iy = max(0.0, min(a.y1, b.y1) - max(a.y0, b.y0))
    return ix * iy


def wall_axis_hint(fp: Footprint, aspect_threshold: float = 1.3) -> str | None:
    width = fp.x1 - fp.x0
    height = fp.y1 - fp.y0
    if width <= EPSILON or height <= EPSILON:
        return None
    if width / height >= aspect_threshold:
        return "h"
    if height / width >= aspect_threshold:
        return "v"
    return None


def prune_coplanar_wall_overlaps(
    footprints: list[Footprint],
    stats: BuildStats,
    overlap_threshold: float = 0.995,
    minor_dim_tol: float = 0.35,
) -> list[Footprint]:
    targets = [
        index
        for index, fp in enumerate(footprints)
        if fp.semantic == "wall" and fp.source in {"wall_line", "wall_poly_segment", "column_line"}
    ]
    if len(targets) < 2:
        return footprints

    keep = [True] * len(footprints)
    sorted_targets = sorted(targets, key=lambda idx: footprints[idx].area, reverse=True)
    pruned = 0

    def span_cover_ratio(a0: float, a1: float, b0: float, b1: float) -> float:
        span = max(EPSILON, b1 - b0)
        inter = max(0.0, min(a1, b1) - max(a0, b0))
        return inter / span

    for outer_pos, outer_index in enumerate(sorted_targets):
        if not keep[outer_index]:
            continue
        outer = footprints[outer_index]
        outer_axis = wall_axis_hint(outer)
        outer_minor = min(outer.x1 - outer.x0, outer.y1 - outer.y0)
        if outer.area <= EPSILON or outer_minor <= EPSILON:
            continue
        for inner_index in sorted_targets[outer_pos + 1 :]:
            if not keep[inner_index]:
                continue
            inner = footprints[inner_index]
            inner_axis = wall_axis_hint(inner)
            inner_minor = min(inner.x1 - inner.x0, inner.y1 - inner.y0)
            if inner.area <= EPSILON or inner_minor <= EPSILON:
                continue
            overlap_ratio = overlap_area_2d(outer, inner) / inner.area
            if overlap_ratio < overlap_threshold:
                continue

            same_axis = outer_axis is not None and inner_axis == outer_axis
            if same_axis and abs(outer_minor - inner_minor) / max(outer_minor, inner_minor) <= minor_dim_tol:
                keep[inner_index] = False
                pruned += 1
                continue

            x_cover = span_cover_ratio(outer.x0, outer.x1, inner.x0, inner.x1)
            y_cover = span_cover_ratio(outer.y0, outer.y1, inner.y0, inner.y1)
            if max(x_cover, y_cover) >= 0.98:
                keep[inner_index] = False
                pruned += 1

    if pruned > 0:
        stats.pruned_wall_overlap_count += pruned
    return [fp for index, fp in enumerate(footprints) if keep[index]]


def block_local_bbox(doc: ezdxf.document.Drawing, block_name: str) -> tuple[float, float, float, float] | None:
    block = doc.blocks.get(block_name)
    if block is None:
        return None

    points: list[tuple[float, float]] = []
    for entity in block:
        kind = entity.dxftype()
        if kind == "LINE":
            points.append((entity.dxf.start.x, entity.dxf.start.y))
            points.append((entity.dxf.end.x, entity.dxf.end.y))
        elif kind == "LWPOLYLINE":
            points.extend((point[0], point[1]) for point in entity.get_points())
        elif kind in {"CIRCLE", "ARC"}:
            cx = entity.dxf.center.x
            cy = entity.dxf.center.y
            radius = entity.dxf.radius
            points.extend(((cx - radius, cy - radius), (cx + radius, cy + radius)))

    if not points:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def transformed_insert_bbox(
    insert_entity: ezdxf.entities.Insert,
    local_bbox: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    lx0, ly0, lx1, ly1 = local_bbox
    corners = [(lx0, ly0), (lx1, ly0), (lx1, ly1), (lx0, ly1)]

    ix = insert_entity.dxf.insert.x
    iy = insert_entity.dxf.insert.y
    sx = float(getattr(insert_entity.dxf, "xscale", 1.0) or 1.0)
    sy = float(getattr(insert_entity.dxf, "yscale", 1.0) or 1.0)
    rotation = math.radians(float(getattr(insert_entity.dxf, "rotation", 0.0) or 0.0))

    cos_a = math.cos(rotation)
    sin_a = math.sin(rotation)

    world: list[tuple[float, float]] = []
    for local_x, local_y in corners:
        scaled_x = local_x * sx
        scaled_y = local_y * sy
        rotated_x = scaled_x * cos_a - scaled_y * sin_a
        rotated_y = scaled_x * sin_a + scaled_y * cos_a
        world.append((ix + rotated_x, iy + rotated_y))

    xs = [point[0] for point in world]
    ys = [point[1] for point in world]
    return min(xs), min(ys), max(xs), max(ys)


def collect_wall_footprints(input_dxf: Path, geometry: dict[str, Any]) -> tuple[list[Footprint], BuildStats]:
    doc = ezdxf.readfile(input_dxf)
    model = doc.modelspace()

    wall_thickness = float(geometry["wall_thickness_mm"])
    column_thickness = float(geometry["column_thickness_mm"])

    footprints: list[Footprint] = []
    stats = BuildStats()

    for entity in model.query('LINE[layer=="WALL"]'):
        stats.wall_count += 1
        append_line_footprint(
            footprints,
            entity.dxf.start.x,
            entity.dxf.start.y,
            entity.dxf.end.x,
            entity.dxf.end.y,
            thickness=wall_thickness,
            semantic="wall",
            source="wall_line",
        )

    for entity in model.query('LWPOLYLINE[layer=="WALL"]'):
        points = [(point[0], point[1]) for point in entity.get_points()]
        if len(points) < 2:
            continue
        stats.wall_count += 1
        for start, end in zip(points, points[1:]):
            append_line_footprint(
                footprints,
                start[0],
                start[1],
                end[0],
                end[1],
                thickness=wall_thickness,
                semantic="wall",
                source="wall_poly_segment",
            )

    for entity in model.query('LINE[layer=="COLUMN"]'):
        stats.wall_count += 1
        append_line_footprint(
            footprints,
            entity.dxf.start.x,
            entity.dxf.start.y,
            entity.dxf.end.x,
            entity.dxf.end.y,
            thickness=column_thickness,
            semantic="wall",
            source="column_line",
        )

    footprints = prune_coplanar_wall_overlaps(footprints, stats)
    if not footprints:
        raise ValueError("No wall footprints extracted from DXF.")

    return footprints, stats


def compute_center_offset(
    wall_footprints: list[Footprint],
    opening_boxes: list[tuple[float, float, float, float]],
    unit_scale: float,
) -> dict[str, float]:
    x_values: list[float] = []
    z_values: list[float] = []

    for footprint in wall_footprints:
        x_values.extend([footprint.x0 * unit_scale, footprint.x1 * unit_scale])
        z_values.extend([-footprint.y0 * unit_scale, -footprint.y1 * unit_scale])

    for x0, y0, x1, y1 in opening_boxes:
        x_values.extend([x0 * unit_scale, x1 * unit_scale])
        z_values.extend([-y0 * unit_scale, -y1 * unit_scale])

    min_x = min(x_values)
    max_x = max(x_values)
    min_z = min(z_values)
    max_z = max(z_values)

    return {
        "x": -((min_x + max_x) * 0.5),
        "y": 0.0,
        "z": -((min_z + max_z) * 0.5),
    }


def cad_to_world_x(x: float, unit_scale: float, offset: dict[str, float]) -> float:
    return x * unit_scale + offset["x"]


def cad_to_world_z(y: float, unit_scale: float, offset: dict[str, float]) -> float:
    return -y * unit_scale + offset["z"]


def footprint_to_wall_placement(
    footprint: Footprint,
    index: int,
    unit_scale: float,
    offset: dict[str, float],
) -> WallPlacement:
    if footprint.segment is not None and footprint.thickness is not None:
        cad_start_x, cad_start_y, cad_end_x, cad_end_y = footprint.segment
        thickness_m = footprint.thickness * unit_scale
    else:
        span_x = footprint.x1 - footprint.x0
        span_y = footprint.y1 - footprint.y0
        if span_x >= span_y:
            cad_start_x = footprint.x0
            cad_end_x = footprint.x1
            cad_start_y = cad_end_y = (footprint.y0 + footprint.y1) * 0.5
            thickness_m = span_y * unit_scale
        else:
            cad_start_x = cad_end_x = (footprint.x0 + footprint.x1) * 0.5
            cad_start_y = footprint.y0
            cad_end_y = footprint.y1
            thickness_m = span_x * unit_scale

    start_x = cad_to_world_x(cad_start_x, unit_scale, offset)
    end_x = cad_to_world_x(cad_end_x, unit_scale, offset)
    start_z = cad_to_world_z(cad_start_y, unit_scale, offset)
    end_z = cad_to_world_z(cad_end_y, unit_scale, offset)

    delta_x = end_x - start_x
    delta_z = end_z - start_z
    length_m = math.hypot(delta_x, delta_z)
    if length_m <= EPSILON:
        raise ValueError("Encountered zero-length wall placement.")

    axis = "x" if abs(delta_x) >= abs(delta_z) else "z"
    rotation_y = normalize_angle_radians(math.atan2(-delta_z, delta_x))

    return WallPlacement(
        asset_id=f"imported-jiazhuang-office-wall-{index:03d}",
        name=f"Imported Wall {index:03d}",
        position_x=round6((start_x + end_x) * 0.5),
        position_z=round6((start_z + end_z) * 0.5),
        rotation_y=round6(rotation_y),
        length_m=round6(length_m),
        thickness_m=round6(thickness_m),
        source=footprint.source,
        axis=axis,
        start_x=round6(start_x),
        start_z=round6(start_z),
        end_x=round6(end_x),
        end_z=round6(end_z),
    )


def choose_door_catalog(width_m: float) -> dict[str, Any]:
    if width_m >= 1.45:
        return DOOR_DOUBLE_CATALOG
    return DOOR_SINGLE_CATALOG


def collect_openings(
    input_dxf: Path,
    unit_scale: float,
    offset: dict[str, float],
) -> tuple[list[OpeningPlacement], dict[str, int], list[tuple[float, float, float, float]]]:
    doc = ezdxf.readfile(input_dxf)
    model = doc.modelspace()
    bbox_cache: dict[str, tuple[float, float, float, float] | None] = {}

    openings: list[OpeningPlacement] = []
    opening_boxes: list[tuple[float, float, float, float]] = []
    counts = {"door": 0, "window": 0}

    for insert in model.query('INSERT[layer=="WINDOW"]'):
        block_name = insert.dxf.name
        if block_name not in bbox_cache:
            bbox_cache[block_name] = block_local_bbox(doc, block_name)
        local_bbox = bbox_cache[block_name]
        if local_bbox is None:
            continue

        x0, y0, x1, y1 = transformed_insert_bbox(insert, local_bbox)
        opening_boxes.append((x0, y0, x1, y1))

        width_cad = abs(x1 - x0)
        height_cad = abs(y1 - y0)
        insert_scale_x = abs(float(getattr(insert.dxf, "xscale", 1.0) or 1.0))
        insert_scale_y = abs(float(getattr(insert.dxf, "yscale", 1.0) or 1.0))
        primary_scale = max(insert_scale_x, insert_scale_y)
        width_m = (primary_scale if primary_scale > EPSILON else max(width_cad, height_cad)) * unit_scale
        axis = "x" if width_cad >= height_cad else "z"
        kind = "door" if "dor" in block_name.lower() else "window"
        counts[kind] += 1

        center_x = cad_to_world_x((x0 + x1) * 0.5, unit_scale, offset)
        center_z = cad_to_world_z((y0 + y1) * 0.5, unit_scale, offset)

        openings.append(
            OpeningPlacement(
                kind=kind,
                block_name=block_name,
                center_x=round6(center_x),
                center_z=round6(center_z),
                width_m=round6(width_m),
                axis=axis,
                bbox_x0=round6(x0),
                bbox_y0=round6(y0),
                bbox_x1=round6(x1),
                bbox_y1=round6(y1),
            )
        )

    return openings, counts, opening_boxes


def build_wall_asset(wall: WallPlacement, timestamp_ms: int) -> dict[str, Any]:
    scale_x = wall.length_m / WALL_CATALOG["dimensions"]["width"]
    scale_z = max(wall.thickness_m / WALL_CATALOG["dimensions"]["depth"], 0.1)
    return {
        "id": wall.asset_id,
        "name": wall.name,
        "assetKind": WALL_CATALOG["assetKind"],
        "variant": WALL_CATALOG["variant"],
        "position": {
            "x": wall.position_x,
            "y": 0.0,
            "z": wall.position_z,
        },
        "rotation": {
            "x": 0.0,
            "y": wall.rotation_y,
            "z": 0.0,
        },
        "scale": {
            "x": round6(scale_x),
            "y": 1.0,
            "z": round6(scale_z),
        },
        "visible": True,
        "metadata": {
            "catalogId": WALL_CATALOG["catalogId"],
            "domain": WALL_CATALOG["domain"],
            "subcategory": WALL_CATALOG["subcategory"],
            "placementMode": WALL_CATALOG["placementMode"],
            "tags": WALL_CATALOG["tags"],
            "importSource": "dxf",
            "dxfRole": "wall",
            "dxfSource": wall.source,
            "wallAxis": wall.axis,
            "wallLengthM": wall.length_m,
            "wallThicknessM": wall.thickness_m,
            "wallStart": {"x": wall.start_x, "z": wall.start_z},
            "wallEnd": {"x": wall.end_x, "z": wall.end_z},
        },
        "createdAt": timestamp_ms,
        "updatedAt": timestamp_ms,
    }


def find_host_wall(opening: OpeningPlacement, walls: list[WallPlacement]) -> WallPlacement:
    strict_matches: list[tuple[tuple[float, float, float], WallPlacement]] = []
    relaxed_matches: list[tuple[tuple[float, float, float, float], WallPlacement]] = []
    fallback_matches: list[tuple[tuple[float, float, float], WallPlacement]] = []

    for wall in walls:
        delta_x = wall.end_x - wall.start_x
        delta_z = wall.end_z - wall.start_z
        wall_length = math.hypot(delta_x, delta_z)
        if wall_length <= EPSILON:
            continue
        tangent_x = delta_x / wall_length
        tangent_z = delta_z / wall_length
        normal_x = -tangent_z
        normal_z = tangent_x

        offset_x = opening.center_x - wall.position_x
        offset_z = opening.center_z - wall.position_z
        along = offset_x * tangent_x + offset_z * tangent_z
        perpendicular = abs(offset_x * normal_x + offset_z * normal_z)
        span_overflow = max(0.0, abs(along) - wall_length * 0.5)
        thickness_allowance = wall.thickness_m * 0.5 + 0.35
        span_allowance = opening.width_m * 0.5 + 0.15
        same_axis = wall.axis == opening.axis
        within_thickness = perpendicular <= thickness_allowance
        within_span = abs(along) <= wall_length * 0.5 + span_allowance

        if same_axis and within_thickness and within_span:
            strict_matches.append(((perpendicular, span_overflow, abs(along)), wall))
            continue

        if within_thickness and within_span:
            relaxed_matches.append(((0.0 if same_axis else 1.0, perpendicular, span_overflow, abs(along)), wall))
            continue

        fallback_matches.append(((0.0 if same_axis else 1.0, perpendicular, span_overflow), wall))

    if strict_matches:
        strict_matches.sort(key=lambda item: item[0])
        return strict_matches[0][1]

    if relaxed_matches:
        relaxed_matches.sort(key=lambda item: item[0])
        return relaxed_matches[0][1]

    if fallback_matches:
        fallback_matches.sort(key=lambda item: item[0])
        return fallback_matches[0][1]

    if not walls:
        raise ValueError(f"Unable to resolve host wall for opening block {opening.block_name}")
    raise ValueError(f"Unable to resolve host wall for opening block {opening.block_name}")


def build_opening_asset(
    opening: OpeningPlacement,
    host_wall: WallPlacement,
    index: int,
    timestamp_ms: int,
) -> dict[str, Any]:
    catalog = WINDOW_CATALOG if opening.kind == "window" else choose_door_catalog(opening.width_m)
    base_width = catalog["dimensions"]["width"]
    scale_x = max(opening.width_m / base_width, 0.1)

    return {
        "id": f"imported-jiazhuang-office-{opening.kind}-{index:03d}",
        "name": f"Imported {opening.kind.title()} {index:03d}",
        "assetKind": catalog["assetKind"],
        "variant": catalog["variant"],
        "position": {
            "x": opening.center_x,
            "y": OPENING_HOST_Y[opening.kind],
            "z": opening.center_z,
        },
        "rotation": {
            "x": 0.0,
            "y": host_wall.rotation_y,
            "z": 0.0,
        },
        "scale": {
            "x": round6(scale_x),
            "y": 1.0,
            "z": 1.0,
        },
        "visible": True,
        "metadata": {
            "catalogId": catalog["catalogId"],
            "domain": catalog["domain"],
            "subcategory": catalog["subcategory"],
            "placementMode": catalog["placementMode"],
            "tags": catalog["tags"],
            "importSource": "dxf",
            "dxfRole": opening.kind,
            "sourceBlockName": opening.block_name,
            "openingWidthM": opening.width_m,
            "hostStaticAssetId": host_wall.asset_id,
            "hostSurface": "opening-center",
        },
        "createdAt": timestamp_ms,
        "updatedAt": timestamp_ms,
    }


def maybe_load_skill_module(skill_script: Path | None):
    if skill_script is None or not skill_script.exists():
        return None
    spec = importlib.util.spec_from_file_location("dxf_to_glb_skill", skill_script)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def generate_outputs(
    input_dxf: Path,
    output_dir: Path,
    geometry: dict[str, Any],
    skill_script: Path | None,
) -> dict[str, Any]:
    unit_scale = float(geometry["unit_scale"])
    opening_pad = float(geometry["window_pad_mm"])

    wall_footprints, wall_stats = collect_wall_footprints(input_dxf, geometry)
    _, _, opening_boxes_for_offset = collect_openings(input_dxf, unit_scale, {"x": 0.0, "y": 0.0, "z": 0.0})
    padded_opening_boxes = [
        (x0 - opening_pad, y0 - opening_pad, x1 + opening_pad, y1 + opening_pad)
        for x0, y0, x1, y1 in opening_boxes_for_offset
    ]
    offset = compute_center_offset(wall_footprints, padded_opening_boxes, unit_scale)
    openings, opening_counts, _ = collect_openings(input_dxf, unit_scale, offset)

    wall_placements = [
        footprint_to_wall_placement(footprint, index + 1, unit_scale, offset)
        for index, footprint in enumerate(wall_footprints)
    ]

    timestamp_ms = now_ms()
    wall_assets = [build_wall_asset(wall, timestamp_ms) for wall in wall_placements]

    opening_assets: list[dict[str, Any]] = []
    for index, opening in enumerate(openings, start=1):
        host_wall = find_host_wall(opening, wall_placements)
        opening_assets.append(build_opening_asset(opening, host_wall, index, timestamp_ms))

    static_assets = [*wall_assets, *opening_assets]

    output_dir.mkdir(parents=True, exist_ok=True)
    static_assets_path = output_dir / "static-assets.json"
    summary_path = output_dir / "import-summary.json"
    glb_metadata_path = output_dir / "scene-metadata.json"
    glb_path = output_dir / "scene.glb"
    preview_path = output_dir / "preview.html"

    static_assets_path.write_text(json.dumps(static_assets, ensure_ascii=False, indent=2), encoding="utf-8")

    summary: dict[str, Any] = {
        "name": "jiazhuang-office",
        "sourceDxf": str(input_dxf),
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "geometry": geometry,
        "transformPolicy": {
            "centerMode": geometry["center_mode"],
            "offset": {key: round6(value) for key, value in offset.items()},
            "unitScale": unit_scale,
        },
        "sourceCounts": {
            "wall": len(wall_footprints),
            "door": opening_counts["door"],
            "window": opening_counts["window"],
            "prunedWallOverlap": wall_stats.pruned_wall_overlap_count,
            "rawWallEntities": wall_stats.wall_count,
        },
        "assetCounts": {
            "wall": len(wall_assets),
            "door": len([asset for asset in opening_assets if asset["assetKind"] == "door-system"]),
            "window": len([asset for asset in opening_assets if asset["assetKind"] == "window-system"]),
            "total": len(static_assets),
        },
        "outputs": {
            "staticAssets": static_assets_path.name,
            "sceneGlb": glb_path.name,
            "sceneMetadata": glb_metadata_path.name,
            "preview": preview_path.name,
        },
    }

    skill_module = maybe_load_skill_module(skill_script)
    if skill_module is not None:
        profile = skill_module.ensure_defaults_material_profile()
        skill_module.build_scene(
            input_dxf=input_dxf,
            output_glb=glb_path,
            emit_json=glb_metadata_path,
            preview_html=preview_path,
            geometry=geometry,
            profile=profile,
        )
        summary["glbGenerated"] = True
    else:
        summary["glbGenerated"] = False

    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Path to the input DXF file")
    parser.add_argument("--output-dir", required=True, type=Path, help="Directory for generated outputs")
    parser.add_argument(
        "--skill-script",
        type=Path,
        default=Path.home() / ".codex/skills/dxf-floorplan-to-glb/scripts/dxf_to_glb.py",
        help="Optional path to the DXF-to-GLB skill script for GLB generation",
    )
    parser.add_argument("--skip-glb", action="store_true", help="Skip GLB generation even if the skill exists")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    geometry = dict(DEFAULT_GEOMETRY)
    skill_script = None if args.skip_glb else args.skill_script
    summary = generate_outputs(
        input_dxf=args.input.resolve(),
        output_dir=args.output_dir.resolve(),
        geometry=geometry,
        skill_script=skill_script,
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "outputDir": str(args.output_dir.resolve()),
                "assetCounts": summary["assetCounts"],
                "glbGenerated": summary["glbGenerated"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
