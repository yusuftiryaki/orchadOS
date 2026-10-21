import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../quality/photo_quality.dart';
import '../time/clock.dart';
import '../time/gps_clock.dart';
import 'database.dart';
import 'outbox.dart';

const String appVersion = '0.1.0';

/// Version of the field methodology the app implements (scan protocol and
/// checklist). Stored on every session.
const String methodologyVersion = 'field-v0';

/// A photo that has been taken and hashed but not yet saved with its tree.
class PendingShot {
  const PendingShot({
    required this.shotCode,
    required this.sha256,
    required this.localPath,
    required this.mediaType,
    required this.byteSize,
    required this.capturedAt,
    required this.gpsTimeMs,
    required this.timeSource,
    required this.quality,
  });

  final String shotCode;
  final String sha256;
  final String localPath;
  final String mediaType;
  final int byteSize;
  final DateTime capturedAt;
  final int gpsTimeMs;
  final TimeSource timeSource;

  /// On-device quality check; never [QualityVerdict.reject].
  final QualityResult quality;
}

/// The newest local result of a verification item and its upload state.
class LocalVerificationResult {
  const LocalVerificationResult(this.row, {this.sent = false, this.failure});

  final VerificationResultRow row;
  final bool sent;

  /// Why the server refused it for good (`item_closed: …`); null otherwise.
  final String? failure;
}

/// Writes field records and their outbox entries atomically.
class FieldRepository {
  FieldRepository(this.db, this._clock) : outbox = Outbox(db, _clock);

  final AppDatabase db;
  final Outbox outbox;
  final Clock _clock;
  final Uuid _uuid = const Uuid();

  String newId() => _uuid.v4();

  Future<void> createSession({
    required String id,
    required String parcelId,
    required String visitKind,
    String? taskId,
    String? season,
    String? operatorId,
    String? loggerName,
    String? loggerFirmware,
    required DateTime startedAt,
    int? startGpsTimeMs,
  }) => db.transaction(() async {
    await db
        .into(db.sessions)
        .insert(
          SessionsCompanion.insert(
            id: id,
            parcelId: parcelId,
            taskId: Value(taskId),
            sessionType: 'scan',
            visitKind: visitKind,
            season: Value(season),
            operatorId: Value(operatorId),
            methodologyVersion: methodologyVersion,
            appVersion: appVersion,
            loggerName: Value(loggerName),
            loggerFirmware: Value(loggerFirmware),
            startedAt: startedAt,
            startGpsTimeMs: Value(startGpsTimeMs),
            status: 'recording',
          ),
        );
    await outbox.enqueue(OutboxEntity.session, id);
  });

  Future<void> stopSession(
    String id, {
    required DateTime stoppedAt,
    required int stopGpsTimeMs,
  }) => _updateSession(
    id,
    SessionsCompanion(
      stoppedAt: Value(stoppedAt),
      stopGpsTimeMs: Value(stopGpsTimeMs),
      status: const Value('stopped'),
    ),
  );

  /// Marks the visit as finished after the summary screen.
  Future<void> closeSession(String id) =>
      _updateSession(id, const SessionsCompanion(status: Value('closed')));

  Future<void> _updateSession(String id, SessionsCompanion c) =>
      db.transaction(() async {
        await (db.update(db.sessions)..where((s) => s.id.equals(id))).write(c);
        await outbox.enqueue(OutboxEntity.session, id);
      });

  /// Stores an event. [data] becomes `session_event.data` (a JSON object).
  Future<String> addEvent({
    required String sessionId,
    required String eventType,
    required String payload,
    required GpsTimeReading time,
    required String loggerResult,
    Map<String, Object?>? data,
  }) async {
    final id = newId();
    await db.transaction(() async {
      await db
          .into(db.sessionEvents)
          .insert(
            SessionEventsCompanion.insert(
              id: id,
              sessionId: sessionId,
              eventType: eventType,
              payload: payload,
              phoneTime: _clock.now(),
              gpsTimeMs: time.gpsTimeMs,
              timeSource: time.source.code,
              loggerResult: loggerResult,
              dataJson: Value(data == null ? null : jsonEncode(data)),
            ),
          );
      await outbox.enqueue(OutboxEntity.sessionEvent, id);
    });
    return id;
  }

  /// Local row for a verification tour, so that its photos and results have
  /// a session. Not queued: the server keeps the tour's status itself
  /// (docs/arayuzler.md, "Doğrulama kalemleri"). Does nothing when the row
  /// exists.
  Future<void> ensureTourSession({
    required String tourId,
    required String parcelId,
    required String taskId,
    String? operatorId,
  }) async {
    await db
        .into(db.sessions)
        .insert(
          SessionsCompanion.insert(
            id: tourId,
            parcelId: parcelId,
            taskId: Value(taskId),
            sessionType: 'verification',
            visitKind: 'verification',
            operatorId: Value(operatorId),
            methodologyVersion: methodologyVersion,
            appVersion: appVersion,
            startedAt: _clock.now(),
            status: 'tour',
          ),
          mode: InsertMode.insertOrIgnore,
        );
  }

  /// Saves what was found at a verification item, with its optional photo,
  /// in one transaction (photo first: the result refers to it).
  Future<String> saveVerificationResult({
    required String tourId,
    required String itemId,
    required String slotId,
    required String slotCode,
    required bool treePresent,
    String? note,
    PendingShot? photo,
  }) async {
    final id = newId();
    await db.transaction(() async {
      if (photo != null) {
        await _insertCapture(
          photo,
          sessionId: tourId,
          kind: 'verification_photo',
          subjectType: 'slot',
          subjectId: slotId,
          slotCode: slotCode,
        );
      }
      final trimmed = note?.trim();
      await db
          .into(db.verificationResults)
          .insert(
            VerificationResultsCompanion.insert(
              id: id,
              tourId: tourId,
              itemId: itemId,
              slotCode: slotCode,
              treePresent: treePresent,
              note: Value(trimmed == null || trimmed.isEmpty ? null : trimmed),
              captureSha256: Value(photo?.sha256),
              recordedAt: _clock.now(),
            ),
          );
      await outbox.enqueue(OutboxEntity.verificationResult, id);
    });
    return id;
  }

  /// The newest result per item of a tour, with the reason when the server
  /// refused it (e.g. `item_closed`).
  Stream<Map<String, LocalVerificationResult>> watchVerificationResults(
    String tourId,
  ) => db
      .customSelect(
        'SELECT r.*, o.failed_at AS o_failed_at, o.last_error AS o_last_error, '
        'o.sent_at AS o_sent_at '
        'FROM verification_results r '
        'LEFT JOIN outbox_entries o ON o.entity_type = ?2 '
        'AND o.entity_id = r.id '
        'WHERE r.tour_id = ?1 ORDER BY r.recorded_at, r.rowid',
        variables: [
          Variable.withString(tourId),
          Variable.withString(OutboxEntity.verificationResult),
        ],
        readsFrom: {db.verificationResults, db.outboxEntries},
      )
      .watch()
      .map((rows) {
        final out = <String, LocalVerificationResult>{};
        for (final r in rows) {
          final row = db.verificationResults.map(r.data);
          out[row.itemId] = LocalVerificationResult(
            row,
            sent: r.readNullable<DateTime>('o_sent_at') != null,
            failure: r.readNullable<DateTime>('o_failed_at') != null
                ? r.readNullable<String>('o_last_error')
                : null,
          );
        }
        return out;
      });

  Future<void> _insertCapture(
    PendingShot s, {
    required String sessionId,
    required String kind,
    required String subjectType,
    required String subjectId,
    String? slotCode,
  }) async {
    if (!s.quality.canSave) {
      throw ArgumentError('rejected photo ${s.sha256} cannot be saved');
    }
    final q = s.quality.scores;
    await db
        .into(db.captures)
        .insert(
          CapturesCompanion.insert(
            sha256: s.sha256,
            sessionId: sessionId,
            kind: kind,
            sensor: 'phone_camera',
            mediaType: s.mediaType,
            byteSize: s.byteSize,
            localPath: s.localPath,
            subjectType: subjectType,
            subjectId: subjectId,
            slotCode: Value(slotCode),
            shotCode: s.shotCode,
            capturedAt: s.capturedAt,
            gpsTimeMs: s.gpsTimeMs,
            timeSource: s.timeSource.code,
            qcVerdict: Value(s.quality.verdict.code),
            qcVersion: Value(s.quality.version),
            qcSharpness: Value(q?.sharpness),
            qcBrightness: Value(q?.meanBrightness),
            qcDarkRatio: Value(q?.darkClippedRatio),
            qcBrightRatio: Value(q?.brightClippedRatio),
            qcFindings: Value(s.quality.findings.join(',')),
          ),
          mode: InsertMode.insertOrIgnore,
        );
    await outbox.enqueue(OutboxEntity.capture, s.sha256);
  }

  /// Saves the photos and answers of one tree in a single transaction.
  Future<void> saveTreeObservation({
    required String sessionId,
    required String treeId,
    required String slotCode,
    required List<PendingShot> shots,
    required Map<String, bool> answers,
    required String methodVersion,
  }) => db.transaction(() async {
    for (final s in shots) {
      await _insertCapture(
        s,
        sessionId: sessionId,
        kind: 'closeup_photo',
        subjectType: 'tree',
        subjectId: treeId,
        slotCode: slotCode,
      );
    }
    final evidence = jsonEncode([for (final s in shots) s.sha256]);
    final now = _clock.now();
    for (final MapEntry(key: metric, value: answer) in answers.entries) {
      final id = newId();
      await db
          .into(db.measurements)
          .insert(
            MeasurementsCompanion.insert(
              id: id,
              sessionId: sessionId,
              subjectType: 'tree',
              subjectId: treeId,
              metricCode: metric,
              valueBoolean: Value(answer),
              method: 'field_question',
              methodVersion: methodVersion,
              source: 'staff',
              measuredAt: now,
              evidenceJson: evidence,
            ),
          );
      await outbox.enqueue(OutboxEntity.measurement, id);
    }
  });

  Future<SessionRow?> session(String id) =>
      (db.select(db.sessions)..where((s) => s.id.equals(id))).getSingleOrNull();

  Future<List<SessionEventRow>> events(String sessionId) =>
      (db.select(db.sessionEvents)
            ..where((e) => e.sessionId.equals(sessionId))
            ..orderBy([(e) => OrderingTerm.asc(e.phoneTime)]))
          .get();

  Future<List<CaptureRow>> captures(String sessionId) =>
      (db.select(db.captures)
            ..where((c) => c.sessionId.equals(sessionId))
            ..orderBy([(c) => OrderingTerm.asc(c.capturedAt)]))
          .get();

  Future<List<MeasurementRow>> measurements(String sessionId) => (db.select(
    db.measurements,
  )..where((m) => m.sessionId.equals(sessionId))).get();

  /// Tasks recorded on this phone (any local recording with that task id;
  /// a verification tour is done when all its items are, see the tour).
  Stream<Set<String>> watchRecordedTaskIds() {
    final q = db.selectOnly(db.sessions, distinct: true)
      ..addColumns([db.sessions.taskId])
      ..where(
        db.sessions.taskId.isNotNull() &
            db.sessions.sessionType.equals('verification').not(),
      );
    return q
        .map((r) => r.read(db.sessions.taskId)!)
        .watch()
        .map((l) => l.toSet());
  }

  /// Trees that already have saved observations in this session.
  Stream<Set<String>> watchObservedTrees(String sessionId) {
    final q = db.selectOnly(db.measurements, distinct: true)
      ..addColumns([db.measurements.subjectId])
      ..where(db.measurements.sessionId.equals(sessionId));
    return q
        .map((r) => r.read(db.measurements.subjectId)!)
        .watch()
        .map((l) => l.toSet());
  }
}
