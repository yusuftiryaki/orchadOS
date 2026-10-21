import 'dart:math' as math;

import '../../core/geo/geo.dart';
import 'grid_route.dart';

// Guidance along a grid route while scanning: which corridor is next, how
// far it is to its start and in which direction, whether the crew is off
// the corridor, how much is left. Pure Dart; fed with the logger's
// positions (about 1 Hz, before PPK) like the coverage tracker.

class RouteGuideConfig {
  const RouteGuideConfig({
    this.onCorridorM = 4,
    this.warnOffM = 6,
    this.doneShare = 0.95,
    this.maxJumpM = 30,
    this.speedMps = 1.2,
    this.binM = 1,
  });

  /// Positions this close to the current corridor count as walking it.
  final double onCorridorM;

  /// Further than this from a corridor already started: "off the corridor".
  final double warnOffM;

  /// Share of a corridor's length walked that finishes it.
  final double doneShare;

  /// Two positions further apart are not joined (lost fix).
  final double maxJumpM;

  /// Walking speed for the time estimate (MVP Modül 3: slow walk).
  final double speedMps;

  /// Resolution of the walked share along a corridor.
  final double binM;
}

enum CorridorStatus { pending, done, skipped }

/// What the crew should do now.
class RouteGuidance {
  const RouteGuidance({
    required this.current,
    required this.statuses,
    required this.started,
    required this.walkedShare,
    required this.remainingCorridors,
    required this.remainingM,
    required this.remaining,
    this.toStartM,
    this.toStartBearingDeg,
    this.offCorridorM,
  });

  /// Index of the current corridor in the route; null when none is left.
  final int? current;
  final List<CorridorStatus> statuses;

  /// The crew has reached the current corridor.
  final bool started;

  /// Share of the current corridor walked (0–1).
  final double walkedShare;

  /// Corridors left, the current one included.
  final int remainingCorridors;

  /// Metres left: the rest of the current corridor, the pending ones and
  /// the walks between them.
  final double remainingM;

  /// [remainingM] at [RouteGuideConfig.speedMps].
  final Duration remaining;

  /// Before the current corridor is reached: distance and bearing from the
  /// crew to its start. Null without a position.
  final double? toStartM;
  final double? toStartBearingDeg;

  /// Distance from the current corridor when the crew strayed from it
  /// after starting; null while on it.
  final double? offCorridorM;

  bool get finished => current == null;

  List<int> numbersWith(CorridorStatus s, GridRoute route) => [
    for (var i = 0; i < statuses.length; i++)
      if (statuses[i] == s) route.corridors[i].no,
  ];
}

/// Follows the crew along [route]. The corridors are walked in route order;
/// a corridor is done when [RouteGuideConfig.doneShare] of it was walked
/// within [RouteGuideConfig.onCorridorM] (in either direction). The crew
/// can skip the current corridor or go back to the previous one.
class RouteGuide {
  RouteGuide(this.route, {this.config = const RouteGuideConfig()})
    : _proj = LocalProjection(
        route.corridors.isEmpty
            ? const GeoPoint(0, 0)
            : route.corridors.first.start,
      ) {
    for (final c in route.corridors) {
      final pts = [for (final p in c.points) _proj.toLocal(p)];
      final cum = <double>[0];
      for (var i = 1; i < pts.length; i++) {
        cum.add(cum.last + (pts[i] - pts[i - 1]).length);
      }
      _lines.add(_Line(pts, cum, math.max(1, (cum.last / config.binM).ceil())));
    }
    _statuses.addAll(
      List.filled(route.corridors.length, CorridorStatus.pending),
    );
    _current = route.corridors.isEmpty ? null : 0;
  }

  final GridRoute route;
  final RouteGuideConfig config;
  final LocalProjection _proj;
  final List<_Line> _lines = [];
  final List<CorridorStatus> _statuses = [];
  int? _current;
  Enu? _here;
  GeoPoint? _hereGeo;

  /// Last position on the current corridor (bins between two consecutive
  /// positions on it are filled).
  double? _lastS;

  int? get current => _current;
  List<CorridorStatus> get statuses => List.unmodifiable(_statuses);

  void add(GeoPoint p) {
    final local = _proj.toLocal(p);
    final prev = _here;
    _here = local;
    _hereGeo = p;
    final i = _current;
    if (i == null) return;
    final line = _lines[i];
    final (d, s) = line.nearest(local);
    if (prev != null && (local - prev).length > config.maxJumpM) _lastS = null;
    if (d > config.onCorridorM) {
      _lastS = null;
      return;
    }
    line.mark(_lastS ?? s, s);
    _lastS = s;
    if (line.share >= config.doneShare) {
      _statuses[i] = CorridorStatus.done;
      _advance(i);
    }
  }

  /// Leaves the current corridor for later; it is listed as skipped.
  void skip() {
    final i = _current;
    if (i == null) return;
    _statuses[i] = CorridorStatus.skipped;
    _advance(i);
  }

  /// Goes back to the corridor before the current one (or the last one
  /// when the route is finished) and walks it again.
  void back() {
    final i = _current ?? _lines.length;
    if (i == 0) return;
    final j = i - 1;
    _statuses[j] = CorridorStatus.pending;
    _lines[j].reset();
    _current = j;
    _lastS = null;
  }

  /// Next pending corridor after [i], else the first pending one.
  void _advance(int i) {
    _lastS = null;
    int? next;
    for (var k = 1; k <= _lines.length; k++) {
      final j = (i + k) % _lines.length;
      if (_statuses[j] == CorridorStatus.pending) {
        next = j;
        break;
      }
    }
    _current = next;
  }

  RouteGuidance get guidance {
    final i = _current;
    final here = _here;
    if (i == null) {
      return RouteGuidance(
        current: null,
        statuses: statuses,
        started: false,
        walkedShare: 0,
        remainingCorridors: 0,
        remainingM: 0,
        remaining: Duration.zero,
      );
    }
    final line = _lines[i];
    final started = line.share > 0;
    double? toStart;
    double? bearing;
    double? off;
    if (here != null && _hereGeo != null) {
      if (!started) {
        toStart = (line.pts.first - here).length;
        bearing = bearingDeg(_hereGeo!, route.corridors[i].start);
      } else {
        final (d, _) = line.nearest(here);
        if (d > config.warnOffM) off = d;
      }
    }

    // Distance left in walking order from the current corridor.
    var m = line.length * (1 - line.share);
    if (!started && toStart != null) m += toStart;
    var end = line.pts.last;
    var count = 1;
    for (var k = 1; k < _lines.length; k++) {
      final j = (i + k) % _lines.length;
      if (_statuses[j] != CorridorStatus.pending) continue;
      count++;
      m += (_lines[j].pts.first - end).length + _lines[j].length;
      end = _lines[j].pts.last;
    }
    return RouteGuidance(
      current: i,
      statuses: statuses,
      started: started,
      walkedShare: line.share,
      remainingCorridors: count,
      remainingM: m,
      remaining: Duration(seconds: (m / config.speedMps).round()),
      toStartM: toStart,
      toStartBearingDeg: bearing,
      offCorridorM: off,
    );
  }

  /// `data` of the `route_progress` event (docs/arayuzler.md).
  Map<String, Object?> progressJson() {
    final g = guidance;
    return {
      'version': 1,
      'corridors_total': route.corridors.length,
      'done': g.numbersWith(CorridorStatus.done, route),
      'skipped': g.numbersWith(CorridorStatus.skipped, route),
      'skipped_labels': [
        for (var i = 0; i < route.corridors.length; i++)
          if (g.statuses[i] == CorridorStatus.skipped) route.corridors[i].label,
      ],
      'pending': g.numbersWith(CorridorStatus.pending, route),
      'current': g.current == null ? null : route.corridors[g.current!].no,
    };
  }
}

class _Line {
  _Line(this.pts, this.cum, int bins) : _bins = List.filled(bins, false);

  final List<Enu> pts;

  /// Distance along the line at each point.
  final List<double> cum;
  final List<bool> _bins;
  int _marked = 0;

  double get length => cum.last;
  double get share => _marked / _bins.length;

  /// Distance to the line and the distance along it of the nearest point.
  (double, double) nearest(Enu p) {
    var best = double.infinity;
    var at = 0.0;
    for (var k = 1; k < pts.length; k++) {
      final a = pts[k - 1];
      final ab = pts[k] - a;
      final len2 = ab.dot(ab);
      final t = len2 == 0 ? 0.0 : ((p - a).dot(ab) / len2).clamp(0.0, 1.0);
      final d = (p - (a + ab * t)).length;
      if (d < best) {
        best = d;
        at = cum[k - 1] + t * (cum[k] - cum[k - 1]);
      }
    }
    return (best, at);
  }

  /// Marks the stretch between [s0] and [s1] (metres along) as walked.
  void mark(double s0, double s1) {
    if (length == 0) {
      if (!_bins[0]) {
        _bins[0] = true;
        _marked++;
      }
      return;
    }
    final n = _bins.length;
    final lo = (math.min(s0, s1) / length * n).floor().clamp(0, n - 1);
    final hi = (math.max(s0, s1) / length * n).floor().clamp(0, n - 1);
    for (var b = lo; b <= hi; b++) {
      if (!_bins[b]) {
        _bins[b] = true;
        _marked++;
      }
    }
  }

  void reset() {
    _bins.fillRange(0, _bins.length, false);
    _marked = 0;
  }
}

/// "Dur-çek-yürü" (MVP Modül 3, stony stretches): a beep every
/// [intervalM] metres walked; the crew stops for [stopFor] at each.
class StopGoWalk {
  StopGoWalk({
    this.intervalM = 4,
    this.minStepM = 0.3,
    this.maxJumpM = 30,
    this.stopFor = const Duration(seconds: 2),
  });

  final double intervalM;

  /// Smaller steps are GNSS noise while standing still.
  final double minStepM;
  final double maxJumpM;
  final Duration stopFor;

  GeoPoint? _last;
  double _sinceBeep = 0;
  int _beeps = 0;

  int get beeps => _beeps;

  /// Metres to the next beep.
  double get toNextM => math.max(0, intervalM - _sinceBeep);

  /// Starts counting from [p] (when the mode is switched on).
  void reset([GeoPoint? p]) {
    _last = p;
    _sinceBeep = 0;
  }

  /// Adds a position; true when a beep is due.
  bool add(GeoPoint p) {
    final last = _last;
    if (last == null) {
      _last = p;
      return false;
    }
    final d = distanceM(last, p);
    if (d > maxJumpM) {
      _last = p;
      return false;
    }
    if (d < minStepM) return false;
    _last = p;
    _sinceBeep += d;
    if (_sinceBeep < intervalM) return false;
    // One beep per point even after a long step; the rest carries over.
    _sinceBeep = _sinceBeep % intervalM;
    _beeps++;
    return true;
  }
}
