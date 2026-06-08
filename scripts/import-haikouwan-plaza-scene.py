#!/usr/bin/env python3
"""Build a Haikouwan Plaza leasing scene from the supplied PPTX.

The script reads text boxes from the PowerPoint file, converts shop/floor
records into editable digital-twin zone entities, writes a reusable scene JSON
snapshot, and upserts a workspace into the local SQLite backend database.
"""

from __future__ import annotations

import argparse
import json
import math
import posixpath
import re
import sqlite3
import struct
import time
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


EMU_PER_INCH = 914_400
PPTX_PATH = Path("/Users/l1ny4n/Documents/工作/化工厂/地域分布图.pptx")
DB_PATH = Path("backend-core-rs/data/digital-twin.db")
OUTPUT_JSON_PATH = Path("fixtures/scenes/haikouwan-plaza-scene.json")
FLOORPLAN_ASSET_DIR = Path("public/generated/workspaces/haikouwan-plaza/floorplans")
FLOORPLAN_PUBLIC_BASE_URL = "/generated/workspaces/haikouwan-plaza/floorplans"
WORKSPACE_ID = "haikouwan-plaza"
WORKSPACE_SLUG = "haikouwan-plaza"
WORKSPACE_NAME = "海口湾广场地域分布场景"
PPT_NS = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
DRAW_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
OFFICE_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PACKAGE_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"

STATUS_COLORS = {
    "signed": "#22c55e",
    "confirmed": "#38bdf8",
    "available": "#94a3b8",
    "unknown": "#f59e0b",
}

FLOOR_ORDER = ["B1", "L1-A", "L1-B", "L2-A", "L2-B", "L3-A", "L3-B", "L4", "L5"]
FLOOR_LABELS = {
    "B1": "B1 地下商业",
    "L1-A": "L1 主力店与餐饮",
    "L1-B": "L1 外摆餐酒吧",
    "L2-A": "L2 餐饮组团",
    "L2-B": "L2 酒吧组团",
    "L3-A": "L3 餐饮主区",
    "L3-B": "L3 露台餐吧",
    "L4": "L4 餐饮娱乐",
    "L5": "L5 夜间娱乐",
}

SLIDE_FLOOR_IDS = {
    1: "B1",
    2: "L1-A",
    3: "L1-B",
    4: "L2-A",
    5: "L2-B",
    6: "L3-A",
    7: "L3-B",
    8: "L4",
    9: "L5",
}

COUNT_LABELS = {
    "signedCount": "已签约",
    "confirmedCount": "已双确",
    "availableCount": "未签约",
    "totalCount": "本层总铺数",
}


@dataclass
class Transform:
    x: float
    y: float
    cx: float
    cy: float
    chx: float = 0.0
    chy: float = 0.0
    chcx: float = 0.0
    chcy: float = 0.0


@dataclass
class TextBox:
    slide: int
    floor_id: str
    text: str
    x: float
    y: float
    w: float
    h: float


@dataclass
class ShopRecord:
    floor_id: str
    shop_id: str
    brand: str
    area: float | None
    status: str
    x: float
    z: float
    w: float
    d: float
    raw_text: str


@dataclass
class FloorPlanBasemap:
    id: str
    label: str
    floorId: str
    imageUrl: str
    position: dict[str, float]
    size: dict[str, float]
    opacity: float
    renderOrder: int
    metadata: dict[str, Any]


@dataclass
class PictureCandidate:
    slide: int
    floor_id: str
    media_path: str
    display_area: float
    x: float
    y: float
    w: float
    h: float


def now_ms() -> int:
    return int(time.time() * 1000)


def slugify_for_id(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")


def normalize_text(value: str) -> str:
    compact = re.sub(r"\s+", " ", value.replace("\u3000", " ")).strip()
    compact = re.sub(r"([A-Z])\s+(\d)", r"\1\2", compact)
    compact = re.sub(r"(\d)\s+(\d)(?=[./㎡m²])", r"\1\2", compact)
    compact = compact.replace("m ²", "m²").replace("m 2", "m²")
    compact = compact.replace(" . ", ".").replace(" - ", "-")
    compact = re.sub(r"L(\d)-0\s+(\d)", r"L\1-0\2", compact)
    compact = re.sub(r"L(\d)-\s+(\d)", r"L\1-\2", compact)
    compact = re.sub(
        r"L(\d)-\s*(\d)\s*0\s*-1",
        lambda match: f"L{match.group(1)}-{match.group(2)}0-1",
        compact,
    )
    compact = re.sub(r"L(\d)-\s*(\d+)\s*\+\s*(\d+)", r"L\1-\2+\3", compact)
    compact = re.sub(r"L(\d)-\s*(\d+)\s*/\s*(\d+)", r"L\1-\2/\3", compact)
    compact = re.sub(r"(\d)\s+\.(\d)", r"\1.\2", compact)
    compact = compact.replace("海口湾广场 L1", "海口湾广场 L1")
    return compact


def read_transform(element: ET.Element, group: bool) -> Transform | None:
    if group:
        xfrm = element.find(f"{PPT_NS}grpSpPr/{DRAW_NS}xfrm")
    else:
        shape_props = element.find(f"{PPT_NS}spPr")
        xfrm = shape_props.find(f"{DRAW_NS}xfrm") if shape_props is not None else None
    if xfrm is None:
        return None

    off = xfrm.find(f"{DRAW_NS}off")
    ext = xfrm.find(f"{DRAW_NS}ext")
    ch_off = xfrm.find(f"{DRAW_NS}chOff")
    ch_ext = xfrm.find(f"{DRAW_NS}chExt")
    return Transform(
        x=float(off.get("x", "0")) if off is not None else 0.0,
        y=float(off.get("y", "0")) if off is not None else 0.0,
        cx=float(ext.get("cx", "0")) if ext is not None else 0.0,
        cy=float(ext.get("cy", "0")) if ext is not None else 0.0,
        chx=float(ch_off.get("x", "0")) if ch_off is not None else 0.0,
        chy=float(ch_off.get("y", "0")) if ch_off is not None else 0.0,
        chcx=float(ch_ext.get("cx", "0")) if ch_ext is not None else 0.0,
        chcy=float(ch_ext.get("cy", "0")) if ch_ext is not None else 0.0,
    )


def apply_parent_transform(parent: Transform | None, local: Transform) -> Transform:
    if parent is None:
        return local
    scale_x = parent.cx / parent.chcx if parent.chcx else 1.0
    scale_y = parent.cy / parent.chcy if parent.chcy else 1.0
    return Transform(
        x=parent.x + (local.x - parent.chx) * scale_x,
        y=parent.y + (local.y - parent.chy) * scale_y,
        cx=local.cx * scale_x,
        cy=local.cy * scale_y,
    )


def compose_group_transform(parent: Transform | None, group: ET.Element) -> Transform | None:
    group_transform = read_transform(group, group=True)
    if group_transform is None:
        return parent
    return apply_parent_transform(parent, group_transform) if parent else group_transform


def walk_text_boxes(
    element: ET.Element,
    slide_index: int,
    floor_id: str,
    parent: Transform | None = None,
) -> list[TextBox]:
    boxes: list[TextBox] = []
    for child in element:
        if child.tag == f"{PPT_NS}grpSp":
            boxes.extend(
                walk_text_boxes(
                    child,
                    slide_index,
                    floor_id,
                    compose_group_transform(parent, child),
                )
            )
            continue
        if child.tag != f"{PPT_NS}sp":
            continue

        texts = [node.text or "" for node in child.findall(f".//{DRAW_NS}t")]
        text = normalize_text(" ".join(part.strip() for part in texts if part.strip()))
        if not text:
            continue
        local_transform = read_transform(child, group=False)
        if local_transform is None:
            continue
        absolute = apply_parent_transform(parent, local_transform)
        boxes.append(
            TextBox(
                slide=slide_index,
                floor_id=floor_id,
                text=text,
                x=absolute.x / EMU_PER_INCH,
                y=absolute.y / EMU_PER_INCH,
                w=absolute.cx / EMU_PER_INCH,
                h=absolute.cy / EMU_PER_INCH,
            )
        )
    return boxes


def read_slide_relationships(archive: zipfile.ZipFile, slide_path: str) -> dict[str, str]:
    rels_path = posixpath.join(
        posixpath.dirname(slide_path),
        "_rels",
        f"{posixpath.basename(slide_path)}.rels",
    )
    if rels_path not in archive.namelist():
        return {}

    relationships: dict[str, str] = {}
    root = ET.fromstring(archive.read(rels_path))
    for relationship in root.findall(f"{PACKAGE_REL_NS}Relationship"):
        relationship_type = relationship.get("Type", "")
        if not relationship_type.endswith("/image"):
            continue
        relationship_id = relationship.get("Id")
        target = relationship.get("Target")
        if not relationship_id or not target:
            continue
        relationships[relationship_id] = posixpath.normpath(
            posixpath.join(posixpath.dirname(slide_path), target)
        )
    return relationships


def walk_picture_candidates(
    element: ET.Element,
    slide_index: int,
    floor_id: str,
    relationships: dict[str, str],
    parent: Transform | None = None,
) -> list[PictureCandidate]:
    candidates: list[PictureCandidate] = []
    for child in element:
        if child.tag == f"{PPT_NS}grpSp":
            candidates.extend(
                walk_picture_candidates(
                    child,
                    slide_index,
                    floor_id,
                    relationships,
                    compose_group_transform(parent, child),
                )
            )
            continue
        if child.tag != f"{PPT_NS}pic":
            continue

        local_transform = read_transform(child, group=False)
        if local_transform is None:
            continue
        absolute = apply_parent_transform(parent, local_transform)
        blip = child.find(f".//{DRAW_NS}blip")
        rel_id = blip.get(f"{OFFICE_REL_NS}embed") if blip is not None else None
        media_path = relationships.get(rel_id or "")
        if not media_path:
            continue
        width = absolute.cx / EMU_PER_INCH
        height = absolute.cy / EMU_PER_INCH
        candidates.append(
            PictureCandidate(
                slide=slide_index,
                floor_id=floor_id,
                media_path=media_path,
                display_area=width * height,
                x=absolute.x / EMU_PER_INCH,
                y=absolute.y / EMU_PER_INCH,
                w=width,
                h=height,
            )
        )
    return candidates


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 24:
        return None
    width, height = struct.unpack(">II", data[16:24])
    return int(width), int(height)


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    offset = 2
    while offset + 9 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset + 1]
        offset += 2
        while marker == 0xFF and offset < len(data):
            marker = data[offset]
            offset += 1
        if marker in {0xD8, 0xD9}:
            continue
        if offset + 2 > len(data):
            return None
        segment_length = struct.unpack(">H", data[offset : offset + 2])[0]
        if segment_length < 2 or offset + segment_length > len(data):
            return None
        if 0xC0 <= marker <= 0xCF and marker not in {0xC4, 0xC8, 0xCC}:
            if offset + 7 > len(data):
                return None
            height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
            return int(width), int(height)
        offset += segment_length
    return None


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    return png_dimensions(data) or jpeg_dimensions(data)


def extract_floor_plan_basemaps(pptx_path: Path) -> list[FloorPlanBasemap]:
    FLOORPLAN_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    basemaps: list[FloorPlanBasemap] = []
    with zipfile.ZipFile(pptx_path) as archive:
        slide_paths = sorted(
            (
                name
                for name in archive.namelist()
                if re.match(r"ppt/slides/slide\d+\.xml$", name)
            ),
            key=lambda name: int(re.search(r"slide(\d+)\.xml", name).group(1)),
        )
        for slide_path in slide_paths:
            slide_index = int(re.search(r"slide(\d+)\.xml", slide_path).group(1))
            floor_id = SLIDE_FLOOR_IDS.get(slide_index, f"slide-{slide_index}")
            root = ET.fromstring(archive.read(slide_path))
            tree = root.find(f".//{PPT_NS}spTree")
            if tree is None:
                continue
            relationships = read_slide_relationships(archive, slide_path)
            candidates = walk_picture_candidates(tree, slide_index, floor_id, relationships)
            if not candidates:
                continue

            # The deck repeats a small logo image on most slides. The floor plan
            # is the dominant picture by rendered area on each slide.
            selected = max(candidates, key=lambda candidate: candidate.display_area)
            media_data = archive.read(selected.media_path)
            dimensions = image_dimensions(media_data)
            extension = Path(selected.media_path).suffix.lower() or ".png"
            filename = f"{slide_index:02d}-{slugify_for_id(floor_id)}{extension}"
            asset_path = FLOORPLAN_ASSET_DIR / filename
            asset_path.write_bytes(media_data)

            origin_x, origin_z = resolve_floor_origin(floor_id)
            image_width, image_height = dimensions or (0, 0)
            aspect_depth = (
                selected.w * (image_height / image_width)
                if image_width > 0 and image_height > 0
                else selected.h
            )
            width = max(72.0, min(92.0, selected.w * 8.8))
            depth = max(28.0, min(60.0, aspect_depth * 8.8))
            basemaps.append(
                FloorPlanBasemap(
                    id=f"floorplan-haikouwan-{slugify_for_id(floor_id)}",
                    label=f"{floor_id} 平面底图",
                    floorId=floor_id,
                    imageUrl=f"{FLOORPLAN_PUBLIC_BASE_URL}/{filename}",
                    position=vector3(origin_x, 0.0, origin_z),
                    size={
                        "width": round(width, 3),
                        "depth": round(depth, 3),
                    },
                    opacity=0.88,
                    renderOrder=-12,
                    metadata={
                        "source": "地域分布图.pptx",
                        "slide": slide_index,
                        "mediaPath": selected.media_path,
                        "displayInches": {
                            "x": round(selected.x, 3),
                            "y": round(selected.y, 3),
                            "width": round(selected.w, 3),
                            "height": round(selected.h, 3),
                        },
                        "imagePixels": {
                            "width": image_width,
                            "height": image_height,
                        },
                        "role": "floor-plan-basemap",
                    },
                )
            )
    return basemaps


def extract_ppt_text_boxes(pptx_path: Path) -> list[TextBox]:
    boxes: list[TextBox] = []
    with zipfile.ZipFile(pptx_path) as archive:
        slide_paths = sorted(
            (
                name
                for name in archive.namelist()
                if re.match(r"ppt/slides/slide\d+\.xml$", name)
            ),
            key=lambda name: int(re.search(r"slide(\d+)\.xml", name).group(1)),
        )
        for slide_path in slide_paths:
            slide_index = int(re.search(r"slide(\d+)\.xml", slide_path).group(1))
            floor_id = SLIDE_FLOOR_IDS.get(slide_index, f"slide-{slide_index}")
            root = ET.fromstring(archive.read(slide_path))
            tree = root.find(f".//{PPT_NS}spTree")
            if tree is None:
                continue
            boxes.extend(walk_text_boxes(tree, slide_index, floor_id))
    return boxes


def extract_area(text: str) -> float | None:
    area_matches = re.findall(r"(\d+(?:\.\d+)?)\s*(?:㎡|m²|m2)", text, flags=re.IGNORECASE)
    if not area_matches:
        return None
    try:
        return round(float(area_matches[0]), 2)
    except ValueError:
        return None


def extract_shop_id(text: str) -> str | None:
    normalized = normalize_text(text)
    patterns = [
        r"\bB1-\d+(?:-\d+)?\b",
        r"\bL\d-\d+(?:-\d+)?(?:[+/]\d+(?:-\d+)?)?\b",
        r"\bL\d-\d+\s+\d+\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            shop_id = re.sub(r"\s+", "", match.group(0))
            return shop_id.replace("/", "-").replace("+", "-")
    return None


def extract_floor_stats(boxes: list[TextBox]) -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = defaultdict(dict)
    for box in boxes:
        text = box.text
        compact_text = re.sub(r"\s+", "", text)
        for key, label in COUNT_LABELS.items():
            if label not in compact_text:
                continue
            match = re.search(rf"{re.escape(label)}(\d+)", compact_text)
            if match:
                stats[box.floor_id][key] = int(match.group(1))
    return stats


def choose_status(floor_stats: dict[str, int], index: int) -> str:
    signed = floor_stats.get("signedCount", 0)
    confirmed = floor_stats.get("confirmedCount", 0)
    if index < signed:
        return "signed"
    if index < signed + confirmed:
        return "confirmed"
    return "available"


def clean_brand(raw_text: str, shop_id: str, area: float | None) -> str:
    value = raw_text.replace(shop_id, " ")
    value = re.sub(r"\d+(?:\.\d+)?\s*(?:㎡|m²|m2)", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\b\d+(?:\.\d+)?\b", " ", value)
    value = re.sub(r"(?:㎡|m²|m2)", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value).strip(" .，,;；")
    blocked = {
        "已签约",
        "已双确",
        "已 双确",
        "未签约",
        "本层总铺数",
        "海口湾广场",
    }
    if not value or any(item in value for item in blocked):
        return ""
    return value


def normalize_box_size(box: TextBox, area: float | None) -> tuple[float, float]:
    if box.w > 0.05 and box.h > 0.05:
        width = max(4.0, min(16.0, box.w * 7.0))
        depth = max(3.0, min(9.0, box.h * 8.0))
    else:
        base = math.sqrt(max(area or 36.0, 16.0))
        width = max(3.4, min(12.0, base * 0.72))
        depth = max(2.8, min(8.0, base * 0.45))
    if area and area > 300:
        width = max(width, min(18.0, math.sqrt(area) * 0.85))
        depth = max(depth, min(12.0, math.sqrt(area) * 0.55))
    return round(width, 3), round(depth, 3)


def resolve_floor_origin(floor_id: str) -> tuple[float, float]:
    index = FLOOR_ORDER.index(floor_id)
    col = index % 3
    row = index // 3
    return -105.0 + col * 105.0, -82.0 + row * 76.0


def build_shop_records(boxes: list[TextBox], stats: dict[str, dict[str, int]]) -> list[ShopRecord]:
    shops_by_floor: dict[str, list[tuple[TextBox, str, float | None]]] = defaultdict(list)
    seen_ids: set[tuple[str, str]] = set()

    for box in boxes:
        shop_id = extract_shop_id(box.text)
        if not shop_id:
            continue
        identity = (box.floor_id, shop_id)
        if identity in seen_ids:
            continue
        seen_ids.add(identity)
        shops_by_floor[box.floor_id].append((box, shop_id, extract_area(box.text)))

    records: list[ShopRecord] = []
    for floor_id in FLOOR_ORDER:
        floor_boxes = sorted(
            shops_by_floor.get(floor_id, []),
            key=lambda item: (item[0].y, item[0].x, item[1]),
        )
        origin_x, origin_z = resolve_floor_origin(floor_id)
        for index, (box, shop_id, area) in enumerate(floor_boxes):
            width, depth = normalize_box_size(box, area)
            local_x = (box.x - 6.7) * 13.5
            local_z = (box.y - 4.4) * 10.5

            # Some grouped text in the PPT has collapsed shape coordinates. Fall
            # back to a compact shelf layout for those records.
            if abs(local_x) < 2 and abs(local_z) < 2 and (box.w < 0.05 or box.h < 0.05):
                local_x = -34.0 + (index % 8) * 9.5
                local_z = -17.0 + (index // 8) * 8.5

            status = choose_status(stats.get(floor_id, {}), index)
            records.append(
                ShopRecord(
                    floor_id=floor_id,
                    shop_id=shop_id,
                    brand=clean_brand(box.text, shop_id, area),
                    area=area,
                    status=status,
                    x=round(origin_x + local_x, 3),
                    z=round(origin_z + local_z, 3),
                    w=width,
                    d=depth,
                    raw_text=box.text,
                )
            )
    return records


def vector3(x: float, y: float = 0.0, z: float = 0.0) -> dict[str, float]:
    return {"x": round(float(x), 6), "y": round(float(y), 6), "z": round(float(z), 6)}


def zone_boundary(cx: float, cz: float, width: float, depth: float) -> list[dict[str, float]]:
    half_w = width / 2.0
    half_d = depth / 2.0
    return [
        vector3(cx - half_w, 0.0, cz - half_d),
        vector3(cx + half_w, 0.0, cz - half_d),
        vector3(cx + half_w, 0.0, cz + half_d),
        vector3(cx - half_w, 0.0, cz + half_d),
    ]


def zone_entity(
    entity_id: str,
    name: str,
    center_x: float,
    center_z: float,
    width: float,
    depth: float,
    zone_type: str,
    color: str,
    metadata: dict[str, Any],
    timestamp: int,
    status: str = "active",
    capacity: int | None = None,
    current_occupancy: int | None = None,
) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "type": "zone",
        "id": entity_id,
        "name": name,
        "position": vector3(center_x, 0.0, center_z),
        "rotation": vector3(0.0, 0.0, 0.0),
        "scale": vector3(1.0, 1.0, 1.0),
        "status": status,
        "visible": True,
        "metadata": metadata,
        "labelMode": "sprite",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "boundary": zone_boundary(center_x, center_z, width, depth),
        "zoneType": zone_type,
        "color": color,
        "accessRules": [],
    }
    if capacity is not None:
        entity["capacity"] = capacity
    if current_occupancy is not None:
        entity["currentOccupancy"] = current_occupancy
    return entity


def equipment_entity(
    entity_id: str,
    name: str,
    x: float,
    z: float,
    parameters: dict[str, int | float | str | bool],
    metadata: dict[str, Any],
    timestamp: int,
    status: str = "active",
) -> dict[str, Any]:
    return {
        "type": "equipment",
        "id": entity_id,
        "name": name,
        "position": vector3(x, 0.0, z),
        "rotation": vector3(0.0, 0.0, 0.0),
        "scale": vector3(0.85, 0.85, 0.85),
        "status": status,
        "visible": True,
        "metadata": metadata,
        "labelMode": "sprite",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "modelId": "leasing-summary-terminal",
        "parameters": parameters,
        "alarms": [],
    }


def build_scene_entities(
    shops: list[ShopRecord],
    floor_stats: dict[str, dict[str, int]],
    timestamp: int,
) -> dict[str, dict[str, Any]]:
    entities: dict[str, dict[str, Any]] = {}

    for floor_id in FLOOR_ORDER:
        origin_x, origin_z = resolve_floor_origin(floor_id)
        stats = floor_stats.get(floor_id, {})
        total = stats.get("totalCount") or len([shop for shop in shops if shop.floor_id == floor_id])
        signed = stats.get("signedCount", 0)
        confirmed = stats.get("confirmedCount", 0)
        available = stats.get("availableCount", max(0, total - signed - confirmed))
        entities[f"zone-haikouwan-{slugify_for_id(floor_id)}-floor"] = zone_entity(
            f"zone-haikouwan-{slugify_for_id(floor_id)}-floor",
            FLOOR_LABELS[floor_id],
            origin_x,
            origin_z,
            88.0,
            58.0,
            "passage",
            "#64748b",
            {
                "source": "地域分布图.pptx",
                "floorId": floor_id,
                "floorLabel": FLOOR_LABELS[floor_id],
                "signedCount": signed,
                "confirmedCount": confirmed,
                "availableCount": available,
                "totalCount": total,
                "role": "floor-outline",
            },
            timestamp,
            status="active",
            capacity=total,
            current_occupancy=signed + confirmed,
        )
        entities[f"equipment-haikouwan-{slugify_for_id(floor_id)}-summary"] = equipment_entity(
            f"equipment-haikouwan-{slugify_for_id(floor_id)}-summary",
            f"{floor_id} 招商统计",
            origin_x + 37.0,
            origin_z - 25.0,
            {
                "已签约": signed,
                "已双确": confirmed,
                "未签约": available,
                "总铺数": total,
            },
            {
                "source": "地域分布图.pptx",
                "floorId": floor_id,
                "role": "floor-leasing-summary",
            },
            timestamp,
            status="active" if available == 0 else "warning",
        )

    for shop in shops:
        title = f"{shop.shop_id} {shop.brand}".strip()
        zone_type = "work" if shop.status in {"signed", "confirmed"} else "custom"
        status = "active" if shop.status in {"signed", "confirmed"} else "inactive"
        metadata = {
            "source": "地域分布图.pptx",
            "floorId": shop.floor_id,
            "floorLabel": FLOOR_LABELS.get(shop.floor_id, shop.floor_id),
            "shopId": shop.shop_id,
            "brand": shop.brand,
            "areaSqm": shop.area,
            "leasingStatus": shop.status,
            "leasingStatusLabel": {
                "signed": "已签约",
                "confirmed": "已双确",
                "available": "未签约",
                "unknown": "未知",
            }[shop.status],
            "rawText": shop.raw_text,
            "role": "shop-unit",
        }
        entity_id = f"zone-haikouwan-{slugify_for_id(shop.floor_id)}-{slugify_for_id(shop.shop_id)}"
        entities[entity_id] = zone_entity(
            entity_id,
            title,
            shop.x,
            shop.z,
            shop.w,
            shop.d,
            zone_type,
            STATUS_COLORS[shop.status],
            metadata,
            timestamp,
            status=status,
        )

    entities["equipment-haikouwan-overall-summary"] = equipment_entity(
        "equipment-haikouwan-overall-summary",
        "海口湾广场总览",
        0.0,
        -123.0,
        {
            "楼层页数": len(FLOOR_ORDER),
            "商铺点位": len(shops),
            "签约铺位": sum(1 for shop in shops if shop.status == "signed"),
            "双确铺位": sum(1 for shop in shops if shop.status == "confirmed"),
            "未签约铺位": sum(1 for shop in shops if shop.status == "available"),
        },
        {
            "source": "地域分布图.pptx",
            "role": "scene-leasing-summary",
            "project": "海口湾广场",
        },
        timestamp,
        status="active",
    )
    return entities


def build_workspace_state(entities: dict[str, dict[str, Any]], timestamp: int) -> dict[str, Any]:
    scene_config = {
        "id": WORKSPACE_ID,
        "name": WORKSPACE_NAME,
        "gridSize": 340,
        "gridDivisions": 170,
        "backgroundColor": "#080b12",
        "ambientLightIntensity": 0.62,
        "showAxes": False,
        "showGrid": True,
        "cameraPosition": {"x": 105.0, "y": 128.0, "z": 148.0},
        "cameraTarget": {"x": 0.0, "y": 0.0, "z": 0.0},
    }
    ordered_entities = dict(sorted(entities.items()))
    published_entities = list(ordered_entities.values())
    return {
        "sceneVersion": 1,
        "sceneConfig": scene_config,
        "entities": ordered_entities,
        "staticAssets": {},
        "publishedSceneVersion": 1,
        "publishedSceneConfig": scene_config,
        "publishedEntities": published_entities,
        "publishedStaticAssets": [],
        "publishedScene": None,
        "publishedCompilerSource": "pptx-leasing-distribution",
        "publishedUpdatedAt": timestamp,
        "activePublishToken": None,
        "activePublishStartedAt": None,
        "activePublishHeartbeatAt": None,
        "lastPublishedAt": timestamp,
        "lastPublishedVersion": f"pptx-import-{timestamp}",
        "lastPublishError": None,
        "lastFailureSceneVersion": None,
        "lastFailureAt": None,
        "rules": {},
        "alarms": [],
        "connectors": {},
        "bindings": {},
        "auditEvents": [
            {
                "action": "workspace.pptx_scene.import",
                "resourceType": "workspace",
                "resourceId": WORKSPACE_ID,
                "actor": "system",
                "timestamp": timestamp,
                "details": {
                    "source": "地域分布图.pptx",
                    "entityCount": len(ordered_entities),
                    "workspaceId": WORKSPACE_ID,
                },
            }
        ],
    }


def build_workspace_record(timestamp: int, set_homepage: bool) -> dict[str, Any]:
    return {
        "id": WORKSPACE_ID,
        "slug": WORKSPACE_SLUG,
        "name": WORKSPACE_NAME,
        "description": "根据地域分布图.pptx 生成的海口湾广场多楼层招商分布场景",
        "isHomepage": set_homepage,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def upsert_workspace(
    db_path: Path,
    workspace: dict[str, Any],
    state: dict[str, Any],
    set_homepage: bool,
    timestamp: int,
) -> None:
    conn = sqlite3.connect(db_path, timeout=15)
    try:
        conn.execute("PRAGMA busy_timeout=15000")
        with conn:
            if set_homepage:
                rows = conn.execute("SELECT id, workspace_data FROM workspaces").fetchall()
                for workspace_id, workspace_data in rows:
                    current = json.loads(workspace_data)
                    if current.get("id") == workspace["id"]:
                        continue
                    current["isHomepage"] = False
                    conn.execute(
                        """
                        UPDATE workspaces
                        SET is_homepage = 0, workspace_data = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            json.dumps(current, ensure_ascii=False, separators=(",", ":")),
                            timestamp,
                            workspace_id,
                        ),
                    )

            existing = conn.execute(
                "SELECT workspace_data FROM workspaces WHERE id = ?",
                (workspace["id"],),
            ).fetchone()
            if existing:
                old_workspace = json.loads(existing[0])
                workspace["createdAt"] = old_workspace.get("createdAt", workspace["createdAt"])

            conn.execute(
                """
                INSERT INTO workspaces
                    (id, slug, is_homepage, workspace_data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    is_homepage = excluded.is_homepage,
                    workspace_data = excluded.workspace_data,
                    updated_at = excluded.updated_at
                """,
                (
                    workspace["id"],
                    workspace["slug"],
                    1 if workspace["isHomepage"] else 0,
                    json.dumps(workspace, ensure_ascii=False, separators=(",", ":")),
                    workspace["createdAt"],
                    workspace["updatedAt"],
                ),
            )
            conn.execute(
                """
                INSERT INTO workspace_states
                    (workspace_id, state_data, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    state_data = excluded.state_data,
                    updated_at = excluded.updated_at
                """,
                (
                    workspace["id"],
                    json.dumps(state, ensure_ascii=False, separators=(",", ":")),
                    timestamp,
                    timestamp,
                ),
            )
    finally:
        conn.close()


def build_scene_payload(pptx_path: Path, timestamp: int) -> dict[str, Any]:
    boxes = extract_ppt_text_boxes(pptx_path)
    stats = extract_floor_stats(boxes)
    shops = build_shop_records(boxes, stats)
    entities = build_scene_entities(shops, stats, timestamp)
    state = build_workspace_state(entities, timestamp)
    return {
        "sourcePptx": str(pptx_path),
        "workspace": build_workspace_record(timestamp, set_homepage=False),
        "floorStats": {floor_id: stats.get(floor_id, {}) for floor_id in FLOOR_ORDER},
        "shops": [shop.__dict__ for shop in shops],
        "state": state,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pptx", type=Path, default=PPTX_PATH)
    parser.add_argument("--db-path", type=Path, default=DB_PATH)
    parser.add_argument("--output-json", type=Path, default=OUTPUT_JSON_PATH)
    parser.add_argument(
        "--set-homepage",
        action="store_true",
        help="Make the generated workspace the site homepage workspace.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.pptx.exists():
        raise SystemExit(f"PPTX not found: {args.pptx}")
    if not args.db_path.exists():
        raise SystemExit(f"SQLite database not found: {args.db_path}")

    timestamp = now_ms()
    payload = build_scene_payload(args.pptx.resolve(), timestamp)
    payload["workspace"]["isHomepage"] = bool(args.set_homepage)
    payload["workspace"]["updatedAt"] = timestamp

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    upsert_workspace(
        args.db_path.resolve(),
        dict(payload["workspace"]),
        payload["state"],
        bool(args.set_homepage),
        timestamp,
    )

    print(
        json.dumps(
            {
                "status": "ok",
                "workspaceId": WORKSPACE_ID,
                "workspaceSlug": WORKSPACE_SLUG,
                "workspaceName": WORKSPACE_NAME,
                "entityCount": len(payload["state"]["entities"]),
                "shopCount": len(payload["shops"]),
                "outputJson": str(args.output_json),
                "dbPath": str(args.db_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
