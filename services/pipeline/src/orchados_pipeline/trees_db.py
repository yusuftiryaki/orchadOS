"""Tree positions from the inventory in the database (public.slot + public.tree).

Read with the signed-in ops user's token (row level security applies; no
service key). Only active trees count; a tree's position is its slot's
position (WGS84) with the slot's position_uncertainty_m. Slots without a
position (a parcel before its inventory is done) are listed as unlocated and
get no crops.
"""

from __future__ import annotations

import re
from typing import Any

from .models import Tree, TreeList

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
    for s in sorted(slots, key=lambda s: slot_order(s["code"])):
        tree_id = tree_of_slot.get(s["id"])
        if tree_id is None:
            continue  # empty slot
        ll = _lon_lat(s["position"], s["code"])
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
    )


def session_tree_list(client, session_id: str) -> TreeList:
    """The tree list for a session: its parcel's active trees and the session kind."""
    rows = client.select("session", {"id": f"eq.{session_id}", "select": "id,parcel_id,kind"})
    if not rows:
        raise TreesError(f"session {session_id} not found or not visible to this user")
    s = rows[0]
    return parcel_tree_list(client, s["parcel_id"], session_id=s["id"], session_kind=s["kind"])
