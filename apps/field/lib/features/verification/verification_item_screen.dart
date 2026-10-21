import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/quality/photo_quality.dart';
import '../../core/ui/widgets.dart';
import '../camera/photo_capture.dart';
import '../tasks/field_task.dart';
import 'route_hint.dart';
import 'verification_tour_screen.dart';

/// One verification item: where it is, why the office asks, and the result
/// ("Ağaç var" / "Ağaç yok", optional close-up, note).
class VerificationItemScreen extends ConsumerStatefulWidget {
  const VerificationItemScreen({
    super.key,
    required this.task,
    required this.tourId,
    required this.item,
  });

  final FieldTask task;
  final String tourId;
  final VerificationItem item;

  @override
  ConsumerState<VerificationItemScreen> createState() =>
      _VerificationItemScreenState();
}

class _VerificationItemScreenState
    extends ConsumerState<VerificationItemScreen> {
  final _note = TextEditingController();
  bool? _present;
  PendingShot? _photo;
  bool _capturing = false;
  bool _saving = false;
  bool _saved = false;
  late final _media = ref.read(mediaStoreProvider);

  @override
  void initState() {
    super.initState();
    _media;
  }

  @override
  void dispose() {
    _note.dispose();
    // Left without saving: the photo was never registered; drop its file.
    final photo = _photo;
    if (!_saved && photo != null) _media.discard(photo.localPath).ignore();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    setState(() => _capturing = true);
    try {
      final shot = await takePhoto(
        context,
        ref,
        shotCode: 'verification_closeup',
        title: 'Yakın plan ${widget.item.slot.code}',
        hint: 'Gövdeyi dibiyle birlikte çerçeveye alın',
        replacing: _photo,
      );
      if (shot != null && mounted) setState(() => _photo = shot);
    } catch (e) {
      if (mounted) showError(context, 'Fotoğraf kaydedilemedi: $e');
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _save() async {
    final present = _present;
    if (present == null) return;
    setState(() => _saving = true);
    await ref
        .read(fieldRepositoryProvider)
        .saveVerificationResult(
          tourId: widget.tourId,
          itemId: widget.item.id,
          slotId: widget.item.slot.id,
          slotCode: widget.item.slot.code,
          treePresent: present,
          note: _note.text,
          photo: _photo,
        );
    _saved = true;
    // Sent right away when there is signal; otherwise it waits.
    ref.read(syncWorkerProvider)?.syncNow().ignore();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final slot = item.slot;
    final here = ref.watch(loggerPositionProvider);
    final distance = describeDistance(here, slot.position);
    final failure = ref
        .watch(verificationResultsProvider(widget.tourId))
        .value?[item.id]
        ?.failure;

    Widget choice(bool value, String label, IconData icon, Key key) {
      final selected = _present == value;
      final style = ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size.fromHeight(72)),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
      );
      void onPressed() => setState(() => _present = value);
      return Expanded(
        child: selected
            ? FilledButton.icon(
                key: key,
                style: style,
                onPressed: onPressed,
                icon: Icon(icon, size: 30),
                label: Text(label),
              )
            : OutlinedButton.icon(
                key: key,
                style: style,
                onPressed: onPressed,
                icon: Icon(icon, size: 30),
                label: Text(label),
              ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text('Yer ${slot.code}')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      describeRoute(slot, widget.task.slots),
                      key: const Key('verify-route'),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Text('Boş yerler de sayılır.'),
                    const SizedBox(height: 8),
                    Text(
                      distance ?? 'Konum yok: kod ve sıra sayımıyla bulun.',
                      key: const Key('verify-distance'),
                      style: const TextStyle(fontSize: 18),
                    ),
                  ],
                ),
              ),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Neden: ${item.reasons.map((r) => r.label).join(', ')}',
                      style: const TextStyle(fontSize: 18),
                    ),
                    if (item.note != null && item.note!.isNotEmpty)
                      Text(
                        'Ofisin notu: ${item.note}',
                        style: const TextStyle(fontSize: 18),
                      ),
                    Text(
                      item.treeId == null
                          ? 'Kayıtta bu yer boş.'
                          : 'Kayıtta bu yerde ağaç var.',
                    ),
                  ],
                ),
              ),
            ),
            if (failure != null)
              Card(
                color: Colors.red.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    verificationFailureMessage(failure),
                    style: TextStyle(color: Colors.red.shade800, fontSize: 16),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            const Text(
              'Yerde ne var?',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                choice(
                  true,
                  'Ağaç var',
                  Icons.park,
                  const Key('verify-present'),
                ),
                const SizedBox(width: 12),
                choice(
                  false,
                  'Ağaç yok',
                  Icons.block,
                  const Key('verify-absent'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 60,
              child: OutlinedButton.icon(
                key: const Key('verify-photo'),
                icon: _capturing
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    : const Icon(Icons.photo_camera, size: 28),
                label: Text(
                  _photo == null
                      ? 'Yakın plan çek (isteğe bağlı)'
                      : 'Yakın planı yeniden çek',
                  style: const TextStyle(fontSize: 18),
                ),
                onPressed: _capturing ? null : _takePhoto,
              ),
            ),
            if (_photo != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  _photo!.quality.verdict == QualityVerdict.warn
                      ? 'Çekildi (uyarıyla) · ${_photo!.sha256.substring(0, 8)}'
                      : 'Çekildi · ${_photo!.sha256.substring(0, 8)}',
                  key: const Key('verify-photo-taken'),
                  style: TextStyle(color: Colors.green.shade700),
                ),
              ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('verify-note'),
              controller: _note,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Not (isteğe bağlı)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 24),
            BigButton(
              key: const Key('verify-save'),
              icon: Icons.save,
              label: 'Kaydet',
              busy: _saving,
              onPressed: _present == null ? null : _save,
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
