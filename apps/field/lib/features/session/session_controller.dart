import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/geo/geo.dart';
import '../../core/time/gps_clock.dart';
import '../boundary/boundary_corners.dart';
import '../coverage/coverage.dart';
import '../gnss/gnss_logger.dart';
import '../gnss/protocol/command_result.dart';
import '../gnss/protocol/gnss_command.dart';
import '../tasks/field_task.dart';

enum SessionPhase { idle, starting, recording, stopping, stopped }

/// The walked track and what it covered, for the map and the summary.
class CoverageView {
  const CoverageView({
    required this.summary,
    required this.tracks,
    required this.covered,
    this.here,
  });

  final CoverageSummary summary;
  final List<List<GeoPoint>> tracks;

  /// Codes of the covered slots.
  final Set<String> covered;

  /// Latest receiver position.
  final GeoPoint? here;
}

/// Which QR the crew is showing to the camera.
enum QrMoment {
  start('Başlangıç QR'),
  end('Bitiş QR');

  const QrMoment(this.label);
  final String label;
}

class SessionState {
  const SessionState({
    this.task,
    this.phase = SessionPhase.idle,
    this.sessionId,
    this.startedAt,
    this.startQrShown = false,
    this.endQrShown = false,
    this.boundary = BoundaryCorners.empty,
    this.coverage,
    this.busy = false,
    this.error,
  });

  final FieldTask? task;
  final SessionPhase phase;
  final String? sessionId;
  final DateTime? startedAt;
  final bool startQrShown;
  final bool endQrShown;

  /// Corners of the boundary walk (inventory), in walking order.
  final BoundaryCorners boundary;

  int get cornerCount => boundary.length;

  /// Coverage of the recording so far; null before the start.
  final CoverageView? coverage;

  /// A logger command is in flight.
  final bool busy;

  /// Last error, in Turkish, for the UI.
  final String? error;

  bool get isRecording => phase == SessionPhase.recording;

  SessionState copyWith({
    FieldTask? task,
    SessionPhase? phase,
    String? sessionId,
    DateTime? startedAt,
    bool? startQrShown,
    bool? endQrShown,
    BoundaryCorners? boundary,
    CoverageView? coverage,
    bool? busy,
    String? Function()? error,
  }) => SessionState(
    task: task ?? this.task,
    phase: phase ?? this.phase,
    sessionId: sessionId ?? this.sessionId,
    startedAt: startedAt ?? this.startedAt,
    startQrShown: startQrShown ?? this.startQrShown,
    endQrShown: endQrShown ?? this.endQrShown,
    boundary: boundary ?? this.boundary,
    coverage: coverage ?? this.coverage,
    busy: busy ?? this.busy,
    error: error != null ? error() : this.error,
  );
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);

/// Drives one recording session: logger commands, local records and the
/// required order (start → start QR → [corners] → end QR → stop).
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    ref.onDispose(_stopTrack);
    return const SessionState();
  }

  CoverageTracker? _tracker;
  StreamSubscription<GnssStatusSample>? _track;

  /// Selects the task the next session belongs to.
  void selectTask(FieldTask task) {
    _stopTrack();
    _tracker = null;
    state = SessionState(task: task);
  }

  /// Follows the logger's positions while recording (coverage map).
  void _startTrack(FieldTask task) {
    _stopTrack();
    final tracker = _tracker = CoverageTracker(task.slots);
    final logger = ref.read(gnssLoggerProvider);
    void onStatus(GnssStatusSample s) {
      final p = s.status.position;
      if (p == null || !ref.mounted) return;
      tracker.add(p, s.receivedAt);
      state = state.copyWith(coverage: _view(tracker));
    }

    state = state.copyWith(coverage: _view(tracker));
    _track = logger.statusStream.listen(onStatus);
  }

  void _stopTrack() {
    _track?.cancel();
    _track = null;
  }

  static CoverageView _view(CoverageTracker t) => CoverageView(
    summary: t.summary,
    tracks: t.tracks,
    covered: t.coveredCodes,
    here: t.lastPosition,
  );

  void clearError() => state = state.copyWith(error: () => null);

  /// Starts recording on the logger and creates the local session.
  Future<bool> start() async {
    final task = state.task;
    if (task == null || state.phase != SessionPhase.idle || state.busy) {
      return false;
    }
    final repo = ref.read(fieldRepositoryProvider);
    final logger = ref.read(gnssLoggerProvider);
    // A planned visit keeps its server id on the phone and on the logger
    // (docs/arayuzler.md); the sync fills in that row.
    final sessionId = task.visitId ?? repo.newId();
    if (await repo.session(sessionId) != null) {
      // The logger refuses an existing session folder (session_exists).
      state = state.copyWith(
        error: () => 'Bu ziyaret bu telefonda zaten kaydedildi',
      );
      return false;
    }
    if (!ref.mounted) return false;
    state = state.copyWith(
      phase: SessionPhase.starting,
      busy: true,
      error: () => null,
    );
    final result = await logger.startSession(
      sessionId: sessionId,
      parcelId: task.parcelId,
    );
    if (!ref.mounted) return false;
    if (!result.isOk) {
      state = state.copyWith(
        phase: SessionPhase.idle,
        busy: false,
        error: () => 'Kayıt başlamadı: ${result.message}',
      );
      return false;
    }
    final time = _now();
    final now = ref.read(clockProvider).now();
    await repo.createSession(
      id: sessionId,
      parcelId: task.parcelId,
      taskId: task.id,
      visitKind: task.kind.code,
      season: task.season.code,
      operatorId: ref.read(currentUserProvider)?.id,
      loggerName: logger.deviceName,
      loggerFirmware: logger.lastStatus?.status.firmwareVersion,
      startedAt: now,
      startGpsTimeMs: time.gpsTimeMs,
    );
    await repo.addEvent(
      sessionId: sessionId,
      eventType: 'session_start',
      payload: 'parcel_id=${task.parcelId}',
      time: time,
      loggerResult: result.name,
    );
    if (!ref.mounted) return true;
    state = state.copyWith(
      phase: SessionPhase.recording,
      sessionId: sessionId,
      startedAt: now,
      busy: false,
    );
    _startTrack(task);
    return true;
  }

  /// Marks a boundary corner (inventory): `mark_event(corner, <n>)` on the
  /// logger and a `corner` event with the GPS time of the press and the
  /// logger's position and quality from its latest status.
  Future<bool> markCorner() async {
    final sessionId = state.sessionId;
    if (!state.isRecording || sessionId == null || state.busy) return false;
    final n = state.boundary.nextCornerNo;
    state = state.copyWith(busy: true, error: () => null);
    final time = _now();
    final logger = ref.read(gnssLoggerProvider);
    final fix = CornerFix.fromStatus(
      logger.lastStatus,
      ref.read(clockProvider).now(),
    );
    final result = await logger.markEvent(MarkType.corner, '$n');
    if (!ref.mounted) return false;
    if (!result.isOk) {
      state = state.copyWith(
        busy: false,
        error: () => 'Köşe kaydedilemedi: ${result.message}',
      );
      return false;
    }
    final id = await ref
        .read(fieldRepositoryProvider)
        .addEvent(
          sessionId: sessionId,
          eventType: 'corner',
          payload: '$n',
          time: time,
          loggerResult: result.name,
          data: Corner.eventData(n, fix),
        );
    if (!ref.mounted) return true;
    state = state.copyWith(
      busy: false,
      boundary: state.boundary.add(
        Corner(
          eventId: id,
          cornerNo: n,
          gpsTimeMs: time.gpsTimeMs,
          timeSource: time.source.code,
          fix: fix,
        ),
      ),
    );
    return true;
  }

  /// Moves a corner up (−1) or down (+1) in the list.
  Future<void> moveCorner(int index, int delta) =>
      _editBoundary(state.boundary.move(index, delta));

  /// Deletes the last corner of the list. The logger keeps its `corner`
  /// line; the new list leaves the corner out.
  Future<void> deleteLastCorner() => _editBoundary(state.boundary.removeLast());

  /// Note, boundary markers and an optional new photo for a corner.
  Future<void> describeCorner(
    String eventId, {
    String? note,
    required List<BoundaryMarker> markers,
    PendingShot? photo,
  }) {
    final trimmed = note?.trim();
    return _editBoundary(
      state.boundary.update(
        eventId,
        (c) => c.copyWith(
          note: () => trimmed == null || trimmed.isEmpty ? null : trimmed,
          markers: markers,
          photos: photo == null ? null : [...c.photos, photo.sha256],
        ),
      ),
      photo: photo,
      photoCornerId: eventId,
    );
  }

  /// Stores the edited list as a `boundary_corners` event (with the photo
  /// in the same transaction). Allowed until the visit is finished.
  Future<void> _editBoundary(
    BoundaryCorners next, {
    PendingShot? photo,
    String? photoCornerId,
  }) async {
    final sessionId = state.sessionId;
    if (sessionId == null ||
        (state.phase != SessionPhase.recording &&
            state.phase != SessionPhase.stopped)) {
      return;
    }
    if (identical(next, state.boundary) && photo == null) return;
    await ref
        .read(fieldRepositoryProvider)
        .saveBoundaryEdit(
          sessionId: sessionId,
          time: _now(),
          corners: next.snapshot(sessionId),
          photo: photo,
          photoCornerId: photoCornerId,
        );
    if (!ref.mounted) return;
    state = state.copyWith(boundary: next);
  }

  /// Called by the QR screen when the first QR frame is on screen: sends
  /// `qr_sync` with the displayed value and stores the event locally.
  Future<CommandResult> qrShown(
    QrMoment moment,
    String payload,
    GpsTimeReading time,
  ) async {
    final sessionId = state.sessionId;
    if (!state.isRecording || sessionId == null) {
      return CommandResult.notRecording;
    }
    final result = await ref
        .read(gnssLoggerProvider)
        .markEvent(MarkType.qrSync, payload);
    if (!ref.mounted) return result;
    // Stored even if the logger missed it: the pipeline reads the QR from the
    // video and only counts qr_sync events.
    await ref
        .read(fieldRepositoryProvider)
        .addEvent(
          sessionId: sessionId,
          eventType: 'qr_sync',
          payload: payload,
          time: time,
          loggerResult: result.name,
        );
    if (!ref.mounted) return result;
    state = switch (moment) {
      QrMoment.start => state.copyWith(startQrShown: true),
      QrMoment.end => state.copyWith(endQrShown: true),
    };
    return result;
  }

  /// Stops recording. A logger that already stopped by itself (SD full or
  /// error) answers `not_recording`, which still closes the local session.
  Future<bool> stop() async {
    final sessionId = state.sessionId;
    if (!state.isRecording || sessionId == null || state.busy) return false;
    state = state.copyWith(
      phase: SessionPhase.stopping,
      busy: true,
      error: () => null,
    );
    final time = _now();
    final result = await ref.read(gnssLoggerProvider).stopSession();
    if (!ref.mounted) return false;
    if (!result.isOk && result != CommandResult.notRecording) {
      state = state.copyWith(
        phase: SessionPhase.recording,
        busy: false,
        error: () => 'Kayıt durmadı: ${result.message}',
      );
      return false;
    }
    _stopTrack();
    final repo = ref.read(fieldRepositoryProvider);
    final tracker = _tracker;
    if (tracker != null && tracker.summary.trackPoints > 0) {
      final summary = tracker.summary;
      await repo.addEvent(
        sessionId: sessionId,
        eventType: 'coverage',
        payload: '${summary.slotsCovered}/${summary.slotsTotal}',
        time: time,
        loggerResult: 'none',
        data: summary.toJson(),
      );
    }
    await repo.addEvent(
      sessionId: sessionId,
      eventType: 'session_stop',
      payload: 'command',
      time: time,
      loggerResult: result.name,
    );
    await repo.stopSession(
      sessionId,
      stoppedAt: ref.read(clockProvider).now(),
      stopGpsTimeMs: time.gpsTimeMs,
    );
    if (!ref.mounted) return true;
    state = state.copyWith(phase: SessionPhase.stopped, busy: false);
    return true;
  }

  /// Closes the visit after the summary.
  Future<void> finish() async {
    final sessionId = state.sessionId;
    final task = state.task;
    if (sessionId != null) {
      await ref.read(fieldRepositoryProvider).closeSession(sessionId);
    }
    if (!ref.mounted) return;
    if (task != null) ref.read(completedTasksProvider.notifier).add(task.id);
    _stopTrack();
    _tracker = null;
    state = const SessionState();
    // Send what the visit produced while the crew may still have signal.
    ref.read(syncWorkerProvider)?.syncNow().ignore();
  }

  GpsTimeReading _now() => ref.read(gpsClockProvider).now();
}

/// Tasks that have a recording on this phone (kept in the local database,
/// so they stay done after a restart).
final recordedTasksProvider = StreamProvider<Set<String>>(
  (ref) => ref.watch(fieldRepositoryProvider).watchRecordedTaskIds(),
);

/// Tasks finished on this device in this run of the app.
final completedTasksProvider = NotifierProvider<CompletedTasks, Set<String>>(
  CompletedTasks.new,
);

class CompletedTasks extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  void add(String taskId) => state = {...state, taskId};
}
