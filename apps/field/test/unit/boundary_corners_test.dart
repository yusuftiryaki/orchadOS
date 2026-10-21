import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/features/boundary/boundary_corners.dart';
import 'package:orchados_field/features/boundary/boundary_screen.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';

void main() {
  const origin = GeoPoint(37.0662, 37.3833);
  final proj = LocalProjection(origin);
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);

  Corner corner(String id, int no, {Enu? at}) => Corner(
    eventId: id,
    cornerNo: no,
    gpsTimeMs: 1000 * no,
    timeSource: 'gps',
    fix: at == null
        ? null
        : CornerFix(
            position: proj.toGeo(at),
            hAccM: 0.014,
            fixType: 3,
            carrierSolution: CarrierSolution.fixed,
            numSv: 24,
            ageMs: 200,
          ),
  );

  group('polygon area', () {
    test('rectangle 100 × 50 m = 5000 m² = 5 dönüm', () {
      final ring = [
        proj.toGeo(const Enu(0, 0)),
        proj.toGeo(const Enu(100, 0)),
        proj.toGeo(const Enu(100, 50)),
        proj.toGeo(const Enu(0, 50)),
      ];
      expect(polygonAreaM2(ring), closeTo(5000, 1));
      expect(polygonAreaM2(ring.reversed.toList()), closeTo(5000, 1));
      expect(m2ToDecare(polygonAreaM2(ring)), closeTo(5, 0.001));
    });

    test('triangle, and fewer than three points', () {
      final tri = [
        proj.toGeo(const Enu(0, 0)),
        proj.toGeo(const Enu(60, 0)),
        proj.toGeo(const Enu(0, 40)),
      ];
      expect(polygonAreaM2(tri), closeTo(1200, 0.5));
      expect(polygonAreaM2(tri.take(2).toList()), 0);
    });

    test('agrees with the haversine distance at orchard scale', () {
      final a = proj.toGeo(const Enu(0, 0));
      final b = proj.toGeo(const Enu(300, 400));
      expect(distanceM(a, b), closeTo(500, 0.05));
    });

    test('area label', () {
      expect(areaLabel(19850.4), '19 850 m² · 19,9 dönüm');
      expect(areaLabel(960), '960 m² · 1,0 dönüm');
      expect(areaLabel(1234567), '1 234 567 m² · 1234,6 dönüm');
    });
  });

  group('corner list', () {
    final list = const BoundaryCorners()
        .add(corner('a', 1, at: const Enu(0, 0)))
        .add(corner('b', 2, at: const Enu(40, 0)))
        .add(corner('c', 3, at: const Enu(40, 25)))
        .add(corner('d', 4));

    test('order, move, delete last', () {
      expect(list.corners.map((c) => c.eventId), ['a', 'b', 'c', 'd']);
      expect(list.nextCornerNo, 5);
      final moved = list.move(3, -1);
      expect(moved.corners.map((c) => c.eventId), ['a', 'b', 'd', 'c']);
      expect(moved.move(0, -1).corners.map((c) => c.eventId), [
        'a',
        'b',
        'd',
        'c',
      ]);
      final deleted = moved.removeLast();
      expect(deleted.corners.map((c) => c.eventId), ['a', 'b', 'd']);
      // Numbers stay unique after a delete (they go to the logger).
      expect(deleted.nextCornerNo, 5);
      expect(const BoundaryCorners().removeLast().isEmpty, isTrue);
    });

    test('ring and area use only corners with a position', () {
      expect(list.ring, hasLength(3));
      expect(list.areaM2, closeTo(500, 0.5));
    });

    test('snapshot carries order, note, markers, photos', () {
      final edited = list.update(
        'b',
        (c) => c.copyWith(
          note: () => 'Taş yerinde',
          markers: [BoundaryMarker.stone, BoundaryMarker.road],
          photos: ['ab' * 32],
        ),
      );
      final snap = edited.snapshot('s-1');
      expect(snap['version'], 1);
      final corners = snap['corners']! as List;
      expect(
        [for (final c in corners) (c as Map)['event_id']],
        ['a', 'b', 'c', 'd'],
      );
      expect(corners[1], {
        'event_id': 'b',
        'corner_no': 2,
        'note': 'Taş yerinde',
        'markers': ['stone', 'road'],
        'photos': [
          {'sha256': 'ab' * 32, 'capture_id': captureId('s-1', 'ab' * 32)},
        ],
      });
      // JSON round trip: what is stored is what is sent.
      expect(jsonDecode(jsonEncode(snap)), snap);
    });
  });

  group('corner fix from the logger status', () {
    GnssStatusSample sample({
      required bool position,
      Duration age = Duration.zero,
    }) {
      var s = FakeGnssLogger.healthyStatus.copyWith(
        gpsTimeNs: 1449000000000000000,
      );
      if (position) {
        s = s.copyWith(latE7: 370662000, lonE7: 373833000, heightMm: 850120);
      }
      return GnssStatusSample(
        GnssStatus.decode(
          s.encode(includeGpsTime: true, includePosition: position),
        ),
        t0.subtract(age),
      );
    }

    test('fresh status with a position', () {
      final fix = CornerFix.fromStatus(
        sample(position: true, age: const Duration(milliseconds: 400)),
        t0,
      )!;
      expect(fix.position, const GeoPoint(37.0662, 37.3833));
      expect(fix.heightM, closeTo(850.12, 1e-9));
      expect(fix.hAccM, 0.014);
      expect(fix.carrierSolution, CarrierSolution.fixed);
      expect(fix.ageMs, 400);
      expect(fix.label, 'RTK fixed · ±1,4 cm · 24 uydu');
      final j = fix.toJson();
      expect(j['carr_soln'], 'fixed');
      expect(j['status_gps_time_ns'], '1449000000000000000');
      final back = CornerFix.fromJson(
        jsonDecode(jsonEncode(j)) as Map<String, Object?>,
      );
      expect(back.position, fix.position);
      expect(back.statusGpsTimeNs, 1449000000000000000);
      expect(back.carrierSolution, CarrierSolution.fixed);
    });

    test('no position block, stale status, no status', () {
      expect(CornerFix.fromStatus(sample(position: false), t0), isNull);
      expect(
        CornerFix.fromStatus(
          sample(position: true, age: const Duration(seconds: 6)),
          t0,
        ),
        isNull,
      );
      expect(CornerFix.fromStatus(null, t0), isNull);
    });

    test('no fix: the position block is ignored', () {
      final s = FakeGnssLogger.healthyStatus.copyWith(
        flags: GnssStatus.flagSdPresent,
        fixType: 0,
        latE7: 1,
        lonE7: 1,
      );
      final decoded = GnssStatus.decode(s.encode(includePosition: true));
      expect(decoded.latE7, 1);
      expect(decoded.position, isNull);
    });
  });

  group('stored as events', () {
    late AppDatabase db;
    late FieldRepository repo;
    late FakeClock clock;

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      clock = FakeClock(t0);
      repo = FieldRepository(db, clock);
      await repo.createSession(
        id: 's-1',
        parcelId: 'P-1',
        visitKind: 'inventory',
        startedAt: t0,
      );
    });

    tearDown(() => db.close());

    Future<String> mark(int n, Enu? at) => repo.addEvent(
      sessionId: 's-1',
      eventType: 'corner',
      payload: '$n',
      time: GpsTimeReading(1000 * n, TimeSource.gps),
      loggerResult: 'ok',
      data: Corner.eventData(n, corner('x', n, at: at).fix),
    );

    test('corners, an edit, a later corner; the newest list counts', () async {
      final a = await mark(1, const Enu(0, 0));
      final b = await mark(2, const Enu(40, 0));
      final c = await mark(3, null);
      // Same phone time on purpose: the recording order decides.
      var list = BoundaryCorners.fromEvents(await repo.events('s-1'));
      expect(list.corners.map((x) => x.eventId), [a, b, c]);
      expect(list.corners[0].fix!.position.lat, closeTo(origin.lat, 1e-9));
      expect(list.corners[2].fix, isNull);

      // Delete c, move b first, describe a.
      list = list
          .removeLast()
          .move(1, -1)
          .update(
            a,
            (x) =>
                x.copyWith(note: () => 'çit', markers: [BoundaryMarker.fence]),
          );
      await repo.saveBoundaryEdit(
        sessionId: 's-1',
        time: const GpsTimeReading(5000, TimeSource.gps),
        corners: list.snapshot('s-1'),
      );
      final d = await mark(4, const Enu(40, 25));

      final rebuilt = BoundaryCorners.fromEvents(await repo.events('s-1'));
      expect(rebuilt.corners.map((x) => x.eventId), [b, a, d]);
      expect(rebuilt.corners[1].note, 'çit');
      expect(rebuilt.corners[1].markers, [BoundaryMarker.fence]);
      expect(rebuilt.nextCornerNo, 5);
      expect(rebuilt.areaM2, closeTo(500, 0.5));

      // Server rows carry the details as a JSON object.
      final events = await repo.events('s-1');
      final row = sessionEventRow(
        events.first,
        orgId: 'org-1',
        parcelId: 'P-1',
      );
      expect(row['event_type'], 'corner');
      expect(row['payload'], '1');
      expect((row['data']! as Map)['corner_no'], 1);
      expect(((row['data']! as Map)['position']! as Map)['carr_soln'], 'fixed');
      final edit = events.singleWhere((e) => e.eventType == 'boundary_corners');
      final editRow = sessionEventRow(edit, orgId: 'org-1', parcelId: 'P-1');
      expect(editRow['payload'], '2');
      expect(editRow['logger_result'], 'none');
      expect(((editRow['data']! as Map)['corners']! as List).length, 2);
    });
  });
}
