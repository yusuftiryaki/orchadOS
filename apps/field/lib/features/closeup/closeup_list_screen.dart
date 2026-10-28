import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/ui/widgets.dart';
import '../session/session_controller.dart';
import '../summary/visit_summary_screen.dart';
import 'closeup_protocol.dart';
import 'tree_observation_screen.dart';

final observedTreesProvider = StreamProvider.family<Set<String>, String>(
  (ref, sessionId) =>
      ref.watch(fieldRepositoryProvider).watchObservedTrees(sessionId),
);

/// Metric codes of the parcel questions answered in a session.
final parcelAnswersProvider = StreamProvider.family<Set<String>, String>(
  (ref, sessionId) =>
      ref.watch(fieldRepositoryProvider).watchParcelAnswers(sessionId),
);

/// Trees selected for close-up photos and questions, and the season's
/// parcel questions (asked once per visit).
class CloseupListScreen extends ConsumerWidget {
  const CloseupListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final task = state.task;
    final trees = task?.closeupTrees ?? const [];
    final sessionId = state.sessionId;
    final done = sessionId == null
        ? const <String>{}
        : ref.watch(observedTreesProvider(sessionId)).value ?? const {};
    final remaining = trees.where((t) => !done.contains(t.treeId)).length;
    final protocol = task == null
        ? null
        : CloseupProtocol.forSeason(task.season);
    final parcelQuestions = sessionId == null
        ? const <YesNoQuestion>[]
        : protocol?.parcelQuestions ?? const <YesNoQuestion>[];
    final answered = sessionId == null || parcelQuestions.isEmpty
        ? const <String>{}
        : ref.watch(parcelAnswersProvider(sessionId)).value ?? const {};
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
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final q in parcelQuestions)
                    _ParcelQuestionCard(
                      question: q,
                      answered: answered.contains(q.metricCode),
                      onAnswer: (answer) => ref
                          .read(fieldRepositoryProvider)
                          .saveParcelAnswer(
                            sessionId: sessionId!,
                            parcelId: task!.parcelId,
                            metricCode: q.metricCode,
                            answer: answer,
                            methodVersion: protocol!.version,
                          ),
                    ),
                  for (final t in trees)
                    Card(
                      child: ListTile(
                        key: Key('tree-${t.treeId}'),
                        minTileHeight: 80,
                        leading: Icon(
                          done.contains(t.treeId)
                              ? Icons.check_circle
                              : Icons.park_outlined,
                          size: 40,
                          color: done.contains(t.treeId)
                              ? Colors.green.shade700
                              : null,
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
                        trailing: done.contains(t.treeId)
                            ? null
                            : const Icon(Icons.chevron_right, size: 32),
                        onTap: done.contains(t.treeId)
                            ? null
                            : () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => TreeObservationScreen(tree: t),
                                ),
                              ),
                      ),
                    ),
                ],
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

/// A question about the whole parcel (e.g. a new gap in the fence), answered
/// once while walking the parcel. A newer answer is a new record; the
/// expert reads the newest.
class _ParcelQuestionCard extends StatelessWidget {
  const _ParcelQuestionCard({
    required this.question,
    required this.answered,
    required this.onAnswer,
  });

  final YesNoQuestion question;
  final bool answered;
  final ValueChanged<StaffAnswer> onAnswer;

  @override
  Widget build(BuildContext context) => Card(
    key: Key('parcel-q-${question.metricCode}'),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                answered ? Icons.check_circle : Icons.fence,
                size: 36,
                color: answered ? Colors.green.shade700 : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Parsel: ${question.text}',
                  style: const TextStyle(fontSize: 20),
                ),
              ),
            ],
          ),
          if (!answered) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                for (final (i, (value, label)) in question.choices.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      key: Key(
                        'parcel-q-${question.metricCode}-'
                        '${(value as YesNoAnswer).value ? 'yes' : 'no'}',
                      ),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(60),
                        textStyle: const TextStyle(fontSize: 20),
                      ),
                      onPressed: () => onAnswer(value),
                      child: Text(label),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              key: Key('parcel-q-${question.metricCode}-unseen'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
                textStyle: const TextStyle(fontSize: 20),
              ),
              onPressed: () => onAnswer(const UnseenAnswer()),
              child: const Text('Göremedim'),
            ),
          ],
        ],
      ),
    ),
  );
}
