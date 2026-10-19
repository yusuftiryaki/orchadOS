import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

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
  });

  final String shotCode;
  final String sha256;
  final String localPath;
  final String mediaType;
  final int byteSize;
  final DateTime capturedAt;
  final int gpsTimeMs;
  final TimeSource timeSource;
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

  Future<String> addEvent({
    required String sessionId,
    required String eventType,
    required String payload,
    required GpsTimeReading time,
    required String loggerResult,
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
            ),
          );
      await outbox.enqueue(OutboxEntity.sessionEvent, id);
    });
    return id;
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
      await db
          .into(db.captures)
          .insert(
            CapturesCompanion.insert(
              sha256: s.sha256,
              sessionId: sessionId,
              kind: 'closeup_photo',
              sensor: 'phone_camera',
              mediaType: s.mediaType,
              byteSize: s.byteSize,
              localPath: s.localPath,
              subjectType: 'tree',
              subjectId: treeId,
              slotCode: Value(slotCode),
              shotCode: s.shotCode,
              capturedAt: s.capturedAt,
              gpsTimeMs: s.gpsTimeMs,
              timeSource: s.timeSource.code,
            ),
            mode: InsertMode.insertOrIgnore,
          );
      await outbox.enqueue(OutboxEntity.capture, s.sha256);
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
              valueBool: Value(answer),
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
