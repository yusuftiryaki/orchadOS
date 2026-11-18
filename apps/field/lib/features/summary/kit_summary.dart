import 'package:flutter/material.dart';

import '../../core/ui/widgets.dart';
import '../gnss/protocol/gnss_status.dart';

/// "veri var, 2 boşluk (en uzun 4 sn), 900 MiB" or "veri yok", from the
/// kit's counters at the stop. The phone reads no files: the numbers come
/// from the status message.
String lidarSummaryLabel(KitStatus kit) {
  if (kit.lidarWrittenMib == 0) return 'veri yok';
  final gaps = kit.lidarGapCount == 0
      ? 'boşluk yok'
      : '${kit.lidarGapCount} boşluk (en uzun ${kit.lidarLongestGapS} sn)';
  return 'veri var, $gaps, ${kit.lidarWrittenMib} MiB';
}

/// LiDAR lines of the stop summary: data, skipped pre-check items and the
/// alerts of the recording. Kit recorder only; nothing for the ESP32.
class KitStopSummary extends StatelessWidget {
  const KitStopSummary({super.key, required this.kit, this.alerts = const []});

  final KitStatus? kit;
  final List<KitAlert> alerts;

  @override
  Widget build(BuildContext context) {
    final k = kit;
    if (k == null) return const SizedBox.shrink();
    final lidarSkipped = k.overrides.contains(KitCheck.lidar);
    return Column(
      key: const Key('kit-summary'),
      children: [
        StatusLine(
          icon: Icons.radar,
          label: 'LiDAR',
          value: lidarSummaryLabel(k),
          health: k.lidarWrittenMib == 0
              ? (lidarSkipped ? Health.warn : Health.bad)
              : k.lidarGapCount > 0
              ? Health.warn
              : Health.ok,
        ),
        if (k.overrides.isNotEmpty)
          StatusLine(
            icon: Icons.warning_amber,
            label: 'Atlanan',
            value: k.overrides.map((c) => c.label).join(', '),
            health: Health.warn,
          ),
        if (alerts.isNotEmpty)
          StatusLine(
            icon: Icons.notifications_active,
            label: 'Uyarılar',
            value: alerts.map((a) => a.label).join(', '),
            health: Health.warn,
          ),
      ],
    );
  }
}
