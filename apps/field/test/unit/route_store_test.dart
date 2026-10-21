import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:orchados_field/features/route/grid_route.dart';
import 'package:orchados_field/features/route/route_store.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';

import '../support/fake_sync_server.dart';

void main() {
  const parcelId = 'P-12';
  const visitId = 'v-1';
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);
  final slots = sampleSlots(idPrefix: 'p', rows: 4, positions: 6);
  final inventoryRoute = generateGridRoute(
    RouteInput(slots: slots, boundary: sampleBoundary(rows: 4, positions: 6)),
  ).route!;
  final boundaryRoute = generateGridRoute(
    RouteInput(boundary: sampleBoundary(rows: 4, positions: 6)),
  ).route!;

  StoredRoute stored(GridRoute r, int version) => StoredRoute(
    id: routeId(parcelId, r.contentHash),
    parcelId: parcelId,
    version: version,
    route: r,
  );

  FieldTask task({List<SlotPoint> slots = const [], StoredRoute? route}) =>
      FieldTask(
        id: visitId,
        parcelId: parcelId,
        parcelName: 'P',
        village: 'V',
        kind: VisitKind.periodic,
        season: Season.winter,
        areaDecare: 1,
        slots: slots,
        route: route,
      );

  group('which route a visit uses', () {
    test('route id: same parcel and content → same id', () {
      expect(
        routeId(parcelId, inventoryRoute.contentHash),
        routeId(parcelId, inventoryRoute.contentHash),
      );
      expect(
        routeId(parcelId, inventoryRoute.contentHash),
        isNot(routeId('P-13', inventoryRoute.contentHash)),
      );
      expect(
        routeId(parcelId, inventoryRoute.contentHash),
        isNot(routeId(parcelId, boundaryRoute.contentHash)),
      );
    });

    test(
      'an inventory route is kept, a boundary route until the inventory',
      () {
        expect(
          reuseRoute(stored(inventoryRoute, 1), task(slots: slots)),
          isTrue,
        );
        expect(reuseRoute(stored(boundaryRoute, 1), task()), isTrue);
        expect(
          reuseRoute(stored(boundaryRoute, 1), task(slots: slots)),
          isFalse,
        );
        // A single located slot per row is no inventory yet.
        expect(hasInventory([slots.first, slots[6]]), isFalse);
        expect(hasInventory(slots.take(2).toList()), isTrue);
      },
    );

    test('the newer of server and phone', () {
      final a = stored(boundaryRoute, 1);
      final b = stored(inventoryRoute, 2);
      expect(latestRoute(null, null), isNull);
      expect(latestRoute(a, null), a);
      expect(latestRoute(null, b), b);
      expect(latestRoute(a, b), b);
      expect(latestRoute(b, a), b);
      // Same route: the server's version counts.
      final local = StoredRoute(
        id: b.id,
        parcelId: parcelId,
        version: 7,
        route: b.route,
      );
      expect(latestRoute(b, local)!.version, 2);
    });

    test('the task carries the route through the offline cache', () {
      final t = task(slots: slots, route: stored(inventoryRoute, 3));
      final back = FieldTask.fromJson(
        (jsonDecode(jsonEncode(t.toJson())) as Map).cast<String, Object?>(),
      );
      expect(back.route!.version, 3);
      expect(back.route!.id, t.route!.id);
      expect(back.route!.route.contentHash, inventoryRoute.contentHash);
      expect(FieldTask.fromJson(task().toJson()).route, isNull);
    });
  });

  group('stored and sent', () {
    late AppDatabase db;
    late FieldRepository repo;
    late FakeSyncServer server;
    late SyncWorker worker;
    final time = GpsTimeReading(utcToGpsMs(t0), TimeSource.gps);

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      final clock = FakeClock(t0);
      repo = FieldRepository(db, clock);
      server = FakeSyncServer(visits: {visitId: 'planned'});
      worker = SyncWorker(
        repository: repo,
        server: server,
        media: MemoryMediaStore(),
        clock: clock,
        timer: (d, run) => throw StateError('no retry expected'),
      );
      await repo.createSession(
        id: visitId,
        parcelId: parcelId,
        visitKind: 'periodic',
        startedAt: t0,
      );
    });

    tearDown(() async {
      worker.dispose();
      await db.close();
    });

    test(
      'a new route: row, event, sent with the visit, server version',
      () async {
        final r = stored(inventoryRoute, 1);
        await repo.saveRouteUse(
          sessionId: visitId,
          route: r,
          isNew: true,
          time: time,
        );
        expect((await repo.localRoute(parcelId))!.id, r.id);
        final events = await repo.events(visitId);
        final e = events.singleWhere((e) => e.eventType == 'route');
        expect(e.payload, '1');
        final data = jsonDecode(e.dataJson!) as Map;
        expect(data['route_id'], r.id);
        expect(data['route_version'], 1);
        expect(data['new_version'], isTrue);
        expect(data['content_hash'], inventoryRoute.contentHash);
        expect(data['generator'], gridRouteGenerator);
        expect(data['basis'], 'inventory');
        expect(data['corridors_total'], 10);
        // Queued in order: visit, route, event.
        expect(
          [for (final o in await repo.outbox.pending()) o.entityType],
          [
            OutboxEntity.session,
            OutboxEntity.parcelRoute,
            OutboxEntity.sessionEvent,
          ],
        );
        expect(
          await repo.outbox.watchSessionCounts(visitId).first,
          const OutboxCounts(pending: 3, sent: 0, failed: 0),
        );

        // Another phone stored a route for the parcel first: this one
        // becomes version 2 on the server, and locally too.
        server.routes[parcelId] = [
          {'p_id': 'other', 'version': 1},
        ];
        final report = await worker.syncNow();
        expect(report.failed, 0);
        final sent = server.routes[parcelId]!.last;
        expect(sent['p_id'], r.id);
        expect(sent['p_parcel_id'], parcelId);
        expect(sent['p_session_id'], visitId);
        expect(sent['p_content_hash'], inventoryRoute.contentHash);
        expect((sent['p_route']! as Map)['generator'], gridRouteGenerator);
        expect(
          ((sent['p_route']! as Map)['corridors']! as List).length,
          inventoryRoute.corridors.length,
        );
        final row = (await repo.routeRow(r.id))!;
        expect(row.synced, isTrue);
        expect(row.version, 2);
        expect((await repo.localRoute(parcelId))!.version, 2);
        expect(
          server.tables['session_event']!.values.single['event_type'],
          'route',
        );

        // Sent again (the app died before markSent): still one route.
        await repo.outbox.enqueue(OutboxEntity.parcelRoute, r.id);
        await worker.syncNow();
        expect(server.routes[parcelId], hasLength(2));
      },
    );

    test('reusing the stored route only writes the event', () async {
      await repo.saveRouteUse(
        sessionId: visitId,
        route: stored(inventoryRoute, 4),
        isNew: false,
        time: time,
      );
      expect(await repo.localRoute(parcelId), isNull);
      final e = (await repo.events(visitId))
          .singleWhere((e) => e.eventType == 'route');
      expect((jsonDecode(e.dataJson!) as Map)['new_version'], isFalse);
      expect(e.payload, '4');
      await worker.syncNow();
      expect(server.routes, isEmpty);
    });

    test('a refused route is a permanent failure, the queue goes on', () async {
      server.refuse = (call, params) =>
          call == 'save_parcel_route' ? 'forbidden' : null;
      await repo.saveRouteUse(
        sessionId: visitId,
        route: stored(boundaryRoute, 1),
        isNew: true,
        time: time,
      );
      final report = await worker.syncNow();
      expect(report.failed, 1);
      expect(report.sent, 2);
      expect(
        (await repo.routeRow(stored(boundaryRoute, 1).id))!.synced,
        isFalse,
      );
    });
  });
}
