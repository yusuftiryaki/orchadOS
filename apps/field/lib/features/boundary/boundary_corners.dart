import 'dart:convert';

import '../../core/db/database.dart';
import '../../core/geo/geo.dart';
import '../../core/sync/sync_rows.dart' show captureId;
import '../gnss/gnss_logger.dart';
import '../gnss/protocol/gnss_status.dart';

// Boundary walk (docs/MVP.md, Modül 2, step 2): the crew presses "Köşe" at
// every corner. Each press is a `corner` session event with its GPS time and
// the logger's position and quality at that moment. Edits (order, deleting
// the last corner, note, markers, photos) are `boundary_corners` events that
// carry the whole list; the newest one counts. Nothing is ever updated: the
// pipeline re-positions every corner from the PPK trajectory by its GPS time
// and the office (or the pipeline) writes the boundary version.
// Format: docs/arayuzler.md, "Sınır köşeleri ve kapsama".

/// What marks the boundary at a corner (photographed for the owner).
enum BoundaryMarker {
  stone('stone', 'Sınır taşı'),
  fence('fence', 'Çit'),
  wall('wall', 'Duvar'),
  road('road', 'Yol'),
  neighbor('neighbor', 'Komşu bahçe'),
  other('other', 'Diğer');

  const BoundaryMarker(this.code, this.label);
  final String code;
  final String label;

  static BoundaryMarker fromCode(String code) =>
      values.firstWhere((m) => m.code == code, orElse: () => other);
}

/// A status message older than this is not used as the corner position.
const Duration cornerFixMaxAge = Duration(seconds: 5);

/// Logger position and quality when a corner was marked.
class CornerFix {
  const CornerFix({
    required this.position,
    this.heightM,
    this.hAccM,
    required this.fixType,
    required this.carrierSolution,
    required this.numSv,
    this.statusGpsTimeNs,
    required this.ageMs,
  });

  final GeoPoint position;

  /// Height above the ellipsoid (m).
  final double? heightM;
  final double? hAccM;
  final int fixType;
  final CarrierSolution carrierSolution;
  final int numSv;

  /// GPS time of the status message the position came from.
  final int? statusGpsTimeNs;

  /// How old the status message was when the button was pressed.
  final int ageMs;

  /// From the latest status, when it carries a position and is fresh.
  static CornerFix? fromStatus(GnssStatusSample? sample, DateTime now) {
    final s = sample?.status;
    final p = s?.position;
    if (sample == null || s == null || p == null) return null;
    final age = now.difference(sample.receivedAt);
    if (age > cornerFixMaxAge) return null;
    return CornerFix(
      position: p,
      heightM: s.heightMm == null ? null : s.heightMm! / 1000,
      hAccM: s.hAccM,
      fixType: s.fixType,
      carrierSolution: s.carrierSolution,
      numSv: s.numSv,
      statusGpsTimeNs: s.gpsTimeNs,
      ageMs: age.inMilliseconds,
    );
  }

  /// "RTK fixed · ±1,4 cm · 24 uydu".
  String get label {
    final acc = hAccM == null
        ? 'doğruluk ?'
        : hAccM! < 1
        ? '±${(hAccM! * 100).toStringAsFixed(1).replaceAll('.', ',')} cm'
        : '±${hAccM!.toStringAsFixed(1).replaceAll('.', ',')} m';
    return '${carrierSolution.label} · $acc · $numSv uydu';
  }

  static const _carr = {
    CarrierSolution.none: 'none',
    CarrierSolution.float: 'float',
    CarrierSolution.fixed: 'fixed',
    CarrierSolution.unknown: 'unknown',
  };

  Map<String, Object?> toJson() => {
    'lat': position.lat,
    'lon': position.lon,
    if (heightM != null) 'height_m': heightM,
    if (hAccM != null) 'h_acc_m': hAccM,
    'fix_type': fixType,
    'carr_soln': _carr[carrierSolution],
    'num_sv': numSv,
    // 64-bit integer: text, like asset.pose.gps_time_ns.
    if (statusGpsTimeNs != null) 'status_gps_time_ns': '$statusGpsTimeNs',
    'age_ms': ageMs,
  };

  factory CornerFix.fromJson(Map<String, Object?> j) => CornerFix(
    position: GeoPoint.fromJson(j),
    heightM: (j['height_m'] as num?)?.toDouble(),
    hAccM: (j['h_acc_m'] as num?)?.toDouble(),
    fixType: j['fix_type']! as int,
    carrierSolution: _carr.entries
        .firstWhere(
          (e) => e.value == j['carr_soln'],
          orElse: () => const MapEntry(CarrierSolution.unknown, 'unknown'),
        )
        .key,
    numSv: j['num_sv']! as int,
    statusGpsTimeNs: j['status_gps_time_ns'] == null
        ? null
        : int.parse(j['status_gps_time_ns']! as String),
    ageMs: j['age_ms']! as int,
  );
}

/// A marked corner and what the crew added to it.
class Corner {
  const Corner({
    required this.eventId,
    required this.cornerNo,
    required this.gpsTimeMs,
    required this.timeSource,
    this.fix,
    this.note,
    this.markers = const [],
    this.photos = const [],
  });

  /// Id of the `corner` event (stable across edits).
  final String eventId;

  /// Number sent to the logger (`mark_event(corner, "<n>")`); unique in the
  /// session, not the position in the list.
  final int cornerNo;
  final int gpsTimeMs;

  /// `gps` or `phone`.
  final String timeSource;
  final CornerFix? fix;
  final String? note;
  final List<BoundaryMarker> markers;

  /// SHA-256 of the photos (`captures`).
  final List<String> photos;

  Corner copyWith({
    String? Function()? note,
    List<BoundaryMarker>? markers,
    List<String>? photos,
  }) => Corner(
    eventId: eventId,
    cornerNo: cornerNo,
    gpsTimeMs: gpsTimeMs,
    timeSource: timeSource,
    fix: fix,
    note: note != null ? note() : this.note,
    markers: markers ?? this.markers,
    photos: photos ?? this.photos,
  );

  /// `data` of the `corner` event.
  static Map<String, Object?> eventData(int cornerNo, CornerFix? fix) => {
    'corner_no': cornerNo,
    'position': fix?.toJson(),
  };
}

/// The corners of one boundary walk, in walking order.
class BoundaryCorners {
  const BoundaryCorners([this.corners = const []]);

  static const empty = BoundaryCorners();

  final List<Corner> corners;

  bool get isEmpty => corners.isEmpty;
  int get length => corners.length;

  /// Number for the next corner press.
  int get nextCornerNo =>
      corners.fold(0, (m, c) => c.cornerNo > m ? c.cornerNo : m) + 1;

  BoundaryCorners add(Corner c) => BoundaryCorners([...corners, c]);

  /// Moves the corner at [index] by [delta] places (−1 up, +1 down).
  BoundaryCorners move(int index, int delta) {
    final to = index + delta;
    if (index < 0 || index >= length || to < 0 || to >= length) return this;
    final list = [...corners];
    final c = list.removeAt(index);
    list.insert(to, c);
    return BoundaryCorners(list);
  }

  /// Only the last corner of the list can be deleted.
  BoundaryCorners removeLast() =>
      isEmpty ? this : BoundaryCorners(corners.sublist(0, length - 1));

  BoundaryCorners update(String eventId, Corner Function(Corner) f) =>
      BoundaryCorners([
        for (final c in corners) c.eventId == eventId ? f(c) : c,
      ]);

  /// Positions of the corners that have one, in order.
  List<GeoPoint> get ring => [
    for (final c in corners)
      if (c.fix != null) c.fix!.position,
  ];

  /// Approximate area from the phone-side positions (before PPK).
  double get areaM2 => polygonAreaM2(ring);

  /// `data` of a `boundary_corners` event: the whole list after an edit.
  Map<String, Object?> snapshot(String sessionId) => {
    'version': 1,
    'corners': [
      for (final c in corners)
        {
          'event_id': c.eventId,
          'corner_no': c.cornerNo,
          'note': c.note,
          'markers': [for (final m in c.markers) m.code],
          'photos': [
            for (final sha in c.photos)
              {'sha256': sha, 'capture_id': captureId(sessionId, sha)},
          ],
        },
    ],
  };

  /// Rebuilds the list from the session's events in recording order (corner
  /// presses, then the newest `boundary_corners` list). Corners missing from
  /// that list were deleted; corners marked after it are appended.
  static BoundaryCorners fromEvents(List<SessionEventRow> events) {
    final marked = <String, Corner>{};
    Map<String, Object?>? latest;
    for (final e in events) {
      final data = e.dataJson == null
          ? null
          : (jsonDecode(e.dataJson!) as Map).cast<String, Object?>();
      if (e.eventType == 'corner') {
        final pos = data?['position'];
        marked[e.id] = Corner(
          eventId: e.id,
          cornerNo: data?['corner_no'] as int? ?? int.tryParse(e.payload) ?? 0,
          gpsTimeMs: e.gpsTimeMs,
          timeSource: e.timeSource,
          fix: pos is Map
              ? CornerFix.fromJson(pos.cast<String, Object?>())
              : null,
        );
      } else if (e.eventType == 'boundary_corners' && data != null) {
        latest = data;
      }
    }
    if (latest == null) return BoundaryCorners(marked.values.toList());
    final listed = <Corner>[];
    final seen = <String>{};
    for (final raw in latest['corners']! as List) {
      final j = (raw as Map).cast<String, Object?>();
      final c = marked[j['event_id']];
      if (c == null) continue;
      seen.add(c.eventId);
      listed.add(
        c.copyWith(
          note: () => j['note'] as String?,
          markers: [
            for (final m in j['markers'] as List? ?? const [])
              BoundaryMarker.fromCode(m as String),
          ],
          photos: [
            for (final p in j['photos'] as List? ?? const [])
              (p as Map)['sha256']! as String,
          ],
        ),
      );
    }
    // A snapshot lists every corner marked before it, so a corner that is
    // neither listed nor marked after it was deleted.
    final snapshotIndex = events.lastIndexWhere(
      (e) => e.eventType == 'boundary_corners',
    );
    for (final e in events.skip(snapshotIndex + 1)) {
      if (e.eventType == 'corner' && !seen.contains(e.id)) {
        listed.add(marked[e.id]!);
      }
    }
    return BoundaryCorners(listed);
  }
}
