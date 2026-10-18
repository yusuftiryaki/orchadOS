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
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/features/auth/auth_repository.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';

/// Everything a widget test needs, with fakes for hardware.
class TestHarness {
  TestHarness({bool provideGpsTime = true, int phoneClockErrorMs = 0})
    : clock = FakeClock(DateTime.utc(2026, 12, 3, 8, 30)),
      db = AppDatabase(NativeDatabase.memory()),
      camera = FakeFieldCamera(),
      media = MemoryMediaStore() {
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
        authRepositoryProvider.overrideWithValue(DevAuthRepository()),
      ],
    );
    // Start collecting GPS time samples like FieldApp does.
    container.read(gpsClockProvider);
  }

  final FakeClock clock;
  final AppDatabase db;
  final FakeFieldCamera camera;
  final MemoryMediaStore media;
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

/// Scrolls [finder] into view and taps it.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
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
