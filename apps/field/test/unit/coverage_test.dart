import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/coverage/coverage.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';

void main() {
  // 4 rows (8 m apart, west to east) × 6 positions (7 m apart, south to
  // north); position 1 at the south end.
  final slots = sampleSlots(idPrefix: 'p', rows: 4, positions: 6);
  final proj = LocalProjection(sampleOrigin);
  final t0 = DateTime.utc(2026, 12, 3, 8);

  /// Walks [waypoints] (local metres) at 1 m/s, one point per second.
  void walk(CoverageTracker t, List<Enu> waypoints, {DateTime? start}) {
    var time = start ?? t0;
    for (var i = 1; i < waypoints.length; i++) {
      final a = waypoints[i - 1];
      final b = waypoints[i];
      final steps = (b - a).length.ceil();
      for (var k = i == 1 ? 0 : 1; k <= steps; k++) {
        t.add(proj.toGeo(a + (b - a) * (k / steps)), time);
        time = time.add(const Duration(seconds: 1));
      }
    }
  }

  test('walking every row corridor covers everything along the rows', () {
    final t = CoverageTracker(slots);
    // Corridors west of row 1, between rows, east of row 4 (4 m off).
    walk(t, [
      for (var c = 0; c <= 4; c++) ...[
        Enu(c * 8.0 - 4, c.isEven ? -3 : 38),
        Enu(c * 8.0 - 4, c.isEven ? 38 : -3),
      ],
    ]);
    final s = t.summary;
    expect(s.hasRowDirection, isTrue);
    expect(s.slotsTotal, 24);
    expect(s.slotsCovered, 24);
    expect(s.ratio, 1);
    expect(s.belowThreshold, isFalse);
    expect(s.rowsDone, 4);
    // Only the short hops between corridors went across.
    expect(s.crossDone, 0);
    expect(s.uncoveredCodes, isEmpty);
    expect(s.sentence, "Yerlerin %100'ünün 4 m yakınından geçildi");
    expect(t.tracks, hasLength(1));
    expect(s.trackLengthM, closeTo(5 * 41 + 4 * 8, 0.5));
  });

  test('cross corridors are counted separately', () {
    final t = CoverageTracker(slots);
    // Across the rows at positions 1, 3 and 5 only.
    walk(t, [
      const Enu(-6, 0),
      const Enu(30, 0),
      const Enu(30, 14),
      const Enu(-6, 14),
      const Enu(-6, 28),
      const Enu(30, 28),
    ]);
    final s = t.summary;
    expect(
      [
        for (final c in s.crossCorridors)
          if (c.ratio >= 0.95) c.no,
      ],
      [1, 3, 5],
    );
    expect(s.rowsDone, 0);
    // Positions 1, 3, 5 of each row; 2, 4, 6 are 7 m from the walk.
    expect(s.slotsCovered, 12);
    expect(s.ratio, 0.5);
    expect(s.belowThreshold, isTrue);
    expect(s.uncoveredCodes.take(3), ['S1-2', 'S1-4', 'S1-6']);
    expect(s.sentence, "Yerlerin %50'sinin 4 m yakınından geçildi");
  });

  test('radius: 3.9 m is covered, 4.1 m is not', () {
    final one = [slots.first]; // S1-1 at the origin
    final near = CoverageTracker(one);
    walk(near, [const Enu(3.9, -10), const Enu(3.9, 10)]);
    expect(near.summary.slotsCovered, 1);
    final far = CoverageTracker(one);
    walk(far, [const Enu(4.1, -10), const Enu(4.1, 10)]);
    expect(far.summary.slotsCovered, 0);
    expect(
      CoverageTracker(one, config: const CoverageConfig(radiusM: 5))
        ..add(proj.toGeo(const Enu(4.5, 0)), t0),
      isA<CoverageTracker>().having(
        (x) => x.summary.slotsCovered,
        'covered',
        1,
      ),
    );
  });

  test('a gap in time or a jump is not bridged', () {
    final t = CoverageTracker(slots);
    // West of row 1, then 30 s without a position, then east of row 4:
    // the straight line between them would cross every row.
    t.add(proj.toGeo(const Enu(-10, 17)), t0);
    t.add(proj.toGeo(const Enu(-9, 17)), t0.add(const Duration(seconds: 1)));
    t.add(proj.toGeo(const Enu(-8, 17)), t0.add(const Duration(seconds: 31)));
    expect(t.tracks, hasLength(2));
    expect(t.summary.slotsCovered, 0);
    // A 40 m jump one second later is not joined either.
    t.add(proj.toGeo(const Enu(32, 17)), t0.add(const Duration(seconds: 32)));
    expect(t.tracks, hasLength(3));
    expect(t.summary.slotsCovered, 0);
  });

  test('standing still adds no points but keeps the track joined', () {
    final t = CoverageTracker(slots);
    for (var i = 0; i < 20; i++) {
      t.add(proj.toGeo(Enu(-20, 0.1 * (i % 2))), t0.add(Duration(seconds: i)));
    }
    t.add(proj.toGeo(const Enu(-17, 0)), t0.add(const Duration(seconds: 21)));
    expect(t.summary.trackPoints, 2);
    expect(t.tracks.single, hasLength(2));
  });

  test('without slots only the track is kept', () {
    final t = CoverageTracker(const []);
    walk(t, [const Enu(0, 0), const Enu(0, 20)]);
    final s = t.summary;
    expect(s.slotsTotal, 0);
    expect(s.sentence, isNull);
    expect(s.belowThreshold, isFalse);
    expect(s.hasRowDirection, isFalse);
    expect(s.trackLengthM, closeTo(20, 0.01));
    expect(
      t.lastPosition!.lat,
      closeTo(proj.toGeo(const Enu(0, 20)).lat, 1e-9),
    );
  });

  test('slots without a position are left out', () {
    final t = CoverageTracker([
      ...slots.take(2),
      const SlotPoint(id: 'x', code: 'S9-1', rowNo: 9, positionNo: 1),
    ]);
    walk(t, [const Enu(-3, -5), const Enu(-3, 12)]);
    expect(t.summary.slotsTotal, 2);
    expect(t.summary.slotsCovered, 2);
  });

  test('coverage target: 98 % for an inventory, 95 % otherwise', () {
    expect(CoverageConfig.forVisit(VisitKind.inventory).threshold, 0.98);
    expect(CoverageConfig.forVisit(VisitKind.periodic).threshold, 0.95);
    expect(const CoverageConfig().threshold, 0.95);
    // 23 of 24 slots (95.8 %) is enough for a periodic visit only.
    final walked = [const Enu(-4, -3), const Enu(-4, 38)];
    for (final x in [4.0, 12.0]) {
      walked.addAll([Enu(x, 38), Enu(x, -3)]);
    }
    walked.addAll([const Enu(20, -3), const Enu(20, 30)]);
    final inventory = CoverageTracker(
      slots,
      config: CoverageConfig.forVisit(VisitKind.inventory),
    );
    final periodic = CoverageTracker(
      slots,
      config: CoverageConfig.forVisit(VisitKind.periodic),
    );
    walk(inventory, walked);
    walk(periodic, walked);
    expect(periodic.summary.slotsCovered, 23);
    expect(periodic.summary.belowThreshold, isFalse);
    expect(inventory.summary.belowThreshold, isTrue);
  });

  test('event data', () {
    final t = CoverageTracker(slots);
    walk(t, [const Enu(-4, -3), const Enu(-4, 38)]);
    final j = t.summary.toJson();
    expect(j['version'], 1);
    expect(j['radius_m'], 4);
    expect(j['threshold'], 0.95);
    expect(j['slots_total'], 24);
    expect(j['slots_covered'], 6);
    expect(j['ratio'], 0.25);
    expect(j['rows_done'], [1]);
    expect(j['rows_total'], 4);
    expect(j['cross_done'], isEmpty);
    expect(j['cross_total'], 6);
    expect(j['uncovered_slot_codes'], hasLength(18));
    expect(j['track_points'], 42);
    expect(j['track_length_m'], 41.0);
  });

  test('percentages read as Turkish', () {
    String s(double r) => CoverageSummary.coverageSentence(r, 4);
    expect(s(0.96), "Yerlerin %96'sının 4 m yakınından geçildi");
    expect(s(0.955), "Yerlerin %95'inin 4 m yakınından geçildi");
    expect(s(0.62), "Yerlerin %62'sinin 4 m yakınından geçildi");
    expect(s(0.3), "Yerlerin %30'unun 4 m yakınından geçildi");
    expect(s(0.4), "Yerlerin %40'ının 4 m yakınından geçildi");
    expect(s(0.04), "Yerlerin %4'ünün 4 m yakınından geçildi");
    expect(s(0.09), "Yerlerin %9'unun 4 m yakınından geçildi");
    expect(s(0), "Yerlerin %0'ının 4 m yakınından geçildi");
  });
}
