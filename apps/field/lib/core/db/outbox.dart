import 'package:drift/drift.dart';

import '../time/clock.dart';
import 'database.dart';

/// Entity types queued for upload.
abstract final class OutboxEntity {
  static const session = 'session';
  static const sessionEvent = 'session_event';
  static const capture = 'capture';
  static const measurement = 'measurement';
  static const verificationResult = 'verification_result';
  static const parcelRoute = 'parcel_route';
}

/// Pending, sent and failed outbox entries.
class OutboxCounts {
  const OutboxCounts({
    required this.pending,
    required this.sent,
    required this.failed,
  });

  static const empty = OutboxCounts(pending: 0, sent: 0, failed: 0);

  final int pending;
  final int sent;
  final int failed;

  /// Nothing waits and nothing failed.
  bool get allSent => pending == 0 && failed == 0;

  @override
  bool operator ==(Object other) =>
      other is OutboxCounts &&
      other.pending == pending &&
      other.sent == sent &&
      other.failed == failed;

  @override
  int get hashCode => Object.hash(pending, sent, failed);

  @override
  String toString() =>
      'OutboxCounts($pending pending, $sent sent, $failed '
      'failed)';
}

/// Queue of local records that still have to be sent to the server.
///
/// Entries are added in the same transaction as the record itself (see
/// `FieldRepository`). The SyncWorker takes [pending] entries in order and
/// calls [markSent], [recordAttempt] (network trouble, retried later) or
/// [markFailed] (refused for good). Sent and failed entries are kept for
/// audit.
class Outbox {
  Outbox(this._db, this._clock);

  final AppDatabase _db;
  final Clock _clock;

  /// Queues an entity. A session updated twice before sync is queued twice;
  /// the uploader sends the current row, so duplicates are harmless.
  Future<int> enqueue(String entityType, String entityId) => _db
      .into(_db.outboxEntries)
      .insert(
        OutboxEntriesCompanion.insert(
          entityType: entityType,
          entityId: entityId,
          createdAt: _clock.now(),
        ),
      );

  /// Entries still to send (neither sent nor failed), oldest first.
  Future<List<OutboxEntry>> pending({int? limit}) {
    final q = _db.select(_db.outboxEntries)
      ..where((e) => e.sentAt.isNull() & e.failedAt.isNull())
      ..orderBy([(e) => OrderingTerm.asc(e.id)]);
    if (limit != null) q.limit(limit);
    return q.get();
  }

  /// Entries the server refused for good, oldest first.
  Future<List<OutboxEntry>> failed() =>
      (_db.select(_db.outboxEntries)
            ..where((e) => e.failedAt.isNotNull())
            ..orderBy([(e) => OrderingTerm.asc(e.id)]))
          .get();

  Stream<int> watchPendingCount() => watchCounts().map((c) => c.pending);

  Future<int> pendingCount() => watchPendingCount().first;

  /// Counts over the whole queue.
  Stream<OutboxCounts> watchCounts() => _db
      .customSelect(
        'SELECT '
        'COALESCE(SUM(sent_at IS NULL AND failed_at IS NULL), 0) AS pending, '
        'COALESCE(SUM(sent_at IS NOT NULL), 0) AS sent, '
        'COALESCE(SUM(failed_at IS NOT NULL), 0) AS failed '
        'FROM outbox_entries',
        readsFrom: {_db.outboxEntries},
      )
      .map(_counts)
      .watchSingle()
      .distinct();

  /// Counts for the records of one session (the session row, its events,
  /// photos, answers, verification results and the route it made).
  Stream<OutboxCounts> watchSessionCounts(String sessionId) => _db
      .customSelect(
        'SELECT '
        'COALESCE(SUM(o.sent_at IS NULL AND o.failed_at IS NULL), 0) '
        'AS pending, '
        'COALESCE(SUM(o.sent_at IS NOT NULL), 0) AS sent, '
        'COALESCE(SUM(o.failed_at IS NOT NULL), 0) AS failed '
        'FROM outbox_entries o WHERE '
        "(o.entity_type = 'session' AND o.entity_id = ?1) OR "
        "(o.entity_type = 'session_event' AND o.entity_id IN "
        '(SELECT id FROM session_events WHERE session_id = ?1)) OR '
        "(o.entity_type = 'capture' AND o.entity_id IN "
        '(SELECT sha256 FROM captures WHERE session_id = ?1)) OR '
        "(o.entity_type = 'measurement' AND o.entity_id IN "
        '(SELECT id FROM measurements WHERE session_id = ?1)) OR '
        "(o.entity_type = 'verification_result' AND o.entity_id IN "
        '(SELECT id FROM verification_results WHERE tour_id = ?1)) OR '
        "(o.entity_type = 'parcel_route' AND o.entity_id IN "
        '(SELECT id FROM parcel_routes WHERE session_id = ?1))',
        variables: [Variable.withString(sessionId)],
        readsFrom: {
          _db.outboxEntries,
          _db.sessionEvents,
          _db.captures,
          _db.measurements,
          _db.verificationResults,
          _db.parcelRoutes,
        },
      )
      .map(_counts)
      .watchSingle()
      .distinct();

  static OutboxCounts _counts(QueryRow r) => OutboxCounts(
    pending: r.read<int>('pending'),
    sent: r.read<int>('sent'),
    failed: r.read<int>('failed'),
  );

  Future<void> markSent(int id) =>
      (_db.update(_db.outboxEntries)..where((e) => e.id.equals(id))).write(
        OutboxEntriesCompanion.custom(
          attempts: _db.outboxEntries.attempts + const Constant(1),
          sentAt: Variable(_clock.now()),
          lastAttemptAt: Variable(_clock.now()),
          lastError: const Variable(null),
        ),
      );

  /// A try that failed for a passing reason (no network, server busy); the
  /// entry stays pending.
  Future<void> recordAttempt(int id, String error) =>
      (_db.update(_db.outboxEntries)..where((e) => e.id.equals(id))).write(
        OutboxEntriesCompanion.custom(
          attempts: _db.outboxEntries.attempts + const Constant(1),
          lastError: Variable(error),
          lastAttemptAt: Variable(_clock.now()),
        ),
      );

  /// The server refused the record for good; it leaves the queue and keeps
  /// [reason].
  Future<void> markFailed(int id, String reason) =>
      (_db.update(_db.outboxEntries)..where((e) => e.id.equals(id))).write(
        OutboxEntriesCompanion.custom(
          attempts: _db.outboxEntries.attempts + const Constant(1),
          lastError: Variable(reason),
          lastAttemptAt: Variable(_clock.now()),
          failedAt: Variable(_clock.now()),
        ),
      );

  /// Puts failed entries back into the queue (after the cause was fixed on
  /// the server). They keep their place: the queue is ordered by id.
  Future<int> requeueFailed() =>
      (_db.update(_db.outboxEntries)..where((e) => e.failedAt.isNotNull()))
          .write(const OutboxEntriesCompanion(failedAt: Value(null)));
}
