import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/widgets.dart';
import '../gnss/gnss_health.dart';
import '../gnss/gnss_logger.dart';
import '../gnss/gnss_panel.dart';
import '../gnss/protocol/gnss_status.dart';
import '../session/session_controller.dart';
import '../session/session_screen.dart';

/// Result of the pre-scan checklist.
class PrecheckResult {
  const PrecheckResult({
    required this.connected,
    required this.status,
    required this.lensClean,
    required this.cameraRecording,
    required this.spraying,
  });

  final bool connected;
  final GnssStatus? status;
  final bool lensClean;
  final bool cameraRecording;

  /// Null until the crew answers. There is no "not passed" answer: then the
  /// crew must not enter the orchard.
  final SprayingCheck? spraying;

  bool get batteryOk => status != null && batteryHealth(status!) == Health.ok;
  bool get sdOk => status != null && status!.sdReady;
  bool get gnssOk => status != null && gnssReady(status!);

  /// Every item must pass; the crew cannot skip the checklist.
  bool get allOk =>
      connected &&
      batteryOk &&
      sdOk &&
      gnssOk &&
      lensClean &&
      cameraRecording &&
      spraying != null;
}

/// Mandatory checklist before a scan (docs/MVP.md, Modül 3, "Ön kontrol").
/// Battery, SD card and GNSS come from the logger over BLE; lens and camera
/// are confirmed by the crew, and so is spraying: the crew states there was
/// none, or that the label's waiting period has passed. Only the spraying
/// answer is recorded (on `session_start`); the others only gate the start.
class PrecheckScreen extends ConsumerStatefulWidget {
  const PrecheckScreen({super.key});

  @override
  ConsumerState<PrecheckScreen> createState() => _PrecheckScreenState();
}

class _PrecheckScreenState extends ConsumerState<PrecheckScreen> {
  bool _lensClean = false;
  bool _cameraRecording = false;
  SprayingCheck? _spraying;

  @override
  Widget build(BuildContext context) {
    final task = ref.watch(sessionControllerProvider).task;
    final conn = ref.watch(gnssConnectionProvider).value;
    final status = ref.watch(gnssStatusProvider).value?.status;
    final result = PrecheckResult(
      connected: conn == GnssConnection.connected,
      status: status,
      lensClean: _lensClean,
      cameraRecording: _cameraRecording,
      spraying: _spraying,
    );
    return Scaffold(
      appBar: AppBar(title: Text(task?.parcelName ?? 'Ön kontrol')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Ön kontrol',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const GnssConnectBar(),
          _AutoItem(
            key: const Key('check-battery'),
            icon: Icons.battery_charging_full,
            title: 'Batarya',
            ok: result.batteryOk,
            detail: status == null ? 'Bilgi yok' : batteryLabel(status),
          ),
          _AutoItem(
            key: const Key('check-sd'),
            icon: Icons.sd_card,
            title: 'SD kart',
            ok: result.sdOk,
            detail: status == null ? 'Bilgi yok' : sdLabel(status),
          ),
          _AutoItem(
            key: const Key('check-gnss'),
            icon: Icons.satellite_alt,
            title: 'GNSS',
            ok: result.gnssOk,
            detail: status == null ? 'Bilgi yok' : gnssLabel(status),
          ),
          _ManualItem(
            key: const Key('check-lens'),
            icon: Icons.camera,
            title: 'Kamera lensleri temiz',
            value: _lensClean,
            onChanged: (v) => setState(() => _lensClean = v),
          ),
          _ManualItem(
            key: const Key('check-camera'),
            icon: Icons.videocam,
            title: 'Kamerada video kaydı başladı',
            value: _cameraRecording,
            onChanged: (v) => setState(() => _cameraRecording = v),
          ),
          _SprayingItem(
            value: _spraying,
            onChanged: (v) => setState(() => _spraying = v),
          ),
          const SizedBox(height: 8),
          const Text(
            'Şafakta, gün batımında, yağmurda ve yoğun tozda tarama yapılmaz.',
            style: TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 24),
          BigButton(
            key: const Key('precheck-continue'),
            icon: Icons.arrow_forward,
            label: 'Devam',
            onPressed: result.allOk
                ? () {
                    ref
                        .read(sessionControllerProvider.notifier)
                        .confirmPrecheck(spraying: result.spraying!);
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute<void>(
                        builder: (_) => const SessionScreen(),
                      ),
                    );
                  }
                : null,
          ),
        ],
      ),
    );
  }
}

class _AutoItem extends StatelessWidget {
  const _AutoItem({
    super.key,
    required this.icon,
    required this.title,
    required this.ok,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final bool ok;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final color = StatusLine.colorFor(ok ? Health.ok : Health.bad);
    return Card(
      child: ListTile(
        minTileHeight: 72,
        leading: Icon(icon, size: 36),
        title: Text(title, style: const TextStyle(fontSize: 20)),
        subtitle: Text(detail, style: const TextStyle(fontSize: 16)),
        trailing: Icon(
          ok ? Icons.check_circle : Icons.cancel,
          color: color,
          size: 36,
        ),
      ),
    );
  }
}

class _ManualItem extends StatelessWidget {
  const _ManualItem({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Card(
    child: CheckboxListTile(
      minTileHeight: 72,
      secondary: Icon(icon, size: 36),
      title: Text(title, style: const TextStyle(fontSize: 20)),
      value: value,
      onChanged: (v) => onChanged(v ?? false),
    ),
  );
}

/// "Son günlerde ilaçlama yapıldıysa ilacın bekleme süresi geçti", with the
/// way to say there was no spraying. Either answer passes.
class _SprayingItem extends StatelessWidget {
  const _SprayingItem({required this.value, required this.onChanged});

  final SprayingCheck? value;
  final ValueChanged<SprayingCheck?> onChanged;

  @override
  Widget build(BuildContext context) => Card(
    key: const Key('check-spraying'),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ListTile(
            leading: Icon(Icons.sanitizer, size: 36),
            title: Text(
              'Son günlerde ilaçlama yapıldıysa ilacın bekleme süresi geçti',
              style: TextStyle(fontSize: 20),
            ),
            subtitle: Text(
              'Bilmiyorsan bahçe sahibine sor. Bekleme süresi geçmediyse '
              'bahçeye girme.',
              style: TextStyle(fontSize: 16),
            ),
          ),
          for (final option in SprayingCheck.values)
            CheckboxListTile(
              key: Key('check-spraying-${option.code}'),
              minTileHeight: 60,
              title: Text(option.label, style: const TextStyle(fontSize: 18)),
              value: value == option,
              onChanged: (v) => onChanged(v == true ? option : null),
            ),
        ],
      ),
    ),
  );
}
