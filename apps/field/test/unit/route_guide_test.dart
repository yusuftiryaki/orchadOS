import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/route/grid_route.dart';
import 'package:orchados_field/features/route/route_guide.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';

void main() {
  // 4 rows (8 m apart, west to east) × 6 positions (7 m apart, south to
  // north); boundary 5 m out. Corridors: 3 along (e = 4, 12, 20), 3 cross,
  // 4 edges.
  final proj = LocalProjection(sampleOrigin);
  final route = generateGridRoute(
    RouteInput(
      slots: sampleSlots(idPrefix: 'p', rows: 4, positions: 6),
      boundary: sampleBoundary(rows: 4, positions: 6),
    ),
  ).route!;

  Enu local(GeoPoint p) => proj.toLocal(p);

  /// Walks from [a] to [b] in 1 m steps.
  void walk(RouteGuide g, Enu a, Enu b) {
    final steps = (b - a).length.ceil();
    for (var k = 0; k <= steps; k++) {
      g.add(proj.toGeo(a + (b - a) * (k / steps)));
    }
  }

  /// Walks corridor [i] of the route from its start to its end.
  void walkCorridor(RouteGuide g, int i, {bool reversed = false}) {
    final pts = [for (final p in route.corridors[i].points) local(p)];
    final path = reversed ? pts.reversed.toList() : pts;
    for (var k = 1; k < path.length; k++) {
      walk(g, path[k - 1], path[k]);
    }
  }

  test('the route under test', () {
    expect(route.corridors.map((c) => c.kind.code).toList(), [
      ...List.filled(3, 'along'),
      ...List.filled(3, 'cross'),
      ...List.filled(4, 'edge'),
    ]);
    final first = route.corridors.first;
    expect(local(first.start).e, closeTo(4, 0.05));
    expect(local(first.start).n, closeTo(-3.5, 0.05));
    expect(local(first.end).n, closeTo(38.5, 0.05));
  });

  test('before the first corridor: distance and direction to its start', () {
    final g = RouteGuide(route);
    var s = g.guidance;
    expect(s.current, 0);
    expect(s.started, isFalse);
    expect(s.toStartM, isNull, reason: 'no position yet');
    expect(s.remainingCorridors, 10);

    // 30 m south-west of the start.
    g.add(proj.toGeo(const Enu(4 - 21.21, -3.5 - 21.21)));
    s = g.guidance;
    expect(s.started, isFalse);
    expect(s.toStartM, closeTo(30, 0.1));
    expect(Compass.of(s.toStartBearingDeg!), Compass.northEast);
    expect(s.offCorridorM, isNull, reason: 'not started: no deviation warning');
    // The way to the start, every corridor and the walks in between.
    var expected = 30 + route.lengthM;
    for (var i = 1; i < route.corridors.length; i++) {
      expected += distanceM(
        route.corridors[i - 1].end,
        route.corridors[i].start,
      );
    }
    expect(s.remainingM, closeTo(expected, 0.5));
    expect(s.remaining.inSeconds, closeTo(expected / 1.2, 1));
  });

  test('walking a corridor finishes it and points to the next one', () {
    final g = RouteGuide(route);
    walk(g, const Enu(4, -10), const Enu(4, -3.5));
    walkCorridor(g, 0);
    final s = g.guidance;
    expect(s.statuses.first, CorridorStatus.done);
    expect(s.current, 1);
    expect(s.started, isFalse);
    // Serpentine: the next one starts at the north end, one row over.
    expect(s.toStartM, closeTo(8, 0.1));
    expect(Compass.of(s.toStartBearingDeg!), Compass.east);
    expect(s.remainingCorridors, 9);
  });

  test('half way along: walked share; straying warns', () {
    final g = RouteGuide(route);
    walk(g, const Enu(4, -3.5), const Enu(4, 17.5));
    var s = g.guidance;
    expect(s.current, 0);
    expect(s.started, isTrue);
    expect(s.walkedShare, closeTo(0.5, 0.05));
    expect(s.offCorridorM, isNull);
    expect(s.toStartM, isNull);

    // 5 m off: still within the warning distance.
    g.add(proj.toGeo(const Enu(9, 17.5)));
    expect(g.guidance.offCorridorM, isNull);
    // 9 m off (in the next corridor): warned.
    g.add(proj.toGeo(const Enu(13, 17.5)));
    s = g.guidance;
    expect(s.offCorridorM, closeTo(9, 0.05));
    expect(s.walkedShare, closeTo(0.5, 0.05), reason: 'off it nothing counts');
    // Back on the corridor.
    g.add(proj.toGeo(const Enu(4.5, 18)));
    expect(g.guidance.offCorridorM, isNull);
  });

  test('a corridor walked the other way round is done too', () {
    final g = RouteGuide(route);
    walkCorridor(g, 0, reversed: true);
    expect(g.guidance.statuses.first, CorridorStatus.done);
    expect(g.guidance.current, 1);
  });

  test('walking a different corridor does not finish the current one', () {
    final g = RouteGuide(route);
    walkCorridor(g, 1);
    final s = g.guidance;
    expect(s.current, 0);
    expect(s.statuses[1], CorridorStatus.pending);
  });

  test('skip and back', () {
    final g = RouteGuide(route);
    g.skip();
    var s = g.guidance;
    expect(s.statuses[0], CorridorStatus.skipped);
    expect(s.current, 1);
    expect(s.remainingCorridors, 9);

    // Half of corridor 2, then back to corridor 1.
    final c1 = [for (final p in route.corridors[1].points) local(p)];
    walk(g, c1.first, c1.first + (c1.last - c1.first) * 0.5);
    expect(g.guidance.walkedShare, closeTo(0.5, 0.05));
    g.back();
    s = g.guidance;
    expect(s.current, 0);
    expect(s.statuses[0], CorridorStatus.pending);
    expect(s.walkedShare, 0);
    expect(s.remainingCorridors, 10);

    // Walk it: on to corridor 2, whose half walk was kept.
    walkCorridor(g, 0);
    s = g.guidance;
    expect(s.current, 1);
    expect(s.walkedShare, closeTo(0.5, 0.05));

    // Skip the rest; the last skip finishes the route.
    for (var i = 1; i < route.corridors.length; i++) {
      g.skip();
    }
    s = g.guidance;
    expect(s.finished, isTrue);
    expect(s.remainingCorridors, 0);
    expect(s.remaining, Duration.zero);
    expect(s.numbersWith(CorridorStatus.done, route), [1]);
    expect(s.numbersWith(CorridorStatus.skipped, route), [
      for (var n = 2; n <= 10; n++) n,
    ]);
    final json = g.progressJson();
    expect(json['corridors_total'], 10);
    expect(json['done'], [1]);
    expect(json['pending'], isEmpty);
    expect(json['current'], isNull);
    expect((json['skipped_labels']! as List).first, 'S2 ile S3 arası');

    // Back from the end reopens the last corridor.
    g.back();
    expect(g.guidance.current, 9);
    expect(g.guidance.statuses[9], CorridorStatus.pending);
  });

  test('after a skip the next pending one comes, then the skipped stay', () {
    final g = RouteGuide(route);
    g.skip(); // 1
    walkCorridor(g, 1); // 2 done
    expect(g.guidance.current, 2);
    final json = g.progressJson();
    expect(json['done'], [2]);
    expect(json['skipped'], [1]);
    expect(json['current'], 3);
    expect(json['pending'], [3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('a jump in the track does not fill the corridor in between', () {
    final g = RouteGuide(route);
    g.add(proj.toGeo(const Enu(4, -3.5)));
    g.add(proj.toGeo(const Enu(4, 38.5)));
    expect(g.guidance.walkedShare, lessThan(0.1));
  });

  group('stop-go-walk', () {
    test('a beep every 4 m', () {
      final s = StopGoWalk();
      var beeps = 0;
      for (var k = 0; k <= 10; k++) {
        if (s.add(proj.toGeo(Enu(0, k.toDouble())))) beeps++;
      }
      expect(beeps, 2);
      expect(s.beeps, 2);
      expect(s.toNextM, closeTo(2, 1e-6));
    });

    test('standing still does not beep; a jump starts over', () {
      final s = StopGoWalk();
      s.add(proj.toGeo(const Enu(0, 0)));
      for (var k = 0; k < 50; k++) {
        expect(s.add(proj.toGeo(Enu(0.1 * (k % 2), 0))), isFalse);
      }
      expect(s.add(proj.toGeo(const Enu(0, 50))), isFalse);
      expect(s.toNextM, 4);
      expect(s.add(proj.toGeo(const Enu(0, 53))), isFalse);
      expect(s.add(proj.toGeo(const Enu(0, 54.5))), isTrue);
      expect(s.toNextM, closeTo(3.5, 1e-6));
      expect(s.stopFor, const Duration(seconds: 2));
    });

    test('reset counts from the given point', () {
      final s = StopGoWalk();
      s.add(proj.toGeo(const Enu(0, 0)));
      s.add(proj.toGeo(const Enu(0, 3)));
      s.reset(proj.toGeo(const Enu(0, 3)));
      expect(s.add(proj.toGeo(const Enu(0, 6))), isFalse);
      expect(s.add(proj.toGeo(const Enu(0, 7.1))), isTrue);
    });
  });
}
