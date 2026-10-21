// Verification tour against a local Supabase (`pnpm db:start && pnpm db:reset`):
//
//   ORCHADOS_TEST_SUPABASE_URL=http://127.0.0.1:54321 \
//   ORCHADOS_TEST_SUPABASE_KEY=<publishable key from `pnpm db:status`> \
//   flutter test test/integration
//
// Skipped when the variables are not set. Ops opens a tour on slots that have
// a tree and the crew answers "tree present" (the inventory does not change);
// the tour, its items and the photo stay behind like real field data. Run
// `pnpm db:reset` afterwards before `pnpm db:test`.
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

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
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final _url = Platform.environment['ORCHADOS_TEST_SUPABASE_URL'] ?? '';
final _key = Platform.environment['ORCHADOS_TEST_SUPABASE_KEY'] ?? '';

// supabase/seed.sql
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
    'verification tour: tasks → results with photo → item closed meanwhile',
    () async {
      final ops = await _signIn('ops@example.com');
      final field = await _signIn('field@example.com');
      final today = DateTime.now();
      final day =
          '${today.year}-${today.month.toString().padLeft(2, '0')}-'
          '${today.day.toString().padLeft(2, '0')}';

      // Ops opens a tour on three slots that have an active tree.
      final trees = await ops
          .from('tree')
          .select('slot_id')
          .eq('parcel_id', _parcel)
          .eq('status', 'active')
          .order('id')
          .limit(30);
      final slotIds = [for (final t in trees) t['slot_id'] as String]
        ..shuffle(Random());
      final created = await ops.rpc<Map<String, dynamic>>(
        'create_verification_tour',
        params: {
          'p_parcel_id': _parcel,
          'p_items': [
            for (final id in slotIds.take(3))
              {
                'slot_id': id,
                'reasons': ['unsure', 'multi_stem'],
                'note': 'Entegrasyon testi',
              },
          ],
          'p_planned_date': day,
          'p_notes': 'Doğrulama testi',
        },
      );
      final tourId = created['session_id'] as String;

      // 1. The tour is a task with its open items, slots and directions.
      final tasks = await SupabaseTaskSource(field)
          .fetch(userId: _fieldUser, today: today);
      final tour = tasks.firstWhere((t) => t.visitId == tourId);
      expect(tour.kind, VisitKind.verification);
      expect(tour.notes, 'Doğrulama testi');
      expect(tour.verificationItems, hasLength(3));
      expect(tour.slots, isNotEmpty);
      // PostgREST sends slot positions as GeoJSON points.
      expect(
        tour.verificationItems.every((i) => i.slot.position != null),
        isTrue,
      );
      final items = tour.verificationItems;
      expect(items.first.reasons, [
        VerificationReason.unsure,
        VerificationReason.multiStem,
      ]);
      expect(items.first.note, 'Entegrasyon testi');
      expect(items.every((i) => i.treeId != null), isTrue);
      final sorted = sortForWalking(items);
      expect([for (final i in items) i.id], [for (final i in sorted) i.id]);

      // 2. Meanwhile the office closes the third item.
      await ops.rpc<void>(
        'close_verification_item',
        params: {'p_item_id': items[2].id, 'p_note': 'Ofiste karar verildi'},
      );

      // 3. The crew records all three on the phone, the first with a photo.
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final clock = FakeClock(DateTime.now().toUtc());
      final repo = FieldRepository(db, clock);
      final media = MemoryMediaStore();
      await repo.ensureTourSession(
        tourId: tourId,
        parcelId: tour.parcelId,
        taskId: tour.id,
        operatorId: _fieldUser,
      );
      final bytes = Uint8List.fromList(
        List.generate(2048, (_) => Random().nextInt(256)),
      );
      final hash = sha256Hex(bytes);
      final photo = PendingShot(
        shotCode: 'verification_closeup',
        sha256: hash,
        localPath: await media.put(bytes, sha256: hash),
        mediaType: 'image/jpeg',
        byteSize: bytes.length,
        capturedAt: clock.now(),
        gpsTimeMs: utcToGpsMs(clock.now()),
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
      );
      for (final (n, item) in items.indexed) {
        await repo.saveVerificationResult(
          tourId: tourId,
          itemId: item.id,
          slotId: item.slot.id,
          slotCode: item.slot.code,
          treePresent: true,
          note: 'Ağaç yerinde ($n)',
          photo: n == 0 ? photo : null,
        );
      }

      // 4. Upload with the field user's token.
      final worker = SyncWorker(
        repository: repo,
        server: SupabaseSyncServer(field),
        media: media,
        clock: clock,
      );
      addTearDown(worker.dispose);
      final report = await worker.syncNow();
      expect(report.stoppedByNetwork, isFalse);
      expect(report.sent, 3, reason: '${await repo.outbox.failed()}');
      expect(report.failed, 1);
      final local = await repo.watchVerificationResults(tourId).first;
      expect(local[items[0].id]!.sent, isTrue);
      expect(local[items[2].id]!.failure, startsWith('item_closed'));

      final server = await ops
          .from('verification_item')
          .select('id, status, tree_present, result_note, closeup_capture_id')
          .eq('session_id', tourId);
      final byId = {for (final r in server) r['id'] as String: r};
      expect(byId[items[0].id]!['status'], 'checked');
      expect(byId[items[0].id]!['tree_present'], isTrue);
      expect(byId[items[0].id]!['result_note'], 'Ağaç yerinde (0)');
      expect(byId[items[0].id]!['closeup_capture_id'], captureId(tourId, hash));
      expect(byId[items[1].id]!['status'], 'checked');
      expect(byId[items[1].id]!['closeup_capture_id'], isNull);
      expect(byId[items[2].id]!['status'], 'closed');
      expect(byId[items[2].id]!['result_note'], 'Ofiste karar verildi');
      final capture = await ops
          .from('capture')
          .select('session_id, tree_id, metadata')
          .eq('id', captureId(tourId, hash))
          .single();
      expect(capture['session_id'], tourId);
      expect(capture['tree_id'], isNull);
      expect((capture['metadata'] as Map)['slot_id'], items[0].slot.id);
      // All items looked at or closed: the database captured the tour.
      final s = await ops
          .from('session')
          .select('status')
          .eq('id', tourId)
          .single();
      expect(s['status'], 'captured');

      await ops.dispose();
      await field.dispose();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
