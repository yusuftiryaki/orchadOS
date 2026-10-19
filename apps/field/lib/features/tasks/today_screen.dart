import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../checklist/precheck_screen.dart';
import '../session/session_controller.dart';
import 'field_task.dart';

final todaysTasksProvider = FutureProvider<List<FieldTask>>(
  (ref) => ref.watch(taskRepositoryProvider).todaysTasks(),
);

/// Today's parcels: inventory or periodic visit.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todaysTasksProvider);
    final done = ref.watch(completedTasksProvider);
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
      body: tasks.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Görevler yüklenemedi: $e')),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Bugün görev yok'))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) =>
                    _TaskCard(task: list[i], done: done.contains(list[i].id)),
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
    final icon = task.isInventory ? Icons.map_outlined : Icons.repeat;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: done
            ? null
            : () {
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
              Icon(done ? Icons.check_circle : icon, size: 48),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.parcelName,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${task.kind.label} · ${task.season.label}',
                      style: const TextStyle(fontSize: 18),
                    ),
                    Text(
                      '${task.village} · ${task.areaDecare.toStringAsFixed(1)} '
                      'dönüm · ${task.closeupTrees.length} yakın plan ağacı',
                    ),
                    if (done)
                      const Text(
                        'Tamamlandı',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
              ),
              if (!done) const Icon(Icons.chevron_right, size: 32),
            ],
          ),
        ),
      ),
    );
  }
}
