import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/route/grid_route.dart';
import 'package:orchados_field/features/tasks/field_task.dart';

void main() {
  const origin = GeoPoint(37.0662, 37.3833);
  final proj = LocalProjection(origin);

  /// Offset (metres) along the rows ([u]) and across ([v]) for rows at
  /// [azimuth]°: rows numbered towards +v, position 1 at u = 0.
  Enu rotated(double u, double v, double azimuth) {
    final a = azimuth * math.pi / 180;
    return Enu(
      u * math.sin(a) + v * math.cos(a),
      u * math.cos(a) - v * math.sin(a),
    );
  }

  /// [rows] × [positions] slots, 8 m between rows, 7 m between trees.
  List<SlotPoint> grid({
    int rows = 4,
    int positions = 6,
    double azimuth = 0,
    bool Function(int r, int p)? skip,
  }) => [
    for (var r = 1; r <= rows; r++)
      for (var p = 1; p <= positions; p++)
        if (skip == null || !skip(r, p))
          SlotPoint(
            id: 's-$r-$p',
            code: 'S$r-$p',
            rowNo: r,
            positionNo: p,
            position: proj.toGeo(
              rotated((p - 1) * 7.0, (r - 1) * 8.0, azimuth),
            ),
          ),
  ];

  /// Rectangle around the grid, [margin] metres out.
  List<GeoPoint> box({
    int rows = 4,
    int positions = 6,
    double azimuth = 0,
    double margin = 5,
  }) {
    final u1 = (positions - 1) * 7.0 + margin;
    final v1 = (rows - 1) * 8.0 + margin;
    return [
      for (final (u, v) in [
        (-margin, -margin),
        (u1, -margin),
        (u1, v1),
        (-margin, v1),
      ])
        proj.toGeo(rotated(u, v, azimuth)),
    ];
  }

  /// A corridor's direction in degrees (0–180) and its offset across the
  /// rows ([azimuth]) from the first row.
  double direction(Corridor c) {
    final a = proj.toLocal(c.start);
    final b = proj.toLocal(c.end);
    final d = math.atan2(b.e - a.e, b.n - a.n) * 180 / math.pi;
    return (d % 180 + 180) % 180;
  }

  double across(GeoPoint p, double azimuth) {
    final a = azimuth * math.pi / 180;
    final l = proj.toLocal(p);
    return l.e * math.cos(a) - l.n * math.sin(a);
  }

  double alongRows(GeoPoint p, double azimuth) {
    final a = azimuth * math.pi / 180;
    final l = proj.toLocal(p);
    return l.e * math.sin(a) + l.n * math.cos(a);
  }

  GridRoute routeOf(RouteInput input) => generateGridRoute(input).route!;

  group('after the inventory', () {
    test('rectangular parcel: rows, then cross corridors, then edges', () {
      final r = routeOf(RouteInput(slots: grid(), boundary: box()));
      expect(r.basis, RouteBasis.inventory);
      expect(r.azimuthSource, AzimuthSource.slots);
      expect(r.azimuthDeg, closeTo(0, 1e-3));
      expect(r.rowSpacingM, closeTo(8, 0.01));
      expect(r.treeSpacingM, closeTo(7, 0.01));
      expect(
        [for (final c in r.corridors) c.kind.code],
        [
          ...List.filled(3, 'along'),
          ...List.filled(3, 'cross'),
          ...List.filled(4, 'edge'),
        ],
      );
      expect([
        for (final c in r.corridors) c.no,
      ], List.generate(10, (i) => i + 1));

      // Along: between rows (4 m from each), westernmost first (south-west
      // start), serpentine: north, south, north.
      final along = r.corridors.take(3).toList();
      expect(
        [for (final c in along) c.label],
        ['S1 ile S2 arası', 'S2 ile S3 arası', 'S3 ile S4 arası'],
      );
      for (final (i, c) in along.indexed) {
        expect(across(c.start, 0), closeTo(4 + 8.0 * i, 0.05));
        expect(across(c.end, 0), closeTo(4 + 8.0 * i, 0.05));
      }
      expect(
        alongRows(along[0].start, 0),
        lessThan(alongRows(along[0].end, 0)),
      );
      expect(
        alongRows(along[1].start, 0),
        greaterThan(alongRows(along[1].end, 0)),
      );
      expect(
        alongRows(along[2].start, 0),
        lessThan(alongRows(along[2].end, 0)),
      );
      // Past the first and last tree, inside the boundary (5 m − 1.5 m).
      expect(alongRows(along[0].start, 0), closeTo(-3.5, 0.05));
      expect(alongRows(along[0].end, 0), closeTo(35 + 3.5, 0.05));

      // Cross: one per two positions (3.5 m from each), starting at the
      // north end where the rows ended.
      final cross = r.corridors.skip(3).take(3).toList();
      expect(
        [for (final c in cross) c.label],
        ['5. ile 6. yer arası', '3. ile 4. yer arası', '1. ile 2. yer arası'],
      );
      expect(
        [for (final c in cross) alongRows(c.start, 0)],
        [closeTo(31.5, 0.05), closeTo(17.5, 0.05), closeTo(3.5, 0.05)],
      );
      for (final c in cross) {
        expect(direction(c), closeTo(90, 0.1));
      }
      // Serpentine across: east, west, east.
      expect(across(cross[0].start, 0), greaterThan(across(cross[0].end, 0)));
      expect(across(cross[1].start, 0), lessThan(across(cross[1].end, 0)));

      // Edges: the four sides, 1.5 m inside, starting near the end of the
      // last cross corridor.
      final edges = r.corridors.skip(6).toList();
      expect(
        [for (final c in edges) c.label],
        ['Kenar 1', 'Kenar 2', 'Kenar 3', 'Kenar 4'],
      );
      final perimeter = edges.fold(0.0, (s, c) => s + c.lengthM);
      // (45 − 3) + (34 − 3), twice.
      expect(perimeter, closeTo(2 * (42 + 31), 0.5));
      expect(
        distanceM(edges.first.start, cross.last.end),
        lessThan(distanceM(edges[1].start, cross.last.end)),
      );
    });

    test('rotated parcel: corridors follow the rows', () {
      const az = 32.0;
      final r = routeOf(
        RouteInput(
          slots: grid(azimuth: az),
          boundary: box(azimuth: az),
        ),
      );
      expect(r.azimuthDeg, closeTo(az, 0.01));
      expect(r.count(CorridorKind.along), 3);
      expect(r.count(CorridorKind.cross), 3);
      expect(r.count(CorridorKind.edge), 4);
      for (final c in r.corridors.where((c) => c.kind == CorridorKind.along)) {
        expect(direction(c), closeTo(az, 0.1));
        expect(c.lengthM, closeTo(42, 0.2));
      }
      for (final c in r.corridors.where((c) => c.kind == CorridorKind.cross)) {
        expect(direction(c), closeTo(az + 90, 0.1));
      }
      final first = r.corridors.first;
      expect(across(first.start, az), closeTo(4, 0.05));
    });

    test('missing and interstitial trees do not move the corridors', () {
      final full = routeOf(RouteInput(slots: grid(), boundary: box()));
      final slots = [
        // Row 2 lost positions 3 and 4 (no slot), row 4 lost position 6.
        ...grid(
          skip: (r, p) => (r == 2 && (p == 3 || p == 4)) || (r == 4 && p == 6),
        ),
        // An interstitial tree between S3-2 and S3-3, a little off the row.
        SlotPoint(
          id: 's-3-2a',
          code: 'S3-2a',
          rowNo: 3,
          positionNo: 2,
          position: proj.toGeo(rotated(10.5, 16.6, 0)),
        ),
      ];
      final r = routeOf(RouteInput(slots: slots, boundary: box()));
      expect(r.rowSpacingM, closeTo(8, 0.01));
      expect(r.treeSpacingM, closeTo(7, 0.01));
      expect(r.corridors.length, full.corridors.length);
      for (var i = 0; i < r.corridors.length; i++) {
        expect(r.corridors[i].label, full.corridors[i].label);
        expect(
          distanceM(r.corridors[i].start, full.corridors[i].start),
          lessThan(0.05),
        );
        expect(
          distanceM(r.corridors[i].end, full.corridors[i].end),
          lessThan(0.05),
        );
      }
    });

    test('without a boundary the edges go round the slots', () {
      final r = routeOf(RouteInput(slots: grid()));
      expect(r.count(CorridorKind.along), 3);
      expect(r.count(CorridorKind.cross), 3);
      expect(r.count(CorridorKind.edge), 4);
      // Along corridors reach 4 m past the end trees, less the clearance.
      expect(r.corridors.first.lengthM, closeTo(35 + 2 * 4 - 3, 0.2));
    });

    test('an odd number of positions: the last one shares the last gap', () {
      final r = routeOf(
        RouteInput(slots: grid(positions: 5), boundary: box(positions: 5)),
      );
      expect(
        [
          for (final c in r.corridors)
            if (c.kind == CorridorKind.cross) c.label,
        ]..sort(),
        ['1. ile 2. yer arası', '3. ile 4. yer arası', '4. ile 5. yer arası'],
      );
    });

    test('the start corner decides where the route begins', () {
      final ne = routeOf(
        RouteInput(slots: grid(), boundary: box(), startCorner: StartCorner.ne),
      );
      expect(ne.corridors.first.label, 'S3 ile S4 arası');
      // Starts at the north end and walks south.
      expect(alongRows(ne.corridors.first.start, 0), greaterThan(30));
    });
  });

  group('before the inventory', () {
    // 80 m (across, east–west) × 150 m (along, north–south).
    final field = [
      proj.toGeo(const Enu(0, 0)),
      proj.toGeo(const Enu(80, 0)),
      proj.toGeo(const Enu(80, 150)),
      proj.toGeo(const Enu(0, 150)),
    ];

    test('direction from the parcel record, spacing from the tree count', () {
      final r = routeOf(
        RouteInput(
          boundary: field,
          parcelAzimuthDeg: 180,
          estimatedTreeCount: 200,
        ),
      );
      expect(r.basis, RouteBasis.boundary);
      expect(r.azimuthSource, AzimuthSource.parcel);
      expect(r.azimuthDeg, 0);
      // sqrt(12 000 m² / 200).
      expect(r.rowSpacingM, closeTo(7.75, 0.01));
      final along = [
        for (final c in r.corridors)
          if (c.kind == CorridorKind.along) c,
      ];
      // Every 7.75 m from the west side while half a spacing is left.
      expect(along, hasLength(9));
      expect(across(along.first.start, 0), closeTo(7.75, 0.05));
      expect(along.first.label, 'Sıra boyunca 1');
      expect(along.first.lengthM, closeTo(147, 0.1));
      // Cross: every two spacings.
      final cross = r.corridors.where((c) => c.kind == CorridorKind.cross);
      expect(cross.length, 9);
      expect(r.count(CorridorKind.edge), 4);
    });

    test(
      'without a direction: the longest boundary side, crew can correct',
      () {
        final guess = routeOf(RouteInput(boundary: field));
        expect(guess.azimuthSource, AzimuthSource.boundary);
        expect(guess.azimuthDeg, 0);
        expect(guess.rowSpacingM, 8);

        // The crew taps two trees of a row running east–west.
        final az = azimuthFromTaps(
          proj.toGeo(const Enu(10, 40)),
          proj.toGeo(const Enu(60, 40.2)),
        );
        expect(az, closeTo(89.8, 0.1));
        final crew = routeOf(RouteInput(boundary: field, crewAzimuthDeg: az));
        expect(crew.azimuthSource, AzimuthSource.crew);
        expect(direction(crew.corridors.first), closeTo(89.8, 0.1));
        // Corridors are now 150 m / 8 m across.
        expect(crew.count(CorridorKind.along), 18);
        expect(azimuthFromTaps(origin, origin), isNull);
      },
    );

    test('the parcel record wins over the crew, the slots over both', () {
      final r = routeOf(
        RouteInput(boundary: field, parcelAzimuthDeg: 10, crewAzimuthDeg: 50),
      );
      expect(r.azimuthSource, AzimuthSource.parcel);
      expect(r.azimuthDeg, closeTo(10, 1e-4));
      final inv = routeOf(
        RouteInput(slots: grid(), boundary: box(), parcelAzimuthDeg: 10),
      );
      expect(inv.azimuthSource, AzimuthSource.slots);
    });

    test('first inventory: the corners walked in the session', () {
      const task = FieldTask(
        id: 't',
        parcelId: 'p',
        parcelName: 'P',
        village: 'V',
        kind: VisitKind.inventory,
        season: Season.winter,
        areaDecare: 12,
        originCorner: 'ne',
        estimatedTreeCount: 200,
      );
      expect(
        generateGridRoute(RouteInput.forTask(task)).missing,
        RouteMissing.noArea,
      );
      final r = routeOf(RouteInput.forTask(task, walkedBoundary: field));
      expect(r.startCorner, StartCorner.ne);
      expect(r.rowSpacingM, closeTo(7.75, 0.01));
      // North-east start: the easternmost corridor, walked southwards.
      expect(across(r.corridors.first.start, 0), closeTo(9 * 7.75, 0.05));
      expect(alongRows(r.corridors.first.start, 0), greaterThan(140));
    });

    test('nothing to lay corridors on', () {
      final g = generateGridRoute(const RouteInput(parcelAzimuthDeg: 0));
      expect(g.route, isNull);
      expect(g.missing, RouteMissing.noArea);
    });
  });

  group('fixed route', () {
    test('the same input always gives the same route', () {
      final input = RouteInput(
        slots: grid(azimuth: 17),
        boundary: box(azimuth: 17),
      );
      final a = routeOf(input);
      final b = routeOf(input);
      expect(jsonEncode(a.toJson()), jsonEncode(b.toJson()));
      expect(a.contentHash, b.contentHash);
      expect(a.contentHash, hasLength(64));
    });

    test('slot order and the boundary start vertex do not matter', () {
      final slots = grid(azimuth: 17);
      final ring = box(azimuth: 17);
      final a = routeOf(RouteInput(slots: slots, boundary: ring));
      final b = routeOf(
        RouteInput(
          slots: [...slots.reversed],
          boundary: [...ring.skip(2), ...ring.take(2)],
        ),
      );
      final c = routeOf(
        RouteInput(slots: slots, boundary: ring.reversed.toList()),
      );
      expect(b.contentHash, a.contentHash);
      expect(c.contentHash, a.contentHash);
    });

    test('JSON round trip keeps the route and its hash', () {
      final a = routeOf(RouteInput(slots: grid(), boundary: box()));
      final back = GridRoute.fromJson(
        (jsonDecode(jsonEncode(a.toJson())) as Map).cast<String, Object?>(),
      );
      expect(back.contentHash, a.contentHash);
      expect(back.corridors.length, a.corridors.length);
      expect(back.generator, gridRouteGenerator);
      expect(a.toJson()['format'], 1);
    });

    test('a different input gives a different route', () {
      final a = routeOf(RouteInput(slots: grid(), boundary: box()));
      final b = routeOf(
        RouteInput(slots: grid(rows: 5), boundary: box(rows: 5)),
      );
      expect(b.contentHash, isNot(a.contentHash));
    });
  });
}
