import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../map/vector_map.dart';
import '../session/session_controller.dart';
import 'coverage.dart';

/// Coverage while scanning: the parcel boundary and slots, the walked track
/// on top (offline vector drawing), the covered share and which corridors
/// are done.
class CoverageCard extends ConsumerWidget {
  const CoverageCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final task = state.task;
    final view = state.coverage;
    if (task == null || view == null) return const SizedBox.shrink();
    final s = view.summary;
    final located = [
      for (final sl in task.slots)
        if (sl.position != null) sl,
    ];
    final draft = state.boundary.ring;
    return Card(
      key: const Key('coverage-card'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Kapsama',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            VectorMap(
              key: const Key('coverage-map'),
              boundary: task.boundary,
              draft: task.boundary == null && draft.length >= 2 ? draft : null,
              dots: [
                for (final sl in located)
                  MapDot(
                    sl.position!,
                    color: view.covered.contains(sl.code)
                        ? Colors.green.shade600
                        : Colors.grey.shade500,
                    radius: 2.5,
                  ),
              ],
              tracks: view.tracks,
              here: view.here,
            ),
            const SizedBox(height: 8),
            CoverageText(summary: s),
            if (s.hasRowDirection) ...[
              const SizedBox(height: 8),
              _Corridors(
                title: 'Sıra boyunca: ${s.rowsDone} / ${s.rows.length} sıra',
                prefix: 'S',
                corridors: s.rows,
                threshold: s.config.threshold,
                keyPrefix: 'row',
              ),
              const SizedBox(height: 6),
              _Corridors(
                title:
                    'Dik koridorlar: ${s.crossDone} / '
                    '${s.crossCorridors.length}',
                prefix: '',
                corridors: s.crossCorridors,
                threshold: s.config.threshold,
                keyPrefix: 'cross',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The covered share in a sentence, with a warning below the threshold.
class CoverageText extends StatelessWidget {
  const CoverageText({super.key, required this.summary});

  final CoverageSummary summary;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    final sentence = s.sentence;
    final km = (s.trackLengthM / 1000).toStringAsFixed(2).replaceAll('.', ',');
    if (sentence == null || s.trackPoints == 0) {
      return Text(
        s.trackPoints == 0
            ? 'Kaydediciden konum gelmiyor; kapsama gösterilemiyor.'
            : 'Yer konumu yok; yalnızca iz çiziliyor ($km km).',
        key: const Key('coverage-text'),
        style: const TextStyle(fontSize: 16),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$sentence.',
          key: const Key('coverage-text'),
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        Text('${s.slotsCovered} / ${s.slotsTotal} yer · iz $km km'),
        if (s.belowThreshold)
          Text(
            'Hedef %${(s.config.threshold * 100).round()}: eksik yerler var.',
            key: const Key('coverage-warning'),
            style: TextStyle(color: Colors.orange.shade900),
          ),
      ],
    );
  }
}

class _Corridors extends StatelessWidget {
  const _Corridors({
    required this.title,
    required this.prefix,
    required this.corridors,
    required this.threshold,
    required this.keyPrefix,
  });

  final String title;
  final String prefix;
  final List<CorridorCoverage> corridors;
  final double threshold;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: const TextStyle(fontSize: 16)),
      const SizedBox(height: 4),
      Wrap(
        spacing: 4,
        runSpacing: 4,
        children: [
          for (final c in corridors)
            Container(
              key: Key('$keyPrefix-${c.no}'),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: c.ratio >= threshold
                    ? Colors.green.shade600
                    : c.covered > 0
                    ? Colors.amber.shade300
                    : Colors.grey.shade300,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$prefix${c.no}',
                style: TextStyle(
                  color: c.ratio >= threshold ? Colors.white : Colors.black87,
                ),
              ),
            ),
        ],
      ),
    ],
  );
}
