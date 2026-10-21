// Grid route against a local Supabase (`pnpm db:start && pnpm db:reset`);
// same variables as supabase_sync_test.dart, skipped without them. Every run
// plans its own visit; the route of the seed parcel is stored once and later
// runs reuse it (rows stay behind: `pnpm db:reset` before `pnpm db:test`).
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/sync/supabase_sync_server.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:orchados_field/features/route/grid_route.dart';
import 'package:orchados_field/features/route/route_store.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final _url = Platform.environment['ORCHADOS_TEST_SUPABASE_URL'] ?? '';
final _key = Platform.environment['ORCHADOS_TEST_SUPABASE_KEY'] ?? '';

// supabase/seed.sql
const _org = 'b0000000-0000-4000-8000-000000000001';
const _parcel = 'c0000000-0000-4000-8000-000000000001';
const _fieldUser = 'a0000000-0000-4000-8000-000000000003';

Future<SupabaseClient> _signIn(String email) async {
  final c = SupabaseClient(
    _url,
    _key,
    authOptions: const AuthClientOptions(autoRefreshToken: false),
  );
  await c.auth.signInWithPassword(email: email, password: 'orchados-dev');
  return c;
}

void main() {
  final skip = _url.isEmpty || _key.isEmpty
      ? 'ORCHADOS_TEST_SUPABASE_URL / ORCHADOS_TEST_SUPABASE_KEY not set'
      : null;

  test(
    'route: stored with the first visit, downloaded with the next',
    () async {
      final ops = await _signIn('ops@example.com');
      final field = await _signIn('field@example.com');
      final today = DateTime.now();
      final day =
          '${today.year}-${today.month.toString().padLeft(2, '0')}-'
          '${today.day.toString().padLeft(2, '0')}';
      Future<String> plan() async =>
          (await ops
                  .from('session')
                  .insert({
                    'org_id': _org,
                    'parcel_id': _parcel,
                    'kind': 'periodic_scan',
                    'status': 'planned',
                    'planned_date': day,
                    'lead_user_id': _fieldUser,
                  })
                  .select('id')
                  .single())['id']
              as String;

      final visitId = await plan();
      final source = SupabaseTaskSource(field);
      final task = (await source.fetch(
        userId: _fieldUser,
        today: today,
      )).firstWhere((t) => t.visitId == visitId);

      // The phone's rule: the stored route if there is one, else a new one.
      final g = generateGridRoute(RouteInput.forTask(task)).route!;
      final stored =
          task.route ??
          StoredRoute(
            id: routeId(task.parcelId, g.contentHash),
            parcelId: task.parcelId,
            version: 1,
            route: g,
          );
      final isNew = task.route == null;

      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final clock = FakeClock(DateTime.now().toUtc());
      final repo = FieldRepository(db, clock);
      await repo.createSession(
        id: visitId,
        parcelId: task.parcelId,
        visitKind: task.kind.code,
        startedAt: clock.now(),
      );
      await repo.saveRouteUse(
        sessionId: visitId,
        route: stored,
        isNew: isNew,
        time: GpsTimeReading(utcToGpsMs(clock.now()), TimeSource.gps),
      );
      final worker = SyncWorker(
        repository: repo,
        server: SupabaseSyncServer(field),
        media: MemoryMediaStore(),
        clock: clock,
      );
      addTearDown(worker.dispose);
      final report = await worker.syncNow();
      expect(report.failed, 0);
      expect(report.stoppedByNetwork, isFalse);

      final row = await field
          .from('parcel_route')
          .select('id, version, basis, generator, route')
          .eq('id', stored.id)
          .single();
      expect(row['generator'], gridRouteGenerator);
      expect(
        ((row['route'] as Map)['corridors'] as List).length,
        stored.route.corridors.length,
      );
      final event = await field
          .from('session_event')
          .select('data')
          .eq('session_id', visitId)
          .eq('event_type', 'route')
          .single();
      expect((event['data'] as Map)['route_id'], stored.id);

      // The next visit downloads the same route.
      final next = await plan();
      final again = (await source.fetch(
        userId: _fieldUser,
        today: today,
      )).firstWhere((t) => t.visitId == next);
      expect(again.route!.id, stored.id);
      expect(again.route!.version, row['version']);
      expect(again.route!.route.contentHash, stored.route.contentHash);
      expect(reuseRoute(again.route!, again), isTrue);
    },
    skip: skip,
  );
}
