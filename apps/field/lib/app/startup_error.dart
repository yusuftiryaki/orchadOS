import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Shown instead of a blank screen when the app cannot start (release builds
/// otherwise stay on the white launch screen). The crew reads or photographs
/// the text and sends it to operations.
class StartupErrorApp extends StatelessWidget {
  const StartupErrorApp({super.key, required this.error, this.stack});

  final Object error;
  final StackTrace? stack;

  String get report => '$error\n\n${stack ?? ''}'.trim();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: SafeArea(
          child: ListView(
            key: const Key('startup-error'),
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Uygulama başlatılamadı',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Bu ekranın fotoğrafını ya da aşağıdaki metni operasyona '
                'gönderin.',
              ),
              const SizedBox(height: 12),
              Builder(
                builder: (context) => OutlinedButton.icon(
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: report)),
                  icon: const Icon(Icons.copy),
                  label: const Text('Metni kopyala'),
                ),
              ),
              const SizedBox(height: 12),
              SelectableText(
                report,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Runs [start]; if it throws, shows [StartupErrorApp] with the error.
Future<void> guardedStartup(Future<void> Function() start) async {
  try {
    await start().timeout(const Duration(seconds: 30));
  } catch (error, stack) {
    runApp(StartupErrorApp(error: error, stack: stack));
  }
}
