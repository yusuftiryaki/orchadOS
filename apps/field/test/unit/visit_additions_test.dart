import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:orchados_field/features/summary/visit_log.dart';
import 'package:orchados_field/features/tasks/closeup_selection.dart';
import 'package:orchados_field/features/tasks/field_task.dart';

import '../support/fake_sync_server.dart';

void main() {
  group('server close-up list', () {
    test('rows become targets in server order with Turkish reasons', () {
      final list = closeupTargetsFromServer([
        {
          'tree_id': 't-2',
          'slot_code': 'S1-2',
          'row_no': 1,
          'position_no': 2,
          'reasons': ['previous_class', 'staff_problem'],
        },
        {
          'tree_id': 't-9',
          'slot_code': 'S3-1',
          'reasons': ['sample'],
        },
        {
          'slot_code': 'S9-9',
          'reasons': ['sample'],
        }, // no tree: skipped
      ]);
      expect(list.map((t) => t.slotCode), ['S1-2', 'S3-1']);
      expect(
        list.first.reason,
        'Önceki ziyarette dikkat/sorunlu/kuru · Sorun gördüm',
      );
      expect(list.last.reason, 'Rastgele örneklem');
    });

    test('offline problem marks are appended once', () {
      const list = [TreeTarget(treeId: 't-1', slotCode: 'S1-1', reason: 'x')];
      final out = withProblemMarks(list, const [
        TreeTarget(treeId: 't-1', slotCode: 'S1-1', reason: ''),
        TreeTarget(treeId: 't-5', slotCode: 'S2-1', reason: ''),
        TreeTarget(treeId: 't-5', slotCode: 'S2-1', reason: ''),
      ]);
      expect(out.map((t) => t.treeId), ['t-1', 't-5']);
      expect(out.last.reason, 'Sorun gördüm');
    });

    test('slot json keeps the tree id', () {
      const s = SlotPoint(
        id: 's',
        code: 'S1-1',
        rowNo: 1,
        positionNo: 1,
        treeId: 't-1',
      );
      expect(SlotPoint.fromJson(s.toJson()).treeId, 't-1');
    });
  });

  test('visit log json round trip', () {
    const log = VisitLog(
      sky: 'clear',
      tempC: 14,
      wind: 'light',
      loggerName: 'orchados-gnss-01',
      loggerFirmware: '0.3.0',
      cameraSerial: 'X5-123',
      issues: '  Kuzey kapı kilitliydi ',
    );
    final j = log.toJson();
    expect(j['weather'], {'sky': 'clear', 'temp_c': 14, 'wind': 'light'});
    expect(j['issues'], 'Kuzey kapı kilitliydi');
    final back = VisitLog.fromJson(j)!;
    expect(back.cameraSerial, 'X5-123');
    expect(back.loggerFirmware, '0.3.0');
  });

  group('sync', () {
    const visitId = 'v-1';
    const parcelId = 'P-12';
    final t0 = DateTime.utc(2026, 12, 3, 8, 30);
    final gps0 = utcToGpsMs(t0);
    late AppDatabase db;
    late FieldRepository repo;
    late MemoryMediaStore media;
    late FakeSyncServer server;

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      final clock = FakeClock(t0);
      repo = FieldRepository(db, clock);
      media = MemoryMediaStore();
      server = FakeSyncServer(
        visits: {visitId: 'planned'},
        metrics: {
          'problem_seen': 'md-problem_seen',
          'fence_breach_present': 'md-fence',
        },
      );
      await repo.createSession(
        id: visitId,
        parcelId: parcelId,
        visitKind: 'periodic',
        season: 'winter',
        startedAt: t0,
        startGpsTimeMs: gps0,
      );
    });
    tearDown(() => db.close());

    SyncWorker worker() => SyncWorker(
      repository: repo,
      server: server,
      media: media,
      clock: FakeClock(t0),
      timer: (d, f) => Timer(const Duration(days: 1), f),
    );

    test('a problem mark is a staff problem_seen = yes', () async {
      await repo.saveProblemMark(
        sessionId: visitId,
        treeId: 't-7',
        methodVersion: 'scan-mark-v1',
      );
      await worker().syncNow();
      final row = server.table('measurement').values.single;
      expect(row['metric_definition_id'], 'md-problem_seen');
      expect(row['value_boolean'], true);
      expect(row['source'], 'staff');
      expect(row['tree_id'], 't-7');
    });

    test('a parcel answer syncs without a tree; unseen is an event', () async {
      final answered = repo.watchParcelAnswers(visitId);
      expect(await answered.first, isEmpty);
      await repo.saveParcelAnswer(
        sessionId: visitId,
        parcelId: parcelId,
        metricCode: 'fence_breach_present',
        answer: const YesNoAnswer(true),
        methodVersion: 'summer-v0.2',
      );
      expect(await answered.first, {'fence_breach_present'});
      await worker().syncNow();
      final row = server.table('measurement').values.single;
      expect(row['metric_definition_id'], 'md-fence');
      expect(row['value_boolean'], true);
      expect(row['parcel_id'], parcelId);
      expect(row.containsKey('tree_id'), isFalse);
      expect(row['method_version'], 'summer-v0.2');

      await repo.saveParcelAnswer(
        sessionId: visitId,
        parcelId: parcelId,
        metricCode: 'other_parcel_question',
        answer: const UnseenAnswer(),
        methodVersion: 'summer-v0.2',
      );
      expect(await answered.first, {
        'fence_breach_present',
        'other_parcel_question',
      });
      final events = await repo.events(visitId);
      final unseen = events.singleWhere(
        (e) => e.eventType == closeupUnseenEvent,
      );
      expect(unseen.payload, 'parcel');
      final data = jsonDecode(unseen.dataJson!) as Map;
      expect(data['parcel_id'], parcelId);
      expect(data['metric_codes'], ['other_parcel_question']);
      expect(data.containsKey('tree_id'), isFalse);
    });

    test('the visit log sends its weather to the visit row', () async {
      await repo.addEvent(
        sessionId: visitId,
        eventType: 'visit_log',
        payload: '',
        time: GpsTimeReading(gps0 + 1000, TimeSource.gps),
        loggerResult: 'none',
        data: const VisitLog(sky: 'overcast', tempC: 9).toJson(),
      );
      await repo.outbox.enqueue('session', visitId);
      await worker().syncNow();
      expect(server.visitValues[visitId]?['weather'], {
        'sky': 'overcast',
        'temp_c': 9,
      });
      expect(
        server.table('session_event').values.single['event_type'],
        'visit_log',
      );
    });

    test('a voice note is an audio_note capture of the tree', () async {
      final bytes = Uint8List.fromList('voice'.codeUnits);
      final hash = sha256Hex(bytes);
      final path = await media.put(bytes, sha256: hash, ext: 'm4a');
      await repo.saveTreeObservation(
        sessionId: visitId,
        treeId: 't-1',
        slotCode: 'S1-1',
        shots: const [],
        answers: const {},
        methodVersion: 'winter-v0',
        voiceNotes: [
          PendingVoiceNote(
            sha256: hash,
            localPath: path,
            byteSize: bytes.length,
            capturedAt: t0,
            gpsTimeMs: gps0 + 5000,
            timeSource: TimeSource.gps,
          ),
        ],
      );
      await worker().syncNow();
      final row = server.table('capture').values.single;
      expect(row['kind'], 'audio_note');
      expect(row['mime_type'], voiceNoteMediaType);
      expect(row['tree_id'], 't-1');
      expect(server.objects.values.single, bytes);
    });
  });
}
