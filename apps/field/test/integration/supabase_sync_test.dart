// Real upload against a local Supabase (`pnpm db:start && pnpm db:reset`):
//
//   ORCHADOS_TEST_SUPABASE_URL=http://127.0.0.1:54321 \
//   ORCHADOS_TEST_SUPABASE_KEY=<publishable key from `pnpm db:status`> \
//   flutter test test/integration
//
// Skipped when the variables are not set (CI has no Supabase for this job).
// Every run plans its own visit and photo, so it can run again without a
// reset; insert-only rows stay behind like real field data. Run
// `pnpm db:reset` afterwards before `pnpm db:test`: the pgTAP tests count
// the seed's rows.
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/core/sync/supabase_sync_server.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final _url = Platform.environment['ORCHADOS_TEST_SUPABASE_URL'] ?? '';
final _key = Platform.environment['ORCHADOS_TEST_SUPABASE_KEY'] ?? '';

// supabase/seed.sql
const _org = 'b0000000-0000-4000-8000-000000000001';
const _parcel = 'c0000000-0000-4000-8000-000000000001';
const _fieldUser = 'a0000000-0000-4000-8000-000000000003';
const _password = 'orchados-dev';

Future<SupabaseClient> _signIn(String email) async {
  final c = SupabaseClient(
    _url,
    _key,
    authOptions: const AuthClientOptions(autoRefreshToken: false),
  );
  await c.auth.signInWithPassword(email: email, password: _password);
  return c;
}

void main() {
  final skip = _url.isEmpty || _key.isEmpty
      ? 'ORCHADOS_TEST_SUPABASE_URL / ORCHADOS_TEST_SUPABASE_KEY not set'
      : null;

  test(
    'field@example.com: planned visit → tasks → record → upload, twice',
    () async {
      final ops = await _signIn('ops@example.com');
      final field = await _signIn('field@example.com');
      final today = DateTime.now();
      final day =
          '${today.year}-${today.month.toString().padLeft(2, '0')}-'
          '${today.day.toString().padLeft(2, '0')}';

      // Ops plans a periodic visit led by the field user.
      final visit = await ops
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
          .single();
      final visitId = visit['id'] as String;

      // 1. Today's tasks from the server.
      final tasks = await SupabaseTaskSource(field)
          .fetch(userId: _fieldUser, today: today);
      final task = tasks.firstWhere((t) => t.visitId == visitId);
      expect(task.assignedToMe, isTrue);
      expect(task.orgId, _org);
      expect(task.closeupTrees, isNotEmpty);
      final tree = task.closeupTrees.first;

      // 2. Record the visit on the phone.
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final clock = FakeClock(DateTime.now().toUtc());
      final repo = FieldRepository(db, clock);
      final media = MemoryMediaStore();
      final gps = utcToGpsMs(clock.now());
      await repo.createSession(
        id: visitId,
        parcelId: task.parcelId,
        taskId: task.id,
        visitKind: task.kind.code,
        season: task.season.code,
        operatorId: _fieldUser,
        startedAt: clock.now(),
        startGpsTimeMs: gps,
      );
      await repo.addEvent(
        sessionId: visitId,
        eventType: 'qr_sync',
        payload: 'OQ1:$gps:visit',
        time: GpsTimeReading(gps, TimeSource.gps),
        loggerResult: 'ok',
      );
      final bytes = Uint8List.fromList(
        List.generate(2048, (_) => Random().nextInt(256)),
      );
      final hash = sha256Hex(bytes);
      final path = await media.put(bytes, sha256: hash);
      await repo.saveTreeObservation(
        sessionId: visitId,
        treeId: tree.treeId,
        slotCode: tree.slotCode,
        shots: [
          PendingShot(
            shotCode: 'trunk',
            sha256: hash,
            localPath: path,
            mediaType: 'image/jpeg',
            byteSize: bytes.length,
            capturedAt: clock.now(),
            gpsTimeMs: gps + 1000,
            timeSource: TimeSource.gps,
            quality: judge(
              const QualityScores(
                sharpness: 900,
                meanBrightness: 110,
                darkClippedRatio: 0,
                brightClippedRatio: 0,
                analysisWidth: 480,
                analysisHeight: 360,
              ),
              PhotoQualityConfig.defaults,
            ),
          ),
        ],
        answers: {'dead_branch_present': true, 'pruned': false},
        methodVersion: 'winter-v0',
      );
      clock.advance(const Duration(minutes: 30));
      await repo.stopSession(
        visitId,
        stoppedAt: clock.now(),
        stopGpsTimeMs: gps + 30 * 60000,
      );
      await repo.closeSession(visitId);

      // 3. Upload with the field user's token.
      final worker = SyncWorker(
        repository: repo,
        server: SupabaseSyncServer(field),
        media: media,
        clock: clock,
      );
      addTearDown(worker.dispose);
      final report = await worker.syncNow();
      expect(report.failed, 0, reason: '${await repo.outbox.failed()}');
      expect(report.stoppedByNetwork, isFalse);
      expect(report.sent, 7);
      expect(media.files, isEmpty, reason: 'verified photo is released');

      Future<Map<String, int>> serverCounts() async => {
        'event':
            (await ops
                    .from('session_event')
                    .select('id')
                    .eq('session_id', visitId))
                .length,
        'capture':
            (await ops.from('capture').select('id').eq('session_id', visitId))
                .length,
        'measurement':
            (await ops
                    .from('measurement')
                    .select('id')
                    .eq('session_id', visitId))
                .length,
      };

      final s = await ops
          .from('session')
          .select('status, started_at, ended_at')
          .eq('id', visitId)
          .single();
      expect(s['status'], 'captured');
      expect(s['started_at'], isNotNull);
      expect(s['ended_at'], isNotNull);
      expect(await serverCounts(), {
        'event': 1,
        'capture': 1,
        'measurement': 2,
      });
      final answers = await ops
          .from('measurement')
          .select('value_boolean, source, metric_definition(code)')
          .eq('session_id', visitId);
      expect(
        {
          for (final a in answers)
            (a['metric_definition'] as Map)['code']: a['value_boolean'],
        },
        {'dead_branch_present': true, 'pruned': false},
      );
      expect(answers.every((a) => a['source'] == 'staff'), isTrue);
      final capture = await ops
          .from('capture')
          .select('id, uri, content_hash, tree_id')
          .eq('session_id', visitId)
          .single();
      expect(capture['id'], captureId(visitId, hash));
      expect(capture['tree_id'], tree.treeId);
      final object = mediaObjectPath(
        orgId: _org,
        parcelId: _parcel,
        sha256: hash,
      );
      expect(capture['uri'], mediaUri(object));
      expect(
        await ops.storage.from('media').download(object),
        bytes,
        reason: 'ops reads back the same bytes',
      );

      // 4. Everything once more (app killed before markSent): no new rows.
      await db
          .update(db.outboxEntries)
          .write(const OutboxEntriesCompanion(sentAt: Value(null)));
      final again = await worker.syncNow();
      expect(again.failed, 0, reason: '${await repo.outbox.failed()}');
      expect(await serverCounts(), {
        'event': 1,
        'capture': 1,
        'measurement': 2,
      });

      await ops.dispose();
      await field.dispose();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
