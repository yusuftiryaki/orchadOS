import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/time/gps_clock.dart';
import '../../core/ui/widgets.dart';
import '../boundary/boundary_corners.dart';
import '../boundary/boundary_screen.dart' show areaLabel;
import '../session/session_controller.dart';
import '../sync/sync_status_card.dart';

/// Numbers shown on the visit summary, read back from the local database.
class VisitSummary {
  const VisitSummary({
    required this.startedAt,
    required this.stoppedAt,
    required this.corners,
    this.boundaryAreaM2,
    required this.qrSyncs,
    required this.qrOnPhoneClock,
    required this.treesDone,
    required this.treesPlanned,
    required this.photos,
    required this.answers,
  });

  final DateTime? startedAt;
  final DateTime? stoppedAt;
  final int corners;

  /// Approximate area from the corners with a position; null below three.
  final double? boundaryAreaM2;
  final int qrSyncs;

  /// QR codes shown with the phone clock (no GPS time from the logger).
  final int qrOnPhoneClock;
  final int treesDone;
  final int treesPlanned;
  final int photos;
  final int answers;

  Duration? get duration => startedAt != null && stoppedAt != null
      ? stoppedAt!.difference(startedAt!)
      : null;
}

final visitSummaryProvider = FutureProvider.autoDispose<VisitSummary?>((
  ref,
) async {
  final state = ref.watch(sessionControllerProvider);
  final sessionId = state.sessionId;
  if (sessionId == null) return null;
  final repo = ref.watch(fieldRepositoryProvider);
  final session = await repo.session(sessionId);
  final events = await repo.events(sessionId);
  final captures = await repo.captures(sessionId);
  final measurements = await repo.measurements(sessionId);
  final qr = events.where((e) => e.eventType == 'qr_sync');
  final boundary = BoundaryCorners.fromEvents(events);
  return VisitSummary(
    startedAt: session?.startedAt,
    stoppedAt: session?.stoppedAt,
    corners: boundary.length,
    boundaryAreaM2: boundary.ring.length >= 3 ? boundary.areaM2 : null,
    qrSyncs: qr.length,
    qrOnPhoneClock: qr
        .where((e) => e.timeSource == TimeSource.phone.code)
        .length,
    treesDone: measurements.map((m) => m.subjectId).toSet().length,
    treesPlanned: state.task?.closeupTrees.length ?? 0,
    photos: captures.length,
    answers: measurements.length,
  );
});

class VisitSummaryScreen extends ConsumerWidget {
  const VisitSummaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final task = ref.watch(sessionControllerProvider).task;
    final summary = ref.watch(visitSummaryProvider);
    final sessionId = ref.watch(sessionControllerProvider).sessionId;
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ziyaret özeti'),
          automaticallyImplyLeading: false,
        ),
        body: summary.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Özet okunamadı: $e')),
          data: (s) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                task?.parcelName ?? '',
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text('${task?.kind.label ?? ''} · ${task?.season.label ?? ''}'),
              const SizedBox(height: 16),
              if (s != null)
                Card(
                  key: const Key('summary-card'),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        StatusLine(
                          icon: Icons.timer,
                          label: 'Kayıt süresi',
                          value: _duration(s.duration),
                          health: Health.ok,
                        ),
                        StatusLine(
                          icon: Icons.qr_code_2,
                          label: 'QR saat işareti',
                          value: '${s.qrSyncs}',
                          health: s.qrSyncs >= 2 ? Health.ok : Health.bad,
                        ),
                        if (s.qrOnPhoneClock > 0)
                          StatusLine(
                            icon: Icons.schedule,
                            label: 'Telefon saatiyle QR',
                            value: '${s.qrOnPhoneClock}',
                            health: Health.warn,
                          ),
                        if (task?.isInventory ?? false)
                          StatusLine(
                            icon: Icons.flag,
                            label: 'Sınır köşesi',
                            value: '${s.corners}',
                            health: s.corners >= 3 ? Health.ok : Health.warn,
                          ),
                        if ((task?.isInventory ?? false) &&
                            s.boundaryAreaM2 != null)
                          StatusLine(
                            icon: Icons.square_foot,
                            label: 'Yaklaşık alan',
                            value: areaLabel(s.boundaryAreaM2!),
                            health: Health.ok,
                          ),
                        StatusLine(
                          icon: Icons.park,
                          label: 'Yakın plan ağaç',
                          value: '${s.treesDone} / ${s.treesPlanned}',
                          health: s.treesDone >= s.treesPlanned
                              ? Health.ok
                              : Health.warn,
                        ),
                        StatusLine(
                          icon: Icons.photo,
                          label: 'Fotoğraf',
                          value: '${s.photos}',
                          health: Health.ok,
                        ),
                        StatusLine(
                          icon: Icons.question_answer,
                          label: 'Cevap',
                          value: '${s.answers}',
                          health: Health.ok,
                        ),
                      ],
                    ),
                  ),
                ),
              if (sessionId != null) ...[
                const SizedBox(height: 8),
                SyncStatusCard(sessionId: sessionId),
              ],
              const SizedBox(height: 8),
              const Text(
                'Kameranın hafıza kartını ve kaydedicinin SD kartını ofise '
                'getirin. Fotoğraf ve cevaplar internet olunca gönderilecek.',
                style: TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 24),
              BigButton(
                key: const Key('summary-finish'),
                icon: Icons.done_all,
                label: 'Ziyareti bitir',
                onPressed: () async {
                  await ref.read(sessionControllerProvider.notifier).finish();
                  if (context.mounted) {
                    Navigator.of(context).popUntil((r) => r.isFirst);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _duration(Duration? d) {
    if (d == null) return '—';
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    return h > 0 ? '$h sa $m dk' : '$m dk $s sn';
  }
}
