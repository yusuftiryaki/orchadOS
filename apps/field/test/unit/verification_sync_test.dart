import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/core/sync/supabase_sync_server.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../support/fake_sync_server.dart';

void main() {
  const tourId = 'tour-1';
  const parcelId = 'P-12';
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);

  late AppDatabase db;
  late FakeClock clock;
  late FieldRepository repo;
  late MemoryMediaStore media;
  late FakeSyncServer server;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    clock = FakeClock(t0);
    repo = FieldRepository(db, clock);
    media = MemoryMediaStore();
    // The tour is not a recording: the app never writes the session row.
    server = FakeSyncServer();
    await repo.ensureTourSession(
      tourId: tourId,
      parcelId: parcelId,
      taskId: tourId,
    );
  });

  tearDown(() => db.close());

  SyncWorker worker() => SyncWorker(
    repository: repo,
    server: server,
    media: media,
    clock: clock,
    timer: (d, run) => throw StateError('no retry expected'),
  );

  Future<PendingShot> photo() async {
    final bytes = Uint8List.fromList([9, 8, 7, 6]);
    final hash = sha256Hex(bytes);
    return PendingShot(
      shotCode: 'verification_closeup',
      sha256: hash,
      localPath: await media.put(bytes, sha256: hash),
      mediaType: 'image/jpeg',
      byteSize: bytes.length,
      capturedAt: t0,
      gpsTimeMs: utcToGpsMs(t0),
      timeSource: TimeSource.gps,
      quality: const QualityResult(
        verdict: QualityVerdict.accept,
        findings: [],
        scores: null,
        version: photoQualityCheckVersion,
      ),
    );
  }

  test('tour session is local only and is created once', () async {
    await repo.ensureTourSession(
      tourId: tourId,
      parcelId: parcelId,
      taskId: tourId,
    );
    final s = await repo.session(tourId);
    expect(s!.sessionType, 'verification');
    expect(await repo.outbox.pending(), isEmpty);
    // A tour does not count as a recorded task.
    expect(await repo.watchRecordedTaskIds().first, isEmpty);
  });

  test('result with photo: capture first, then the function call', () async {
    final shot = await photo();
    await repo.saveVerificationResult(
      tourId: tourId,
      itemId: 'item-1',
      slotId: 'slot-1',
      slotCode: 'S2-4',
      treePresent: true,
      note: '  fidan dikilmiş  ',
      photo: shot,
    );
    expect(
      [for (final e in await repo.outbox.pending()) e.entityType],
      [OutboxEntity.capture, OutboxEntity.verificationResult],
    );

    final report = await worker().syncNow();
    expect(report.sent, 2);
    expect(report.failed, 0);
    final capture = server.table('capture').values.single;
    expect(capture['session_id'], tourId);
    expect(capture['kind'], 'photo');
    expect(capture.containsKey('tree_id'), isFalse);
    final metadata = capture['metadata']! as Map;
    expect(metadata['local_kind'], 'verification_photo');
    expect(metadata['slot_id'], 'slot-1');
    expect(metadata['slot_code'], 'S2-4');
    expect(
      server.objects.keys.single,
      'org/org-1/parcel/$parcelId/${shot.sha256}',
    );
    final call = server.verificationResults.single;
    expect(call, {
      'p_item_id': 'item-1',
      'p_tree_present': true,
      'p_note': 'fidan dikilmiş',
      'p_closeup_capture_id': captureId(tourId, shot.sha256),
    });
    expect(call['p_closeup_capture_id'], capture['id']);
    expect(
      server.calls.indexOf('rpc:record_verification_result'),
      greaterThan(server.calls.indexWhere((c) => c == 'insert:capture')),
    );

    final results = await repo.watchVerificationResults(tourId).first;
    expect(results['item-1']!.sent, isTrue);
    expect(results['item-1']!.failure, isNull);
  });

  test('without photo or note', () async {
    await repo.saveVerificationResult(
      tourId: tourId,
      itemId: 'item-2',
      slotId: 'slot-2',
      slotCode: 'S2-9',
      treePresent: false,
      note: '   ',
    );
    await worker().syncNow();
    expect(server.verificationResults.single, {
      'p_item_id': 'item-2',
      'p_tree_present': false,
      'p_note': null,
      'p_closeup_capture_id': null,
    });
  });

  test('a second result for the same item is sent after the first', () async {
    for (final present in [true, false]) {
      await repo.saveVerificationResult(
        tourId: tourId,
        itemId: 'item-1',
        slotId: 'slot-1',
        slotCode: 'S2-4',
        treePresent: present,
      );
      clock.advance(const Duration(minutes: 1));
    }
    final latest = await repo.watchVerificationResults(tourId).first;
    expect(latest['item-1']!.row.treePresent, isFalse);
    await worker().syncNow();
    // The newest one counts on the server.
    expect(
      [for (final c in server.verificationResults) c['p_tree_present']],
      [true, false],
    );
  });

  test('closed item: refused for good, the reason reaches the tour', () async {
    server.refuse = (table, row) =>
        table == 'record_verification_result' ? 'item_closed' : null;
    await repo.saveVerificationResult(
      tourId: tourId,
      itemId: 'item-1',
      slotId: 'slot-1',
      slotCode: 'S2-4',
      treePresent: true,
    );
    await repo.saveVerificationResult(
      tourId: tourId,
      itemId: 'item-2',
      slotId: 'slot-2',
      slotCode: 'S2-9',
      treePresent: true,
    );
    final report = await worker().syncNow();
    expect(report.failed, 2);
    expect(report.stoppedByNetwork, isFalse);
    final results = await repo.watchVerificationResults(tourId).first;
    expect(results['item-1']!.failure, startsWith('item_closed'));
    expect(results['item-1']!.sent, isFalse);
    final counts = await repo.outbox.watchSessionCounts(tourId).first;
    expect(counts.failed, 2);
  });

  test('function errors are permanent and keep their reason', () {
    for (final reason in [
      'item_closed',
      'not_found',
      'forbidden',
      'invalid_input',
    ]) {
      final e = SupabaseSyncServer.classify(
        PostgrestException(message: reason, code: '55000'),
      );
      expect(e.isTransient, isFalse, reason: reason);
      expect(e.reason, reason);
    }
  });
}
