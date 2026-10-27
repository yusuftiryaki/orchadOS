import 'dart:math' as math;

import '../../core/geo/geo.dart';
import '../tasks/field_task.dart';

// Scan coverage on the phone (docs/MVP.md, Modül 3: grid scan, first along
// the rows, then across). A simple rule: a slot is covered when the track
// passed within [CoverageConfig.radiusM] of it. Each track segment is also
// classified by its direction against the rows, so the crew sees which row
// corridors (along) and which cross corridors are done. The track comes from
// the positions in the logger's status messages (about 1 Hz, before PPK).

class CoverageConfig {
  const CoverageConfig({
    this.radiusM = 4,
    this.threshold = periodicThreshold,
    this.maxGap = const Duration(seconds: 10),
    this.maxJumpM = 30,
    this.minStepM = 0.5,
    this.directionToleranceDeg = 30,
  });

  /// A slot this close to the track is covered.
  final double radiusM;

  /// Coverage target of [kind] (methodology v0.1, docs/uzman-ajan-onerileri.md
  /// 1.9): 98 % for an inventory, whose missed trees stay missing on every
  /// later visit; 95 % otherwise.
  factory CoverageConfig.forVisit(VisitKind kind) => CoverageConfig(
    threshold: kind == VisitKind.inventory
        ? inventoryThreshold
        : periodicThreshold,
  );

  static const double periodicThreshold = 0.95;
  static const double inventoryThreshold = 0.98;

  /// Share of slots (and of a corridor's slots) that counts as done; below
  /// it the summary warns.
  final double threshold;

  /// Points further apart in time or space are not joined (lost fix,
  /// logger reconnect); the track gets a gap.
  final Duration maxGap;
  final double maxJumpM;

  /// Points closer than this to the last kept point are skipped.
  final double minStepM;

  /// A segment within this angle of the row direction is "along"; within
  /// this angle of the perpendicular it is "across".
  final double directionToleranceDeg;

  Map<String, Object?> toJson() => {
    'radius_m': radiusM,
    'threshold': threshold,
    'max_gap_s': maxGap.inSeconds,
    'max_jump_m': maxJumpM,
    'direction_tolerance_deg': directionToleranceDeg,
  };
}

/// Coverage of one corridor: a row (passes along it) or a cross corridor,
/// i.e. the slots with one position number (passes across the rows).
class CorridorCoverage {
  const CorridorCoverage(this.no, {required this.total, required this.covered});

  /// Row number or position number.
  final int no;
  final int total;
  final int covered;

  double get ratio => total == 0 ? 0 : covered / total;
}

class CoverageSummary {
  const CoverageSummary({
    required this.config,
    required this.slotsTotal,
    required this.slotsCovered,
    required this.rows,
    required this.crossCorridors,
    required this.trackPoints,
    required this.trackLengthM,
    required this.uncoveredCodes,
    required this.hasRowDirection,
  });

  final CoverageConfig config;

  /// Slots with a position (the others cannot be checked).
  final int slotsTotal;
  final int slotsCovered;

  /// Along the rows, by row number.
  final List<CorridorCoverage> rows;

  /// Across the rows, by position number.
  final List<CorridorCoverage> crossCorridors;
  final int trackPoints;
  final double trackLengthM;

  /// Codes of the slots not passed near, in walking order.
  final List<String> uncoveredCodes;

  /// The row direction could be found (at least one row with two located
  /// slots); without it there are no corridors.
  final bool hasRowDirection;

  double get ratio => slotsTotal == 0 ? 0 : slotsCovered / slotsTotal;
  bool get belowThreshold => slotsTotal > 0 && ratio < config.threshold;

  int get rowsDone => rows.where((r) => r.ratio >= config.threshold).length;
  int get crossDone =>
      crossCorridors.where((c) => c.ratio >= config.threshold).length;

  /// "Yerlerin %96'sının 4 m yakınından geçildi"; null without slots.
  String? get sentence =>
      slotsTotal == 0 ? null : coverageSentence(ratio, config.radiusM);

  /// Same sentence for a stored ratio.
  static String coverageSentence(double ratio, double radiusM) {
    final pct = (ratio * 100).floor();
    final r = radiusM.toStringAsFixed(0);
    return "Yerlerin %$pct'${_suffix(pct)} $r m yakınından geçildi";
  }

  /// Turkish genitive suffix after the percentage (`%96'sının`, `%100'ünün`).
  static String _suffix(int n) {
    final last = n % 10;
    final tens = (n ~/ 10) % 10;
    if (n == 0) return 'ının';
    if (last == 0) {
      return switch (tens) {
        1 || 3 => 'unun', // on, otuz
        2 || 5 => 'sinin', // yirmi, elli
        4 || 6 => 'ının', // kırk, altmış
        7 || 8 => 'inin', // yetmiş, seksen
        9 => 'ının', // doksan
        _ => 'ünün', // yüz
      };
    }
    return switch (last) {
      1 || 5 || 8 => 'inin', // bir, beş, sekiz
      2 || 7 => 'sinin', // iki, yedi
      3 || 4 => 'ünün', // üç, dört
      6 => 'sının', // altı
      _ => 'unun', // dokuz
    };
  }

  /// `data` of the `coverage` session event (docs/arayuzler.md).
  Map<String, Object?> toJson() => {
    'version': 1,
    ...config.toJson(),
    'slots_total': slotsTotal,
    'slots_covered': slotsCovered,
    'ratio': double.parse(ratio.toStringAsFixed(4)),
    'rows_done': [
      for (final r in rows)
        if (r.ratio >= config.threshold) r.no,
    ],
    'rows_total': rows.length,
    'cross_done': [
      for (final c in crossCorridors)
        if (c.ratio >= config.threshold) c.no,
    ],
    'cross_total': crossCorridors.length,
    'uncovered_slot_codes': uncoveredCodes,
    'track_points': trackPoints,
    'track_length_m': double.parse(trackLengthM.toStringAsFixed(1)),
  };
}

class _Slot {
  _Slot(this.slot, this.at);

  final SlotPoint slot;
  final Enu at;
  bool any = false;
  bool along = false;
  bool across = false;
}

/// Follows the track and marks the slots it passes near. Points are added
/// as they arrive; each new segment is checked against every located slot.
class CoverageTracker {
  CoverageTracker(List<SlotPoint> slots, {this.config = const CoverageConfig()})
    : _proj = _projectionFor(slots) {
    for (final s in slots) {
      if (s.position != null) _slots.add(_Slot(s, _proj!.toLocal(s.position!)));
    }
    _axis = _rowAxis(_slots);
  }

  final CoverageConfig config;
  LocalProjection? _proj;
  final List<_Slot> _slots = [];
  Enu? _axis;

  final List<List<GeoPoint>> _tracks = [];
  GeoPoint? _last;
  Enu? _lastLocal;
  DateTime? _lastTime;
  int _points = 0;
  double _length = 0;

  static LocalProjection? _projectionFor(List<SlotPoint> slots) {
    for (final s in slots) {
      if (s.position != null) return LocalProjection(s.position!);
    }
    return null;
  }

  /// Mean direction of the rows (unit vector), from the first to the last
  /// located slot of every row; null when no row has two.
  static Enu? _rowAxis(List<_Slot> slots) {
    final byRow = <int, List<_Slot>>{};
    for (final s in slots) {
      if (!s.slot.isInterstitial) (byRow[s.slot.rowNo] ??= []).add(s);
    }
    Enu? sum;
    for (final row in byRow.values) {
      if (row.length < 2) continue;
      row.sort((a, b) => a.slot.positionNo.compareTo(b.slot.positionNo));
      var d = row.last.at - row.first.at;
      final len = d.length;
      if (len == 0) continue;
      d = d * (1 / len);
      if (sum != null && sum.dot(d) < 0) d = d * -1;
      sum = sum == null ? d : sum + d;
    }
    if (sum == null || sum.length == 0) return null;
    return sum * (1 / sum.length);
  }

  /// Track pieces (a gap starts a new piece).
  List<List<GeoPoint>> get tracks => [for (final t in _tracks) List.of(t)];

  GeoPoint? get lastPosition => _last;

  /// Codes of the covered slots.
  Set<String> get coveredCodes => {
    for (final s in _slots)
      if (s.any) s.slot.code,
  };

  void add(GeoPoint p, DateTime time) {
    _proj ??= LocalProjection(p);
    final local = _proj!.toLocal(p);
    final prev = _lastLocal;
    final prevTime = _lastTime;
    final joined =
        prev != null &&
        prevTime != null &&
        time.difference(prevTime) <= config.maxGap &&
        (local - prev).length <= config.maxJumpM;
    if (joined && (local - prev).length < config.minStepM) {
      // Standing still: keep the point's time so the track stays joined.
      _lastTime = time;
      return;
    }
    _points++;
    if (joined) {
      _tracks.last.add(p);
      _length += (local - prev).length;
      _cover(prev, local);
    } else {
      _tracks.add([p]);
      _cover(local, local);
    }
    _last = p;
    _lastLocal = local;
    _lastTime = time;
  }

  void _cover(Enu a, Enu b) {
    final r = config.radiusM;
    final seg = b - a;
    final len = seg.length;
    var along = false;
    var across = false;
    final axis = _axis;
    if (axis != null && len > 0) {
      final c = (seg.dot(axis) / len).abs();
      final tol = config.directionToleranceDeg * math.pi / 180;
      along = c >= math.cos(tol);
      across = c <= math.sin(tol);
    }
    final minE = math.min(a.e, b.e) - r;
    final maxE = math.max(a.e, b.e) + r;
    final minN = math.min(a.n, b.n) - r;
    final maxN = math.max(a.n, b.n) + r;
    for (final s in _slots) {
      final p = s.at;
      if (p.e < minE || p.e > maxE || p.n < minN || p.n > maxN) continue;
      if (pointSegmentDistance(p, a, b) > r) continue;
      s.any = true;
      if (along) s.along = true;
      if (across) s.across = true;
    }
  }

  CoverageSummary get summary {
    final rows = <int, List<_Slot>>{};
    final cross = <int, List<_Slot>>{};
    for (final s in _slots) {
      (rows[s.slot.rowNo] ??= []).add(s);
      if (!s.slot.isInterstitial) (cross[s.slot.positionNo] ??= []).add(s);
    }
    List<CorridorCoverage> corridors(
      Map<int, List<_Slot>> groups,
      bool Function(_Slot) done,
    ) => [
      for (final no in groups.keys.toList()..sort())
        CorridorCoverage(
          no,
          total: groups[no]!.length,
          covered: groups[no]!.where(done).length,
        ),
    ];
    final hasAxis = _axis != null;
    final uncovered =
        [
          for (final s in _slots)
            if (!s.any) s.slot,
        ]..sort((a, b) {
          final r = a.rowNo.compareTo(b.rowNo);
          if (r != 0) return r;
          final p = a.positionNo.compareTo(b.positionNo);
          return p != 0 ? p : a.code.compareTo(b.code);
        });
    return CoverageSummary(
      config: config,
      slotsTotal: _slots.length,
      slotsCovered: _slots.where((s) => s.any).length,
      rows: hasAxis ? corridors(rows, (s) => s.along) : const [],
      crossCorridors: hasAxis ? corridors(cross, (s) => s.across) : const [],
      trackPoints: _points,
      trackLengthM: _length,
      uncoveredCodes: [for (final s in uncovered) s.code],
      hasRowDirection: hasAxis,
    );
  }
}
