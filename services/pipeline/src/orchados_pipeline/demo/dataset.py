# ruff: noqa: E501 - Turkish texts of the dataset read better unwrapped
"""The demo dataset, version 1 (docs/demo-turu.md §8): parcels, slots, trees, visits,
their per-tree classes and values, findings, close-ups and questions.

Pure and deterministic: every random choice is seeded from (version, key)
(rng()). The renderer (render.py) draws what this module says, the SQL emitter
(sqlgen.py) writes the same facts as rows.

Season: both periodic scans are in July (summer). The report card's pest and
fruit load rows come only from spring and summer metrics (pest_sign_*,
fruit_load_scale), pruning is a winter and harvest_complete a harvest metric
(public.metric_definition.valid_seasons; apps/web/src/lib/expert/season.ts).
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from fractions import Fraction
from functools import cached_property

import numpy as np

from ..geo import LocalFrame
from . import ids

DATASET_NAME = "orchados-demo"
DATASET_VERSION = 1
# Producer of every algorithmic row and file: pipeline name and version.
PRODUCER = "orchados-demo"
PRODUCER_VERSION = "1"
METHODOLOGY = "methodology-v0.1"
CAMERA_HEIGHT_M = 2.0
# Today, for the "no future dates" rule.
TODAY = datetime(2026, 10, 28, tzinfo=UTC)

CLASSES = ("healthy", "attention", "problem", "dead", "absent")


def rng(key: str, version: int = DATASET_VERSION) -> np.random.Generator:
    """Generator seeded from (dataset version, key)."""
    digest = hashlib.sha256(f"{DATASET_NAME}:v{version}:{key}".encode()).digest()
    return np.random.default_rng(int.from_bytes(digest[:8], "little"))


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=UTC)


# ---------------------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class ParcelSpec:
    key: str  # "A" | "B"
    id: str
    name: str
    village: str
    district: str
    origin_lat: float
    origin_lon: float
    row_azimuth_deg: float  # local x axis, clockwise from north
    rows: int
    positions: int
    row_spacing_m: float
    tree_spacing_m: float
    irrigation: str
    estimated_tree_count: int
    # Boundary in local metres (field survey), counter-clockwise.
    boundary: tuple[tuple[float, float], ...]

    @cached_property
    def frame(self) -> LocalFrame:
        return LocalFrame(self.origin_lat, self.origin_lon)

    def to_en(self, x: float, y: float) -> tuple[float, float]:
        """Local (x along rows, y across) -> east/north metres from the origin."""
        t = math.radians(self.row_azimuth_deg)
        return x * math.sin(t) - y * math.cos(t), x * math.cos(t) + y * math.sin(t)

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        e, n = self.to_en(x, y)
        lat, lon = self.frame.to_latlon(e, n)
        return float(lat), float(lon)

    def slot_xy(self, row: int, pos: int) -> tuple[float, float]:
        return (
            self.tree_spacing_m / 2 + (pos - 1) * self.tree_spacing_m,
            self.row_spacing_m / 2 + (row - 1) * self.row_spacing_m,
        )

    @property
    def length_m(self) -> float:
        return self.positions * self.tree_spacing_m

    @property
    def width_m(self) -> float:
        return self.rows * self.row_spacing_m

    @property
    def area_m2(self) -> float:
        return self.length_m * self.width_m


PARCEL_A = ParcelSpec(
    key="A",
    id=ids.PARCEL_A,
    name="Örnek Bahçe – Kuzey",
    village="Örnek Köyü",
    district="Şehitkamil",
    origin_lat=37.13862,
    origin_lon=37.56421,
    row_azimuth_deg=80.0,
    rows=6,
    positions=12,
    row_spacing_m=7.0,
    tree_spacing_m=6.0,
    irrigation="irrigated",
    estimated_tree_count=75,
    boundary=((0.0, 0.0), (72.0, 0.0), (72.6, 21.0), (72.0, 42.0), (0.0, 42.0), (-0.5, 20.0)),
)
PARCEL_B = ParcelSpec(
    key="B",
    id=ids.PARCEL_B,
    name="Örnek Bahçe – Dere",
    village="Örnek Köyü",
    district="Şehitkamil",
    origin_lat=37.13571,
    origin_lon=37.56874,
    row_azimuth_deg=100.0,
    rows=4,
    positions=8,
    row_spacing_m=7.0,
    tree_spacing_m=6.0,
    irrigation="irrigated",
    estimated_tree_count=30,
    boundary=((0.0, 0.0), (48.0, 0.0), (48.0, 28.0), (24.0, 28.6), (0.0, 28.0)),
)
PARCELS = (PARCEL_A, PARCEL_B)


# ---------------------------------------------------------------------------------------
# Slots and trees
# ---------------------------------------------------------------------------------------


@dataclass
class Slot:
    parcel: ParcelSpec
    row: int
    pos: int

    @property
    def code(self) -> str:
        return f"S{self.row}-{self.pos}"

    @property
    def key(self) -> str:
        return f"{self.parcel.key}:{self.code}"

    @property
    def id(self) -> str:
        return ids.did("slot", self.key)

    @property
    def xy(self) -> tuple[float, float]:
        return self.parcel.slot_xy(self.row, self.pos)

    @property
    def latlon(self) -> tuple[float, float]:
        return self.parcel.to_latlon(*self.xy)


@dataclass
class Tree:
    slot: Slot
    sex: str
    graft: str
    age_class: str
    cultivar: str
    stem_form: str
    # Drawing: total height, crown radius, trunk lean (degrees, direction), jitter.
    height_m: float
    crown_r_m: float
    lean_deg: float
    lean_dir_deg: float
    dx: float
    dy: float

    @property
    def id(self) -> str:
        return ids.did("tree", self.slot.key)

    @property
    def code(self) -> str:
        return self.slot.code

    @property
    def xy(self) -> tuple[float, float]:
        x, y = self.slot.xy
        return x + self.dx, y + self.dy


# Parcel layouts. Codes not listed are female, grafted, productive, single stem.
LAYOUT = {
    "A": {
        "empty": {"S2-12", "S5-1"},
        "male": {"S1-6", "S2-3", "S2-10", "S3-8", "S4-5", "S5-11", "S6-7"},
        "ungrafted": {"S1-9", "S4-12", "S6-11"},
        "young": {"S1-12", "S2-1", "S3-1", "S4-1", "S5-2", "S6-1"},
        "old": {"S1-1", "S6-12"},
        "sapling": {"S3-11"},  # young replant, first seen at the inventory
        "multi": {"S4-12", "S2-5"},
    },
    "B": {
        "empty": {"S4-8"},
        "male": {"S1-4", "S2-8", "S4-2"},
        "ungrafted": {"S3-1", "S1-8"},
        "young": {"S4-1", "S4-3"},
        "old": set(),
        "sapling": set(),
        "multi": {"S3-1"},
    },
}


def _cultivar(code: str, sex: str, row: int, pos: int) -> str:
    if sex == "male":
        return "Erkek (tozlayıcı)"
    if (row + pos) % 5 == 0:
        return "Siirt"
    if (row * pos) % 7 == 0:
        return "Uzun"
    return "Kırmızı"


def make_trees(parcel: ParcelSpec) -> tuple[list[Slot], list[Tree]]:
    lay = LAYOUT[parcel.key]
    slots = [
        Slot(parcel, r, p)
        for r in range(1, parcel.rows + 1)
        for p in range(1, parcel.positions + 1)
    ]
    trees = []
    for s in slots:
        if s.code in lay["empty"]:
            continue
        g = rng(f"tree:{s.key}")
        sex = "male" if s.code in lay["male"] else "female"
        age = (
            "sapling"
            if s.code in lay["sapling"]
            else "young"
            if s.code in lay["young"]
            else "old"
            if s.code in lay["old"]
            else "productive"
        )
        height = {"sapling": 1.3, "young": 3.0, "productive": 4.3, "old": 4.9}[age]
        crown = {"sapling": 0.45, "young": 1.35, "productive": 2.0, "old": 2.3}[age]
        if sex == "male":
            height += 0.4
        trees.append(
            Tree(
                slot=s,
                sex=sex,
                graft="ungrafted" if s.code in lay["ungrafted"] else "grafted",
                age_class=age,
                cultivar=_cultivar(s.code, sex, s.row, s.pos),
                stem_form="multi" if s.code in lay["multi"] else "single",
                height_m=float(height * g.uniform(0.92, 1.08)),
                crown_r_m=float(crown * g.uniform(0.9, 1.1)),
                lean_deg=float(g.uniform(1.0, 7.0)),
                lean_dir_deg=float(g.uniform(0, 360)),
                dx=float(g.normal(0, 0.12)),
                dy=float(g.normal(0, 0.12)),
            )
        )
    return slots, trees


# ---------------------------------------------------------------------------------------
# Visits
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Frame:
    """A camera stop along the scan path."""

    index: int
    x: float
    y: float
    heading_deg: float  # world, clockwise from north
    time: datetime
    quality: float
    # Uploaded image variants: ("full", "preview"), ("preview",) or () (coverage only).
    variants: tuple[str, ...]


@dataclass
class Visit:
    key: str  # A-INV25, A-SCN25, A-SCN26, B-INV26, B-SCN26, A-VER25, B-VER26
    id: str
    parcel: ParcelSpec
    kind: str  # inventory | periodic_scan | verification
    status: str
    day: str  # planned date
    start: datetime
    end: datetime
    published_at: datetime | None
    aisles: tuple[float, ...] = ()  # local y of the driven aisles
    step_m: float = 8.0
    full_variants: bool = False
    uploaded: frozenset[int] | None = None  # frame indices with a preview; None: all
    weather: dict = field(default_factory=dict)

    @property
    def year(self) -> int:
        return self.start.year

    @cached_property
    def frames(self) -> list[Frame]:
        if not self.aisles:
            return []
        g = rng(f"frames:{self.parcel.key}:{self.kind}")  # same path in both years
        gy = rng(f"frames:{self.key}")
        out = []
        n = 0
        t = self.start + timedelta(minutes=8)
        xs = np.arange(0.0, self.parcel.length_m + 0.01, self.step_m)
        for a, y in enumerate(self.aisles):
            order = xs if a % 2 == 0 else xs[::-1]
            heading = self.parcel.row_azimuth_deg + (0.0 if a % 2 == 0 else 180.0)
            for x in order:
                jx, jy = g.normal(0, 0.25), g.normal(0, 0.15)
                # A year apart the crew walks nearly the same line.
                jx += gy.normal(0, 0.3)
                jy += gy.normal(0, 0.2)
                if self.uploaded is None or n in self.uploaded:
                    variants = ("full", "preview") if self.full_variants else ("preview",)
                else:
                    variants = ()
                out.append(
                    Frame(
                        index=n,
                        x=float(x + jx),
                        y=float(y + jy),
                        heading_deg=float((heading + gy.normal(0, 1.5)) % 360.0),
                        time=t,
                        quality=float(np.clip(0.86 + g.normal(0, 0.05), 0.7, 0.98)),
                        variants=variants,
                    )
                )
                n += 1
                t += timedelta(seconds=int(self.step_m * 1.8 + gy.integers(0, 6)))
            t += timedelta(seconds=40)
        return out


def _visits() -> list[Visit]:
    A, B = PARCEL_A, PARCEL_B
    # Inventory: every aisle, a frame every 2 m (coverage from both sides, as the
    # pipeline's dense frames); ~16 / ~8 previews kept.
    a_all = tuple(float(y) for y in np.arange(0.0, A.width_m + 0.01, A.row_spacing_m))
    b_all = tuple(float(y) for y in np.arange(0.0, B.width_m + 0.01, B.row_spacing_m))
    a_pos = int(A.length_m // 2) + 1  # frames per aisle
    b_pos = int(B.length_m // 2) + 1

    # Driving order reverses on odd aisles: keep the same x on every aisle.
    def keep(aisles, positions, per_aisle):
        return frozenset(
            a * per_aisle + (p if a % 2 == 0 else per_aisle - 1 - p)
            for a in aisles
            for p in positions
        )

    a_keep = keep((0, 2, 4, 6), (4, 12, 20, 28), a_pos)
    b_keep = keep((1, 3), (0, 8, 16, 24), b_pos)
    clear = {"sky": "clear", "temp_c": 31, "wind": "light"}
    return [
        Visit(
            "A-INV25",
            ids.A_INVENTORY,
            A,
            "inventory",
            "published",
            "2025-06-10",
            utc("2025-06-10 05:40"),
            utc("2025-06-10 08:10"),
            utc("2025-06-16 14:20"),
            aisles=a_all,
            step_m=2.0,
            uploaded=a_keep,
            weather={**clear, "temp_c": 27},
        ),
        Visit(
            "A-VER25",
            ids.did("session", "A-VER25"),
            A,
            "verification",
            "captured",
            "2025-06-12",
            utc("2025-06-12 06:00"),
            utc("2025-06-12 06:40"),
            None,
            weather={**clear, "temp_c": 26},
        ),
        Visit(
            "A-SCN25",
            ids.A_SCAN_2025,
            A,
            "periodic_scan",
            "published",
            "2025-07-15",
            utc("2025-07-15 05:30"),
            utc("2025-07-15 07:45"),
            utc("2025-07-19 15:10"),
            aisles=(0.0, 14.0, 28.0, 42.0),
            weather=clear,
        ),
        Visit(
            "A-SCN26",
            ids.A_SCAN_2026,
            A,
            "periodic_scan",
            "published",
            "2026-07-14",
            utc("2026-07-14 05:35"),
            utc("2026-07-14 07:55"),
            utc("2026-07-18 16:05"),
            aisles=(0.0, 14.0, 28.0, 42.0),
            full_variants=True,
            weather={**clear, "temp_c": 33},
        ),
        Visit(
            "B-INV26",
            ids.B_INVENTORY,
            B,
            "inventory",
            "published",
            "2026-06-09",
            utc("2026-06-09 05:50"),
            utc("2026-06-09 07:20"),
            utc("2026-06-13 11:30"),
            aisles=b_all,
            step_m=2.0,
            uploaded=b_keep,
            weather={**clear, "temp_c": 28},
        ),
        Visit(
            "B-VER26",
            ids.did("session", "B-VER26"),
            B,
            "verification",
            "captured",
            "2026-06-11",
            utc("2026-06-11 06:10"),
            utc("2026-06-11 06:30"),
            None,
            weather={**clear, "temp_c": 27},
        ),
        Visit(
            "B-SCN26",
            ids.B_SCAN_2026,
            B,
            "periodic_scan",
            "published",
            "2026-07-16",
            utc("2026-07-16 05:40"),
            utc("2026-07-16 06:50"),
            utc("2026-07-20 12:45"),
            aisles=(7.0, 21.0),
            step_m=7.0,
            weather={**clear, "temp_c": 32},
        ),
    ]


# ---------------------------------------------------------------------------------------
# Classes and values per visit
# ---------------------------------------------------------------------------------------

# Class of a tree in a periodic scan; trees not listed are healthy.
CLASSES_BY_SCAN = {
    "A-SCN25": {
        "problem": {"S4-3", "S5-8"},
        "attention": {"S2-9", "S4-10", "S5-4", "S6-5", "S1-7"},
    },
    "A-SCN26": {
        "dead": {"S4-3"},
        "problem": {"S3-6", "S5-8", "S2-9", "S6-5", "S1-7"},
        "attention": {"S5-4", "S4-10", "S1-11", "S2-6", "S3-2", "S4-8", "S5-10", "S6-9", "S1-3"},
        "absent": {"S6-2"},
    },
    "B-SCN26": {"problem": {"S2-5"}, "attention": {"S3-3", "S1-6"}},
}
FEATURED = ("A", "S3-6")

PEST = {
    "A-SCN25": {"marked": set(), "mild": {"S4-10", "S2-6"}},
    "A-SCN26": {"marked": {"S4-10"}, "mild": {"S1-11", "S2-6", "S3-2", "S5-10"}},
    "B-SCN26": {"marked": set(), "mild": {"S3-3"}},
}
SPROUTS_DENSE = {"S2-9", "S4-12", "S6-5"}
GUMMOSIS = {"S2-9"}


def tree_class(visit_key: str, code: str) -> str:
    for cls, codes in CLASSES_BY_SCAN.get(visit_key, {}).items():
        if code in codes:
            return cls
    return "healthy"


def tree_values(visit: Visit, tree: Tree, cls: str) -> dict[str, object]:
    """Expert values of one tree in a periodic scan, by metric code.

    An absent tree gets none (nothing to judge); a male tree no fruit load.
    """
    if cls == "absent":
        return {}
    g = rng(f"values:{visit.key}:{tree.code}")
    step = {"healthy": 0, "attention": 1, "problem": 2, "dead": 3}[cls]
    dead_branch = step if step else int(g.random() < 0.12)
    crown = step if step else int(g.random() < 0.1)
    if tree.age_class == "sapling":
        dead_branch = crown = 0
    v: dict[str, object] = {
        "dead_branch_scale": dead_branch,
        "crown_density_scale": crown,
        "trunk_base_scale": (
            (2 if visit.year == 2026 else 1)
            if tree.code in GUMMOSIS
            else 1
            if cls == "dead" or g.random() < 0.06
            else 0
        ),
        "dieback_pattern": {
            "healthy": "none",
            "attention": "tip_dieback",
            "problem": "one_sided",
            "dead": "top_down",
        }[cls],
        "dried_leaves_attached": cls in ("problem", "dead"),
        "basal_sprout_level": (
            "dense"
            if tree.code in SPROUTS_DENSE or tree.graft == "ungrafted"
            else "few"
            if g.random() < 0.2
            else "none"
        ),
    }
    pest = PEST.get(visit.key, {})
    severity = (
        "marked"
        if tree.code in pest.get("marked", ())
        else "mild"
        if tree.code in pest.get("mild", ())
        else "none"
    )
    v["pest_sign_severity"] = severity
    if severity != "none":
        v["pest_sign_type"] = "psylla"
    if tree.sex == "female":
        if tree.age_class == "sapling" or cls == "dead":
            fruit = 0
        elif visit.year == 2025:  # "on" year
            fruit = {
                "healthy": int(g.choice([2, 3], p=[0.45, 0.55])),
                "attention": 2,
                "problem": 1,
            }[cls]
        else:  # "off" year: alternate bearing
            fruit = {
                "healthy": int(g.choice([1, 2], p=[0.35, 0.65])),
                "attention": 1,
                "problem": int(g.integers(0, 2)),
            }[cls]
        if tree.age_class == "young" and fruit > 1:
            fruit -= 1
        v["fruit_load_scale"] = fruit
    return v


# Inventory: the expert's first observations (inventory report, "ilk gözlemler").
INVENTORY_CODES = (
    "dieback_pattern",
    "dried_leaves_attached",
    "basal_sprout_level",
    "trunk_base_scale",
)


def inventory_values(visit: Visit, tree: Tree) -> dict[str, object]:
    g = rng(f"inventory:{visit.key}:{tree.code}")
    weak = tree.code in ("S4-3", "S5-8") and visit.parcel.key == "A"
    return {
        "dieback_pattern": "tip_dieback" if weak else "none",
        "dried_leaves_attached": False,
        "basal_sprout_level": "dense"
        if tree.graft == "ungrafted"
        else "few"
        if g.random() < 0.15
        else "none",
        "trunk_base_scale": 1 if tree.code in GUMMOSIS else 0,
    }


# ---------------------------------------------------------------------------------------
# Findings, close-ups, questions
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    visit: str
    key: str  # unique within the visit: slot code or a parcel-level name
    kind: str
    severity: str
    description: str
    recommendation: str
    tree: str | None = None  # slot code
    zone: str | None = None  # zone key
    closeups: tuple[str, ...] = ()  # macro scene kinds (closeups.py)

    @property
    def id(self) -> str:
        return ids.did("finding", f"{self.visit}:{self.key}")


FINDINGS = (
    # A, summer 2026
    Finding(
        "A-SCN26",
        "S3-6",
        "dead_branch",
        "medium",
        "S3-6: tacın kuzey yarısında %25–30 kuru dal; yapraklar dalda kurumuş. Geçen yaz ağaç sağlıklıydı.",
        "Kuru dallar kış budamasında sağlam dokuya kadar alınsın; kesik yerleri macunlansın. "
        "İlkbaharda yeni sürgünler yakın planla kontrol edilecek.",
        tree="S3-6",
        closeups=("dry_twig", "leaflets_dry", "leaflets"),
    ),
    Finding(
        "A-SCN26",
        "S5-8",
        "dead_branch",
        "medium",
        "S5-8: tacın güneybatısında kuru dallar, bir yılda belirgin artış.",
        "Kış budamasında kuru dallar alınsın; sulama hattında bu ağaca su gidip gitmediği kontrol edilsin.",
        tree="S5-8",
        closeups=("dry_twig", "leaflets_dry"),
    ),
    Finding(
        "A-SCN26",
        "S2-9",
        "trunk_damage",
        "medium",
        "S2-9: gövde dibinde yara ve zamk akıntısı; çevresinde yoğun dip sürgünü.",
        "Yara çevresi temizlenip kurutulsun, dip sürgünleri alınsın; gövde dibinde su birikmemesine dikkat edilsin.",
        tree="S2-9",
        closeups=("bark_gum", "bark"),
    ),
    Finding(
        "A-SCN26",
        "S6-5",
        "canopy_dieback",
        "medium",
        "S6-5: tacın tek yanında kuruma ve seyrelme.",
        "Bir sonraki ziyarette yakından bakılsın; kök boğazı ve sulama kontrol edilsin.",
        tree="S6-5",
        closeups=("leaflets_dry", "dry_twig"),
    ),
    Finding(
        "A-SCN26",
        "S1-7",
        "dead_branch",
        "low",
        "S1-7: alt dallarda tek tük kuru dal.",
        "Kış budamasında alınsın.",
        tree="S1-7",
    ),
    Finding(
        "A-SCN26",
        "S4-3",
        "dead_tree",
        "high",
        "S4-3: ağaçta canlı yaprak ve sürgün yok; geçen yıl tacın yarısı kuruydu.",
        "Söküm ve aynı yere yeni dikim değerlendirilsin; çevredeki ağaçlara geçen bir hastalık belirtisi görülmedi.",
        tree="S4-3",
        closeups=("dry_twig", "bark"),
    ),
    Finding(
        "A-SCN26",
        "S6-2",
        "missing_tree",
        "high",
        "S6-2: envanterde ve geçen yaz kayıtlı ağaç bu ziyarette yerinde görülmedi; yerde kesim izi var.",
        "Ağacın ne zaman ve neden kesildiğini bahçıvanınıza sorun; yeni dikim istenirse envantere eklenir.",
        tree="S6-2",
    ),
    Finding(
        "A-SCN26",
        "S4-10",
        "pest_sign",
        "medium",
        "S4-10: yapraklarda yapışkanlık, siyah is ve psil belirtisi; tacın tamamında.",
        "Bölgedeki uyarı sistemine göre psil mücadelesi bahçıvanla planlansın; komşu ağaçlar izlensin.",
        tree="S4-10",
        closeups=("psyllid", "leaflets"),
    ),
    Finding(
        "A-SCN26",
        "S1-11",
        "pest_sign",
        "low",
        "S1-11: birkaç yaprakta hafif psil belirtisi.",
        "Şimdilik izlenmesi yeterli; bir sonraki ziyarette yeniden bakılacak.",
        tree="S1-11",
        closeups=("psyllid", "leaflets"),
    ),
    Finding(
        "A-SCN26",
        "S5-4",
        "other",
        "low",
        "S5-4: yapraklarda genel sararma; taç seyrelmeye başlamış.",
        "Toprak nemi ve gübreleme bahçıvanla gözden geçirilsin; gerekirse yaprak analizi yapılsın.",
        tree="S5-4",
        closeups=("leaflets_yellow", "leaflets"),
    ),
    Finding(
        "A-SCN26",
        "S1-3",
        "other",
        "low",
        "S1-3: salkımların bir kısmı boş; meyve tutumu düşük.",
        "Var-yok yılı etkisi olabilir; tozlayıcı erkek ağaçların çiçeklenmesi gelecek bahar izlensin.",
        tree="S1-3",
        closeups=("empty_cluster", "leaflets"),
    ),
    Finding(
        "A-SCN26",
        "irrigation",
        "irrigation_leak",
        "low",
        "Güney kenardaki ana sulama hattında, S1-4 hizasında sızıntı ve ıslak toprak.",
        "Bağlantı parçası bahçıvan tarafından değiştirilsin; sızıntı sürerse ilk sıradaki ağaçlar fazla su alır.",
        zone="irrigation_line",
    ),
    Finding(
        "A-SCN26",
        "weeds",
        "other",
        "low",
        "Kuzey kenarda (5. ve 6. sıra arası) diz boyunu geçen kuru ot; hasatta yangın riski.",
        "Hasattan önce biçilsin ya da sürülsün.",
        zone="north_strip",
    ),
    # A, summer 2025
    Finding(
        "A-SCN25",
        "S4-3",
        "dead_branch",
        "medium",
        "S4-3: tacın yarısına yakın kuru dal.",
        "Kış budamasında kuru dallar alınsın; ağaç gelecek yıl yakından izlensin.",
        tree="S4-3",
    ),
    Finding(
        "A-SCN25",
        "S5-8",
        "dead_branch",
        "medium",
        "S5-8: tacın güneybatısında kuru dallar.",
        "Kış budamasında alınsın.",
        tree="S5-8",
    ),
    Finding(
        "A-SCN25",
        "S2-9",
        "trunk_damage",
        "low",
        "S2-9: gövde dibinde küçük yara, hafif zamklanma.",
        "Yara izlenmeli; çapa ile gövdeye zarar verilmemeli.",
        tree="S2-9",
    ),
    Finding(
        "A-SCN25",
        "S4-10",
        "pest_sign",
        "low",
        "S4-10: birkaç yaprakta hafif psil belirtisi.",
        "İzlenmesi yeterli.",
        tree="S4-10",
    ),
    Finding(
        "A-SCN25",
        "weeds",
        "other",
        "low",
        "Kuzey kenarda yabancı ot.",
        "Temmuz sonuna kadar biçilsin.",
        zone="north_strip",
    ),
    # B, summer 2026
    Finding(
        "B-SCN26",
        "S2-5",
        "dead_branch",
        "medium",
        "S2-5: tacın batı yanında kuru dallar.",
        "Kış budamasında kuru dallar alınsın.",
        tree="S2-5",
        closeups=("dry_twig", "leaflets_dry"),
    ),
    Finding(
        "B-SCN26",
        "S3-3",
        "pest_sign",
        "low",
        "S3-3: yapraklarda hafif psil belirtisi.",
        "İzlenmesi yeterli; bir sonraki ziyarette yeniden bakılacak.",
        tree="S3-3",
        closeups=("psyllid",),
    ),
    Finding(
        "B-SCN26",
        "irrigation",
        "irrigation_leak",
        "low",
        "Kuyu çıkışında vanada damlama.",
        "Vananın contası değiştirilsin.",
        zone="well",
    ),
)

# (key, parcel, kind, name, local geometry: point (x, y) or line ((x, y), ...))
ZONES = (
    ("gate", "A", "gate", "Ana kapı", (-0.3, 21.0)),
    ("well", "A", "well", "Kuyu", (74.0, 39.0)),
    ("irrigation_line", "A", "irrigation_line", "Ana sulama hattı", ((1.0, 1.2), (71.0, 1.2))),
    ("north_strip", "A", "other", "Kuzey kenar şeridi", ((1.0, 41.0), (71.0, 41.0))),
    ("gate", "B", "gate", "Kapı", (0.0, 14.0)),
    ("well", "B", "well", "Kuyu", (49.5, 26.0)),
)


@dataclass(frozen=True)
class Question:
    key: str
    parcel: str
    author: str  # persona id
    body: str
    reply: str
    tree: str | None = None
    finding: str | None = None  # Finding id key "visit:key"


QUESTIONS = (
    Question(
        "q-s3-6",
        "A",
        ids.OWNER,
        "S3-6'daki kuru dallar geçen yaz yoktu. Ağacı kaybetme riskimiz var mı, budamayı beklemeli miyiz?",
        "Fotoğraflarda kuruma tacın kuzey yarısında ve dal uçlarından başlıyor; gövde ve kök boğazı sağlam görünüyor. "
        "Ağacı kaybetme riski şu an düşük. Kuru dalları kış budamasında almak yeterli; ilkbaharda yeni sürgünlere "
        "yakın planla yeniden bakacağız.",
        tree="S3-6",
    ),
    Question(
        "q-irrigation",
        "A",
        ids.VIEWER,
        "Sulama hattındaki sızıntı ağaçlara zarar verir mi? Ne kadar sürede onarılmalı?",
        "Sızıntı ilk sıradaki birkaç ağacın dibinde sürekli ıslaklık yapıyor; uzun sürerse kök boğazında çürüme "
        "riskini artırır. Bağlantı parçasının bir iki hafta içinde değiştirilmesini öneririz. Bir sonraki ziyarette "
        "bu bölgeyi ayrıca kontrol edeceğiz.",
        finding="A-SCN26:irrigation",
    ),
)

# Verification visit items: (slot code, reasons, tree present, note)
VERIFICATION = {
    "A-VER25": (
        ("S2-12", ("empty_slot",), False, "Yer boş; dikim izi yok."),
        ("S5-1", ("empty_slot",), False, "Yer boş."),
        ("S3-11", ("possible_sapling",), True, "Yeni dikilmiş fidan, aşılı."),
        ("S4-12", ("unsure", "multi_stem"), True, "Çok gövdeli, aşısız ağaç."),
    ),
    "B-VER26": (("S4-8", ("empty_slot",), False, "Yer boş."),),
}
UNSURE_LABELS = {("A", "S4-12")}


# ---------------------------------------------------------------------------------------
# Service layer: weed mowing (docs/MVP.md Module 6, IP15)
# ---------------------------------------------------------------------------------------

# The field question "Bahçede yabani ot ne boyda?" (weed_height, parcel subject),
# answered once in spring and summer visits; by visit key. A's tall weeds match the
# north strip finding; B was mowed three weeks before its scan.
WEED_HEIGHTS = {"A-SCN26": "tall", "B-SCN26": "short"}
# Field protocol of the question by season (apps/field closeup_protocol.dart).
FIELD_PROTOCOL = {"spring": "spring-v0.2", "summer": "summer-v0.3"}
# Months of the visits in this dataset; season.ts: June-July summer.
SEASON_OF_MONTH = {6: "summer", 7: "summer"}
FIELD_QUESTION_METHOD = "field_question"

# The demo org's catalogue row: the draft launch price of docs/MVP.md Module 6, as
# the migration seeds it for other orgs (20261106100100_service_layer.sql skips
# demo orgs).
SERVICE_TYPE = {
    "code": "weed_mowing",
    "name": "Yabani ot biçme",
    "description": "orchadOS ot biçme hizmeti: parseldeki yabani otlar motorlu tırpanla biçilir. "
    "Öncesi ve sonrası fotoğrafları parsel kaydına eklenir.",
    "operation_kind": "mowing",
    "price_per_donum_kurus": 37500,
    "minimum_fee_kurus": 250000,
    "vat_rate_bp": 2000,
    "price_is_draft": True,
    "season_start_month": 3,
    "season_start_day": 1,
    "season_end_month": 6,
    "season_end_day": 30,
    "recommend_from_weed_height": "medium",
    "observation_max_age_days": 60,
    "sort_order": 10,
}
# Service terms the owner accepted (20261106300000_legal_text_service_terms.sql).
SERVICE_TERMS_VERSION = "bakim-v1-taslak"
PRICING_RULE = "service-v1"


def _round_half_up(x: Fraction) -> int:
    """Postgres round() of a positive numeric: half away from zero."""
    return math.floor(x + Fraction(1, 2))


def service_quote(
    area_m2: float, price_per_donum_kurus: int, minimum_fee_kurus: int, vat_rate_bp: int
) -> tuple[int, int, int]:
    """private.service_quote (service-v1): max(ceil(area/100) x price / 10, minimum) + VAT.

    Exact arithmetic, as Postgres numeric; returns (subtotal, vat, total) in kuruş.
    """
    if area_m2 <= 0 or price_per_donum_kurus <= 0 or minimum_fee_kurus < 0:
        raise ValueError("invalid quote input")
    if not 0 <= vat_rate_bp <= 10000:
        raise ValueError("invalid VAT rate")
    area = Fraction(_round_half_up(Fraction(area_m2) * 100), 100)
    tenths = math.ceil(area / 100)
    subtotal = max(_round_half_up(Fraction(tenths * price_per_donum_kurus, 10)), minimum_fee_kurus)
    vat = _round_half_up(Fraction(subtotal * vat_rate_bp, 10000))
    return subtotal, vat, subtotal + vat


def polygon_area_m2(points: tuple[tuple[float, float], ...]) -> float:
    """Shoelace area of a local-metre polygon (the boundary's geography area within cm²)."""
    s = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1], strict=True):
        s += x0 * y1 - x1 * y0
    return abs(s) / 2


@dataclass(frozen=True)
class ServicePhoto:
    phase: str  # before | after
    scene: str  # closeups.SERVICE_SCENES
    time: datetime

    def key(self, job: ServiceJob) -> str:
        return f"{job.short}-{self.phase.upper()}"


@dataclass(frozen=True)
class ServiceJob:
    """A done weed mowing job: request, schedule, the crew's day, proof photos, payment.

    In the 2026 season, after B's inventory (the quote needs the walked boundary) and
    before its July scan. The owner asked for an early job inside the 14-day
    withdrawal period (H37), so the day is nine days after the request.
    """

    key: str
    short: str  # stamp prefix of its photos
    parcel: ParcelSpec
    number: str
    requested_at: datetime
    preferred_window: str
    customer_note: str | None
    early_performance: bool
    scheduled_at: datetime  # ops confirmed the amount and the day
    scheduled_date: str
    work_start: datetime  # the job day at 08:00 Turkey time (ops_complete_service_request)
    done_at: datetime  # ops closed the job
    completed_on: str
    payment_on: str
    payment_method: str
    photos: tuple[ServicePhoto, ...]

    @property
    def id(self) -> str:
        """The job's session (kind mowing): media are filed under it."""
        return ids.did("session", self.key)

    @property
    def request_id(self) -> str:
        return ids.did("service_request", self.key)

    @property
    def operation_id(self) -> str:
        return ids.did("operation", self.key)

    @property
    def season_year(self) -> int:
        return self.requested_at.year

    def quote(self) -> tuple[int, int, int]:
        t = SERVICE_TYPE
        return service_quote(
            polygon_area_m2(self.parcel.boundary),
            t["price_per_donum_kurus"],
            t["minimum_fee_kurus"],
            t["vat_rate_bp"],
        )


SERVICE_JOBS = (
    ServiceJob(
        key="B-MOW26",
        short="B26M",
        parcel=PARCEL_B,
        number="H-2026-000001",
        requested_at=utc("2026-06-15 07:20"),
        preferred_window="asap",
        customer_note="Otlar dizi geçti; hasattan önce biçilmesini istiyoruz.",
        early_performance=True,
        scheduled_at=utc("2026-06-16 08:05"),
        scheduled_date="2026-06-24",
        work_start=utc("2026-06-24 05:00"),
        done_at=utc("2026-06-24 15:30"),
        completed_on="2026-06-24",
        payment_on="2026-06-26",
        payment_method="transfer",
        photos=(
            ServicePhoto("before", "grass_tall", utc("2026-06-24 05:12")),
            ServicePhoto("after", "grass_mowed", utc("2026-06-24 08:41")),
        ),
    ),
)

# Robot suitability notes per parcel (staff only): slope, stoniness, lowest branch.
ROBOT_NOTES = {
    "A": ("flat", "low", 60, "Sıralar düz, koridorlar geniş; kuzey kenarda ot yoğun."),
    "B": ("gentle", "medium", 45, "Dereye doğru hafif eğim; kuyu çevresinde taş var."),
}


# ---------------------------------------------------------------------------------------
# The dataset
# ---------------------------------------------------------------------------------------


@dataclass
class Dataset:
    version: int
    slots: dict[str, list[Slot]]
    trees: dict[str, list[Tree]]
    visits: list[Visit]

    def visit(self, key: str) -> Visit:
        return next(v for v in self.visits if v.key == key)

    def parcel(self, key: str) -> ParcelSpec:
        return PARCEL_A if key == "A" else PARCEL_B

    def tree(self, parcel: str, code: str) -> Tree:
        return next(t for t in self.trees[parcel] if t.code == code)

    def scans(self) -> list[Visit]:
        return [v for v in self.visits if v.kind == "periodic_scan"]

    def findings(self, visit_key: str | None = None) -> list[Finding]:
        return [f for f in FINDINGS if visit_key is None or f.visit == visit_key]

    def classes(self, visit: Visit) -> dict[str, str]:
        """slot code -> class of each active tree in a periodic scan."""
        return {t.code: tree_class(visit.key, t.code) for t in self.trees[visit.parcel.key]}

    def tour(self) -> dict[str, str]:
        return {
            "parcel_id": ids.PARCEL_A,
            "tree_id": self.tree(*FEATURED).id,
            "session_id": ids.A_SCAN_2026,
            "previous_session_id": ids.A_SCAN_2025,
            "inventory_session_id": ids.A_INVENTORY,
        }


def load(version: int = DATASET_VERSION) -> Dataset:
    if version != 1:
        raise ValueError(f"unknown demo dataset version {version}")
    slots, trees = {}, {}
    for p in PARCELS:
        slots[p.key], trees[p.key] = make_trees(p)
    return Dataset(version=version, slots=slots, trees=trees, visits=_visits())
