import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:drift/drift.dart' show BooleanExpressionOperators, OrderingTerm;

import '../db/database.dart';
import '../db/field_repository.dart';
import '../db/outbox.dart';
import '../media/media_store.dart';
import '../time/clock.dart';
import 'sync_rows.dart';
import 'sync_server.dart';

/// Wait before the n-th retry after network trouble: [initial] · 2^(n−1),
/// at most [max].
class Backoff {
  const Backoff({
    this.initial = const Duration(seconds: 2),
    this.max = const Duration(minutes: 5),
  });

  final Duration initial;
  final Duration max;

  Duration delay(int failures) {
    final n = math.max(1, failures);
    final ms = initial.inMilliseconds * math.pow(2, math.min(n - 1, 20));
    return Duration(milliseconds: math.min(ms.toInt(), max.inMilliseconds));
  }
}

/// Starts a timer; replaced in tests to fire retries by hand.
typedef TimerFactory = Timer Function(Duration delay, void Function() run);

enum SyncPhase {
  /// Nothing running; the queue may still hold entries.
  idle,

  /// Sending.
  running,

  /// The last pass hit network trouble; a retry is scheduled.
  waitingForNetwork,
}

/// What the worker is doing, for the status line.
class SyncActivity {
  const SyncActivity({
    this.phase = SyncPhase.idle,
    this.nextRetryAt,
    this.lastProblem,
    this.lastPassAt,
  });

  final SyncPhase phase;

  /// When the scheduled retry runs ([SyncPhase.waitingForNetwork]).
  final DateTime? nextRetryAt;

  /// Last passing problem (no network, server busy), for the log.
  final String? lastProblem;

  /// End of the last pass that reached the end of the queue.
  final DateTime? lastPassAt;
}

/// Result of one call to [SyncWorker.syncNow].
class SyncReport {
  const SyncReport({
    required this.sent,
    required this.failed,
    required this.stoppedByNetwork,
  });

  final int sent;
  final int failed;

  /// The pass stopped early on network trouble; a retry is scheduled.
  final bool stoppedByNetwork;
}

/// Sends the outbox to the server, oldest entry first.
///
/// - Every entry is sent with an idempotent write (ids come from the phone),
///   so an entry sent twice, e.g. after the app was killed between the
///   upload and [Outbox.markSent], leaves one row on the server.
/// - Network trouble ([SyncErrorKind.transient]) stops the pass: later
///   entries would fail the same way, and order matters (a photo needs its
///   visit). The entry stays queued and the pass is retried after
///   [Backoff.delay].
/// - A refusal ([SyncErrorKind.permanent]) marks the entry failed with its
///   reason and the pass goes on with the next entry.
/// - A photo file is removed from the phone only after the upload, the
///   capture row and a check that the object exists have all succeeded.
class SyncWorker {
  SyncWorker({
    required this.repository,
    required this.server,
    required this.media,
    required this.clock,
    this.backoff = const Backoff(),
    TimerFactory? timer,
    this.releasePhotosAfterUpload = true,
  }) : _timer = timer ?? Timer.new;

  final FieldRepository repository;
  final SyncServer server;
  final MediaStore media;
  final Clock clock;
  final Backoff backoff;
  final bool releasePhotosAfterUpload;
  final TimerFactory _timer;

  final _activity = StreamController<SyncActivity>.broadcast();
  SyncActivity _current = const SyncActivity();
  Future<SyncReport>? _running;
  bool _again = false;
  bool _disposed = false;
  int _networkFailures = 0;
  Timer? _retry;

  final Map<String, String> _orgByParcel = {};
  Map<String, String>? _metricIds;

  Outbox get _outbox => repository.outbox;

  SyncActivity get current => _current;
  Stream<SyncActivity> get activity => _activity.stream;

  /// Sends everything that is queued. While a pass runs, a new call makes
  /// the running pass go round once more and returns its result.
  Future<SyncReport> syncNow() {
    if (_disposed) {
      return Future.value(
        const SyncReport(sent: 0, failed: 0, stoppedByNetwork: false),
      );
    }
    final running = _running;
    if (running != null) {
      _again = true;
      return running;
    }
    _retry?.cancel();
    _retry = null;
    final run = _loop();
    _running = run;
    return run.whenComplete(() => _running = null);
  }

  void dispose() {
    _disposed = true;
    _retry?.cancel();
    _activity.close();
  }

  Future<SyncReport> _loop() async {
    var sent = 0;
    var failed = 0;
    _emit(
      SyncActivity(phase: SyncPhase.running, lastPassAt: _current.lastPassAt),
    );
    try {
      do {
        _again = false;
        final r = await _pass();
        sent += r.sent;
        failed += r.failed;
        if (r.stoppedByNetwork) {
          return SyncReport(sent: sent, failed: failed, stoppedByNetwork: true);
        }
      } while (_again && !_disposed);
      _networkFailures = 0;
      _emit(SyncActivity(lastPassAt: clock.now()));
      return SyncReport(sent: sent, failed: failed, stoppedByNetwork: false);
    } catch (e) {
      // Local trouble (database closed, ...): leave the queue as it is.
      _emit(SyncActivity(lastProblem: '$e', lastPassAt: _current.lastPassAt));
      rethrow;
    }
  }

  Future<SyncReport> _pass() async {
    var sent = 0;
    var failed = 0;
    for (final entry in await _outbox.pending()) {
      if (_disposed) break;
      try {
        await _send(entry);
        await _outbox.markSent(entry.id);
        sent++;
      } on SyncError catch (e) {
        if (e.isTransient) {
          await _outbox.recordAttempt(entry.id, '$e');
          _scheduleRetry('$e');
          return SyncReport(sent: sent, failed: failed, stoppedByNetwork: true);
        }
        await _outbox.markFailed(entry.id, '$e');
        failed++;
      }
    }
    return SyncReport(sent: sent, failed: failed, stoppedByNetwork: false);
  }

  void _scheduleRetry(String problem) {
    _networkFailures++;
    final wait = backoff.delay(_networkFailures);
    _retry?.cancel();
    _retry = _timer(wait, () {
      _retry = null;
      if (!_disposed) syncNow().ignore();
    });
    _emit(
      SyncActivity(
        phase: SyncPhase.waitingForNetwork,
        nextRetryAt: clock.now().add(wait),
        lastProblem: problem,
        lastPassAt: _current.lastPassAt,
      ),
    );
  }

  void _emit(SyncActivity a) {
    _current = a;
    if (!_activity.isClosed) _activity.add(a);
  }

  // --- One entry --------------------------------------------------------------

  Future<void> _send(OutboxEntry entry) async {
    switch (entry.entityType) {
      case OutboxEntity.session:
        return _sendSession(entry.entityId);
      case OutboxEntity.sessionEvent:
        return _sendEvent(entry.entityId);
      case OutboxEntity.capture:
        return _sendCapture(entry.entityId);
      case OutboxEntity.measurement:
        return _sendMeasurement(entry.entityId);
      case OutboxEntity.verificationResult:
        return _sendVerificationResult(entry.entityId);
      case OutboxEntity.parcelRoute:
        return _sendParcelRoute(entry.entityId);
      default:
        throw SyncError.permanent('unknown_entity', entry.entityType);
    }
  }

  Future<SessionRow> _session(String id) async =>
      await repository.session(id) ??
      (throw SyncError.permanent('local_record_missing', 'session $id'));

  Future<String> _org(String parcelId) async {
    final known = _orgByParcel[parcelId];
    if (known != null) return known;
    final org = await server.parcelOrg(parcelId);
    if (org == null) {
      throw SyncError.permanent('parcel_not_visible', parcelId);
    }
    return _orgByParcel[parcelId] = org;
  }

  Future<String> _metricId(String code) async {
    var id = (_metricIds ??= await server.metricIds())[code];
    if (id == null) {
      // The registry may have grown since the last lookup.
      _metricIds = await server.metricIds();
      id = _metricIds![code];
    }
    return id ?? (throw SyncError.permanent('unknown_metric', code));
  }

  Future<void> _sendSession(String id) async {
    final s = await _session(id);
    final updated = await server.updateVisit(
      id,
      visitUpdate(s, weather: await _weather(id)),
      whileStatus: visitWritableStatuses,
    );
    if (updated) return;
    // Nothing updated: the visit is gone, cancelled, or already further
    // along (processed, in review, published), which is fine.
    final status = await server.visitStatus(id);
    if (status == null) throw SyncError.permanent('visit_not_found', id);
    if (status == 'cancelled') throw SyncError.permanent('visit_cancelled', id);
  }

  /// Weather of the newest `visit_log` event of the session, if any.
  Future<Map<String, Object?>?> _weather(String sessionId) async {
    final logs =
        await (repository.db.select(repository.db.sessionEvents)
              ..where(
                (e) =>
                    e.sessionId.equals(sessionId) &
                    e.eventType.equals('visit_log'),
              )
              ..orderBy([(e) => OrderingTerm.desc(e.phoneTime)])
              ..limit(1))
            .get();
    final data = logs.firstOrNull?.dataJson;
    if (data == null) return null;
    return ((jsonDecode(data) as Map)['weather'] as Map?)
        ?.cast<String, Object?>();
  }

  Future<void> _sendEvent(String id) async {
    final e = await (repository.db.select(
      repository.db.sessionEvents,
    )..where((x) => x.id.equals(id))).getSingleOrNull();
    if (e == null) throw SyncError.permanent('local_record_missing', id);
    final s = await _session(e.sessionId);
    await server.insertIgnoringDuplicates(
      'session_event',
      sessionEventRow(e, orgId: await _org(s.parcelId), parcelId: s.parcelId),
      onConflict: 'id',
    );
  }

  Future<void> _sendCapture(String sha256) async {
    final c = await (repository.db.select(
      repository.db.captures,
    )..where((x) => x.sha256.equals(sha256))).getSingleOrNull();
    if (c == null) throw SyncError.permanent('local_record_missing', sha256);
    final s = await _session(c.sessionId);
    final org = await _org(s.parcelId);
    final path = mediaObjectPath(
      orgId: org,
      parcelId: s.parcelId,
      sha256: c.sha256,
    );

    final bytes = await media.read(c.localPath);
    if (bytes != null) {
      if (sha256Hex(bytes) != c.sha256) {
        // Never upload a file whose content does not match its name.
        throw SyncError.permanent('hash_mismatch', c.localPath);
      }
      await server.uploadMedia(path, bytes, contentType: c.mediaType);
    } else if (!await server.mediaExists(path)) {
      // Released after an earlier verified upload, or lost on the phone.
      throw SyncError.permanent('file_missing', c.localPath);
    }

    await server.insertIgnoringDuplicates(
      'capture',
      captureRow(c, orgId: org, parcelId: s.parcelId),
      onConflict: 'session_id,content_hash',
    );

    if (bytes != null && releasePhotosAfterUpload) {
      if (!await server.mediaExists(path)) {
        throw SyncError.transient('upload_not_verified', path);
      }
      await media.release(c.localPath);
    }
  }

  Future<void> _sendMeasurement(String id) async {
    final m = await (repository.db.select(
      repository.db.measurements,
    )..where((x) => x.id.equals(id))).getSingleOrNull();
    if (m == null) throw SyncError.permanent('local_record_missing', id);
    final s = await _session(m.sessionId);
    await server.insertIgnoringDuplicates(
      'measurement',
      measurementRow(
        m,
        orgId: await _org(s.parcelId),
        parcelId: s.parcelId,
        metricDefinitionId: await _metricId(m.metricCode),
      ),
      onConflict: 'id',
    );
  }

  Future<void> _sendVerificationResult(String id) async {
    final r = await (repository.db.select(
      repository.db.verificationResults,
    )..where((x) => x.id.equals(id))).getSingleOrNull();
    if (r == null) throw SyncError.permanent('local_record_missing', id);
    await server.recordVerificationResult(verificationResultParams(r));
  }

  Future<void> _sendParcelRoute(String id) async {
    final r = await repository.routeRow(id);
    if (r == null) throw SyncError.permanent('local_record_missing', id);
    final version = await server.saveParcelRoute(parcelRouteParams(r));
    await repository.markRouteSynced(id, version);
  }
}
