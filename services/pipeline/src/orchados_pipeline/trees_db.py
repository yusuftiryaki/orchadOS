"""Tree positions from the inventory in the database (public.slot + public.tree).

Read with the signed-in ops user's token (row level security applies; no
service key). Only active trees count; a tree's position is its slot's
position (WGS84) with the slot's position_uncertainty_m. Slots without a
position (a parcel before its inventory is done) are listed as unlocated and
get no crops. Located slots without an active tree are listed as empty slots:
they get views for the presence check (possible new planting).
"""

from __future__ import annotations

import re
from typing import Any

from .models import EmptySlot, Tree, TreeList

SLOT_CODE = re.compile(r"^S(\d+)-(\d+)([a-z]?)$")


class TreesError(RuntimeError):
    pass


def slot_order(code: str) -> tuple[int, int, str]:
    """Row, position, suffix of a slot code (S5-12a -> 5, 12, 'a'); unknown codes last."""
    m = SLOT_CODE.match(code)
    if m is None:
        return (1 << 30, 0, code)
    return (int(m.group(1)), int(m.group(2)), m.group(3))


def _lon_lat(position: Any, code: str) -> tuple[float, float] | None:
    """PostgREST returns PostGIS points as GeoJSON."""
    if position is None:
        return None
    if isinstance(position, dict) and position.get("type") == "Point":
        lon, lat = position["coordinates"][:2]
        return float(lon), float(lat)
    raise TreesError(f"slot {code}: unexpected position value {position!r}")


def _bbox(geom: Any) -> tuple[float, float, float, float] | None:
    """West, south, east, north of a GeoJSON polygon."""
    if not isinstance(geom, dict) or geom.get("type") != "Polygon":
        return None
    pts = [p for ring in geom["coordinates"] for p in ring]
    lons, lats = [float(p[0]) for p in pts], [float(p[1]) for p in pts]
    return min(lons), min(lats), max(lons), max(lats)


def boundary_bbox(client, parcel_id: str) -> tuple[float, float, float, float] | None:
    """Bounding box of the parcel's newest boundary version (the origin of the
    10 x 10 m cells, as closeup_list() in the database); None without one."""
    rows = client.select("boundary", {"parcel_id": f"eq.{parcel_id}", "select": "id,version,geom"})
    if not rows:
        return None
    return _bbox(max(rows, key=lambda r: r["version"])["geom"])


def parcel_tree_list(
    client, parcel_id: str, session_id: str | None = None, session_kind: str | None = None
) -> TreeList:
    """Active trees of a parcel with their slot codes and positions."""
    slots = client.select(
        "slot",
        {
            "parcel_id": f"eq.{parcel_id}",
            "select": "id,code,position,position_uncertainty_m,local_x_m,local_y_m",
        },
    )
    active = client.select(
        "tree",
        {"parcel_id": f"eq.{parcel_id}", "status": "eq.active", "select": "id,slot_id"},
    )
    tree_of_slot = {t["slot_id"]: t["id"] for t in active}
    trees: list[Tree] = []
    unlocated: list[str] = []
    empty: list[EmptySlot] = []
    for s in sorted(slots, key=lambda s: slot_order(s["code"])):
        tree_id = tree_of_slot.get(s["id"])
        ll = _lon_lat(s["position"], s["code"])
        if tree_id is None:
            # Empty slot: viewed for the presence check (possible new planting).
            if ll is not None:
                empty.append(EmptySlot(slot_id=s["id"], slot_code=s["code"], lat=ll[1], lon=ll[0]))
            continue
        if ll is None:
            unlocated.append(s["code"])
            continue
        trees.append(
            Tree(
                tree_id=tree_id,
                slot_code=s["code"],
                lat=ll[1],
                lon=ll[0],
                position_uncertainty_m=s["position_uncertainty_m"],
                local_x_m=s["local_x_m"],
                local_y_m=s["local_y_m"],
            )
        )
    return TreeList(
        source="database",
        session_id=session_id,
        parcel_id=parcel_id,
        session_kind=session_kind,
        trees=trees,
        unlocated_slots=unlocated,
        empty_slots=empty,
        boundary_bbox=boundary_bbox(client, parcel_id),
    )


def session_tree_list(client, session_id: str) -> TreeList:
    """The tree list for a session: its parcel's active trees and the session kind."""
    rows = client.select("session", {"id": f"eq.{session_id}", "select": "id,parcel_id,kind"})
    if not rows:
        raise TreesError(f"session {session_id} not found or not visible to this user")
    s = rows[0]
    return parcel_tree_list(client, s["parcel_id"], session_id=s["id"], session_kind=s["kind"])
