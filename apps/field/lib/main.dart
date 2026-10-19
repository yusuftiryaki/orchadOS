import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/db/database.dart';
import 'core/media/field_camera.dart';
import 'core/media/media_store.dart';
import 'core/media/plugin_field_camera.dart';
import 'features/auth/auth_repository.dart';
import 'features/gnss/fake_gnss_logger.dart';
import 'features/gnss/flutter_blue_gnss_logger.dart';
import 'features/gnss/gnss_logger.dart';

/// Build-time settings (`--dart-define`):
/// - `SUPABASE_URL`, `SUPABASE_KEY`: sign in against Supabase; without them
///   the app uses the offline development users.
/// - `FAKE_GNSS=true`: simulated logger instead of BLE (emulator, demos).
/// - `FAKE_CAMERA=true`: synthetic photos instead of the camera (demos).
const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseKey = String.fromEnvironment('SUPABASE_KEY');
const _fakeGnss = bool.fromEnvironment('FAKE_GNSS');
const _fakeCamera = bool.fromEnvironment('FAKE_CAMERA');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  AuthRepository auth;
  if (_supabaseUrl.isNotEmpty && _supabaseKey.isNotEmpty) {
    await Supabase.initialize(url: _supabaseUrl, publishableKey: _supabaseKey);
    auth = SupabaseAuthRepository(Supabase.instance.client);
  } else {
    auth = DevAuthRepository();
  }

  final docs = await getApplicationDocumentsDirectory();
  final GnssLogger logger = _fakeGnss
      ? FakeGnssLogger(autoTick: true)
      : FlutterBlueGnssLogger();

  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(AppDatabase.open()),
        gnssLoggerProvider.overrideWithValue(logger),
        cameraProvider.overrideWithValue(
          _fakeCamera ? FakeFieldCamera() : PluginFieldCamera(),
        ),
        mediaStoreProvider.overrideWithValue(
          FileMediaStore(Directory(p.join(docs.path, 'media'))),
        ),
        authRepositoryProvider.overrideWithValue(auth),
      ],
      child: const FieldApp(),
    ),
  );
}
