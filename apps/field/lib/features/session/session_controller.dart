import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/db/outbox.dart';
import '../../core/geo/geo.dart';
import '../../core/time/gps_clock.dart';
import '../boundary/boundary_corners.dart';
import '../checklist/scan_setup.dart';
import '../coverage/coverage.dart';
import '../gnss/gnss_logger.dart';
import '../gnss/protocol/command_result.dart';
import '../gnss/protocol/gnss_command.dart';
import '../notice/field_records.dart';
import '../route/grid_route.dart';
import '../route/route_guide.dart';
import '../route/route_store.dart';
import '../route/route_view.dart';
import '../summary/visit_log.dart';
import '../tasks/closeup_selection.dart';
import '../tasks/field_task.dart';

enum SessionPhase { idle, starting, recording, stopping, stopped }

/// Pre-check answer on spraying (docs/uzman-ajan-onerileri.md, 5/15). Only
/// these two let the crew in; recorded on the `session_start` event.
enum SprayingCheck {
  none('none', 'Son günlerde ilaçlama yapılmadı'),
  waitingPassed(
    'waiting_period_passed',
    'İlaçlama yapıldı, tekrar giriş süresi geçti',
  );

  const SprayingCheck(this.code, this.label);
  final String code;
  final String label;
}

/// Pre-check answer on the harvest, asked on harvest-season scans
/// (methodology v0.2, docs/metodoloji.md section 2): the crew does not enter
/// while the harvest is under way, so there is no such answer. Gleaning
/// (çöpleme: picking up the nuts left on the ground and on the trees) may
/// still go on; the expert reads leftover clusters and heaps with it.
/// Recorded on the `session_start` event (`data.precheck.harvest`).
enum HarvestCheck {
  gleaningDone('gleaning_done', 'Hasat bitti, çöpleme de bitti'),
  gleaningOngoing('gleaning_ongoing', 'Hasat bitti, çöpleme sürüyor'),
  noGleaning('no_gleaning', 'Hasat bitti, çöpleme yapılmayacak');

  const HarvestCheck(this.code, this.label);
  final String code;
  final String label;
}

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
    this.route,
    this.busy = false,
    this.error,
    this.problemTrees = const {},
    this.verbalNotice,
    this.objections = 0,
    this.pointerName,
    this.pointerRole,
  });

  final FieldTask? task;

  /// Newest "sözlü bilgi" answer of this recording; null until given.
  final VerbalNotice? verbalNotice;

  /// "Bir kişi itiraz etti" records of this recording.
  final int objections;

  /// Newest person recorded as showing the boundary (inventory).
  final String? pointerName;
  final PointerRole? pointerRole;

  /// Trees marked "Sorun gördüm" during this recording.
  final Set<String> problemTrees;
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

  /// Grid route of the scan; null before the start and on tours.
  final RouteView? route;

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
    RouteView? route,
    bool? busy,
    String? Function()? error,
    Set<String>? problemTrees,
    VerbalNotice? verbalNotice,
    int? objections,
    String? pointerName,
    PointerRole? pointerRole,
  }) => SessionState(
    task: task ?? this.task,
    phase: phase ?? this.phase,
    sessionId: sessionId ?? this.sessionId,
    startedAt: startedAt ?? this.startedAt,
    startQrShown: startQrShown ?? this.startQrShown,
    endQrShown: endQrShown ?? this.endQrShown,
    boundary: boundary ?? this.boundary,
    coverage: coverage ?? this.coverage,
    route: route ?? this.route,
    busy: busy ?? this.busy,
    error: error != null ? error() : this.error,
    problemTrees: problemTrees ?? this.problemTrees,
    verbalNotice: verbalNotice ?? this.verbalNotice,
    objections: objections ?? this.objections,
    pointerName: pointerName ?? this.pointerName,
    pointerRole: pointerRole ?? this.pointerRole,
  );
}

/// Method version of the "Sorun gördüm" mark (`measurement.method_version`).
const problemMarkMethodVersion = 'scan-mark-v1';

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
  RouteGuide? _guide;
  StopGoWalk? _stopGo;
  double? _crewAzimuthDeg;

  /// Newest route of the parcel known on this phone (server or local).
  StoredRoute? _known;

  /// Selects the task the next session belongs to.
  void selectTask(FieldTask task) {
    _stopTrack();
    _resetRoute();
    _spraying = null;
    _harvest = null;
    _setup = null;
    _notice = null;
    state = SessionState(task: task);
  }

  void _resetRoute() {
    _tracker = null;
    _guide = null;
    _stopGo = null;
    _crewAzimuthDeg = null;
    _known = null;
  }

  /// Follows the logger's positions while recording (coverage map).
  void _startTrack(FieldTask task) {
    _stopTrack();
    final tracker = _tracker = CoverageTracker(
      task.slots,
      config: CoverageConfig.forVisit(task.kind),
    );
    final logger = ref.read(gnssLoggerProvider);
    void onStatus(GnssStatusSample s) {
      final p = s.status.position;
      if (p == null || !ref.mounted) return;
      tracker.add(p, s.receivedAt);
      _guide?.add(p);
      final beeped = _stopGo?.add(p) ?? false;
      if (beeped) ref.read(beeperProvider).beep().ignore();
      state = state.copyWith(
        coverage: _view(tracker),
        route: _routeView(beeped: beeped),
      );
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

  /// The route view after a change of the guide or the stop-go counter.
  RouteView? _routeView({bool beeped = false}) {
    final view = state.route;
    if (view == null) return null;
    final now = ref.read(clockProvider).now();
    final stop = _stopGo;
    final until = view.stopUntil;
    return view.copyWith(
      guidance: () => _guide?.guidance,
      beeps: stop?.beeps ?? view.beeps,
      toNextBeepM: () => stop?.toNextM,
      stopUntil: () => beeped && stop != null
          ? now.add(stop.stopFor)
          : until != null && now.isBefore(until)
          ? until
          : null,
    );
  }

  // --- Route ---------------------------------------------------------------

  /// The route of this visit. The parcel's stored route comes first, so
  /// that every visit walks the same corridors; otherwise a route (or a
  /// proposal) is laid out from what is known now. Routes whose direction
  /// came from the slots or the parcel record are used right away; a
  /// guessed or crew-set direction waits for [useRoute].
  Future<void> _prepareRoute() async {
    final task = state.task;
    if (task == null || task.isVerification || !state.isRecording) return;
    if (state.route?.committed ?? false) return;
    final known = _known;
    if (known != null && reuseRoute(known, task)) {
      state = state.copyWith(
        route: (state.route ?? const RouteView()).copyWith(
          route: () => known.route,
          missing: () => null,
        ),
      );
      return _commit(known, isNew: false);
    }
    final ring = state.boundary.ring;
    final g = generateGridRoute(
      RouteInput.forTask(
        task,
        walkedBoundary: ring.length >= 3 ? ring : null,
        crewAzimuthDeg: _crewAzimuthDeg,
      ),
    );
    final view = (state.route ?? const RouteView()).copyWith(
      route: () => g.route,
      missing: () => g.missing,
    );
    state = state.copyWith(route: view);
    if (g.route != null && !view.needsConfirmation) await useRoute();
  }

  /// The crew follows the laid-out route from now on. It is stored as the
  /// parcel's next route version (sent with the visit).
  Future<void> useRoute() async {
    final task = state.task;
    final view = state.route;
    final route = view?.route;
    if (task == null || view == null || route == null || view.committed) {
      return;
    }
    final known = _known;
    final id = routeId(task.parcelId, route.contentHash);
    if (known != null && known.id == id) return _commit(known, isNew: false);
    return _commit(
      StoredRoute(
        id: id,
        parcelId: task.parcelId,
        version: (known?.version ?? 0) + 1,
        route: route,
      ),
      isNew: true,
    );
  }

  Future<void> _commit(StoredRoute stored, {required bool isNew}) async {
    final sessionId = state.sessionId;
    final view = state.route;
    if (sessionId == null || view == null || view.committed) return;
    final guide = _guide = RouteGuide(stored.route);
    final here = ref.read(gnssLoggerProvider).lastStatus?.status.position;
    if (here != null) guide.add(here);
    _known = stored;
    state = state.copyWith(
      route: view.copyWith(
        route: () => stored.route,
        committed: true,
        stored: () => stored,
        settingDirection: false,
        firstTap: () => null,
        guidance: () => guide.guidance,
      ),
    );
    await ref
        .read(fieldRepositoryProvider)
        .saveRouteUse(
          sessionId: sessionId,
          route: stored,
          isNew: isNew,
          time: _now(),
        );
  }

  /// Starts setting the row direction: two taps on the map along a row.
  void startDirection() {
    final view = state.route;
    if (view == null || view.committed) return;
    state = state.copyWith(
      route: view.copyWith(settingDirection: true, firstTap: () => null),
    );
  }

  void cancelDirection() {
    final view = state.route;
    if (view == null) return;
    state = state.copyWith(
      route: view.copyWith(settingDirection: false, firstTap: () => null),
    );
  }

  /// A tap on the map while setting the direction.
  Future<void> tapMap(GeoPoint p) async {
    final view = state.route;
    if (view == null || !view.settingDirection) return;
    final first = view.firstTap;
    if (first == null) {
      state = state.copyWith(route: view.copyWith(firstTap: () => p));
      return;
    }
    final az = azimuthFromTaps(first, p);
    if (az == null) return;
    _crewAzimuthDeg = az;
    state = state.copyWith(
      route: view.copyWith(settingDirection: false, firstTap: () => null),
    );
    await _prepareRoute();
  }

  /// Leaves the current corridor; it is listed as skipped.
  void skipCorridor() {
    _guide?.skip();
    state = state.copyWith(route: _routeView());
  }

  /// Goes back to the previous corridor.
  void previousCorridor() {
    _guide?.back();
    state = state.copyWith(route: _routeView());
  }

  /// "Dur-çek-yürü" on or off; counting starts at the current position.
  void setStopGo(bool on) {
    final view = state.route;
    if (view == null) return;
    final here = ref.read(gnssLoggerProvider).lastStatus?.status.position;
    if (on) {
      (_stopGo ??= StopGoWalk()).reset(here);
    } else {
      _stopGo = null;
    }
    state = state.copyWith(
      route: view.copyWith(
        stopGo: on,
        toNextBeepM: () => _stopGo?.toNextM,
        stopUntil: () => null,
      ),
    );
  }

  void clearError() => state = state.copyWith(error: () => null);

  /// Answers of the pre-check that are recorded; go with the next start.
  SprayingCheck? _spraying;
  HarvestCheck? _harvest;
  ScanSetup? _setup;
  NoticeSign? _notice;

  void confirmPrecheck({
    required SprayingCheck spraying,
    required ScanPlatform platform,
    required double cameraHeightM,
    required NoticeSign notice,
    HarvestCheck? harvest,
  }) {
    _spraying = spraying;
    _harvest = harvest;
    _setup = ScanSetup(platform: platform, cameraHeightM: cameraHeightM);
    _notice = notice;
  }

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
    final existing = await repo.session(sessionId);
    // A visit recorded as blocked has a local row but no recording yet.
    if (existing != null && existing.status != blockedSessionStatus) {
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
      scanPlatform: _setup?.platform.code,
      cameraHeightM: _setup?.cameraHeightM,
    );
    final spraying = _spraying;
    final harvest = _harvest;
    final setup = _setup;
    final notice = _notice;
    final precheck = {
      if (spraying != null) 'spraying': spraying.code,
      if (harvest != null) 'harvest': harvest.code,
      if (setup != null) ...{
        'platform': setup.platform.code,
        'camera_height_m': setup.cameraHeightM,
      },
      // Also on the start event, so the answers survive a crash before the
      // field_notice_sign row below is written.
      if (notice != null) 'notice': notice.toJson(),
    };
    await repo.addEvent(
      sessionId: sessionId,
      eventType: 'session_start',
      payload: 'parcel_id=${task.parcelId}',
      time: time,
      loggerResult: result.name,
      data: precheck.isEmpty ? null : {'version': 1, 'precheck': precheck},
    );
    if (notice != null) {
      await repo.addFieldRecord(
        sessionId: sessionId,
        eventType: FieldRecordEvent.noticeSign,
        payload: notice.toPayload(),
        time: time,
      );
    }
    if (!ref.mounted) return true;
    state = state.copyWith(
      phase: SessionPhase.recording,
      sessionId: sessionId,
      startedAt: now,
      busy: false,
      route: const RouteView(),
    );
    _startTrack(task);
    _known = latestRoute(task.route, await repo.localRoute(task.parcelId));
    if (!ref.mounted) return true;
    await _prepareRoute();
    return true;
  }

  /// Slots with an active tree, nearest to the receiver first (by code when
  /// there is no position): the choices for "Sorun gördüm".
  List<SlotPoint> problemCandidates({int limit = 8}) {
    final slots = [
      for (final s in state.task?.slots ?? const <SlotPoint>[])
        if (s.treeId != null) s,
    ];
    final here = ref.read(gnssLoggerProvider).lastStatus?.status.position;
    int byCode(SlotPoint a, SlotPoint b) {
      final r = a.rowNo.compareTo(b.rowNo);
      return r != 0 ? r : a.positionNo.compareTo(b.positionNo);
    }

    if (here == null) return (slots..sort(byCode)).take(limit).toList();
    double d(SlotPoint s) =>
        s.position == null ? double.infinity : distanceM(here, s.position!);
    slots.sort((a, b) => d(a).compareTo(d(b)));
    return slots.take(limit).toList();
  }

  /// "Sorun gördüm": the crew saw something wrong on a tree while scanning.
  /// Records the mark and puts the tree on this visit's close-up list.
  Future<bool> markProblem(SlotPoint slot) async {
    final sessionId = state.sessionId;
    final task = state.task;
    final treeId = slot.treeId;
    if (sessionId == null || task == null || treeId == null) return false;
    if (state.problemTrees.contains(treeId)) return true;
    await ref
        .read(fieldRepositoryProvider)
        .saveProblemMark(
          sessionId: sessionId,
          treeId: treeId,
          methodVersion: problemMarkMethodVersion,
        );
    if (!ref.mounted) return false;
    state = state.copyWith(
      problemTrees: {...state.problemTrees, treeId},
      task: task.copyWith(
        closeupTrees: withProblemMarks(task.closeupTrees, [
          TreeTarget(treeId: treeId, slotCode: slot.code, reason: ''),
        ]),
      ),
    );
    return true;
  }

  /// Session of the current visit, while it can still take records.
  String? get _recordSession =>
      state.phase == SessionPhase.recording ||
          state.phase == SessionPhase.stopped
      ? state.sessionId
      : null;

  /// "Bahçede rastlanan kişilere sözlü bilgi verildi" (H01). A note is
  /// required for "not given". The newest answer counts.
  Future<bool> recordVerbalNotice(VerbalNotice answer, {String? note}) async {
    final sessionId = _recordSession;
    if (sessionId == null) return false;
    if (textError(
          note ?? '',
          maxLength: maxNoteLength,
          required: answer == VerbalNotice.notGiven,
        ) !=
        null) {
      return false;
    }
    await ref
        .read(fieldRepositoryProvider)
        .addFieldRecord(
          sessionId: sessionId,
          eventType: FieldRecordEvent.noticeVerbal,
          payload: verbalNoticePayload(answer, note: note),
          time: _now(),
        );
    if (!ref.mounted) return true;
    state = state.copyWith(verbalNotice: answer);
    return true;
  }

  /// "Bir kişi itiraz etti": the section is scanned later (H01).
  Future<bool> recordObjection(String note) async {
    final sessionId = _recordSession;
    if (sessionId == null) return false;
    if (textError(note, maxLength: maxNoteLength, required: true) != null) {
      return false;
    }
    await ref
        .read(fieldRepositoryProvider)
        .addFieldRecord(
          sessionId: sessionId,
          eventType: FieldRecordEvent.noticeObjection,
          payload: objectionPayload(note),
          time: _now(),
        );
    if (!ref.mounted) return true;
    state = state.copyWith(objections: state.objections + 1);
    return true;
  }

  /// Who shows the boundary: name and role, never the phone (H07, T16). The
  /// newest record counts.
  Future<bool> recordBoundaryPointer(String name, PointerRole role) async {
    final sessionId = _recordSession;
    if (sessionId == null || pointerNameError(name) != null) return false;
    await ref
        .read(fieldRepositoryProvider)
        .addFieldRecord(
          sessionId: sessionId,
          eventType: FieldRecordEvent.boundaryPointer,
          payload: boundaryPointerPayload(name, role),
          time: _now(),
        );
    if (!ref.mounted) return true;
    state = state.copyWith(pointerName: name.trim(), pointerRole: role);
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
    await _prepareRoute();
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
    await _prepareRoute();
  }

  /// Saves the visit record (weather, equipment, problems): a `visit_log`
  /// event, and the visit row is queued again so that the server's
  /// `session.weather` gets the weather. The newest record counts.
  Future<void> saveVisitLog(VisitLog log) async {
    final sessionId = state.sessionId;
    if (sessionId == null) return;
    final repo = ref.read(fieldRepositoryProvider);
    final session = await repo.session(sessionId);
    final full = VisitLog(
      sky: log.sky,
      tempC: log.tempC,
      wind: log.wind,
      loggerName: session?.loggerName,
      loggerFirmware: session?.loggerFirmware,
      cameraSerial: log.cameraSerial,
      issues: log.issues,
    );
    await repo.addEvent(
      sessionId: sessionId,
      eventType: 'visit_log',
      payload: '',
      time: _now(),
      loggerResult: 'none',
      data: full.toJson(),
    );
    await repo.outbox.enqueue(OutboxEntity.session, sessionId);
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
    final guide = _guide;
    if (guide != null) {
      final progress = guide.progressJson();
      await repo.addEvent(
        sessionId: sessionId,
        eventType: 'route_progress',
        payload:
            '${(progress['done']! as List).length}/'
            '${progress['corridors_total']}',
        time: time,
        loggerResult: 'none',
        data: progress,
      );
    }
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
    _resetRoute();
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
