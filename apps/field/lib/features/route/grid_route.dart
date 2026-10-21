import 'dart:convert';
import 'dart:math' as math;

import 'package:crypto/crypto.dart';

import '../../core/geo/geo.dart';
import '../tasks/field_task.dart';

// Fixed grid route of a parcel (docs/MVP.md, Modül 3: first every corridor
// along the rows, then the cross corridors, last the parcel edges). Pure
// Dart and deterministic: the same input always gives the same route. The
// first route used on a parcel is stored as a version on the server
// (docs/arayuzler.md, "Grid rotası") and later visits reuse it, so scans
// stay comparable.
//
// Geometry is worked out on a local plane rotated to the rows: `u` runs
// along the rows (the row azimuth), `v` across them (azimuth + 90°).

/// Version of this generator; stored with every route. Bump it when a rule
/// below changes the output for the same input.
const String gridRouteGenerator = 'grid-route-v1';

/// Version of the stored route JSON (`parcel_route.route.format`).
const int gridRouteFormat = 1;

enum CorridorKind {
  /// Along the rows, between two rows.
  along('along', 'Sıra boyunca'),

  /// Across the rows, between two positions.
  cross('cross', 'Dik'),

  /// Along the parcel edge.
  edge('edge', 'Kenar');

  const CorridorKind(this.code, this.label);
  final String code;
  final String label;

  static CorridorKind fromCode(String code) =>
      values.firstWhere((k) => k.code == code);
}

/// Where the route's row direction came from.
enum AzimuthSource {
  /// Fitted to the located slots (after the inventory).
  slots('slots'),

  /// `parcel.row_azimuth_deg`.
  parcel('parcel'),

  /// Set by the crew on the map (two taps along a row).
  crew('crew'),

  /// Guessed from the longest boundary side; the crew confirms or corrects.
  boundary('boundary');

  const AzimuthSource(this.code);
  final String code;

  static AzimuthSource fromCode(String code) =>
      values.firstWhere((s) => s.code == code);
}

/// What the corridors are laid out from.
enum RouteBasis {
  /// Between the rows of the located slots.
  inventory('inventory'),

  /// Before the inventory: the boundary, a row direction and an estimated
  /// spacing.
  boundary('boundary');

  const RouteBasis(this.code);
  final String code;

  static RouteBasis fromCode(String code) =>
      values.firstWhere((b) => b.code == code);
}

/// Numbering origin corner of the parcel (`public.corner`); the route starts
/// there.
enum StartCorner {
  sw('sw', -1, -1),
  se('se', 1, -1),
  nw('nw', -1, 1),
  ne('ne', 1, 1);

  const StartCorner(this.code, this.e, this.n);
  final String code;
  final double e;
  final double n;

  static StartCorner fromCode(String? code) =>
      values.firstWhere((c) => c.code == code, orElse: () => sw);
}

/// One leg of the route: a line (along, cross) or a polyline (edge), walked
/// from its first to its last point.
class Corridor {
  const Corridor({
    required this.no,
    required this.kind,
    required this.label,
    required this.points,
    required this.lengthM,
  });

  /// 1-based place in the route.
  final int no;
  final CorridorKind kind;

  /// For the crew: "S3 ile S4 arası", "12. ile 13. yer arası", "Kenar 2".
  final String label;
  final List<GeoPoint> points;
  final double lengthM;

  GeoPoint get start => points.first;
  GeoPoint get end => points.last;

  Map<String, Object?> toJson() => {
    'no': no,
    'kind': kind.code,
    'label': label,
    'points': [
      for (final p in points) [p.lon, p.lat],
    ],
    'length_m': lengthM,
  };

  factory Corridor.fromJson(Map<String, Object?> j) => Corridor(
    no: j['no']! as int,
    kind: CorridorKind.fromCode(j['kind']! as String),
    label: j['label']! as String,
    points: [
      for (final c in j['points']! as List) GeoPoint.fromCoordinates(c)!,
    ],
    lengthM: (j['length_m']! as num).toDouble(),
  );
}

/// A generated route: its parameters and the corridors in walking order.
class GridRoute {
  const GridRoute({
    required this.generator,
    required this.basis,
    required this.azimuthDeg,
    required this.azimuthSource,
    required this.rowSpacingM,
    required this.treeSpacingM,
    required this.startCorner,
    required this.corridors,
  });

  final String generator;
  final RouteBasis basis;

  /// Row direction, degrees clockwise from north, folded to 0–180.
  final double azimuthDeg;
  final AzimuthSource azimuthSource;
  final double rowSpacingM;
  final double treeSpacingM;
  final StartCorner startCorner;
  final List<Corridor> corridors;

  int count(CorridorKind kind) => corridors.where((c) => c.kind == kind).length;

  double get lengthM => corridors.fold(0, (s, c) => s + c.lengthM);

  /// The stored route (`parcel_route.route`, docs/arayuzler.md).
  Map<String, Object?> toJson() => {
    'format': gridRouteFormat,
    'generator': generator,
    'basis': basis.code,
    'azimuth_deg': azimuthDeg,
    'azimuth_source': azimuthSource.code,
    'row_spacing_m': rowSpacingM,
    'tree_spacing_m': treeSpacingM,
    'start_corner': startCorner.code,
    'corridors': [for (final c in corridors) c.toJson()],
  };

  factory GridRoute.fromJson(Map<String, Object?> j) => GridRoute(
    generator: j['generator']! as String,
    basis: RouteBasis.fromCode(j['basis']! as String),
    azimuthDeg: (j['azimuth_deg']! as num).toDouble(),
    azimuthSource: AzimuthSource.fromCode(j['azimuth_source']! as String),
    rowSpacingM: (j['row_spacing_m']! as num).toDouble(),
    treeSpacingM: (j['tree_spacing_m']! as num).toDouble(),
    startCorner: StartCorner.fromCode(j['start_corner'] as String?),
    corridors: [
      for (final c in j['corridors']! as List)
        Corridor.fromJson((c as Map).cast<String, Object?>()),
    ],
  );

  /// SHA-256 of the canonical JSON: equal routes have equal hashes.
  String get contentHash =>
      sha256.convert(utf8.encode(jsonEncode(toJson()))).toString();
}

/// What the route is generated from.
class RouteInput {
  const RouteInput({
    this.boundary,
    this.slots = const [],
    this.parcelAzimuthDeg,
    this.crewAzimuthDeg,
    this.startCorner = StartCorner.sw,
    this.estimatedAreaM2,
    this.estimatedTreeCount,
  });

  /// Latest boundary of the parcel, or the corners walked in this session.
  final List<GeoPoint>? boundary;

  /// Slots of the parcel; only located ones are used.
  final List<SlotPoint> slots;

  /// `parcel.row_azimuth_deg`.
  final double? parcelAzimuthDeg;

  /// Row direction the crew set on the map.
  final double? crewAzimuthDeg;
  final StartCorner startCorner;

  /// `parcel.estimated_area_m2` and `estimated_tree_count`: spacing before
  /// the inventory.
  final double? estimatedAreaM2;
  final int? estimatedTreeCount;

  /// Input for a task's parcel. Without a stored boundary, [walkedBoundary]
  /// (the corners of this session's boundary walk) stands in.
  factory RouteInput.forTask(
    FieldTask task, {
    List<GeoPoint>? walkedBoundary,
    double? crewAzimuthDeg,
  }) => RouteInput(
    boundary: task.boundary ?? walkedBoundary,
    slots: task.slots,
    parcelAzimuthDeg: task.rowAzimuthDeg,
    crewAzimuthDeg: crewAzimuthDeg,
    startCorner: StartCorner.fromCode(task.originCorner),
    // 1 dönüm = 1000 m².
    estimatedAreaM2: task.areaDecare > 0 ? task.areaDecare * 1000 : null,
    estimatedTreeCount: task.estimatedTreeCount,
  );
}

class RouteConfig {
  const RouteConfig({
    this.coverRadiusM = 4,
    this.clearanceM = 1.5,
    this.defaultSpacingM = 8,
    this.minSpacingM = 4,
    this.maxSpacingM = 12,
    this.sideTurnDeg = 30,
    this.minCorridorM = 2,
  });

  /// Slot coverage radius (the coverage rule, CoverageConfig.radiusM). A
  /// cross corridor serves two positions when both are this close.
  final double coverRadiusM;

  /// Corridors stop this far inside the boundary (fence, wall).
  final double clearanceM;

  /// Row spacing when nothing better is known; estimates are clamped to
  /// [minSpacingM]–[maxSpacingM].
  final double defaultSpacingM;
  final double minSpacingM;
  final double maxSpacingM;

  /// A boundary vertex turning more than this starts a new edge corridor.
  final double sideTurnDeg;

  /// Shorter corridors are dropped.
  final double minCorridorM;
}

/// Why no route could be generated.
enum RouteMissing {
  /// No boundary and no located slots: nothing to lay corridors on.
  noArea,
}

/// Result of [generateGridRoute]: a route, or why there is none.
class RouteGeneration {
  const RouteGeneration.route(GridRoute this.route) : missing = null;
  const RouteGeneration.missing(RouteMissing this.missing) : route = null;

  final GridRoute? route;
  final RouteMissing? missing;
}

/// Lays out the grid route for [input].
RouteGeneration generateGridRoute(
  RouteInput input, {
  RouteConfig config = const RouteConfig(),
}) {
  final slots = [
    for (final s in input.slots)
      if (s.position != null) s,
  ]..sort((a, b) => _compareSlots(a, b));
  final ring = input.boundary != null && input.boundary!.length >= 3
      ? input.boundary!
      : null;
  if (ring == null && slots.isEmpty) {
    return const RouteGeneration.missing(RouteMissing.noArea);
  }
  final proj = LocalProjection(
    _bboxCenter([...?ring, for (final s in slots) s.position!]),
  );
  final ringEnu = ring == null ? null : [for (final p in ring) proj.toLocal(p)];
  final slotEnu = [for (final s in slots) proj.toLocal(s.position!)];

  // Row direction.
  final fitted = _slotAzimuth(slots, slotEnu);
  final double azimuth;
  final AzimuthSource source;
  if (fitted != null) {
    azimuth = fitted;
    source = AzimuthSource.slots;
  } else if (input.parcelAzimuthDeg != null) {
    azimuth = _fold(input.parcelAzimuthDeg!);
    source = AzimuthSource.parcel;
  } else if (input.crewAzimuthDeg != null) {
    azimuth = _fold(input.crewAzimuthDeg!);
    source = AzimuthSource.crew;
  } else if (ringEnu != null) {
    azimuth = _longestSideAzimuth(ringEnu);
    source = AzimuthSource.boundary;
  } else {
    // Located slots in a single position each row: no direction to fit and
    // nothing else given. Rows run north–south by default.
    azimuth = 0;
    source = AzimuthSource.boundary;
  }
  final frame = _Frame(_round(azimuth, 4));

  final layout = slots.isNotEmpty && fitted != null
      ? _inventoryLayout(slots, slotEnu, ringEnu, frame, config)
      : _boundaryLayout(input, ringEnu, slotEnu, frame, config);
  if (layout == null) {
    return const RouteGeneration.missing(RouteMissing.noArea);
  }

  // Serpentine order from the start corner.
  final area = layout.area;
  var at = area.reduce(
    (best, p) =>
        p.e * input.startCorner.e + p.n * input.startCorner.n >
            best.e * input.startCorner.e + best.n * input.startCorner.n
        ? p
        : best,
  );
  final ordered = <_Leg>[];
  for (final group in [layout.along, layout.cross]) {
    final legs = _serpentine(group, at, frame);
    ordered.addAll(legs);
    if (legs.isNotEmpty) at = legs.last.points.last;
  }
  ordered.addAll(_edges(area, at, config));

  final corridors = <Corridor>[];
  var edgeNo = 0;
  for (final leg in ordered) {
    final pts = [for (final p in leg.points) _roundGeo(proj.toGeo(p))];
    var len = 0.0;
    for (var i = 1; i < leg.points.length; i++) {
      len += (leg.points[i] - leg.points[i - 1]).length;
    }
    corridors.add(
      Corridor(
        no: corridors.length + 1,
        kind: leg.kind,
        label: leg.kind == CorridorKind.edge ? 'Kenar ${++edgeNo}' : leg.label,
        points: pts,
        lengthM: _round(len, 1),
      ),
    );
  }
  return RouteGeneration.route(
    GridRoute(
      generator: gridRouteGenerator,
      basis: layout.basis,
      azimuthDeg: frame.azimuthDeg,
      azimuthSource: source,
      rowSpacingM: _round(layout.rowSpacingM, 2),
      treeSpacingM: _round(layout.treeSpacingM, 2),
      startCorner: input.startCorner,
      corridors: corridors,
    ),
  );
}

/// Row direction from two points the crew tapped along a row, folded to
/// 0–180°; null when the points are closer than 1 m.
double? azimuthFromTaps(GeoPoint a, GeoPoint b) {
  if (distanceM(a, b) < 1) return null;
  return _fold(bearingDeg(a, b));
}

// --- Layout -------------------------------------------------------------------

/// Rotated plane: `u` along the rows, `v` across.
class _Frame {
  _Frame(this.azimuthDeg)
    : _a = Enu(
        math.sin(azimuthDeg * math.pi / 180),
        math.cos(azimuthDeg * math.pi / 180),
      ),
      _b = Enu(
        math.cos(azimuthDeg * math.pi / 180),
        -math.sin(azimuthDeg * math.pi / 180),
      );

  final double azimuthDeg;
  final Enu _a;
  final Enu _b;

  double u(Enu p) => p.dot(_a);
  double v(Enu p) => p.dot(_b);
  Enu at(double u, double v) => _a * u + _b * v;
}

class _Leg {
  _Leg(this.kind, this.label, this.points, {this.key = 0});

  final CorridorKind kind;
  final String label;
  final List<Enu> points;

  /// Position across the group (v for along, u for cross), for ordering.
  final double key;

  _Leg reversed() => _Leg(kind, label, points.reversed.toList(), key: key);
}

class _Layout {
  _Layout({
    required this.basis,
    required this.area,
    required this.along,
    required this.cross,
    required this.rowSpacingM,
    required this.treeSpacingM,
  });

  final RouteBasis basis;

  /// Ring the edges follow (boundary, or a rectangle around the slots).
  final List<Enu> area;
  final List<_Leg> along;
  final List<_Leg> cross;
  final double rowSpacingM;
  final double treeSpacingM;
}

_Layout? _inventoryLayout(
  List<SlotPoint> slots,
  List<Enu> slotEnu,
  List<Enu>? ring,
  _Frame f,
  RouteConfig config,
) {
  // Row lines: median v of each row's slots (interstitials left out).
  final byRow = <int, List<Enu>>{};
  final byPos = <int, List<double>>{};
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].isInterstitial) continue;
    (byRow[slots[i].rowNo] ??= []).add(slotEnu[i]);
    (byPos[slots[i].positionNo] ??= []).add(f.u(slotEnu[i]));
  }
  if (byRow.isEmpty) return null;
  final rows = [
    for (final no in byRow.keys)
      (
        no: no,
        v: _median([for (final p in byRow[no]!) f.v(p)]),
        lo: byRow[no]!.map(f.u).reduce(math.min),
        hi: byRow[no]!.map(f.u).reduce(math.max),
      ),
  ]..sort((a, b) => a.v.compareTo(b.v));

  // Spacings: between neighbouring rows; along a row per position step
  // (a missing slot counts its gap once per missing position).
  final rowGaps = [
    for (var i = 1; i < rows.length; i++) rows[i].v - rows[i - 1].v,
  ];
  final treeGaps = <double>[];
  final byRowPos = <int, List<(int, double)>>{};
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].isInterstitial) continue;
    (byRowPos[slots[i].rowNo] ??= []).add((
      slots[i].positionNo,
      f.u(slotEnu[i]),
    ));
  }
  for (final row in byRowPos.values) {
    row.sort((a, b) => a.$1.compareTo(b.$1));
    for (var i = 1; i < row.length; i++) {
      final steps = row[i].$1 - row[i - 1].$1;
      if (steps > 0) treeGaps.add((row[i].$2 - row[i - 1].$2).abs() / steps);
    }
  }
  final treeSpacing = treeGaps.isEmpty
      ? config.defaultSpacingM
      : _median(treeGaps);
  final rowSpacing = rowGaps.isEmpty
      ? math.max(treeSpacing, config.defaultSpacingM)
      : _median(rowGaps);

  final uLo = rows.map((r) => r.lo).reduce(math.min);
  final uHi = rows.map((r) => r.hi).reduce(math.max);
  final uMargin = math.max(treeSpacing / 2, config.coverRadiusM);
  final vLo = rows.first.v - rowSpacing / 2;
  final vHi = rows.last.v + rowSpacing / 2;
  final area =
      ring ??
      [
        f.at(uLo - uMargin, vLo),
        f.at(uHi + uMargin, vLo),
        f.at(uHi + uMargin, vHi),
        f.at(uLo - uMargin, vHi),
      ];
  final areaUv = [for (final p in area) (u: f.u(p), v: f.v(p))];

  // Along: between neighbouring rows; a single row gets one on each side.
  final along = <_Leg>[];
  void addAlong(double v, double lo, double hi, String label) {
    final span = _clip(areaUv, v, lo, hi, alongRows: true, config: config);
    if (span == null) return;
    along.add(
      _Leg(CorridorKind.along, label, [
        f.at(span.$1, v),
        f.at(span.$2, v),
      ], key: v),
    );
  }

  if (rows.length == 1) {
    final r = rows.single;
    addAlong(
      r.v - rowSpacing / 2,
      r.lo - uMargin,
      r.hi + uMargin,
      'S${r.no} yanı (1)',
    );
    addAlong(
      r.v + rowSpacing / 2,
      r.lo - uMargin,
      r.hi + uMargin,
      'S${r.no} yanı (2)',
    );
  }
  for (var i = 1; i < rows.length; i++) {
    final a = rows[i - 1];
    final b = rows[i];
    final names = [a.no, b.no]..sort();
    addAlong(
      (a.v + b.v) / 2,
      math.min(a.lo, b.lo) - uMargin,
      math.max(a.hi, b.hi) + uMargin,
      'S${names[0]} ile S${names[1]} arası',
    );
  }

  // Cross: between positions; two positions share one corridor while both
  // stay within the coverage radius of it.
  final positions = [
    for (final no in byPos.keys) (no: no, u: _median(byPos[no]!)),
  ]..sort((a, b) => a.u.compareTo(b.u));
  final cross = <_Leg>[];
  void addCross(int i) {
    final a = positions[i];
    final b = positions[i + 1];
    final u = (a.u + b.u) / 2;
    final span = _clip(areaUv, u, vLo, vHi, alongRows: false, config: config);
    if (span == null) return;
    final names = [a.no, b.no]..sort();
    cross.add(
      _Leg(CorridorKind.cross, '${names[0]}. ile ${names[1]}. yer arası', [
        f.at(u, span.$1),
        f.at(u, span.$2),
      ], key: u),
    );
  }

  for (final i in _crossGaps([
    for (final p in positions) p.u,
  ], config.coverRadiusM)) {
    addCross(i);
  }
  if (positions.length == 1) {
    final u = positions.single.u;
    final span = _clip(areaUv, u, vLo, vHi, alongRows: false, config: config);
    if (span != null) {
      cross.add(
        _Leg(CorridorKind.cross, '${positions.single.no}. yer', [
          f.at(u, span.$1),
          f.at(u, span.$2),
        ], key: u),
      );
    }
  }
  return _Layout(
    basis: RouteBasis.inventory,
    area: area,
    along: along,
    cross: cross,
    rowSpacingM: rowSpacing,
    treeSpacingM: treeSpacing,
  );
}

_Layout? _boundaryLayout(
  RouteInput input,
  List<Enu>? ring,
  List<Enu> slotEnu,
  _Frame f,
  RouteConfig config,
) {
  final area = ring ?? _slotBox(slotEnu, f, config.defaultSpacingM);
  final areaUv = [for (final p in area) (u: f.u(p), v: f.v(p))];
  final uLo = areaUv.map((p) => p.u).reduce(math.min);
  final uHi = areaUv.map((p) => p.u).reduce(math.max);
  final vLo = areaUv.map((p) => p.v).reduce(math.min);
  final vHi = areaUv.map((p) => p.v).reduce(math.max);

  // Spacing: area per tree as a square, from the parcel record.
  var spacing = config.defaultSpacingM;
  final trees = input.estimatedTreeCount;
  final m2 = ring != null ? _signedArea(ring).abs() : input.estimatedAreaM2;
  if (trees != null && trees > 0 && m2 != null && m2 > 0) {
    spacing = math
        .sqrt(m2 / trees)
        .clamp(config.minSpacingM, config.maxSpacingM)
        .toDouble();
  }
  spacing = _round(spacing, 2);

  // Along: every row spacing from the side, assuming the first row half a
  // spacing inside the boundary; a narrow parcel gets one corridor.
  final along = <_Leg>[];
  final width = vHi - vLo;
  final vs = width < 1.5 * spacing
      ? [vLo + width / 2]
      : [
          for (
            var v = vLo + spacing;
            v <= vHi - spacing / 2 + 1e-9;
            v += spacing
          )
            v,
        ];
  for (final v in vs) {
    final span = _clip(
      areaUv,
      v,
      uLo - 1,
      uHi + 1,
      alongRows: true,
      config: config,
    );
    if (span == null) continue;
    along.add(
      _Leg(CorridorKind.along, 'Sıra boyunca ${along.length + 1}', [
        f.at(span.$1, v),
        f.at(span.$2, v),
      ], key: v),
    );
  }

  // Cross: one every two positions (or every position when two would not
  // both be within the coverage radius).
  final step = spacing <= 2 * config.coverRadiusM ? 2 * spacing : spacing;
  final length = uHi - uLo;
  final us = length < 1.5 * spacing
      ? [uLo + length / 2]
      : [
          for (var u = uLo + spacing; u <= uHi - spacing / 2 + 1e-9; u += step)
            u,
        ];
  final cross = <_Leg>[];
  for (final u in us) {
    final span = _clip(
      areaUv,
      u,
      vLo - 1,
      vHi + 1,
      alongRows: false,
      config: config,
    );
    if (span == null) continue;
    cross.add(
      _Leg(CorridorKind.cross, 'Dik ${cross.length + 1}', [
        f.at(u, span.$1),
        f.at(u, span.$2),
      ], key: u),
    );
  }
  return _Layout(
    basis: RouteBasis.boundary,
    area: area,
    along: along,
    cross: cross,
    rowSpacingM: spacing,
    treeSpacingM: spacing,
  );
}

/// Gaps (index i = between positions i and i+1) that get a cross corridor:
/// pairs (0,1), (2,3), … while both ends are within [radius] of the middle,
/// else every gap. An odd last position shares the last gap.
List<int> _crossGaps(List<double> us, double radius) {
  final gaps = <int>[];
  var i = 0;
  while (i + 1 < us.length) {
    gaps.add(i);
    i += (us[i + 1] - us[i]) / 2 <= radius ? 2 : 1;
  }
  if (i == us.length - 1 && i > 0 && !gaps.contains(i - 1)) gaps.add(i - 1);
  return gaps;
}

/// Rectangle around located slots (no boundary, no fitted direction).
List<Enu> _slotBox(List<Enu> pts, _Frame f, double margin) {
  final us = pts.map(f.u);
  final vs = pts.map(f.v);
  final uLo = us.reduce(math.min) - margin / 2;
  final uHi = us.reduce(math.max) + margin / 2;
  final vLo = vs.reduce(math.min) - margin / 2;
  final vHi = vs.reduce(math.max) + margin / 2;
  return [f.at(uLo, vLo), f.at(uHi, vLo), f.at(uHi, vHi), f.at(uLo, vHi)];
}

/// The part of the line (v = [c] when [alongRows], else u = [c]) inside the
/// area and within [lo]–[hi], kept [RouteConfig.clearanceM] from the
/// boundary. The longest inside piece counts (a concave boundary may cut
/// the line in several). Null when too short.
(double, double)? _clip(
  List<({double u, double v})> ring,
  double c,
  double lo,
  double hi, {
  required bool alongRows,
  required RouteConfig config,
}) {
  final cuts = <double>[];
  for (var i = 0; i < ring.length; i++) {
    final a = ring[i];
    final b = ring[(i + 1) % ring.length];
    final (ac, bc) = alongRows ? (a.v, b.v) : (a.u, b.u);
    final (ax, bx) = alongRows ? (a.u, b.u) : (a.v, b.v);
    if ((ac > c) != (bc > c)) cuts.add(ax + (c - ac) * (bx - ax) / (bc - ac));
  }
  cuts.sort();
  (double, double)? best;
  for (var i = 0; i + 1 < cuts.length; i += 2) {
    final s = math.max(cuts[i] + config.clearanceM, lo);
    final e = math.min(cuts[i + 1] - config.clearanceM, hi);
    if (e - s < config.minCorridorM) continue;
    if (best == null || e - s > best.$2 - best.$1) best = (s, e);
  }
  return best;
}

/// Orders a group of parallel legs as a serpentine from [from]: starting at
/// the side nearer to it, each leg entered at the end nearer to where the
/// previous one ended.
List<_Leg> _serpentine(List<_Leg> group, Enu from, _Frame f) {
  if (group.isEmpty) return const [];
  final sorted = [...group]..sort((a, b) => a.key.compareTo(b.key));
  final isAlong = group.first.kind == CorridorKind.along;
  final k = isAlong ? f.v(from) : f.u(from);
  if ((k - sorted.first.key).abs() > (k - sorted.last.key).abs()) {
    sorted.setAll(0, sorted.reversed.toList());
  }
  final out = <_Leg>[];
  var at = from;
  for (final leg in sorted) {
    final ok =
        (leg.points.first - at).length <= (leg.points.last - at).length + 1e-9;
    final l = ok ? leg : leg.reversed();
    out.add(l);
    at = l.points.last;
  }
  return out;
}

/// Edge corridors: the area ring, [RouteConfig.clearanceM] inside, cut into
/// sides at its corners (a turn of more than [RouteConfig.sideTurnDeg]),
/// starting with the side nearest to [from] and going round in the
/// direction that starts nearer.
List<_Leg> _edges(List<Enu> area, Enu from, RouteConfig config) {
  var ring = [...area];
  if (_signedArea(ring) < 0) ring = ring.reversed.toList();
  ring = _inset(ring, config.clearanceM);
  final n = ring.length;
  final corners = <int>[];
  for (var i = 0; i < n; i++) {
    final a = ring[(i - 1 + n) % n];
    final b = ring[i];
    final c = ring[(i + 1) % n];
    final d1 = b - a;
    final d2 = c - b;
    if (d1.length == 0 || d2.length == 0) continue;
    final cos = (d1.dot(d2) / (d1.length * d2.length)).clamp(-1.0, 1.0);
    if (math.acos(cos) * 180 / math.pi > config.sideTurnDeg) corners.add(i);
  }
  if (corners.isEmpty) {
    // Round boundary: one closed side from the southernmost vertex.
    var s = 0;
    for (var i = 1; i < n; i++) {
      if (ring[i].n < ring[s].n ||
          (ring[i].n == ring[s].n && ring[i].e < ring[s].e)) {
        s = i;
      }
    }
    corners.add(s);
  }
  final sides = <List<Enu>>[];
  for (var k = 0; k < corners.length; k++) {
    final s = corners[k];
    final e = corners.length == 1 ? s + n : corners[(k + 1) % corners.length];
    final end = e <= s ? e + n : e;
    sides.add([for (var i = s; i <= end; i++) ring[i % n]]);
  }
  sides.removeWhere((s) => _polylineLength(s) < config.minCorridorM);
  if (sides.isEmpty) return const [];

  // Nearest side start (going counter-clockwise) or side end (clockwise).
  var best = 0;
  var bestD = double.infinity;
  var clockwise = false;
  for (var i = 0; i < sides.length; i++) {
    final ds = (sides[i].first - from).length;
    final de = (sides[i].last - from).length;
    if (ds < bestD - 1e-9) {
      bestD = ds;
      best = i;
      clockwise = false;
    }
    if (de < bestD - 1e-9) {
      bestD = de;
      best = i;
      clockwise = true;
    }
  }
  final order = <List<Enu>>[];
  for (var k = 0; k < sides.length; k++) {
    final i = clockwise
        ? (best - k + sides.length) % sides.length
        : (best + k) % sides.length;
    order.add(clockwise ? sides[i].reversed.toList() : sides[i]);
  }
  return [for (final s in order) _Leg(CorridorKind.edge, '', s)];
}

/// Moves every vertex of a counter-clockwise ring [d] metres inwards (along
/// the bisector of its two edges; at most 3·[d] at sharp corners).
List<Enu> _inset(List<Enu> ring, double d) {
  final n = ring.length;
  Enu? leftNormal(Enu a, Enu b) {
    final v = b - a;
    final len = v.length;
    return len == 0 ? null : Enu(-v.n / len, v.e / len);
  }

  return [
    for (var i = 0; i < n; i++)
      () {
        final n1 = leftNormal(ring[(i - 1 + n) % n], ring[i]);
        final n2 = leftNormal(ring[i], ring[(i + 1) % n]);
        if (n1 == null || n2 == null) return ring[i];
        final sum = n1 + n2;
        final half = sum.length / 2;
        if (half < 1e-9) return ring[i];
        final k = math.min(d / half, 3 * d);
        return ring[i] + sum * (k / sum.length);
      }(),
  ];
}

// --- Helpers ------------------------------------------------------------------

int _compareSlots(SlotPoint a, SlotPoint b) {
  final c = a.code.compareTo(b.code);
  return c != 0 ? c : a.id.compareTo(b.id);
}

/// Mean row direction of the located slots (first to last position of
/// each row with two), folded to 0–180°; null when no row has two.
double? _slotAzimuth(List<SlotPoint> slots, List<Enu> pts) {
  final byRow = <int, List<int>>{};
  for (var i = 0; i < slots.length; i++) {
    if (!slots[i].isInterstitial) (byRow[slots[i].rowNo] ??= []).add(i);
  }
  Enu? sum;
  for (final no in byRow.keys.toList()..sort()) {
    final row = byRow[no]!;
    if (row.length < 2) continue;
    row.sort((a, b) => slots[a].positionNo.compareTo(slots[b].positionNo));
    var d = pts[row.last] - pts[row.first];
    final len = d.length;
    if (len == 0) continue;
    d = d * (1 / len);
    if (sum != null && sum.dot(d) < 0) d = d * -1;
    sum = sum == null ? d : sum + d;
  }
  if (sum == null || sum.length == 0) return null;
  return _fold(math.atan2(sum.e, sum.n) * 180 / math.pi);
}

/// Direction of the longest boundary side, folded to 0–180°.
double _longestSideAzimuth(List<Enu> ring) {
  var best = 0.0;
  var az = 0.0;
  for (var i = 0; i < ring.length; i++) {
    final d = ring[(i + 1) % ring.length] - ring[i];
    if (d.length > best + 1e-9) {
      best = d.length;
      az = math.atan2(d.e, d.n) * 180 / math.pi;
    }
  }
  return _fold(az);
}

/// Rows have no direction: 0–360° folded to 0–180°.
double _fold(double deg) {
  final d = (deg % 180 + 180) % 180;
  return d >= 180 - 1e-9 ? 0 : d;
}

GeoPoint _bboxCenter(List<GeoPoint> pts) {
  var loLat = pts.first.lat, hiLat = pts.first.lat;
  var loLon = pts.first.lon, hiLon = pts.first.lon;
  for (final p in pts) {
    loLat = math.min(loLat, p.lat);
    hiLat = math.max(hiLat, p.lat);
    loLon = math.min(loLon, p.lon);
    hiLon = math.max(hiLon, p.lon);
  }
  return GeoPoint((loLat + hiLat) / 2, (loLon + hiLon) / 2);
}

double _median(List<double> xs) {
  final s = [...xs]..sort();
  final m = s.length ~/ 2;
  return s.length.isOdd ? s[m] : (s[m - 1] + s[m]) / 2;
}

double _signedArea(List<Enu> ring) {
  var twice = 0.0;
  for (var i = 0; i < ring.length; i++) {
    final a = ring[i];
    final b = ring[(i + 1) % ring.length];
    twice += a.e * b.n - b.e * a.n;
  }
  return twice / 2;
}

double _polylineLength(List<Enu> pts) {
  var len = 0.0;
  for (var i = 1; i < pts.length; i++) {
    len += (pts[i] - pts[i - 1]).length;
  }
  return len;
}

double _round(double x, int digits) {
  final k = math.pow(10, digits);
  return (x * k).roundToDouble() / k;
}

/// 1e-7° (about 1 cm): stable output, compact JSON.
GeoPoint _roundGeo(GeoPoint p) => GeoPoint(_round(p.lat, 7), _round(p.lon, 7));
