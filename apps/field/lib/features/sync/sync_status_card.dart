import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/outbox.dart';
import '../../core/sync/sync_worker.dart';

/// Upload state: pending, sent and failed records, what the sync is doing,
/// and "Şimdi gönder". With [sessionId] the counts cover that visit only
/// (summary screen).
class SyncStatusCard extends ConsumerWidget {
  const SyncStatusCard({super.key, this.sessionId});

  final String? sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = sessionId;
    final counts =
        (id == null
                ? ref.watch(outboxCountsProvider)
                : ref.watch(sessionOutboxCountsProvider(id)))
            .value;
    final worker = ref.watch(syncWorkerProvider);
    final activity = ref.watch(syncActivityProvider).value ?? worker?.current;
    final running = activity?.phase == SyncPhase.running;
    final scheme = Theme.of(context).colorScheme;

    return Card(
      key: const Key('sync-card'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: _Count(
                    key: const Key('sync-pending'),
                    label: 'Bekleyen',
                    value: counts?.pending,
                  ),
                ),
                Expanded(
                  child: _Count(
                    key: const Key('sync-sent'),
                    label: 'Gönderilen',
                    value: counts?.sent,
                  ),
                ),
                Expanded(
                  child: _Count(
                    key: const Key('sync-failed'),
                    label: 'Başarısız',
                    value: counts?.failed,
                    color: (counts?.failed ?? 0) > 0 ? scheme.error : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(_icon(counts, activity, worker != null), size: 28),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _message(counts, activity, worker != null, id != null),
                    key: const Key('sync-status'),
                    style: const TextStyle(fontSize: 18),
                  ),
                ),
              ],
            ),
            if ((counts?.failed ?? 0) > 0) ...[
              const SizedBox(height: 8),
              Container(
                key: const Key('sync-failed-warning'),
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${counts!.failed} kayıt sunucuya kabul edilmedi. Kayıtlar '
                  'telefonda duruyor; ofise haber verin.',
                  style: TextStyle(
                    fontSize: 16,
                    color: scheme.onErrorContainer,
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: const Key('sync-failed-details'),
                  onPressed: () => _showFailed(context, ref),
                  child: const Text('Ayrıntılar'),
                ),
              ),
            ],
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: OutlinedButton.icon(
                key: const Key('sync-now'),
                onPressed: worker == null || running
                    ? null
                    : () => worker.syncNow().ignore(),
                icon: running
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    : const Icon(Icons.cloud_upload, size: 28),
                label: const Text(
                  'Şimdi gönder',
                  style: TextStyle(fontSize: 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static IconData _icon(OutboxCounts? c, SyncActivity? a, bool hasServer) {
    if (!hasServer) return Icons.cloud_off;
    if (a?.phase == SyncPhase.running) return Icons.cloud_sync;
    if (a?.phase == SyncPhase.waitingForNetwork) return Icons.wifi_off;
    if (c != null && c.allSent) return Icons.cloud_done;
    return Icons.cloud_queue;
  }

  static String _message(
    OutboxCounts? c,
    SyncActivity? a,
    bool hasServer,
    bool forSession,
  ) {
    if (c != null && c.allSent && c.sent > 0) {
      return forSession
          ? 'Bu ziyaretin her şeyi gönderildi'
          : 'Her şey gönderildi';
    }
    if (!hasServer) {
      return 'Sunucu bağlantısı ayarlı değil; kayıtlar telefonda bekliyor';
    }
    switch (a?.phase) {
      case SyncPhase.running:
        return 'Gönderiliyor…';
      case SyncPhase.waitingForNetwork:
        final at = a?.nextRetryAt;
        return at == null
            ? 'İnternet yok ya da zayıf; yeniden denenecek'
            : 'İnternet yok ya da zayıf; ${_time(at)} civarında yeniden '
                  'denenecek';
      case SyncPhase.idle:
      case null:
        if (c == null) return '…';
        if (c.pending > 0) return '${c.pending} kayıt gönderilmeyi bekliyor';
        if (c.failed > 0) return 'Gönderilebilen her şey gönderildi';
        return 'Gönderilecek kayıt yok';
    }
  }

  static String _time(DateTime t) {
    final l = t.toLocal();
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(l.hour)}:${two(l.minute)}:${two(l.second)}';
  }

  Future<void> _showFailed(BuildContext context, WidgetRef ref) async {
    final outbox = ref.read(fieldRepositoryProvider).outbox;
    final failed = await outbox.failed();
    if (!context.mounted) return;
    final retry = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Gönderilemeyen kayıtlar'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final e in failed)
                ListTile(
                  dense: true,
                  title: Text(_entityLabel(e.entityType)),
                  subtitle: Text(e.lastError ?? ''),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Kapat'),
          ),
          TextButton(
            key: const Key('sync-retry-failed'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Yeniden dene'),
          ),
        ],
      ),
    );
    if (retry ?? false) {
      await outbox.requeueFailed();
      ref.read(syncWorkerProvider)?.syncNow().ignore();
    }
  }

  static String _entityLabel(String type) => switch (type) {
    OutboxEntity.session => 'Ziyaret',
    OutboxEntity.sessionEvent => 'Oturum olayı',
    OutboxEntity.capture => 'Fotoğraf',
    OutboxEntity.measurement => 'Cevap',
    _ => type,
  };
}

class _Count extends StatelessWidget {
  const _Count({super.key, required this.label, this.value, this.color});

  final String label;
  final int? value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(
        value?.toString() ?? '…',
        style: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
      Text(label, style: const TextStyle(fontSize: 14)),
    ],
  );
}
