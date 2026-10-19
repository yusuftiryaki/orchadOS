import 'package:drift/drift.dart';

import '../time/clock.dart';
import 'database.dart';

/// Entity types queued for upload.
abstract final class OutboxEntity {
  static const session = 'session';
  static const sessionEvent = 'session_event';
  static const capture = 'capture';
  static const measurement = 'measurement';
}

/// Queue of local records that still have to be sent to the server.
///
/// Entries are added in the same transaction as the record itself (see
/// `FieldRepository`). The sync worker (later) takes [pending] entries in
/// order, calls [markSent] or [markFailed]. Sent entries are kept for audit.
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

  /// Unsent entries, oldest first.
  Future<List<OutboxEntry>> pending({int? limit}) {
    final q = _db.select(_db.outboxEntries)
      ..where((e) => e.sentAt.isNull())
      ..orderBy([(e) => OrderingTerm.asc(e.id)]);
    if (limit != null) q.limit(limit);
    return q.get();
  }

  Stream<int> watchPendingCount() {
    final count = _db.outboxEntries.id.count();
    final q = _db.selectOnly(_db.outboxEntries)
      ..addColumns([count])
      ..where(_db.outboxEntries.sentAt.isNull());
    return q.map((r) => r.read(count) ?? 0).watchSingle();
  }

  Future<int> pendingCount() => watchPendingCount().first;

  Future<void> markSent(int id) =>
      (_db.update(_db.outboxEntries)..where((e) => e.id.equals(id))).write(
        OutboxEntriesCompanion(
          sentAt: Value(_clock.now()),
          lastAttemptAt: Value(_clock.now()),
          lastError: const Value(null),
        ),
      );

  Future<void> markFailed(int id, String error) =>
      (_db.update(_db.outboxEntries)..where((e) => e.id.equals(id))).write(
        OutboxEntriesCompanion.custom(
          attempts: _db.outboxEntries.attempts + const Constant(1),
          lastError: Variable(error),
          lastAttemptAt: Variable(_clock.now()),
        ),
      );
}
