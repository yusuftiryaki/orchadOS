import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/time/gps_clock.dart';
import '../gnss/protocol/command_result.dart';
import '../gnss/protocol/gnss_command.dart';
import '../tasks/field_task.dart';

enum SessionPhase { idle, starting, recording, stopping, stopped }

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
    this.cornerCount = 0,
    this.busy = false,
    this.error,
  });

  final FieldTask? task;
  final SessionPhase phase;
  final String? sessionId;
  final DateTime? startedAt;
  final bool startQrShown;
  final bool endQrShown;
  final int cornerCount;

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
    int? cornerCount,
    bool? busy,
    String? Function()? error,
  }) => SessionState(
    task: task ?? this.task,
    phase: phase ?? this.phase,
    sessionId: sessionId ?? this.sessionId,
    startedAt: startedAt ?? this.startedAt,
    startQrShown: startQrShown ?? this.startQrShown,
    endQrShown: endQrShown ?? this.endQrShown,
    cornerCount: cornerCount ?? this.cornerCount,
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
  SessionState build() => const SessionState();

  /// Selects the task the next session belongs to.
  void selectTask(FieldTask task) => state = SessionState(task: task);

  void clearError() => state = state.copyWith(error: () => null);

  /// Starts recording on the logger and creates the local session.
  Future<bool> start() async {
    final task = state.task;
    if (task == null || state.phase != SessionPhase.idle || state.busy) {
      return false;
    }
    final repo = ref.read(fieldRepositoryProvider);
    final logger = ref.read(gnssLoggerProvider);
    final sessionId = repo.newId();
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
    return true;
  }

  /// Marks a boundary corner (inventory). The payload is the corner number.
  Future<bool> markCorner() async {
    final sessionId = state.sessionId;
    if (!state.isRecording || sessionId == null || state.busy) return false;
    final n = state.cornerCount + 1;
    state = state.copyWith(busy: true, error: () => null);
    final time = _now();
    final result = await ref
        .read(gnssLoggerProvider)
        .markEvent(MarkType.corner, '$n');
    if (!ref.mounted) return false;
    if (!result.isOk) {
      state = state.copyWith(
        busy: false,
        error: () => 'Köşe kaydedilemedi: ${result.message}',
      );
      return false;
    }
    await ref
        .read(fieldRepositoryProvider)
        .addEvent(
          sessionId: sessionId,
          eventType: 'corner',
          payload: '$n',
          time: time,
          loggerResult: result.name,
        );
    if (!ref.mounted) return true;
    state = state.copyWith(busy: false, cornerCount: n);
    return true;
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
    final repo = ref.read(fieldRepositoryProvider);
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
    state = const SessionState();
  }

  GpsTimeReading _now() => ref.read(gpsClockProvider).now();
}

/// Tasks finished on this device today.
final completedTasksProvider = NotifierProvider<CompletedTasks, Set<String>>(
  CompletedTasks.new,
);

class CompletedTasks extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  void add(String taskId) => state = {...state, taskId};
}
