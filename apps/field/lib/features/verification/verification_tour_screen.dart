import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/geo/geo.dart';
import '../../core/ui/widgets.dart';
import '../gnss/gnss_panel.dart';
import '../session/session_controller.dart';
import '../sync/sync_status_card.dart';
import '../tasks/field_task.dart';
import 'route_hint.dart';
import 'verification_item_screen.dart';

/// Newest local result per item of a tour (with its upload state).
final verificationResultsProvider =
    StreamProvider.family<Map<String, LocalVerificationResult>, String>(
      (ref, tourId) =>
          ref.watch(fieldRepositoryProvider).watchVerificationResults(tourId),
    );

/// Receiver position from the logger's status, when it sends one.
final loggerPositionProvider = Provider<GeoPoint?>(
  (ref) => ref.watch(gnssStatusProvider).value?.status.position,
);

/// Plain message for a result the server refused for good.
String verificationFailureMessage(String failure) {
  final reason = failure.split(':').first.trim();
  return switch (reason) {
    'item_closed' =>
      'Ofis bu kalemi kapatmış; sonucunuz kaydedilmedi. '
          'Gerekirse ofise haber verin.',
    'not_found' => 'Kalem sunucuda bulunamadı (silinmiş olabilir).',
    'forbidden' => 'Bu kalem için yetkiniz yok. Ofise haber verin.',
    'invalid_input' => 'Sonuç eksik gönderildi. Kalemi yeniden kaydedin.',
    _ => 'Sunucu sonucu kabul etmedi ($reason). Ofise haber verin.',
  };
}

/// Verification tour (docs/MVP.md, Modül 2, step 9): the open items in
/// walking order with directions; each item records "tree / no tree", an
/// optional close-up and a note. Works offline: results wait in the outbox.
class VerificationTourScreen extends ConsumerStatefulWidget {
  const VerificationTourScreen({super.key, required this.task});

  final FieldTask task;

  @override
  ConsumerState<VerificationTourScreen> createState() =>
      _VerificationTourScreenState();
}

class _VerificationTourScreenState
    extends ConsumerState<VerificationTourScreen> {
  late final String _tourId = widget.task.visitId ?? widget.task.id;
  late final Future<void> _ready = ref
      .read(fieldRepositoryProvider)
      .ensureTourSession(
        tourId: _tourId,
        parcelId: widget.task.parcelId,
        taskId: widget.task.id,
        operatorId: ref.read(currentUserProvider)?.id,
      );

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final results = ref.watch(verificationResultsProvider(_tourId)).value ?? {};
    final here = ref.watch(loggerPositionProvider);
    final items = task.verificationItems;
    final open = [
      for (final i in items)
        if (results[i.id] == null) i,
    ];
    final refused = [
      for (final i in items)
        if (results[i.id]?.failure != null) i,
    ];
    final done = [
      for (final i in items)
        if (results[i.id] != null && results[i.id]!.failure == null) i,
    ];
    return Scaffold(
      appBar: AppBar(title: Text('Doğrulama · ${task.parcelName}')),
      body: FutureBuilder<void>(
        future: _ready,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          // Not lazy: a tour has tens of items and every card stays mounted.
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const GnssConnectBar(),
                Text(
                  '${items.length - open.length} / ${items.length} kaleme '
                  'bakıldı',
                  key: const Key('tour-progress'),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (here == null)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      'Konum yok: yeri kod ve sıra sayımıyla bulun.',
                      key: Key('tour-no-position'),
                    ),
                  ),
                if (task.notes != null && task.notes!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Ofisin notu: ${task.notes}'),
                  ),
                const SizedBox(height: 12),
                if (refused.isNotEmpty) ...[
                  const _Heading('Gönderilemeyenler'),
                  for (final i in refused)
                    _ItemCard(
                      item: i,
                      task: task,
                      tourId: _tourId,
                      here: here,
                      result: results[i.id],
                    ),
                ],
                if (open.isNotEmpty) const _Heading('Açık kalemler'),
                for (final i in open)
                  _ItemCard(
                    item: i,
                    task: task,
                    tourId: _tourId,
                    here: here,
                    result: null,
                  ),
                if (open.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'Bütün kalemlere bakıldı.',
                      key: Key('tour-all-done'),
                      style: TextStyle(fontSize: 18),
                    ),
                  ),
                if (done.isNotEmpty) ...[
                  const _Heading('Bakılanlar'),
                  for (final i in done)
                    _ItemCard(
                      item: i,
                      task: task,
                      tourId: _tourId,
                      here: here,
                      result: results[i.id],
                    ),
                ],
                const SizedBox(height: 8),
                SyncStatusCard(sessionId: _tourId),
                const SizedBox(height: 16),
                BigButton(
                  key: const Key('tour-finish'),
                  icon: Icons.done_all,
                  label: 'Turu bitir',
                  onPressed: () {
                    if (open.isEmpty) {
                      ref.read(completedTasksProvider.notifier).add(task.id);
                    }
                    ref.read(syncWorkerProvider)?.syncNow().ignore();
                    Navigator.of(context).pop();
                  },
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8, bottom: 4),
    child: Text(
      text,
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
    ),
  );
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({
    required this.item,
    required this.task,
    required this.tourId,
    required this.here,
    required this.result,
  });

  final VerificationItem item;
  final FieldTask task;
  final String tourId;
  final GeoPoint? here;
  final LocalVerificationResult? result;

  @override
  Widget build(BuildContext context) {
    final r = result;
    final failure = r?.failure;
    final distance = describeDistance(here, item.slot.position);
    return Card(
      key: Key('tour-item-${item.slot.code}'),
      color: failure != null ? Colors.red.shade50 : null,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) =>
                VerificationItemScreen(task: task, tourId: tourId, item: item),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(
                failure != null
                    ? Icons.error
                    : r == null
                    ? Icons.place_outlined
                    : Icons.check_circle,
                size: 40,
                color: failure != null
                    ? Colors.red.shade700
                    : r == null
                    ? null
                    : Colors.green.shade700,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.slot.code,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      describeRoute(item.slot, task.slots),
                      style: const TextStyle(fontSize: 17),
                    ),
                    Text(item.reasons.map((x) => x.label).join(' · ')),
                    if (item.note != null && item.note!.isNotEmpty)
                      Text('Not: ${item.note}'),
                    if (distance != null && r == null)
                      Text(
                        distance,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    if (r != null)
                      Text(
                        [
                          r.row.treePresent ? 'Ağaç var' : 'Ağaç yok',
                          if (r.row.captureSha256 != null) 'fotoğraflı',
                          r.sent ? 'gönderildi' : 'gönderilecek',
                        ].join(' · '),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    if (failure != null)
                      Text(
                        verificationFailureMessage(failure),
                        key: Key('tour-item-error-${item.slot.code}'),
                        style: TextStyle(color: Colors.red.shade800),
                      ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 32),
            ],
          ),
        ),
      ),
    );
  }
}
