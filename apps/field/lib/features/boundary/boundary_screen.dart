import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/geo/geo.dart';
import '../../core/time/gps_time.dart';
import '../../core/ui/widgets.dart';
import '../camera/photo_capture.dart';
import '../map/vector_map.dart';
import '../notice/field_records.dart';
import '../notice/notice_widgets.dart';
import '../session/session_controller.dart';
import 'boundary_corners.dart';

/// "19 850 m² · 19,9 dönüm".
String areaLabel(double m2) {
  final whole = m2.round().toString();
  final grouped = whole.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ' ',
  );
  final decare = m2ToDecare(m2).toStringAsFixed(1).replaceAll('.', ',');
  return '$grouped m² · $decare dönüm';
}

String _hhmmss(int gpsMs) {
  final t = gpsMsToUtc(gpsMs).toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(t.hour)}:${two(t.minute)}:${two(t.second)}';
}

/// Boundary step of an inventory visit: "Köşe" at every corner, the corner
/// list (order fixable, last one deletable, note, markers, photo) and the
/// approximate polygon with its area.
class BoundaryScreen extends ConsumerWidget {
  const BoundaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    final controller = ref.read(sessionControllerProvider.notifier);
    final boundary = state.boundary;
    final status = ref.watch(gnssStatusProvider).value;
    final live = CornerFix.fromStatus(status, ref.read(clockProvider).now());
    final ring = boundary.ring;

    ref.listen(sessionControllerProvider.select((s) => s.error), (_, error) {
      if (error != null) {
        showError(context, error);
        controller.clearError();
      }
    });

    Future<void> deleteLast() async {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('Köşe ${boundary.length} silinsin mi?'),
          content: const Text('Son köşe listeden çıkar.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(c).pop(false),
              child: const Text('Vazgeç'),
            ),
            FilledButton(
              key: const Key('boundary-delete-confirm'),
              onPressed: () => Navigator.of(c).pop(true),
              child: const Text('Sil'),
            ),
          ],
        ),
      );
      if (ok ?? false) await controller.deleteLastCorner();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Sınır')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              live?.label ?? 'Kaydediciden konum yok',
              key: const Key('boundary-fix'),
              style: const TextStyle(fontSize: 17),
            ),
            const SizedBox(height: 8),
            BigButton(
              key: const Key('boundary-corner'),
              icon: Icons.flag,
              label: 'Köşe (${boundary.length})',
              busy: state.busy,
              color: Colors.indigo,
              onPressed: state.isRecording && state.startQrShown
                  ? controller.markCorner
                  : null,
            ),
            const SizedBox(height: 12),
            VectorMap(
              key: const Key('boundary-map'),
              draft: ring,
              dots: [
                for (final (i, c) in boundary.corners.indexed)
                  if (c.fix != null)
                    MapDot(
                      c.fix!.position,
                      color: Colors.indigo,
                      radius: 5,
                      label: '${i + 1}',
                    ),
              ],
              here: status?.status.position,
              height: 240,
            ),
            const SizedBox(height: 8),
            Text(
              ring.length >= 3
                  ? 'Yaklaşık alan: ${areaLabel(boundary.areaM2)}'
                  : 'Alan için en az 3 konumlu köşe gerekir',
              key: const Key('boundary-area'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            if (ring.length < boundary.length)
              Text(
                '${boundary.length - ring.length} köşenin konumu yok; '
                'ofiste GNSS kaydından bulunacak.',
              ),
            const Text(
              'Kesin köşe konumları ofiste PPK ile hesaplanır.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            for (final (i, c) in boundary.corners.indexed)
              _CornerTile(
                index: i,
                corner: c,
                last: i == boundary.length - 1,
                onUp: i > 0 ? () => controller.moveCorner(i, -1) : null,
                onDown: i < boundary.length - 1
                    ? () => controller.moveCorner(i, 1)
                    : null,
                onOpen: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => CornerScreen(eventId: c.eventId),
                  ),
                ),
              ),
            if (!boundary.isEmpty) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('boundary-delete-last'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                  foregroundColor: Colors.red.shade700,
                ),
                icon: const Icon(Icons.delete_outline),
                label: Text(
                  'Son köşeyi sil (Köşe ${boundary.length})',
                  style: const TextStyle(fontSize: 18),
                ),
                onPressed: deleteLast,
              ),
            ],
            const SizedBox(height: 16),
            const BoundaryPointerCard(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _CornerTile extends StatelessWidget {
  const _CornerTile({
    required this.index,
    required this.corner,
    required this.last,
    required this.onUp,
    required this.onDown,
    required this.onOpen,
  });

  final int index;
  final Corner corner;
  final bool last;
  final VoidCallback? onUp;
  final VoidCallback? onDown;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = corner;
    final details = [
      _hhmmss(c.gpsTimeMs),
      c.fix?.label ?? 'konum yok',
      if (c.markers.isNotEmpty) c.markers.map((m) => m.label).join(', '),
      if (c.photos.isNotEmpty) '${c.photos.length} fotoğraf',
    ].join(' · ');
    return Card(
      key: Key('corner-$index'),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Köşe ${index + 1}',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(details),
                    if (c.note != null) Text('Not: ${c.note}'),
                  ],
                ),
              ),
              IconButton(
                key: Key('corner-up-$index'),
                iconSize: 32,
                tooltip: 'Yukarı',
                icon: const Icon(Icons.arrow_upward),
                onPressed: onUp,
              ),
              IconButton(
                key: Key('corner-down-$index'),
                iconSize: 32,
                tooltip: 'Aşağı',
                icon: const Icon(Icons.arrow_downward),
                onPressed: onDown,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Note, boundary markers and photos of one corner.
class CornerScreen extends ConsumerStatefulWidget {
  const CornerScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<CornerScreen> createState() => _CornerScreenState();
}

class _CornerScreenState extends ConsumerState<CornerScreen> {
  late final Corner _corner = ref
      .read(sessionControllerProvider)
      .boundary
      .corners
      .firstWhere((c) => c.eventId == widget.eventId);
  late final _note = TextEditingController(text: _corner.note);
  late final Set<BoundaryMarker> _markers = {..._corner.markers};
  late final _media = ref.read(mediaStoreProvider);
  PendingShot? _photo;
  bool _capturing = false;
  bool _saving = false;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _media;
  }

  @override
  void dispose() {
    _note.dispose();
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
        shotCode: 'boundary_marker',
        title: 'Sınır işareti',
        hint: 'Taşı, çiti ya da duvarı köşeyle birlikte çekin',
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
    setState(() => _saving = true);
    await ref
        .read(sessionControllerProvider.notifier)
        .describeCorner(
          widget.eventId,
          note: _note.text,
          markers: [
            for (final m in BoundaryMarker.values)
              if (_markers.contains(m)) m,
          ],
          photo: _photo,
        );
    _saved = true;
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final index = ref
        .watch(sessionControllerProvider)
        .boundary
        .corners
        .indexWhere((c) => c.eventId == widget.eventId);
    final noteError = textError(_note.text, maxLength: maxNoteLength);
    return Scaffold(
      appBar: AppBar(title: Text('Köşe ${index + 1}')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${_hhmmss(_corner.gpsTimeMs)} · '
              '${_corner.fix?.label ?? 'konum yok'}',
              style: const TextStyle(fontSize: 17),
            ),
            const SizedBox(height: 16),
            const Text(
              'Sınırı ne belirliyor?',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final m in BoundaryMarker.values)
                  FilterChip(
                    key: Key('marker-${m.code}'),
                    label: Text(m.label, style: const TextStyle(fontSize: 18)),
                    selected: _markers.contains(m),
                    onSelected: (on) => setState(
                      () => on ? _markers.add(m) : _markers.remove(m),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 60,
              child: OutlinedButton.icon(
                key: const Key('corner-photo'),
                icon: _capturing
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    : const Icon(Icons.photo_camera, size: 28),
                label: Text(
                  _photo == null
                      ? 'Sınır işaretini çek (isteğe bağlı)'
                      : 'Yeniden çek',
                  style: const TextStyle(fontSize: 18),
                ),
                onPressed: _capturing ? null : _takePhoto,
              ),
            ),
            if (_corner.photos.isNotEmpty || _photo != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${_corner.photos.length + (_photo == null ? 0 : 1)} '
                  'fotoğraf',
                  key: const Key('corner-photo-count'),
                  style: TextStyle(color: Colors.green.shade700),
                ),
              ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('corner-note'),
              controller: _note,
              maxLines: 3,
              maxLength: maxNoteLength,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Not (isteğe bağlı)',
                helperText: noteHint,
                helperMaxLines: 3,
                errorText: noteError,
                errorMaxLines: 3,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 24),
            BigButton(
              key: const Key('corner-save'),
              icon: Icons.save,
              label: 'Kaydet',
              busy: _saving,
              // The note goes to session_event: no phone numbers.
              onPressed: noteError == null ? _save : null,
            ),
          ],
        ),
      ),
    );
  }
}
