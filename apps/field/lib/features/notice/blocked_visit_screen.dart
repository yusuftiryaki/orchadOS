import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/ui/widgets.dart';
import '../camera/photo_capture.dart';
import '../tasks/field_task.dart';
import 'field_records.dart';

/// Tasks recorded as "Ziyaret yapılamadı" on this phone and not scanned since.
final blockedTasksProvider = StreamProvider<Set<String>>(
  (ref) => ref.watch(fieldRepositoryProvider).watchBlockedTaskIds(),
);

/// The visit can be recorded as blocked: a planned scan visit (the event
/// needs the server's visit).
bool canRecordBlocked(FieldTask task) =>
    !task.isVerification && task.visitId != null;

/// "Ziyaret yapılamadı" (H15, T07): the reason, a note and timestamped
/// photos, recorded as a `visit_blocked` event of the planned visit. An
/// owner cause needs at least one photo and a note. The visit's status is
/// not changed; it can still be scanned later.
class BlockedVisitScreen extends ConsumerStatefulWidget {
  const BlockedVisitScreen({super.key, required this.task});

  final FieldTask task;

  @override
  ConsumerState<BlockedVisitScreen> createState() => _BlockedVisitScreenState();
}

class _BlockedVisitScreenState extends ConsumerState<BlockedVisitScreen> {
  BlockedDetail? _detail;
  final _note = TextEditingController();
  final List<PendingShot> _photos = [];
  late final _media = ref.read(mediaStoreProvider);
  bool _capturing = false;
  bool _saving = false;
  bool _saved = false;

  @override
  void dispose() {
    _note.dispose();
    if (!_saved) {
      for (final p in _photos) {
        _media.discard(p.localPath).ignore();
      }
    }
    super.dispose();
  }

  Future<void> _takePhoto() async {
    setState(() => _capturing = true);
    try {
      final shot = await takePhoto(
        context,
        ref,
        shotCode: 'blocked_visit_${_photos.length + 1}',
        title: 'Ziyaret yapılamadı',
        hint: 'Kapalı kapıyı, engeli ya da durumu çekin',
      );
      if (shot != null &&
          mounted &&
          !_photos.any((p) => p.sha256 == shot.sha256)) {
        setState(() => _photos.add(shot));
      }
    } catch (e) {
      if (mounted) showError(context, 'Fotoğraf kaydedilemedi: $e');
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _save() async {
    final task = widget.task;
    setState(() => _saving = true);
    try {
      await ref
          .read(fieldRepositoryProvider)
          .saveBlockedVisit(
            visitId: task.visitId!,
            parcelId: task.parcelId,
            taskId: task.id,
            visitKind: task.kind.code,
            season: task.season.code,
            operatorId: ref.read(currentUserProvider)?.id,
            detail: _detail!,
            note: _note.text,
            photos: _photos,
            time: ref.read(gpsClockProvider).now(),
          );
      _saved = true;
      // Send while the crew may still have signal.
      ref.read(syncWorkerProvider)?.syncNow().ignore();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showError(context, 'Kaydedilemedi: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final noteError = textError(
      _note.text,
      maxLength: maxNoteLength,
      required: detail?.needsNote ?? false,
    );
    final missingPhoto = (detail?.needsEvidence ?? false) && _photos.isEmpty;
    final canSave =
        detail != null && noteError == null && !missingPhoto && !_saving;
    return Scaffold(
      appBar: AppBar(title: Text(widget.task.parcelName)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Ziyaret yapılamadı',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          const Text(
            'Neden? Ziyaret planda kalır; engel kalkarsa bugün yine '
            'taranabilir.',
            style: TextStyle(fontSize: 16),
          ),
          for (final group in BlockedGroup.values)
            Card(
              key: Key('blocked-group-${group.name}'),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                      child: Text(
                        group.label,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    for (final d in BlockedDetail.values)
                      if (d.group == group)
                        CheckboxListTile(
                          key: Key('blocked-${d.code}'),
                          minTileHeight: 52,
                          title: Text(
                            d.label,
                            style: const TextStyle(fontSize: 17),
                          ),
                          value: detail == d,
                          onChanged: (v) =>
                              setState(() => _detail = v! ? d : null),
                        ),
                  ],
                ),
              ),
            ),
          if (detail?.needsEvidence ?? false)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Bahçe sahibinden kaynaklı engel en az bir fotoğraf ve notla '
                'belgelenir. Operasyon ekibi bahçe sahibine bugün bildirir.',
                key: const Key('blocked-evidence-hint'),
                style: TextStyle(fontSize: 16, color: Colors.orange.shade900),
              ),
            ),
          const SizedBox(height: 8),
          SizedBox(
            height: 60,
            child: OutlinedButton.icon(
              key: const Key('blocked-photo'),
              icon: _capturing
                  ? const SizedBox.square(
                      dimension: 24,
                      child: CircularProgressIndicator(strokeWidth: 3),
                    )
                  : const Icon(Icons.photo_camera, size: 28),
              label: Text(
                _photos.isEmpty ? 'Fotoğraf çek' : 'Bir fotoğraf daha çek',
                style: const TextStyle(fontSize: 18),
              ),
              onPressed: _capturing ? null : _takePhoto,
            ),
          ),
          if (_photos.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${_photos.length} fotoğraf (zaman damgalı)',
                key: const Key('blocked-photo-count'),
                style: TextStyle(color: Colors.green.shade700),
              ),
            ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('blocked-note'),
            controller: _note,
            maxLines: 3,
            maxLength: maxNoteLength,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: detail?.needsNote ?? false
                  ? 'Not'
                  : 'Not (isteğe bağlı)',
              helperText: noteHint,
              helperMaxLines: 3,
              errorText: _note.text.trim().isEmpty ? null : noteError,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          BigButton(
            key: const Key('blocked-save'),
            icon: Icons.save,
            label: 'Kaydet',
            busy: _saving,
            color: Colors.red.shade700,
            onPressed: canSave ? _save : null,
          ),
        ],
      ),
    );
  }
}
