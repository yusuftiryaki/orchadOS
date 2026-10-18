import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/widgets.dart';
import '../session/session_controller.dart';
import '../summary/visit_summary_screen.dart';
import 'tree_observation_screen.dart';

final observedTreesProvider = StreamProvider.family<Set<String>, String>(
  (ref, sessionId) =>
      ref.watch(fieldRepositoryProvider).watchObservedTrees(sessionId),
);

/// Trees selected for close-up photos and questions.
class CloseupListScreen extends ConsumerWidget {
  const CloseupListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final trees = state.task?.closeupTrees ?? const [];
    final sessionId = state.sessionId;
    final done = sessionId == null
        ? const <String>{}
        : ref.watch(observedTreesProvider(sessionId)).value ?? const {};
    final remaining = trees.where((t) => !done.contains(t.treeId)).length;
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Yakın plan görevi'),
          automaticallyImplyLeading: false,
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                remaining == 0
                    ? 'Tüm ağaçlar tamam'
                    : '$remaining ağaç kaldı (${trees.length} ağaçtan)',
                key: const Key('closeup-remaining'),
                style: const TextStyle(fontSize: 20),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: trees.length,
                itemBuilder: (context, i) {
                  final t = trees[i];
                  final isDone = done.contains(t.treeId);
                  return Card(
                    child: ListTile(
                      key: Key('tree-${t.treeId}'),
                      minTileHeight: 80,
                      leading: Icon(
                        isDone ? Icons.check_circle : Icons.park_outlined,
                        size: 40,
                        color: isDone ? Colors.green.shade700 : null,
                      ),
                      title: Text(
                        t.slotCode,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        t.reason,
                        style: const TextStyle(fontSize: 16),
                      ),
                      trailing: isDone
                          ? null
                          : const Icon(Icons.chevron_right, size: 32),
                      onTap: isDone
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => TreeObservationScreen(tree: t),
                              ),
                            ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: BigButton(
                key: const Key('closeup-finish'),
                icon: Icons.summarize,
                label: 'Ziyaret özeti',
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute<void>(
                    builder: (_) => const VisitSummaryScreen(),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
