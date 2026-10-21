import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/login_screen.dart';
import '../features/tasks/today_screen.dart';
import 'providers.dart';
import 'theme.dart';

class FieldApp extends ConsumerWidget {
  const FieldApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keep the GPS clock alive so it collects samples from app start.
    ref.watch(gpsClockProvider);
    final user = ref.watch(currentUserProvider);
    // Signed in: start the sync (first pass now, then on network changes).
    if (user != null) ref.watch(syncWorkerProvider);
    return MaterialApp(
      title: 'orchadOS Saha',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      locale: const Locale('tr', 'TR'),
      home: user == null ? const LoginScreen() : const TodayScreen(),
    );
  }
}
