import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/ui/widgets.dart';
import '../checklist/precheck_screen.dart';
import '../session/session_controller.dart';
import '../sync/sync_status_card.dart';
import '../verification/verification_tour_screen.dart';
import 'field_task.dart';
import 'task_repository.dart';

final todaysTasksProvider = FutureProvider<TaskList>(
  (ref) => ref.watch(taskRepositoryProvider).todaysTasks(),
);

/// Today's parcels: inventory or periodic visit.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todaysTasksProvider);
    final done = {
      ...ref.watch(completedTasksProvider),
      ...?ref.watch(recordedTasksProvider).value,
    };
    final pending = ref.watch(pendingUploadsProvider).value ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bugünkü görevler'),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Chip(
              key: const Key('pending-uploads'),
              avatar: const Icon(Icons.cloud_upload_outlined),
              label: Text('$pending'),
            ),
          ),
          IconButton(
            tooltip: 'Çıkış',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authRepositoryProvider).signOut();
              ref.read(currentUserProvider.notifier).set(null);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(todaysTasksProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const SyncStatusCard(),
            const SizedBox(height: 12),
            ...tasks.when(
              loading: () => const [Center(child: CircularProgressIndicator())],
              error: (e, _) => [
                Text('Görevler yüklenemedi: $e', key: const Key('tasks-error')),
              ],
              data: (list) => [
                if (list.fromCache) _OfflineBanner(fetchedAt: list.fetchedAt),
                if (list.tasks.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: Text('Bugün görev yok')),
                  ),
                for (final t in list.tasks) ...[
                  _TaskCard(task: t, done: done.contains(t.id)),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends ConsumerWidget {
  const _TaskCard({required this.task, required this.done});

  final FieldTask task;
  final bool done;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final icon = switch (task.kind) {
      VisitKind.inventory => Icons.map_outlined,
      VisitKind.verification => Icons.fact_check_outlined,
      VisitKind.periodic => Icons.repeat,
    };
    var done = this.done;
    var detail =
        '${task.village} · ${task.areaDecare.toStringAsFixed(1)} '
        'dönüm · ${task.closeupTrees.length} yakın plan ağacı';
    if (task.isVerification) {
      // A tour is done when every item has a result on this phone; until
      // then it can be opened again (no recording, nothing to orphan).
      final results =
          ref
              .watch(verificationResultsProvider(task.visitId ?? task.id))
              .value ??
          const {};
      final total = task.verificationItems.length;
      final checked = task.verificationItems
          .where((i) => results.containsKey(i.id))
          .length;
      done = total > 0 && checked == total;
      detail = '${task.village} · $checked / $total kaleme bakıldı';
    }
    return Card(
      key: Key('task-${task.id}'),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: done
            ? null
            : () {
                if (task.isVerification) {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => VerificationTourScreen(task: task),
                    ),
                  );
                  return;
                }
                ref.read(sessionControllerProvider.notifier).selectTask(task);
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PrecheckScreen(),
                  ),
                );
              },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              IconBadge(
                icon: done ? Icons.check_circle : icon,
                color: done ? Brand.ok : null,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.parcelName,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${task.kind.label} · ${task.season.label}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: const TextStyle(fontSize: 16, color: Brand.muted),
                    ),
                    if (task.plannedDate != null || task.assignedToMe || done)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            if (task.plannedDate != null)
                              _plannedPill(
                                task.plannedDate!,
                                ref.read(clockProvider).now(),
                              ),
                            if (task.assignedToMe)
                              const Pill(
                                label: 'Size atanmış',
                                color: Brand.green,
                              ),
                            if (done)
                              const Pill(label: 'Tamamlandı', color: Brand.ok),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (!done)
                const Icon(Icons.chevron_right, size: 32, color: Brand.muted),
            ],
          ),
        ),
      ),
    );
  }
}

Widget _plannedPill(DateTime day, DateTime now) {
  final label = _plannedLabel(day, now);
  final late = label.startsWith('Gecikmiş');
  return Pill(label: label, color: late ? Brand.bad : Brand.muted);
}

String _plannedLabel(DateTime day, DateTime now) {
  now = now.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final d = DateTime(day.year, day.month, day.day);
  final diff = d.difference(today).inDays;
  if (diff == 0) return 'Bugün';
  if (diff == 1) return 'Yarın';
  final date =
      '${d.day.toString().padLeft(2, '0')}.'
      '${d.month.toString().padLeft(2, '0')}.${d.year}';
  return diff < 0 ? 'Gecikmiş: $date' : 'Planlanan gün: $date';
}

/// The server could not be reached: the list is the last downloaded one.
class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({this.fetchedAt});

  final DateTime? fetchedAt;

  @override
  Widget build(BuildContext context) {
    final at = fetchedAt?.toLocal();
    String two(int v) => v.toString().padLeft(2, '0');
    final when = at == null
        ? ''
        : ' (${two(at.day)}.${two(at.month)} ${two(at.hour)}:${two(at.minute)})';
    return Container(
      key: const Key('tasks-offline'),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4DC),
        border: Border.all(color: const Color(0xFFF3D899)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'Sunucuya ulaşılamadı. Son indirilen liste gösteriliyor$when.',
        style: const TextStyle(fontSize: 16),
      ),
    );
  }
}
