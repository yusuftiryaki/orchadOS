import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/app/theme.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/media/field_camera.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/sync/connectivity.dart';
import 'package:orchados_field/core/sync/sync_server.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/features/auth/auth_repository.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/route/beeper.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

/// Everything a widget test needs, with fakes for hardware.
class TestHarness {
  TestHarness({
    bool provideGpsTime = true,
    int phoneClockErrorMs = 0,
    List<SyntheticPhotoKind> photos = const [],
    CameraOpenResult cameraOpenResult = CameraOpenResult.ready,
    this.server,
    this.connectivity,
    TaskRepository Function(TestHarness h)? tasks,
  }) : clock = FakeClock(DateTime.utc(2026, 12, 3, 8, 30)),
       db = AppDatabase(NativeDatabase.memory()),
       camera = FakeFieldCamera(script: photos, openResult: cameraOpenResult),
       media = MemoryMediaStore(),
       beeper = FakeBeeper() {
    // Each test opens its own in-memory database.
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    logger = FakeGnssLogger(
      clock: clock,
      provideGpsTime: provideGpsTime,
      phoneClockErrorMs: phoneClockErrorMs,
    );
    container = ProviderContainer(
      overrides: [
        clockProvider.overrideWithValue(clock),
        databaseProvider.overrideWithValue(db),
        gnssLoggerProvider.overrideWithValue(logger),
        cameraProvider.overrideWithValue(camera),
        mediaStoreProvider.overrideWithValue(media),
        beeperProvider.overrideWithValue(beeper),
        // Same check, on the test isolate so that fake time controls it.
        photoQualityCheckerProvider.overrideWithValue(
          const PhotoQualityChecker(useIsolate: false),
        ),
        authRepositoryProvider.overrideWithValue(DevAuthRepository()),
        syncServerProvider.overrideWithValue(server),
        connectivityProvider.overrideWithValue(connectivity),
        if (tasks != null)
          taskRepositoryProvider.overrideWithValue(tasks(this)),
      ],
    );
    // Start collecting GPS time samples like FieldApp does.
    container.read(gpsClockProvider);
  }

  final FakeClock clock;
  final AppDatabase db;
  final FakeFieldCamera camera;
  final MemoryMediaStore media;
  final FakeBeeper beeper;

  /// Sync target; null = no server (offline development build).
  final SyncServer? server;
  final ConnectivityMonitor? connectivity;
  late final FakeGnssLogger logger;
  late final ProviderContainer container;

  Widget wrap(Widget child) => UncontrolledProviderScope(
    container: container,
    child: MaterialApp(theme: buildTheme(), home: child),
  );

  Future<void> dispose(WidgetTester tester) async {
    // Unmount first so stream providers cancel their database queries.
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
    container.dispose();
    await settle(tester);
    await tester.runAsync(() async {
      await logger.dispose();
      await db.close();
    });
  }
}

/// Counts beeps instead of playing them.
class FakeBeeper implements Beeper {
  int count = 0;

  @override
  Future<void> beep() async => count++;
}

/// Scrolls [finder] into view and taps it.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    // Not built yet by a lazy list: scroll the main list until it is.
    await tester.scrollUntilVisible(
      finder,
      300,
      scrollable: find.byType(Scrollable).first,
    );
  }
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
}

/// From a tree form: opens the camera for [shotCode], takes a picture and
/// waits for the quality check. Leaves the review step open.
Future<void> shoot(WidgetTester tester, String shotCode) async {
  await tapVisible(tester, find.byKey(Key('shot-$shotCode')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('camera-shutter')));
  await settle(tester);
  await tester.pumpAndSettle();
}

/// Takes a picture for [shotCode] and presses "Kullan".
Future<void> shootAndUse(WidgetTester tester, String shotCode) async {
  await shoot(tester, shotCode);
  await tester.tap(find.byKey(const Key('review-use')));
  await tester.pumpAndSettle();
  await settle(tester);
}

/// Lets logger replies, database writes and stream updates run. The
/// database does real asynchronous work, so part of the wait is real time.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump(const Duration(milliseconds: 20));
  }
}
