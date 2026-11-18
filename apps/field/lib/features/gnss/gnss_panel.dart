import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/widgets.dart';
import 'gnss_health.dart';
import 'gnss_logger.dart';

/// Connect button shown while the logger is not connected.
class GnssConnectBar extends ConsumerWidget {
  const GnssConnectBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn =
        ref.watch(gnssConnectionProvider).value ?? GnssConnection.disconnected;
    if (conn == GnssConnection.connected) return const SizedBox.shrink();
    final busy = conn != GnssConnection.disconnected;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: BigButton(
        key: const Key('gnss-connect'),
        icon: Icons.bluetooth_searching,
        label: busy ? '${conn.label}…' : 'Kaydediciye bağlan',
        busy: busy,
        onPressed: () => ref.read(gnssLoggerProvider).connect(),
      ),
    );
  }
}

/// Live GNSS / logger status (updated with every BLE notification).
class GnssPanel extends ConsumerWidget {
  const GnssPanel({super.key, this.showRecording = false});

  final bool showRecording;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn =
        ref.watch(gnssConnectionProvider).value ?? GnssConnection.disconnected;
    final sample = ref.watch(gnssStatusProvider).value;
    final gpsClock = ref.watch(gpsClockProvider);
    final s = sample?.status;
    final reading = gpsClock.now();
    return Card(
      key: const Key('gnss-panel'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            StatusLine(
              icon: Icons.bluetooth,
              label: 'Kaydedici',
              value: conn == GnssConnection.connected
                  ? (ref.read(gnssLoggerProvider).deviceName ?? conn.label)
                  : conn.label,
              health: conn == GnssConnection.connected ? Health.ok : Health.bad,
            ),
            if (s != null && conn == GnssConnection.connected) ...[
              if (showRecording)
                StatusLine(
                  icon: s.recording
                      ? Icons.fiber_manual_record
                      : Icons.stop_circle_outlined,
                  label: 'Kayıt',
                  value: s.recording
                      ? 'Sürüyor · ${(s.bytesWritten / 1048576).toStringAsFixed(1)} MB'
                      : 'Yok',
                  health: s.recording ? Health.ok : Health.warn,
                ),
              StatusLine(
                icon: Icons.satellite_alt,
                label: 'GNSS',
                value: gnssLabel(s),
                health: gnssHealth(s),
              ),
              StatusLine(
                icon: Icons.my_location,
                label: 'Doğruluk',
                value: '${s.carrierSolution.label} · ${accuracyLabel(s)}',
                health: accuracyHealth(s),
              ),
              StatusLine(
                icon: Icons.timer_outlined,
                label: 'PPS',
                value: s.ppsState.label,
                health: ppsHealth(s),
              ),
              StatusLine(
                icon: s.isKit ? Icons.storage : Icons.sd_card_outlined,
                label: storageName(s),
                value: sdLabel(s),
                health: sdHealth(s),
              ),
              if (batteryApplies(s))
                StatusLine(
                  icon: Icons.battery_std,
                  label: 'Batarya',
                  value: batteryLabel(s),
                  health: batteryHealth(s),
                ),
              if (s.kit case final kit?) ...[
                StatusLine(
                  key: const Key('gnss-panel-lidar'),
                  icon: Icons.radar,
                  label: 'LiDAR',
                  value: showRecording && kit.lidarGapCount > 0
                      ? '${lidarLabel(s)} · ${kit.lidarGapCount} boşluk'
                      : lidarLabel(s),
                  health: lidarHealth(s),
                ),
                StatusLine(
                  icon: Icons.av_timer,
                  label: 'Kit saati',
                  value: clockLabel(s),
                  health: clockHealth(s),
                ),
                // Overridden items stay visible for the whole recording.
                if (kit.overrides.isNotEmpty)
                  StatusLine(
                    key: const Key('gnss-panel-overrides'),
                    icon: Icons.warning_amber,
                    label: 'Atlanan',
                    value: kit.overrides.map((c) => c.label).join(', '),
                    health: Health.warn,
                  ),
              ],
            ],
            StatusLine(
              icon: Icons.schedule,
              label: 'Saat kaynağı',
              value: reading.source.label,
              health: reading.isFromGps ? Health.ok : Health.warn,
            ),
          ],
        ),
      ),
    );
  }
}
