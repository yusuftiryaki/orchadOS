import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';

void main() {
  late AppDatabase db;
  late FakeClock clock;
  late FieldRepository repo;
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    clock = FakeClock(t0);
    repo = FieldRepository(db, clock);
  });

  tearDown(() => db.close());

  Future<void> createSession(String id) => repo.createSession(
    id: id,
    parcelId: 'P-12',
    visitKind: 'periodic',
    season: 'winter',
    startedAt: clock.now(),
    startGpsTimeMs: 1,
  );

  PendingShot shot(String code, List<int> bytes) => PendingShot(
    shotCode: code,
    sha256: sha256Hex(bytes),
    localPath: 'mem://$code',
    mediaType: 'image/jpeg',
    byteSize: bytes.length,
    capturedAt: clock.now(),
    gpsTimeMs: 1000,
    timeSource: TimeSource.gps,
  );

  test('every record is queued, in order', () async {
    await createSession('s1');
    await repo.addEvent(
      sessionId: 's1',
      eventType: 'qr_sync',
      payload: 'OQ1:1:s1',
      time: const GpsTimeReading(1, TimeSource.gps),
      loggerResult: 'ok',
    );
    await repo.saveTreeObservation(
      sessionId: 's1',
      treeId: 't-1',
      slotCode: 'S1-1',
      shots: [
        shot('trunk', [1, 2, 3]),
        shot('cuts', [4, 5]),
      ],
      answers: {'dead_branch_present': true, 'pruned': false},
      methodVersion: 'winter-v0',
    );
    await repo.stopSession('s1', stoppedAt: clock.now(), stopGpsTimeMs: 2);

    final pending = await repo.outbox.pending();
    expect(pending.map((e) => e.entityType).toList(), [
      OutboxEntity.session,
      OutboxEntity.sessionEvent,
      OutboxEntity.capture,
      OutboxEntity.capture,
      OutboxEntity.measurement,
      OutboxEntity.measurement,
      OutboxEntity.session,
    ]);
    expect(pending[2].entityId, sha256Hex([1, 2, 3]));
    expect(await repo.outbox.pendingCount(), 7);
  });

  test('measurements follow the data model', () async {
    await createSession('s1');
    await repo.saveTreeObservation(
      sessionId: 's1',
      treeId: 't-1',
      slotCode: 'S1-1',
      shots: [
        shot('trunk', [9]),
      ],
      answers: {'root_sucker_present': true},
      methodVersion: 'winter-v0',
    );
    final m = (await repo.measurements('s1')).single;
    expect(m.source, 'staff');
    expect(m.subjectType, 'tree');
    expect(m.subjectId, 't-1');
    expect(m.metricCode, 'root_sucker_present');
    expect(m.valueBool, isTrue);
    expect(m.method, 'field_question');
    expect(m.methodVersion, 'winter-v0');
    expect(jsonDecode(m.evidenceJson), [
      sha256Hex([9]),
    ]);
    final c = (await repo.captures('s1')).single;
    expect(c.sha256, sha256Hex([9]));
    expect(c.kind, 'closeup_photo');
    expect(c.capturedAt, t0);
    final s = (await repo.session('s1'))!;
    expect(s.sessionType, 'scan');
    expect(s.methodologyVersion, methodologyVersion);
  });

  test('markSent and markFailed', () async {
    await createSession('s1');
    await createSession('s2');
    final first = (await repo.outbox.pending()).first;

    await repo.outbox.markFailed(first.id, 'offline');
    await repo.outbox.markFailed(first.id, 'timeout');
    final e = (await repo.outbox.pending()).first;
    expect(e.attempts, 2);
    expect(e.lastError, 'timeout');
    expect(e.lastAttemptAt, t0);

    clock.advance(const Duration(minutes: 5));
    await repo.outbox.markSent(first.id);
    final rest = await repo.outbox.pending();
    expect(rest.map((e) => e.entityId), ['s2']);
    final sent = await (db.select(
      db.outboxEntries,
    )..where((x) => x.id.equals(first.id))).getSingle();
    expect(sent.sentAt, t0.add(const Duration(minutes: 5)));
    expect(sent.lastError, isNull);
  });

  test('pending count stream follows the queue', () async {
    final counts = <int>[];
    final sub = repo.outbox.watchPendingCount().listen(counts.add);
    await pumpEventQueue();
    await createSession('s1');
    await pumpEventQueue();
    await repo.outbox.markSent((await repo.outbox.pending()).single.id);
    await pumpEventQueue();
    await sub.cancel();
    expect(counts, [0, 1, 0]);
  });

  test('a failed save leaves nothing behind', () async {
    // No session "missing": the foreign key fails after the capture insert.
    await expectLater(
      repo.saveTreeObservation(
        sessionId: 'missing',
        treeId: 't-1',
        slotCode: 'S1-1',
        shots: [
          shot('trunk', [1]),
        ],
        answers: {'pruned': true},
        methodVersion: 'winter-v0',
      ),
      throwsA(isA<SqliteException>()),
    );
    expect(await repo.outbox.pending(), isEmpty);
    expect(await db.select(db.captures).get(), isEmpty);
  });

  test('pending respects limit', () async {
    for (var i = 0; i < 5; i++) {
      await createSession('s$i');
    }
    final page = await repo.outbox.pending(limit: 2);
    expect(page.map((e) => e.entityId), ['s0', 's1']);
  });

  test('dates keep millisecond precision', () async {
    clock.time = DateTime.utc(2026, 12, 3, 8, 30, 1, 234);
    await createSession('s1');
    final row = await (db.select(db.sessions)).getSingle();
    expect(row.startedAt.millisecond, 234);
    expect(row.startedAt.isUtc, isTrue);
  });
}
