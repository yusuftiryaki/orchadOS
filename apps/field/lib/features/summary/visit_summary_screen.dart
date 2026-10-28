import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/time/gps_clock.dart';
import '../../core/ui/widgets.dart';
import '../boundary/boundary_corners.dart';
import '../boundary/boundary_screen.dart' show areaLabel;
import '../coverage/coverage.dart';
import '../notice/field_records.dart' show blockedVisitPhotoKind;
import '../notice/notice_widgets.dart';
import '../session/session_controller.dart';
import '../sync/sync_status_card.dart';
import 'visit_log.dart';

/// Numbers shown on the visit summary, read back from the local database.
class VisitSummary {
  const VisitSummary({
    required this.startedAt,
    required this.stoppedAt,
    required this.corners,
    this.boundaryAreaM2,
    required this.qrSyncs,
    this.coverage,
    this.route,
    required this.qrOnPhoneClock,
    required this.treesDone,
    required this.treesPlanned,
    required this.photos,
    required this.answers,
    this.visitLog,
  });

  /// Newest visit record (weather, equipment, problems); null until saved.
  final VisitLog? visitLog;

  final DateTime? startedAt;
  final DateTime? stoppedAt;
  final int corners;

  /// Approximate area from the corners with a position; null below three.
  final double? boundaryAreaM2;
  final int qrSyncs;

  /// `data` of the recording's `coverage` event; null without positions.
  final Map<String, Object?>? coverage;

  /// `data` of the recording's `route_progress` event; null without a route.
  final Map<String, Object?>? route;

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
  final coverage = events.where((e) => e.eventType == 'coverage').lastOrNull;
  final route = events.where((e) => e.eventType == 'route_progress').lastOrNull;
  final log = events.where((e) => e.eventType == 'visit_log').lastOrNull;
  final answers = measurements.where((m) => m.method == closeupQuestionMethod);
  final unseen = events.where((e) => e.eventType == closeupUnseenEvent);
  return VisitSummary(
    startedAt: session?.startedAt,
    stoppedAt: session?.stoppedAt,
    corners: boundary.length,
    boundaryAreaM2: boundary.ring.length >= 3 ? boundary.areaM2 : null,
    qrSyncs: qr.length,
    coverage: coverage?.dataJson == null
        ? null
        : (jsonDecode(coverage!.dataJson!) as Map).cast<String, Object?>(),
    route: route?.dataJson == null
        ? null
        : (jsonDecode(route!.dataJson!) as Map).cast<String, Object?>(),
    qrOnPhoneClock: qr
        .where((e) => e.timeSource == TimeSource.phone.code)
        .length,
    treesDone: {
      for (final m in answers) m.subjectId,
      for (final c in captures)
        if (c.kind == 'closeup_photo') c.subjectId,
    }.length,
    treesPlanned: state.task?.closeupTrees.length ?? 0,
    photos: captures.where((c) => c.kind != blockedVisitPhotoKind).length,
    // "Göremedim" counts as an answer.
    answers:
        answers.length +
        unseen.fold(
          0,
          (n, e) =>
              n +
              ((jsonDecode(e.dataJson!) as Map)['metric_codes'] as List).length,
        ),
    visitLog: log?.dataJson == null
        ? null
        : VisitLog.fromJson(
            (jsonDecode(log!.dataJson!) as Map).cast<String, Object?>(),
          ),
  );
});

class VisitSummaryScreen extends ConsumerWidget {
  const VisitSummaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final task = ref.watch(sessionControllerProvider).task;
    final summary = ref.watch(visitSummaryProvider);
    final sessionId = ref.watch(sessionControllerProvider).sessionId;
    final verbalNotice = ref.watch(
      sessionControllerProvider.select((s) => s.verbalNotice),
    );
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
                        ..._routeLines(s.route),
                        ..._coverageLines(s.coverage),
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
              if (s != null)
                Card(
                  child: ListTile(
                    key: const Key('summary-visit-log'),
                    leading: Icon(
                      s.visitLog == null ? Icons.edit_note : Icons.check_circle,
                      color: s.visitLog == null ? Colors.orange : Colors.green,
                      size: 36,
                    ),
                    title: const Text('Ziyaret kaydı'),
                    subtitle: Text(
                      s.visitLog == null
                          ? 'Hava, kamera seri numarası, sahada yaşanan sorunlar'
                          : [
                              VisitLog.skies[s.visitLog!.sky] ?? '',
                              if (s.visitLog!.tempC != null)
                                '${s.visitLog!.tempC} °C',
                              VisitLog.winds[s.visitLog!.wind] ?? '',
                            ].where((x) => x.isNotEmpty).join(' · '),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      final saved = await Navigator.of(context).push<bool>(
                        MaterialPageRoute(
                          builder: (_) => VisitLogScreen(initial: s.visitLog),
                        ),
                      );
                      if (saved == true) ref.invalidate(visitSummaryProvider);
                    },
                  ),
                ),
              const VerbalNoticeCard(),
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
                // The oral notice answer is recorded first (H01, T07).
                onPressed: verbalNotice == null && sessionId != null
                    ? null
                    : () async {
                        await ref
                            .read(sessionControllerProvider.notifier)
                            .finish();
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

  /// "Rota 12 / 14 koridor" and the skipped corridors.
  static List<Widget> _routeLines(Map<String, Object?>? r) {
    if (r == null) return const [];
    final total = r['corridors_total']! as int;
    final done = (r['done']! as List).length;
    final skipped = [
      for (final l in r['skipped_labels'] as List? ?? const []) '$l',
    ];
    final numbers = [for (final n in r['skipped']! as List) '$n'];
    return [
      StatusLine(
        icon: Icons.alt_route,
        label: 'Rota',
        value: '$done / $total koridor',
        health: done == total ? Health.ok : Health.warn,
      ),
      if (skipped.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 6),
          child: Text(
            'Atlanan koridorlar: '
            '${[for (var i = 0; i < skipped.length; i++) '${numbers[i]}. ${skipped[i]}'].join(', ')}.',
            key: const Key('summary-route-skipped'),
            style: TextStyle(fontSize: 16, color: Colors.orange.shade900),
          ),
        ),
    ];
  }

  /// "Kapsama %96 (4 m)" and the sentence; a warning below the threshold.
  static List<Widget> _coverageLines(Map<String, Object?>? c) {
    if (c == null) return const [];
    final total = c['slots_total']! as int;
    final km = ((c['track_length_m']! as num) / 1000)
        .toStringAsFixed(2)
        .replaceAll('.', ',');
    if (total == 0) {
      return [
        StatusLine(
          icon: Icons.route,
          label: 'İz',
          value: '$km km',
          health: Health.ok,
        ),
      ];
    }
    final ratio = (c['ratio']! as num).toDouble();
    final radius = (c['radius_m']! as num).toDouble();
    final threshold = (c['threshold']! as num).toDouble();
    final ok = ratio >= threshold;
    return [
      StatusLine(
        icon: Icons.grid_on,
        label: 'Kapsama',
        value: '%${(ratio * 100).floor()} (${radius.toStringAsFixed(0)} m)',
        health: ok ? Health.ok : Health.bad,
      ),
      Padding(
        padding: const EdgeInsets.only(left: 8, bottom: 6),
        child: Text(
          '${CoverageSummary.coverageSentence(ratio, radius)}.',
          key: const Key('summary-coverage'),
          style: const TextStyle(fontSize: 16),
        ),
      ),
      if (!ok)
        Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 6),
          child: Text(
            'Kapsama %${(threshold * 100).round()} hedefinin altında. '
            'Kaçırılan yerler: ${_codes(c['uncovered_slot_codes'])}. '
            'Ofise bildirin; gerekirse yeniden tarama planlanır.',
            key: const Key('summary-coverage-warning'),
            style: TextStyle(fontSize: 16, color: Colors.red.shade800),
          ),
        ),
    ];
  }

  static String _codes(Object? list) {
    final codes = [for (final c in list as List? ?? const []) '$c'];
    if (codes.length <= 8) return codes.join(', ');
    return '${codes.take(8).join(', ')} ve ${codes.length - 8} yer daha';
  }

  static String _duration(Duration? d) {
    if (d == null) return '—';
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    return h > 0 ? '$h sa $m dk' : '$m dk $s sn';
  }
}
