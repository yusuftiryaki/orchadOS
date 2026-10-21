import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/geo/geo.dart';
import '../map/vector_map.dart';
import '../session/session_controller.dart';
import 'grid_route.dart';
import 'route_guide.dart';
import 'route_view.dart';

/// The route while scanning: the next corridor and the way to it, what is
/// left, skip / back, the "dur-çek-yürü" switch. The corridors themselves
/// are drawn on the coverage map ([routeLines]).
class RouteCard extends ConsumerWidget {
  const RouteCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final view = state.route;
    if (view == null || state.task == null) return const SizedBox.shrink();
    final controller = ref.read(sessionControllerProvider.notifier);
    final route = view.route;
    return Card(
      key: const Key('route-card'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Rota',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            if (route == null)
              Text(
                state.task!.isInventory
                    ? 'Rota için parselin sınırı gerekli: önce Sınır '
                          'adımında köşeleri işaretleyin.'
                    : 'Parselin sınırı da yer konumları da yok; rota '
                          'çizilemiyor.',
                key: const Key('route-missing'),
                style: const TextStyle(fontSize: 16),
              )
            else if (!view.committed)
              _Proposal(view: view, route: route, controller: controller)
            else
              _Guidance(view: view, route: route, controller: controller),
            if (route != null && view.committed) ...[
              const Divider(height: 20),
              _StopGo(view: view, controller: controller),
            ],
          ],
        ),
      ),
    );
  }
}

class _Proposal extends StatelessWidget {
  const _Proposal({
    required this.view,
    required this.route,
    required this.controller,
  });

  final RouteView view;
  final GridRoute route;
  final SessionController controller;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        route.azimuthSource == AzimuthSource.crew
            ? 'Sıra yönü sizin işaretlediğiniz gibi.'
            : 'Sıra yönü sınırın en uzun kenarından tahmin edildi.',
        key: const Key('route-proposal'),
        style: const TextStyle(fontSize: 16),
      ),
      Text(
        '${route.corridors.length} koridor · sıra aralığı '
        '${_decimal(route.rowSpacingM)} m (tahmini). Haritadaki çizgiler '
        'sıralara paralel değilse yönü düzeltin.',
      ),
      const SizedBox(height: 8),
      if (view.settingDirection)
        Text(
          view.firstTap == null
              ? 'Haritada bir sıranın bir ucuna dokunun (1 / 2).'
              : 'Şimdi aynı sıranın öbür ucuna dokunun (2 / 2).',
          key: const Key('route-direction-hint'),
          style: TextStyle(fontSize: 16, color: Colors.indigo.shade800),
        ),
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('route-direction'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              icon: const Icon(Icons.straighten),
              label: Text(view.settingDirection ? 'Vazgeç' : 'Yönü düzelt'),
              onPressed: view.settingDirection
                  ? controller.cancelDirection
                  : controller.startDirection,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton.icon(
              key: const Key('route-use'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              icon: const Icon(Icons.check),
              label: const Text('Rotayı kullan'),
              onPressed: view.settingDirection ? null : controller.useRoute,
            ),
          ),
        ],
      ),
    ],
  );
}

class _Guidance extends StatelessWidget {
  const _Guidance({
    required this.view,
    required this.route,
    required this.controller,
  });

  final RouteView view;
  final GridRoute route;
  final SessionController controller;

  @override
  Widget build(BuildContext context) {
    final g = view.guidance;
    if (g == null) return const SizedBox.shrink();
    final done = g.statuses.where((s) => s == CorridorStatus.done).length;
    final skipped = g.statuses.where((s) => s == CorridorStatus.skipped).length;
    final i = g.current;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '$done / ${route.corridors.length} koridor bitti'
          '${skipped > 0 ? ' · $skipped atlandı' : ''}',
          key: const Key('route-progress'),
        ),
        if (i == null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              skipped > 0
                  ? 'Rota bitti; $skipped koridor atlandı.'
                  : 'Rota bitti.',
              key: const Key('route-finished'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
          )
        else ...[
          const SizedBox(height: 4),
          Text(
            '${route.corridors[i].no}. ${route.corridors[i].label}',
            key: const Key('route-current'),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          Text(route.corridors[i].kind.label),
          const SizedBox(height: 4),
          if (g.offCorridorM != null)
            Container(
              padding: const EdgeInsets.all(8),
              color: Colors.red.shade50,
              child: Text(
                key: const Key('route-off'),
                'Koridordan ${g.offCorridorM!.round()} m saptınız. '
                'Koridora dönün.',
                style: TextStyle(
                  fontSize: 17,
                  color: Colors.red.shade900,
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else if (!g.started)
            Text(
              g.toStartM == null
                  ? 'Koridorun başına gidin (konum bekleniyor).'
                  : g.toStartM! < 3
                  ? 'Koridorun başındasınız; yürümeye başlayın.'
                  : 'Koridorun başına ${_distance(g.toStartM!)}, '
                        '${Compass.of(g.toStartBearingDeg!).at}.',
              key: const Key('route-to-start'),
              style: const TextStyle(fontSize: 17),
            )
          else
            Text(
              'Koridorun %${(g.walkedShare * 100).floor()}’i yüründü.',
              key: const Key('route-walked'),
              style: const TextStyle(fontSize: 17),
            ),
          const SizedBox(height: 4),
          Text(
            'Kalan: ${g.remainingCorridors} koridor · '
            '${_distance(g.remainingM)} · ${_duration(g.remaining)}',
            key: const Key('route-remaining'),
          ),
        ],
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const Key('route-back'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
                icon: const Icon(Icons.undo),
                label: const Text('Önceki koridor'),
                onPressed: (i ?? route.corridors.length) > 0
                    ? controller.previousCorridor
                    : null,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                key: const Key('route-skip'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
                icon: const Icon(Icons.skip_next),
                label: const Text('Atla'),
                onPressed: i == null ? null : controller.skipCorridor,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _StopGo extends StatelessWidget {
  const _StopGo({required this.view, required this.controller});

  final RouteView view;
  final SessionController controller;

  @override
  Widget build(BuildContext context) {
    final stopNow = view.stopUntil != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SwitchListTile(
          key: const Key('route-stopgo'),
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Dur-çek-yürü',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text('Taşlı bölümler: her 4 m’de bip, 2 sn durun'),
          value: view.stopGo,
          onChanged: controller.setStopGo,
        ),
        if (view.stopGo)
          Container(
            key: const Key('route-stopgo-indicator'),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: stopNow ? Colors.red.shade700 : Colors.grey.shade200,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              stopNow
                  ? 'DUR · 2 sn'
                  : 'Yürü · sonraki bip ${_decimal(view.toNextBeepM ?? 4)} m'
                        ' · ${view.beeps} bip',
              key: Key(stopNow ? 'route-stop-now' : 'route-walk-now'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: stopNow ? Colors.white : Colors.black87,
              ),
            ),
          ),
      ],
    );
  }
}

/// Corridors for the coverage map: the current one highlighted, done ones
/// faded, skipped ones dashed red, the rest thin; a proposal dashed.
List<MapLine> routeLines(RouteView? view) {
  final route = view?.route;
  if (view == null || route == null) return const [];
  final g = view.guidance;
  if (!view.committed || g == null) {
    return [
      for (final c in route.corridors)
        MapLine(
          c.points,
          color: Colors.indigo.withValues(alpha: 0.6),
          width: 2,
          dashed: true,
        ),
    ];
  }
  final lines = <MapLine>[];
  for (var i = 0; i < route.corridors.length; i++) {
    if (i == g.current) continue;
    final c = route.corridors[i];
    lines.add(switch (g.statuses[i]) {
      CorridorStatus.done => MapLine(
        c.points,
        color: Colors.green.withValues(alpha: 0.25),
        width: 3,
      ),
      CorridorStatus.skipped => MapLine(
        c.points,
        color: Colors.red.shade300,
        width: 2,
        dashed: true,
      ),
      CorridorStatus.pending => MapLine(
        c.points,
        color: Colors.indigo.withValues(alpha: 0.45),
        width: 2,
      ),
    });
  }
  if (g.current != null) {
    lines.add(
      MapLine(
        route.corridors[g.current!].points,
        color: Colors.blue.shade700,
        width: 6,
      ),
    );
  }
  return lines;
}

/// Map taps while the crew sets the row direction.
void Function(GeoPoint)? routeMapTap(RouteView? view, WidgetRef ref) =>
    view != null && view.settingDirection
    ? ref.read(sessionControllerProvider.notifier).tapMap
    : null;

String _decimal(double x) => x.toStringAsFixed(1).replaceAll('.', ',');

String _distance(double m) =>
    m < 1000 ? '${m.round()} m' : '${_decimal(m / 1000)} km';

String _duration(Duration d) {
  final min = (d.inSeconds / 60).round();
  if (min < 1) return '1 dk’dan az';
  if (min < 60) return '~$min dk';
  return '~${min ~/ 60} sa ${min % 60} dk';
}
