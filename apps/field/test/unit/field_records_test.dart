import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/core/sync/sync_worker.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';
import 'package:orchados_field/features/notice/field_records.dart';

import '../support/fake_sync_server.dart';

void main() {
  group('payloads and checks', () {
    test('phone numbers are recognised in free text', () {
      for (final t in [
        '0532 123 45 67',
        '+90 (532) 123-4567',
        'bekçi 05321234567 aradı',
        '532.123.45.67',
        '0532/123/45/67',
        '0532,123,4567',
        '0532_1234_567',
        '0532.123.10.15',
        '28.10.2026 0532 123 45 67',
      ]) {
        expect(containsPhoneNumber(t), isTrue, reason: t);
        expect(
          textError(t, maxLength: maxNoteLength),
          'Telefon numarası yazmayın',
        );
      }
      for (final t in [
        'Kapı kilitli, 2 kez çaldık',
        'S3-12 civarı',
        '',
        '28.10.2026 09:30 kapı kilitli',
        'Saat 08.30-10.15 arası',
        '2026-10-28 sabah',
        '28/10/26 saat 7:05.',
      ]) {
        expect(containsPhoneNumber(t), isFalse, reason: t);
      }
      expect(textError('  ', maxLength: 10, required: true), 'Bu alan gerekli');
      expect(textError('a' * 11, maxLength: 10), 'En çok 10 karakter');
      expect(textError(' ok ', maxLength: 10), isNull);
    });

    test('sign and badge: a "no" needs a reason', () {
      const yes = NoticeSign(sign: true, badge: true, reason: 'ignored');
      expect(yes.isValid, isTrue);
      expect(jsonDecode(yes.toPayload()), {'sign': true, 'badge': true});

      expect(const NoticeSign(sign: false, badge: true).isValid, isFalse);
      expect(
        const NoticeSign(sign: true, badge: false, reason: '  ').isValid,
        isFalse,
      );
      expect(
        const NoticeSign(
          sign: false,
          badge: true,
          reason: 'ara 0532 123 45 67',
        ).isValid,
        isFalse,
      );
      const no = NoticeSign(
        sign: false,
        badge: true,
        reason: ' Levha araçta kaldı ',
      );
      expect(no.isValid, isTrue);
      expect(jsonDecode(no.toPayload()), {
        'sign': false,
        'badge': true,
        'reason': 'Levha araçta kaldı',
      });
    });

    test('oral notice, objection and boundary pointer payloads', () {
      expect(jsonDecode(verbalNoticePayload(VerbalNotice.given)), {
        'answer': 'given',
      });
      expect(
        jsonDecode(verbalNoticePayload(VerbalNotice.notGiven, note: ' x ')),
        {'answer': 'not_given', 'note': 'x'},
      );
      expect(VerbalNotice.fromCode('nobody'), VerbalNotice.nobody);
      expect(jsonDecode(objectionPayload(' Batı sıraları ')), {
        'note': 'Batı sıraları',
      });
      expect(
        jsonDecode(boundaryPointerPayload(' Ali Veli ', PointerRole.worker)),
        {'name': 'Ali Veli', 'role': 'worker'},
      );
      expect(pointerNameError(''), isNotNull);
      expect(pointerNameError('a' * 121), isNotNull);
      expect(pointerNameError('a' * 120), isNull);
      expect(pointerNameError('Ali 0532 123 4567'), isNotNull);
      expect(PointerRole.values.map((r) => r.code), [
        'owner',
        'owner_relative',
        'worker',
        'neighbor',
        'other',
      ]);
    });

    test('blocked visit: details map to the four reasons', () {
      final byReason = <String, List<String>>{};
      for (final d in BlockedDetail.values) {
        (byReason[d.reason.code] ??= []).add(d.code);
      }
      expect(byReason, {
        'customer': [
          'gate_closed',
          'no_key',
          'no_guard',
          'no_boundary_pointer',
        ],
        'weather': ['rain', 'dust_wind', 'weather_other', 'flood'],
        'force_majeure': ['road_closed', 'official_ban', 'force_majeure_other'],
        'company': ['equipment', 'staff'],
      });
      // Road, flood and bans are never an owner cause (8A/2).
      for (final d in BlockedDetail.values) {
        if (d.group == BlockedGroup.accessOther) {
          expect(d.reason, isNot(BlockedReason.customer), reason: d.code);
        }
        expect(d.needsEvidence, d.group == BlockedGroup.customer);
      }
      expect(
        jsonDecode(
          blockedVisitPayload(
            BlockedDetail.noKey,
            note: 'Kapı kilitli',
            photoCount: 2,
          ),
        ),
        {
          'reason': 'customer',
          'detail': 'no_key',
          'note': 'Kapı kilitli',
          'photo_count': 2,
        },
      );
      expect(
        jsonDecode(blockedVisitPayload(BlockedDetail.rain, photoCount: 0)),
        {'reason': 'weather', 'detail': 'rain', 'photo_count': 0},
      );
    });
  });

  group('queue and sync', () {
    const visitId = 'v-1';
    const parcelId = 'P-12';
    final t0 = DateTime.utc(2026, 12, 3, 8, 30);
    final gps0 = utcToGpsMs(t0);

    late AppDatabase db;
    late FakeClock clock;
    late FieldRepository repo;
    late MemoryMediaStore media;
    late FakeSyncServer server;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      clock = FakeClock(t0);
      repo = FieldRepository(db, clock);
      media = MemoryMediaStore();
      server = FakeSyncServer(visits: {visitId: 'planned'});
    });

    tearDown(() => db.close());

    SyncWorker worker() => SyncWorker(
      repository: repo,
      server: server,
      media: media,
      clock: clock,
      timer: (_, _) => _NoTimer(),
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
      return PendingShot(
        shotCode: code,
        sha256: hash,
        localPath: await media.put(data, sha256: hash),
        mediaType: 'image/jpeg',
        byteSize: data.length,
        capturedAt: clock.now(),
        gpsTimeMs: gps0 + 5000,
        timeSource: TimeSource.gps,
        quality: quality,
      );
    }

    Future<String> blocked({List<PendingShot> photos = const []}) =>
        repo.saveBlockedVisit(
          visitId: visitId,
          parcelId: parcelId,
          taskId: visitId,
          visitKind: 'periodic',
          season: 'winter',
          operatorId: 'u-1',
          detail: BlockedDetail.gateClosed,
          note: 'Kapı kilitli, kimse yok',
          photos: photos,
          time: GpsTimeReading(gps0, TimeSource.gps),
        );

    test('blocked visit: photos then the event; the visit is not touched, '
        'offline first, ids stable on resend', () async {
      final p1 = await photo('blocked_visit_1', [1, 2, 3]);
      final p2 = await photo('blocked_visit_2', [4, 5, 6]);
      final eventId = await blocked(photos: [p1, p2]);

      final session = (await repo.session(visitId))!;
      expect(session.status, blockedSessionStatus);
      final queued = await repo.outbox.pending();
      expect(
        [for (final e in queued) '${e.entityType}:${e.entityId}'],
        [
          'capture:${p1.sha256}',
          'capture:${p2.sha256}',
          'session_event:$eventId',
        ],
        reason: 'the local blocked row is never queued as a visit update',
      );
      final event = (await repo.events(visitId)).single;
      expect(event.eventType, 'visit_blocked');
      expect(event.loggerResult, 'none');
      expect(event.dataJson, isNull);
      expect(jsonDecode(event.payload), {
        'reason': 'customer',
        'detail': 'gate_closed',
        'note': 'Kapı kilitli, kimse yok',
        'photo_count': 2,
      });
      expect(await repo.watchBlockedTaskIds().first, {visitId});
      expect(await repo.watchRecordedTaskIds().first, isEmpty);

      // Offline: nothing leaves, everything stays queued.
      server.offline = true;
      final r1 = await worker().syncNow();
      expect(r1.stoppedByNetwork, isTrue);
      expect(await repo.outbox.pendingCount(), 3);

      server.offline = false;
      final r2 = await worker().syncNow();
      expect(r2.sent, 3);
      expect(server.visitValues, isEmpty);
      expect(server.visits[visitId], 'planned');
      final row = server.table('session_event').values.single;
      expect(row['id'], eventId);
      expect(row['session_id'], visitId);
      expect(row['org_id'], 'org-1');
      expect(row['event_type'], 'visit_blocked');
      expect(row['logger_result'], 'none');
      expect(row.containsKey('data'), isFalse);
      expect(
        jsonDecode(row['payload']! as String),
        isA<Map<String, Object?>>(),
      );
      expect(row['gps_time_ns'], gps0 * 1000000);
      final captures = server.table('capture').values.toList();
      expect(captures, hasLength(2));
      for (final c in captures) {
        expect(c.containsKey('tree_id'), isFalse);
        final meta = c['metadata']! as Map<String, Object?>;
        expect(meta['local_kind'], 'blocked_visit_photo');
        expect(meta['event_id'], eventId);
        expect(c['started_at'], isNotNull);
      }

      // A resend (e.g. the app died before markSent) keeps the same ids.
      await repo.outbox.enqueue(OutboxEntity.sessionEvent, eventId);
      await repo.outbox.enqueue(OutboxEntity.capture, p1.sha256);
      await worker().syncNow();
      expect(server.table('session_event'), hasLength(1));
      expect(server.table('capture'), hasLength(2));
    });

    test('a blocked visit can still be scanned later', () async {
      final eventId = await blocked();
      await repo.createSession(
        id: visitId,
        parcelId: parcelId,
        taskId: visitId,
        visitKind: 'periodic',
        season: 'winter',
        startedAt: t0.add(const Duration(hours: 2)),
        startGpsTimeMs: gps0 + 7200000,
      );
      final session = (await repo.session(visitId))!;
      expect(session.status, 'recording');
      expect(session.startGpsTimeMs, gps0 + 7200000);
      expect((await repo.events(visitId)).single.id, eventId);
      expect(await repo.watchBlockedTaskIds().first, isEmpty);
      expect(await repo.watchRecordedTaskIds().first, {visitId});
      await worker().syncNow();
      expect(server.table('session_event').keys, [eventId]);
      expect(server.visitValues[visitId]!['started_at'], isNotNull);
    });

    test('notice records and the boundary pointer go up as events', () async {
      await repo.createSession(
        id: visitId,
        parcelId: parcelId,
        taskId: visitId,
        visitKind: 'inventory',
        startedAt: t0,
        startGpsTimeMs: gps0,
      );
      final time = GpsTimeReading(gps0, TimeSource.phone);
      final records = {
        FieldRecordEvent.noticeSign: const NoticeSign(
          sign: true,
          badge: false,
          reason: 'Kart araçta',
        ).toPayload(),
        FieldRecordEvent.noticeVerbal: verbalNoticePayload(VerbalNotice.given),
        FieldRecordEvent.noticeObjection: objectionPayload('Kuzey köşe'),
        FieldRecordEvent.boundaryPointer: boundaryPointerPayload(
          'Ayşe Yılmaz',
          PointerRole.ownerRelative,
        ),
      };
      final ids = <String, String>{};
      for (final MapEntry(:key, :value) in records.entries) {
        ids[key] = await repo.addFieldRecord(
          sessionId: visitId,
          eventType: key,
          payload: value,
          time: time,
        );
      }
      server.offline = true;
      await worker().syncNow();
      expect(server.table('session_event'), isEmpty);
      server.offline = false;
      await worker().syncNow();
      final rows = server.table('session_event');
      expect(rows, hasLength(4));
      for (final MapEntry(:key, :value) in records.entries) {
        final row = rows[ids[key]]!;
        expect(row['event_type'], key);
        expect(row['payload'], value);
        expect(jsonDecode(value), isA<Map<String, Object?>>());
        expect(row['time_source'], 'phone');
        expect(row['logger_result'], 'none');
        expect(
          containsPhoneNumber(row['payload']! as String),
          isFalse,
          reason: key,
        );
      }
    });
  });
}

class _NoTimer implements Timer {
  @override
  void cancel() {}

  @override
  bool get isActive => false;

  @override
  int get tick => 0;
}
