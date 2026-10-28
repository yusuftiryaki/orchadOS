import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'app/startup_error.dart';
import 'core/audio/voice_recorder.dart';
import 'core/db/database.dart';
import 'core/media/field_camera.dart';
import 'core/media/media_store.dart';
import 'core/media/plugin_field_camera.dart';
import 'core/sync/connectivity.dart';
import 'core/sync/supabase_sync_server.dart';
import 'core/time/clock.dart';
import 'features/auth/auth_repository.dart';
import 'features/gnss/ble_gnss_logger.dart';
import 'features/gnss/fake_gnss_logger.dart';
import 'features/gnss/gnss_logger.dart';
import 'features/tasks/sample_parcel.dart';
import 'features/tasks/task_repository.dart';

/// Build-time settings (`--dart-define`):
/// - `SUPABASE_URL`, `SUPABASE_KEY`: sign in against Supabase, download the
///   planned visits and upload the outbox; without them the app uses the
///   offline development users and sample tasks, and nothing is uploaded.
/// - `FAKE_GNSS=true`: simulated logger instead of BLE (emulator, demos); it
///   walks the corridors of the synthetic sample parcel and sends positions.
/// - `FAKE_CAMERA=true`: synthetic photos instead of the camera (demos).
const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseKey = String.fromEnvironment('SUPABASE_KEY');
const _fakeGnss = bool.fromEnvironment('FAKE_GNSS');
const _fakeCamera = bool.fromEnvironment('FAKE_CAMERA');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await guardedStartup(_start);
}

Future<void> _start() async {
  final db = AppDatabase.open();
  final overrides = <Override>[];
  AuthRepository auth;
  if (_supabaseUrl.isNotEmpty && _supabaseKey.isNotEmpty) {
    await Supabase.initialize(url: _supabaseUrl, publishableKey: _supabaseKey);
    final client = Supabase.instance.client;
    auth = SupabaseAuthRepository(client);
    overrides.addAll([
      taskRepositoryProvider.overrideWithValue(
        CachedTaskRepository(
          source: SupabaseTaskSource(client),
          cache: TaskCacheStore(db),
          clock: const SystemClock(),
          userId: () => client.auth.currentUser?.id,
        ),
      ),
      syncServerProvider.overrideWithValue(SupabaseSyncServer(client)),
      connectivityProvider.overrideWithValue(PluginConnectivityMonitor()),
    ]);
  } else {
    auth = DevAuthRepository();
  }

  final docs = await getApplicationDocumentsDirectory();
  final GnssLogger logger = _fakeGnss
      ? FakeGnssLogger(autoTick: true, path: sampleWalk(start: DateTime.now()))
      : BleGnssLogger();

  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        gnssLoggerProvider.overrideWithValue(logger),
        cameraProvider.overrideWithValue(
          _fakeCamera ? FakeFieldCamera() : PluginFieldCamera(),
        ),
        if (!_fakeCamera)
          voiceRecorderProvider.overrideWithValue(MicVoiceRecorder()),
        mediaStoreProvider.overrideWithValue(
          FileMediaStore(Directory(p.join(docs.path, 'media'))),
        ),
        authRepositoryProvider.overrideWithValue(auth),
        ...overrides,
      ],
      child: const FieldApp(),
    ),
  );
}
