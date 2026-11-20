import 'dart:async';
import 'dart:typed_data';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';

import '../support/fake_sync_server.dart';

/// Timers that only run when the test fires them.
class ManualTimers {
  final List<ManualTimer> created = [];

  Timer call(Duration delay, void Function() run) {
    final t = ManualTimer(delay, run);
    created.add(t);
    return t;
  }

  List<Duration> get delays => [for (final t in created) t.delay];

  void fireLast() => created.last.fire();
}

class ManualTimer implements Timer {
  ManualTimer(this.delay, this._run);

  final Duration delay;
  final void Function() _run;
  bool _active = true;

  void fire() {
    if (!_active) return;
    _active = false;
    _run();
  }

  @override
  void cancel() => _active = false;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;
}

void main() {
  const visitId = 'v-1';
  const parcelId = 'P-12';
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);
  final gps0 = utcToGpsMs(t0);

  late AppDatabase db;
  late FakeClock clock;
  late FieldRepository repo;
  late MemoryMediaStore media;
  late FakeSyncServer server;
  late ManualTimers timers;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    clock = FakeClock(t0);
    repo = FieldRepository(db, clock);
    media = MemoryMediaStore();
    server = FakeSyncServer(visits: {visitId: 'planned'});
    timers = ManualTimers();
  });

  tearDown(() => db.close());

  SyncWorker worker({bool release = true}) => SyncWorker(
    repository: repo,
    server: server,
    media: media,
    clock: clock,
    timer: timers.call,
    releasePhotosAfterUpload: release,
  );

  final quality = judge(
    const QualityScores(
      sharpness: 900,
      meanBrightness: 110,
      darkClippedRatio: 0.01,
      brightClippedRatio: 0.02,
      analysisWidth: 480,
      analysisHeight: 360,
    ),
    PhotoQualityConfig.defaults,
  );

  Future<PendingShot> photo(String code, List<int> bytes) async {
    final data = Uint8List.fromList(bytes);
    final hash = sha256Hex(data);
    final path = await media.put(data, sha256: hash);
    return PendingShot(
      shotCode: code,
      sha256: hash,
      localPath: path,
      mediaType: 'image/jpeg',
      byteSize: data.length,
      capturedAt: clock.now(),
      gpsTimeMs: gps0 + 60000,
      timeSource: TimeSource.gps,
      quality: quality,
    );
  }

  /// A whole visit: start, QR, one tree with two photos and two answers,
  /// stop, close. Queue: session, event, 2 captures, 2 measurements,
  /// session (stop), session (close).
  Future<void> recordVisit() async {
    await repo.createSession(
      id: visitId,
      parcelId: parcelId,
      visitKind: 'periodic',
      season: 'winter',
      startedAt: t0,
      startGpsTimeMs: gps0,
    );
    await repo.addEvent(
      sessionId: visitId,
      eventType: 'qr_sync',
      payload: 'OQ1:$gps0:visit',
      time: GpsTimeReading(gps0, TimeSource.gps),
      loggerResult: 'ok',
    );
    await repo.saveTreeObservation(
      sessionId: visitId,
      treeId: 't-1',
      slotCode: 'S1-1',
      shots: [
        await photo('trunk', [1, 2, 3]),
        await photo('cuts', [4, 5]),
      ],
      answers: {
        'dead_branch_present': const YesNoAnswer(true),
        'pruned': const YesNoAnswer(false),
      },
      methodVersion: 'winter-v0',
    );
    await repo.stopSession(
      visitId,
      stoppedAt: t0.add(const Duration(minutes: 90)),
      stopGpsTimeMs: gps0 + 90 * 60000,
    );
    await repo.closeSession(visitId);
  }

  Future<OutboxCounts> counts() => repo.outbox.watchCounts().first;

  final hash1 = sha256Hex([1, 2, 3]);
  final hash2 = sha256Hex([4, 5]);
  String objectPath(String hash) =>
      mediaObjectPath(orgId: 'org-1', parcelId: parcelId, sha256: hash);

  test('sends the queue in order and maps every record', () async {
    await recordVisit();
    final report = await worker().syncNow();

    expect(report.sent, 8);
    expect(report.failed, 0);
    expect(await counts(), const OutboxCounts(pending: 0, sent: 8, failed: 0));

    // Order of the writes = order of the queue (a photo after its visit,
    // the file before its row).
    final writes = [
      for (final c in server.calls)
        if (c.startsWith('visit:') ||
            c.startsWith('insert:') ||
            c.startsWith('upload:'))
          c,
    ];
    expect(writes, [
      'visit:$visitId',
      'insert:session_event',
      'upload:${objectPath(hash1)}',
      'insert:capture',
      'upload:${objectPath(hash2)}',
      'insert:capture',
      'insert:measurement',
      'insert:measurement',
      'visit:$visitId',
      'visit:$visitId',
    ]);

    // Visit: captured with start and end (UTC from GPS time).
    expect(server.visits[visitId], 'captured');
    expect(server.visitValues[visitId], {
      'started_at': t0.toIso8601String(),
      'status': 'captured',
      'ended_at': t0.add(const Duration(minutes: 90)).toIso8601String(),
    });

    final event = server.table('session_event').values.single;
    expect(event['org_id'], 'org-1');
    expect(event['event_type'], 'qr_sync');
    expect(event['gps_time_ns'], gps0 * 1000000);
    expect(event['time_source'], 'gps');

    final capture = server.table('capture')['$visitId/$hash1']!;
    expect(capture['id'], captureId(visitId, hash1));
    expect(capture['kind'], 'photo');
    expect(capture['tree_id'], 't-1');
    expect(capture['uri'], 'storage://media/${objectPath(hash1)}');
    expect(capture['content_hash'], hash1);
    expect(
      capture['started_at'],
      t0.add(const Duration(minutes: 1)).toIso8601String(),
    );
    final meta = capture['metadata']! as Map;
    expect(meta['shot_code'], 'trunk');
    expect(meta['slot_code'], 'S1-1');
    expect((meta['quality'] as Map)['verdict'], 'accept');
    expect(server.objects[objectPath(hash1)], [1, 2, 3]);

    final answers = {
      for (final m in server.table('measurement').values)
        m['metric_definition_id']: m,
    };
    expect(answers['md-dead_branch_present']!['value_boolean'], isTrue);
    expect(answers['md-pruned']!['value_boolean'], isFalse);
    expect(answers['md-pruned']!.containsKey('value_bool'), isFalse);
    expect(answers['md-pruned']!['source'], 'staff');
    expect(answers['md-pruned']!['method'], 'field_question');
    expect(answers['md-pruned']!['method_version'], 'winter-v0');
    expect(answers['md-pruned']!['tree_id'], 't-1');
    expect(answers['md-pruned']!['org_id'], 'org-1');

    // Uploaded and verified photos leave the phone.
    expect(media.files, isEmpty);
  });

  test('sending everything again adds nothing on the server', () async {
    await recordVisit();
    await worker(release: false).syncNow();
    final rows = {for (final e in server.tables.entries) e.key: e.value.length};
    final objects = server.objects.length;

    // As if the app had died after each write but before markSent.
    await db
        .update(db.outboxEntries)
        .write(const OutboxEntriesCompanion(sentAt: Value(null)));
    final report = await worker(release: false).syncNow();

    expect(report.sent, 8);
    expect({
      for (final e in server.tables.entries) e.key: e.value.length,
    }, rows);
    expect(server.objects.length, objects);
    expect(server.visits[visitId], 'captured');
  });

  test('a photo released after upload is not needed for a resend', () async {
    await recordVisit();
    await worker().syncNow();
    expect(media.files, isEmpty);
    await db
        .update(db.outboxEntries)
        .write(const OutboxEntriesCompanion(sentAt: Value(null)));

    final report = await worker().syncNow();
    expect(report.failed, 0);
    expect(server.table('capture'), hasLength(2));
  });

  test('network trouble: stops, keeps the entry and backs off', () async {
    await recordVisit();
    server.offline = true;
    final w = worker();

    var report = await w.syncNow();
    expect(report.stoppedByNetwork, isTrue);
    expect(report.sent, 0);
    var first = (await repo.outbox.pending()).first;
    expect(first.attempts, 1);
    expect(first.lastError, contains('network'));
    expect(w.current.phase, SyncPhase.waitingForNetwork);
    expect(w.current.nextRetryAt, t0.add(const Duration(seconds: 2)));
    expect(timers.delays, [const Duration(seconds: 2)]);
    // Only the first entry was tried.
    expect(server.calls.where((c) => c.startsWith('insert:')), isEmpty);

    // Still offline when the timer fires: the wait doubles.
    timers.fireLast();
    report = await w.syncNow(); // joins the pass the timer started
    expect(report.stoppedByNetwork, isTrue);
    expect(timers.delays, [
      const Duration(seconds: 2),
      const Duration(seconds: 4),
    ]);
    first = (await repo.outbox.pending()).first;
    expect(first.attempts, 2);

    // The connection comes back.
    server.offline = false;
    timers.fireLast();
    report = await w.syncNow();
    expect(report.stoppedByNetwork, isFalse);
    expect(await counts(), const OutboxCounts(pending: 0, sent: 8, failed: 0));
    expect(w.current.phase, SyncPhase.idle);
    w.dispose();
  });

  test('backoff grows to its limit', () {
    const b = Backoff(initial: Duration(seconds: 2), max: Duration(minutes: 5));
    expect(b.delay(1), const Duration(seconds: 2));
    expect(b.delay(2), const Duration(seconds: 4));
    expect(b.delay(5), const Duration(seconds: 32));
    expect(b.delay(9), const Duration(minutes: 5));
    expect(b.delay(100), const Duration(minutes: 5));
  });

  test('a refused record is marked failed and the queue goes on', () async {
    await recordVisit();
    server.refuse = (table, row) =>
        table == 'measurement' && row['value_boolean'] == true
        ? 'forbidden'
        : null;

    final report = await worker().syncNow();
    expect(report.failed, 1);
    expect(report.sent, 7);
    expect(report.stoppedByNetwork, isFalse);
    final failed = (await repo.outbox.failed()).single;
    expect(failed.entityType, OutboxEntity.measurement);
    expect(failed.lastError, startsWith('forbidden'));
    expect(failed.failedAt, t0);
    // Later entries were still sent.
    expect(server.visits[visitId], 'captured');
    expect(server.table('measurement'), hasLength(1));

    // Not retried by the next pass.
    server.refuse = null;
    expect((await worker().syncNow()).sent, 0);
    // Unless the crew asks for it after the office fixed the cause.
    await repo.outbox.requeueFailed();
    expect((await worker().syncNow()).sent, 1);
    expect(server.table('measurement'), hasLength(2));
  });

  test(
    'unknown visit, cancelled visit and unknown metric fail for good',
    () async {
      server.visits.remove(visitId);
      server.metrics.remove('pruned');
      await recordVisit();

      final report = await worker().syncNow();
      final reasons = [
        for (final e in await repo.outbox.failed())
          '${e.entityType} ${e.lastError!.split(':').first}',
      ];
      expect(reasons, [
        'session visit_not_found',
        'measurement unknown_metric',
        'session visit_not_found',
        'session visit_not_found',
      ]);
      expect(report.failed, 4);
      // Events, photos and the other answer do not depend on the visit row
      // here; on the real server they fail with reference_missing.
      expect(report.sent, 4);

      server.visits[visitId] = 'cancelled';
      await repo.outbox.requeueFailed();
      await worker().syncNow();
      expect(
        (await repo.outbox.failed()).map((e) => e.lastError!.split(':').first),
        contains('visit_cancelled'),
      );
    },
  );

  test('a visit already processed on the server counts as sent', () async {
    server.visits[visitId] = 'in_review';
    await recordVisit();
    final report = await worker().syncNow();
    expect(report.failed, 0);
    expect(server.visits[visitId], 'in_review');
    expect(server.visitValues, isEmpty);
  });

  test('a recording still running sends its start, not captured', () async {
    await repo.createSession(
      id: visitId,
      parcelId: parcelId,
      visitKind: 'periodic',
      startedAt: t0,
      startGpsTimeMs: gps0,
    );
    await worker().syncNow();
    expect(server.visits[visitId], 'planned');
    expect(server.visitValues[visitId], {'started_at': t0.toIso8601String()});
  });

  test(
    'the visit gets the platform and camera height of the pre-check',
    () async {
      await repo.createSession(
        id: visitId,
        parcelId: parcelId,
        visitKind: 'periodic',
        startedAt: t0,
        startGpsTimeMs: gps0,
        scanPlatform: 'robot',
        cameraHeightM: 2.1,
      );
      await worker().syncNow();
      expect(server.visitValues[visitId], {
        'started_at': t0.toIso8601String(),
        'scan_platform': 'robot',
        'camera_height_m': 2.1,
      });

      await repo.stopSession(
        visitId,
        stoppedAt: t0.add(const Duration(minutes: 30)),
        stopGpsTimeMs: gps0 + 30 * 60000,
      );
      await worker().syncNow();
      expect(server.visits[visitId], 'captured');
      expect(server.visitValues[visitId], {
        'started_at': t0.toIso8601String(),
        'scan_platform': 'robot',
        'camera_height_m': 2.1,
        'status': 'captured',
        'ended_at': t0.add(const Duration(minutes: 30)).toIso8601String(),
      });
    },
  );

  test('the photo stays on the phone until the upload is verified', () async {
    await recordVisit();
    server.dropUploads = true;
    final w = worker();

    final report = await w.syncNow();
    expect(report.stoppedByNetwork, isTrue);
    expect(media.files, hasLength(2));
    final entry = (await repo.outbox.pending()).firstWhere(
      (e) => e.entityType == OutboxEntity.capture,
    );
    expect(entry.lastError, startsWith('upload_not_verified'));

    server.dropUploads = false;
    timers.fireLast();
    await w.syncNow();
    expect(media.files, isEmpty);
    expect(await counts(), const OutboxCounts(pending: 0, sent: 8, failed: 0));
    w.dispose();
  });

  test('a file that does not match its hash is never uploaded', () async {
    await recordVisit();
    final path = media.files.keys.first;
    media.files[path] = Uint8List.fromList([9, 9, 9]);

    await worker().syncNow();
    final failed = (await repo.outbox.failed()).single;
    expect(failed.entityType, OutboxEntity.capture);
    expect(failed.lastError, startsWith('hash_mismatch'));
    expect(server.objects.keys, isNot(contains(objectPath(hash1))));
    // The file stays for the office to look at.
    expect(media.files, contains(path));
  });

  test('after a restart the queue continues where it stopped', () async {
    await recordVisit();
    // The signal drops after the visit row and its event (3 calls: visit
    // update, parcel lookup, event insert).
    server.offlineAfterCalls = 3;
    final before = worker();
    final r1 = await before.syncNow();
    expect(r1.sent, 2);
    expect(r1.stoppedByNetwork, isTrue);
    // The app is closed; the queue is in the database.
    before.dispose();

    server
      ..offlineAfterCalls = null
      ..calls.clear();
    final after = worker();
    final r2 = await after.syncNow();
    expect(r2.sent, 6);
    // Nothing sent twice: no second event, first write is the photo.
    expect(server.calls.where((c) => c == 'insert:session_event'), isEmpty);
    expect(
      server.calls.firstWhere((c) => !c.startsWith('parcel:')),
      'upload:${objectPath(hash1)}',
    );
    expect(server.table('session_event'), hasLength(1));
    expect(await counts(), const OutboxCounts(pending: 0, sent: 8, failed: 0));
    after.dispose();
  });

  test('a call while a pass runs makes it go round once more', () async {
    await recordVisit();
    final w = worker();
    server.gate = Completer<void>();
    final first = w.syncNow();
    // A record added while the first pass waits on the server.
    await repo.addEvent(
      sessionId: visitId,
      eventType: 'corner',
      payload: '1',
      time: GpsTimeReading(gps0 + 1000, TimeSource.gps),
      loggerResult: 'ok',
    );
    final second = w.syncNow();
    server.gate!.complete();
    server.gate = null;
    final r1 = await first;
    final r2 = await second;
    expect(identical(r1, r2), isTrue);
    expect(r1.sent, 9);
    expect(await counts(), const OutboxCounts(pending: 0, sent: 9, failed: 0));
    w.dispose();
  });
}
