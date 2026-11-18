import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/device/wakelock.dart';
import '../../core/ui/widgets.dart';
import '../boundary/boundary_screen.dart';
import '../closeup/closeup_list_screen.dart';
import '../coverage/coverage_card.dart';
import '../gnss/gnss_panel.dart';
import '../gnss/protocol/gnss_status.dart';
import '../notice/notice_widgets.dart';
import '../qr_clock/qr_clock_screen.dart';
import '../route/route_card.dart';
import '../summary/kit_summary.dart';
import '../summary/visit_summary_screen.dart';
import '../tasks/field_task.dart';
import 'session_controller.dart';

/// Recording screen: start/stop, live GNSS panel, start and end QR, boundary
/// corners (inventory).
class SessionScreen extends ConsumerWidget {
  const SessionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final controller = ref.read(sessionControllerProvider.notifier);
    final task = state.task;
    final loggerStatus = ref.watch(gnssStatusProvider).value?.status;
    final loggerStopped =
        state.isRecording && loggerStatus != null && !loggerStatus.recording;
    // Kit recorder alerts, shown while they last (the controller sounds them).
    final kitAlerts = state.isRecording
        ? loggerStatus?.kit?.alerts ?? const <KitAlert>[]
        : const <KitAlert>[];

    ref.listen(sessionControllerProvider.select((s) => s.error), (_, error) {
      if (error != null) {
        showError(context, error);
        controller.clearError();
      }
    });

    void openQr(QrMoment m) => Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => QrClockScreen(moment: m)));
    void openBoundary() => Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => const BoundaryScreen()));

    return KeepScreenOn(
      on:
          state.phase == SessionPhase.recording ||
          state.phase == SessionPhase.stopping,
      child: PopScope(
        // Leaving while recording would orphan the logger session.
        canPop: state.phase == SessionPhase.idle,
        child: Scaffold(
          appBar: AppBar(
            title: Text(task?.parcelName ?? 'Oturum'),
            automaticallyImplyLeading: state.phase == SessionPhase.idle,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (kitAlerts.isNotEmpty) _KitAlertBanner(kitAlerts),
                const GnssConnectBar(),
                const GnssPanel(showRecording: true),
                if (loggerStopped)
                  Card(
                    color: Colors.red.shade50,
                    child: const ListTile(
                      leading: Icon(Icons.warning, color: Colors.red, size: 36),
                      title: Text(
                        'Kaydedici kaydı durdurdu (SD kart dolu ya da hatalı). '
                        'Bitiş QR’ını gösterip oturumu durdurun.',
                      ),
                    ),
                  ),
                if (state.isRecording && state.route != null) const RouteCard(),
                if (state.coverage != null) const CoverageCard(),
                const SizedBox(height: 16),
                ..._actions(
                  context,
                  ref,
                  state,
                  controller,
                  openQr,
                  openBoundary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _actions(
    BuildContext context,
    WidgetRef ref,
    SessionState state,
    SessionController controller,
    void Function(QrMoment) openQr,
    VoidCallback openBoundary,
  ) {
    const gap = SizedBox(height: 12);
    switch (state.phase) {
      case SessionPhase.idle:
      case SessionPhase.starting:
        return [
          BigButton(
            key: const Key('session-start'),
            icon: Icons.play_arrow,
            label: 'Kaydı başlat',
            busy: state.busy,
            color: Colors.green.shade700,
            onPressed: controller.start,
          ),
        ];
      case SessionPhase.recording:
      case SessionPhase.stopping:
        return [
          _Step(
            done: state.startQrShown,
            text: '1. Başlangıç QR’ını kameraya göster',
          ),
          BigButton(
            key: const Key('session-start-qr'),
            icon: Icons.qr_code_2,
            label: 'Başlangıç QR',
            onPressed: () => openQr(QrMoment.start),
          ),
          if (state.task?.isInventory ?? false) ...[
            gap,
            _Step(
              done: state.cornerCount >= 3,
              text: '2. Sınır boyunca yürü, her köşede "Köşe"ye bas',
            ),
            BigButton(
              key: const Key('session-boundary'),
              icon: Icons.flag,
              label: 'Sınır (${state.cornerCount} köşe)',
              color: Colors.indigo,
              onPressed: state.startQrShown ? openBoundary : null,
            ),
          ],
          if (state.task?.kind == VisitKind.periodic &&
              (state.task?.slots.any((s) => s.treeId != null) ?? false)) ...[
            gap,
            OutlinedButton.icon(
              key: const Key('session-problem'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(56),
                foregroundColor: Colors.orange.shade900,
              ),
              icon: const Icon(Icons.report_problem),
              label: Text(
                state.problemTrees.isEmpty
                    ? 'Sorun gördüm'
                    : 'Sorun gördüm (${state.problemTrees.length})',
                style: const TextStyle(fontSize: 18),
              ),
              onPressed: () => _pickProblemTree(context, state, controller),
            ),
          ],
          gap,
          const FieldInstructionCard(),
          gap,
          _Step(
            done: state.endQrShown,
            text: 'Tarama bitince bitiş QR’ını göster',
          ),
          BigButton(
            key: const Key('session-end-qr'),
            icon: Icons.qr_code_2,
            label: 'Bitiş QR',
            onPressed: state.startQrShown ? () => openQr(QrMoment.end) : null,
          ),
          gap,
          BigButton(
            key: const Key('session-stop'),
            icon: Icons.stop,
            label: 'Kaydı durdur',
            busy: state.busy,
            color: Colors.red.shade700,
            onPressed: state.endQrShown ? controller.stop : null,
          ),
        ];
      case SessionPhase.stopped:
        final hasTrees = state.task?.closeupTrees.isNotEmpty ?? false;
        return [
          const ListTile(
            leading: Icon(Icons.check_circle, color: Colors.green, size: 40),
            title: Text('Kayıt durdu. Kameradaki videoyu da durdurun.'),
          ),
          if (state.kitAtStop != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: KitStopSummary(
                  kit: state.kitAtStop,
                  alerts: state.kitAlertsSeen,
                ),
              ),
            ),
          const FieldInstructionCard(),
          if (state.task?.isInventory ?? false) ...[
            gap,
            OutlinedButton.icon(
              key: const Key('session-boundary-edit'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(56),
              ),
              icon: const Icon(Icons.flag),
              label: Text(
                'Sınır köşeleri (${state.cornerCount})',
                style: const TextStyle(fontSize: 18),
              ),
              onPressed: openBoundary,
            ),
          ],
          gap,
          BigButton(
            key: const Key('session-next'),
            icon: hasTrees ? Icons.photo_camera : Icons.summarize,
            label: hasTrees ? 'Yakın plan görevi' : 'Ziyaret özeti',
            onPressed: () => Navigator.of(context).pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => hasTrees
                    ? const CloseupListScreen()
                    : const VisitSummaryScreen(),
              ),
            ),
          ),
        ];
    }
  }
}

/// "Sorun gördüm": the crew picks the tree (nearest first) and the mark goes
/// on the close-up list of this visit.
Future<void> _pickProblemTree(
  BuildContext context,
  SessionState state,
  SessionController controller,
) async {
  final slots = controller.problemCandidates();
  final picked = await showModalBottomSheet<SlotPoint>(
    context: context,
    builder: (context) => SafeArea(
      child: ListView(
        key: const Key('problem-candidates'),
        shrinkWrap: true,
        children: [
          const ListTile(
            title: Text(
              'Hangi ağaçta sorun gördünüz?',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Text(
              'En yakın ağaçlar üstte. Yakın plan listesine eklenir.',
            ),
          ),
          for (final s in slots)
            ListTile(
              key: Key('problem-${s.code}'),
              leading: Icon(
                state.problemTrees.contains(s.treeId)
                    ? Icons.check_circle
                    : Icons.park,
              ),
              title: Text(s.code, style: const TextStyle(fontSize: 20)),
              onTap: () => Navigator.of(context).pop(s),
            ),
        ],
      ),
    ),
  );
  if (picked == null) return;
  final ok = await controller.markProblem(picked);
  if (ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${picked.code} yakın plan listesine eklendi')),
    );
  }
}

/// Live alerts of the kit recorder, in the alert colour, while they last.
class _KitAlertBanner extends StatelessWidget {
  const _KitAlertBanner(this.alerts);

  final List<KitAlert> alerts;

  @override
  Widget build(BuildContext context) => Card(
    key: const Key('kit-alert-banner'),
    color: StatusLine.colorFor(Health.bad),
    child: ListTile(
      minTileHeight: 72,
      leading: const Icon(Icons.warning, color: Colors.white, size: 36),
      title: Text(
        alerts.map((a) => a.label).join(' · '),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
  );
}

/// Keeps the phone's screen on while [on] and until it leaves the screen
/// (the phone sits on the handlebar; there is no background service).
class KeepScreenOn extends ConsumerStatefulWidget {
  const KeepScreenOn({super.key, required this.on, required this.child});

  final bool on;
  final Widget child;

  @override
  ConsumerState<KeepScreenOn> createState() => _KeepScreenOnState();
}

class _KeepScreenOnState extends ConsumerState<KeepScreenOn> {
  late final Wakelock _wakelock = ref.read(wakelockProvider);
  bool _enabled = false;

  void _apply() {
    if (widget.on == _enabled) return;
    _enabled = widget.on;
    (_enabled ? _wakelock.enable() : _wakelock.disable()).ignore();
  }

  @override
  void initState() {
    super.initState();
    _apply();
  }

  @override
  void didUpdateWidget(KeepScreenOn oldWidget) {
    super.didUpdateWidget(oldWidget);
    _apply();
  }

  @override
  void dispose() {
    if (_enabled) _wakelock.disable().ignore();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _Step extends StatelessWidget {
  const _Step({required this.done, required this.text});

  final bool done;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Icon(
          done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: done ? Colors.green.shade700 : null,
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 17))),
      ],
    ),
  );
}
