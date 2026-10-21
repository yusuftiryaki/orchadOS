import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/widgets.dart';
import '../boundary/boundary_screen.dart';
import '../closeup/closeup_list_screen.dart';
import '../gnss/gnss_panel.dart';
import '../qr_clock/qr_clock_screen.dart';
import '../summary/visit_summary_screen.dart';
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

    return PopScope(
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
