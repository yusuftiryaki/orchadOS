import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/audio/voice_recorder.dart';
import '../core/db/database.dart';
import '../core/db/field_repository.dart';
import '../core/db/outbox.dart';
import '../core/media/field_camera.dart';
import '../core/media/media_store.dart';
import '../core/quality/photo_quality.dart';
import '../core/sync/connectivity.dart';
import '../core/sync/sync_server.dart';
import '../core/sync/sync_worker.dart';
import '../core/time/clock.dart';
import '../core/time/gps_clock.dart';
import '../features/auth/auth_repository.dart';
import '../features/gnss/gnss_logger.dart';
import '../features/route/beeper.dart';
import '../features/tasks/task_repository.dart';

// Dependencies with platform implementations are overridden in main() and in
// tests; the defaults throw so a missing override is obvious.

final clockProvider = Provider<Clock>((ref) => const SystemClock());

final databaseProvider = Provider<AppDatabase>(
  (ref) => throw UnimplementedError('override databaseProvider'),
);

final gnssLoggerProvider = Provider<GnssLogger>(
  (ref) => throw UnimplementedError('override gnssLoggerProvider'),
);

final cameraProvider = Provider<FieldCamera>(
  (ref) => throw UnimplementedError('override cameraProvider'),
);

/// On-device photo quality check; runs in a separate isolate.
final photoQualityCheckerProvider = Provider<PhotoQualityChecker>(
  (ref) => const PhotoQualityChecker(),
);

/// Voice notes on close-up trees; the app overrides it with the microphone.
final voiceRecorderProvider = Provider<VoiceRecorder>(
  (ref) => FakeVoiceRecorder(),
);

final mediaStoreProvider = Provider<MediaStore>(
  (ref) => throw UnimplementedError('override mediaStoreProvider'),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => throw UnimplementedError('override authRepositoryProvider'),
);

/// Beep of the "dur-çek-yürü" mode.
final beeperProvider = Provider<Beeper>((ref) => const ToneBeeper());

final taskRepositoryProvider = Provider<TaskRepository>(
  (ref) => const FakeTaskRepository(),
);

final fieldRepositoryProvider = Provider<FieldRepository>(
  (ref) =>
      FieldRepository(ref.watch(databaseProvider), ref.watch(clockProvider)),
);

/// Signed-in operator; set by the login screen.
final currentUserProvider = NotifierProvider<CurrentUser, FieldUser?>(
  CurrentUser.new,
);

class CurrentUser extends Notifier<FieldUser?> {
  @override
  FieldUser? build() => ref.watch(authRepositoryProvider).currentUser;

  void set(FieldUser? user) => state = user;
}

final gnssStatusProvider = StreamProvider<GnssStatusSample>((ref) {
  final logger = ref.watch(gnssLoggerProvider);
  final controller = StreamController<GnssStatusSample>();
  final last = logger.lastStatus;
  if (last != null) controller.add(last);
  final sub = logger.statusStream.listen(controller.add);
  ref.onDispose(() {
    sub.cancel();
    controller.close();
  });
  return controller.stream;
});

final gnssConnectionProvider = StreamProvider<GnssConnection>((ref) {
  final logger = ref.watch(gnssLoggerProvider);
  final controller = StreamController<GnssConnection>()..add(logger.connection);
  final sub = logger.connectionChanges.listen(controller.add);
  ref.onDispose(() {
    sub.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Phone-side GPS clock fed by every status message that carries GPS time.
final gpsClockProvider = Provider<GpsClock>((ref) {
  final clock = GpsClock(clock: ref.watch(clockProvider));
  final logger = ref.watch(gnssLoggerProvider);
  void add(GnssStatusSample s) {
    final t = s.status.gpsTimeNs;
    if (t != null) {
      clock.addSample(loggerGpsTimeNs: t, phoneReceivedAt: s.receivedAt);
    }
  }

  final last = logger.lastStatus;
  if (last != null) add(last);
  final sub = logger.statusStream.listen(add);
  ref.onDispose(sub.cancel);
  return clock;
});

final pendingUploadsProvider = StreamProvider<int>(
  (ref) => ref.watch(fieldRepositoryProvider).outbox.watchPendingCount(),
);

/// Pending, sent and failed records over the whole queue.
final outboxCountsProvider = StreamProvider<OutboxCounts>(
  (ref) => ref.watch(fieldRepositoryProvider).outbox.watchCounts(),
);

/// The same for the records of one visit (summary screen).
final sessionOutboxCountsProvider = StreamProvider.family<OutboxCounts, String>(
  (ref, sessionId) =>
      ref.watch(fieldRepositoryProvider).outbox.watchSessionCounts(sessionId),
);

/// Server for the sync; null without Supabase (offline development): the
/// queue then only fills up.
final syncServerProvider = Provider<SyncServer?>((ref) => null);

/// Network state changes; null where no plugin is available (tests).
final connectivityProvider = Provider<ConnectivityMonitor?>((ref) => null);

/// Uploads the outbox. Null when there is no server.
///
/// Runs when it is created (the app opens with a signed-in user), when the
/// network comes back ([connectivityProvider]), when a visit is finished
/// and on "Şimdi gönder".
final syncWorkerProvider = Provider<SyncWorker?>((ref) {
  final server = ref.watch(syncServerProvider);
  if (server == null) return null;
  final worker = SyncWorker(
    repository: ref.watch(fieldRepositoryProvider),
    server: server,
    media: ref.watch(mediaStoreProvider),
    clock: ref.watch(clockProvider),
  );
  final online = ref
      .watch(connectivityProvider)
      ?.onlineChanges
      .where((up) => up)
      .listen((_) => worker.syncNow().ignore());
  ref.onDispose(() {
    online?.cancel();
    worker.dispose();
  });
  Future.microtask(() => worker.syncNow().ignore());
  return worker;
});

/// What the sync is doing (idle, sending, waiting for the network).
final syncActivityProvider = StreamProvider<SyncActivity>((ref) {
  final worker = ref.watch(syncWorkerProvider);
  if (worker == null) return const Stream.empty();
  final controller = StreamController<SyncActivity>()..add(worker.current);
  final sub = worker.activity.listen(controller.add);
  ref.onDispose(() {
    sub.cancel();
    controller.close();
  });
  return controller.stream;
});
