import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/media/media_store.dart';
import '../../core/quality/photo_quality.dart';
import '../../core/ui/widgets.dart';
import '../camera/capture_screen.dart';
import '../session/session_controller.dart';
import '../tasks/field_task.dart';
import 'closeup_protocol.dart';

/// Photos and yes/no questions for one tree.
///
/// Photos come only from the in-app camera ([CaptureScreen]); there is no
/// gallery option. A photo that passes the quality check and that the crew
/// chose to use is hashed (SHA-256) and written to the content-addressed
/// store; the database rows are written together with the answers when the
/// tree is saved.
class TreeObservationScreen extends ConsumerStatefulWidget {
  const TreeObservationScreen({super.key, required this.tree});

  final TreeTarget tree;

  @override
  ConsumerState<TreeObservationScreen> createState() =>
      _TreeObservationScreenState();
}

class _TreeObservationScreenState extends ConsumerState<TreeObservationScreen> {
  final Map<String, PendingShot> _shots = {};
  final Map<String, bool> _answers = {};
  String? _capturing;
  bool _saving = false;

  CloseupProtocol get _protocol => CloseupProtocol.forSeason(
    ref.read(sessionControllerProvider).task?.season ?? Season.winter,
  );

  bool get _complete =>
      _protocol.shots
          .where((s) => s.required)
          .every((s) => _shots.containsKey(s.code)) &&
      _protocol.questions.every((q) => _answers.containsKey(q.metricCode));

  Future<void> _take(ShotSpec spec) async {
    setState(() => _capturing = spec.code);
    try {
      final photo = await Navigator.of(context).push<CapturedPhoto>(
        MaterialPageRoute(
          builder: (_) => CaptureScreen(
            title: spec.title,
            hint: spec.hint,
            referenceImage: spec.referenceImage,
          ),
        ),
      );
      // Cancelled, or only rejected photos: nothing is stored.
      if (photo == null || !photo.quality.canSave) return;
      final bytes = photo.shot.bytes;
      final hash = sha256Hex(bytes);
      final store = ref.read(mediaStoreProvider);
      final path = await store.put(bytes, sha256: hash);
      final previous = _shots[spec.code];
      // A retake replaces a photo that was never saved; drop its file.
      if (previous != null && previous.sha256 != hash) {
        await store.discard(previous.localPath);
      }
      if (!mounted) return;
      setState(
        () => _shots[spec.code] = PendingShot(
          shotCode: spec.code,
          sha256: hash,
          localPath: path,
          mediaType: photo.shot.mediaType,
          byteSize: bytes.length,
          capturedAt: photo.capturedAt,
          gpsTimeMs: photo.time.gpsTimeMs,
          timeSource: photo.time.source,
          quality: photo.quality,
        ),
      );
    } catch (e) {
      if (mounted) showError(context, 'Fotoğraf kaydedilemedi: $e');
    } finally {
      if (mounted) setState(() => _capturing = null);
    }
  }

  Future<void> _save() async {
    final sessionId = ref.read(sessionControllerProvider).sessionId;
    if (sessionId == null) return;
    setState(() => _saving = true);
    final protocol = _protocol;
    await ref
        .read(fieldRepositoryProvider)
        .saveTreeObservation(
          sessionId: sessionId,
          treeId: widget.tree.treeId,
          slotCode: widget.tree.slotCode,
          shots: [
            for (final s in protocol.shots)
              if (_shots[s.code] != null) _shots[s.code]!,
          ],
          answers: {
            for (final q in protocol.questions)
              q.metricCode: _answers[q.metricCode]!,
          },
          methodVersion: protocol.version,
        );
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final protocol = _protocol;
    return Scaffold(
      appBar: AppBar(title: Text('Ağaç ${widget.tree.slotCode}')),
      // Not lazy: the form is short and every field must stay mounted.
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _SectionTitle('Fotoğraflar'),
            for (final spec in protocol.shots)
              _ShotCard(
                spec: spec,
                shot: _shots[spec.code],
                busy: _capturing == spec.code,
                onTake: _capturing == null ? () => _take(spec) : null,
              ),
            const SizedBox(height: 16),
            const _SectionTitle('Sorular'),
            for (final q in protocol.questions)
              _QuestionCard(
                question: q,
                answer: _answers[q.metricCode],
                onAnswer: (v) => setState(() => _answers[q.metricCode] = v),
              ),
            const SizedBox(height: 24),
            BigButton(
              key: const Key('tree-save'),
              icon: Icons.save,
              label: 'Kaydet',
              busy: _saving,
              onPressed: _complete ? _save : null,
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
    ),
  );
}

class _ShotCard extends StatelessWidget {
  const _ShotCard({
    required this.spec,
    required this.shot,
    required this.busy,
    required this.onTake,
  });

  final ShotSpec spec;
  final PendingShot? shot;
  final bool busy;
  final VoidCallback? onTake;

  @override
  Widget build(BuildContext context) {
    final taken = shot != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ReferenceImage(assetPath: spec.referenceImage),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        spec.required
                            ? spec.title
                            : '${spec.title} (isteğe bağlı)',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text('Böyle çek: ${spec.hint}'),
                      if (taken)
                        Text(
                          shot!.quality.verdict == QualityVerdict.warn
                              ? 'Çekildi (uyarıyla) · '
                                    '${shot!.sha256.substring(0, 8)}'
                              : 'Çekildi · ${shot!.sha256.substring(0, 8)}',
                          style: TextStyle(color: Colors.green.shade700),
                        ),
                    ],
                  ),
                ),
                if (taken)
                  Icon(
                    Icons.check_circle,
                    color: Colors.green.shade700,
                    size: 36,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: OutlinedButton.icon(
                key: Key('shot-${spec.code}'),
                icon: busy
                    ? const SizedBox.square(
                        dimension: 24,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    : const Icon(Icons.photo_camera, size: 28),
                label: Text(
                  taken ? 'Yeniden çek' : 'Fotoğraf çek',
                  style: const TextStyle(fontSize: 20),
                ),
                onPressed: onTake,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.question,
    required this.answer,
    required this.onAnswer,
  });

  final YesNoQuestion question;
  final bool? answer;
  final ValueChanged<bool> onAnswer;

  @override
  Widget build(BuildContext context) {
    Widget choice(bool value, String label, IconData icon) {
      final selected = answer == value;
      final style = FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(60),
        textStyle: const TextStyle(fontSize: 20),
      );
      return Expanded(
        child: selected
            ? FilledButton.icon(
                key: Key('q-${question.metricCode}-$value'),
                style: style,
                onPressed: () => onAnswer(value),
                icon: Icon(icon),
                label: Text(label),
              )
            : OutlinedButton.icon(
                key: Key('q-${question.metricCode}-$value'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(60),
                  textStyle: const TextStyle(fontSize: 20),
                ),
                onPressed: () => onAnswer(value),
                icon: Icon(icon),
                label: Text(label),
              ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                ReferenceImage(assetPath: question.referenceImage),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    question.text,
                    style: const TextStyle(fontSize: 20),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                choice(true, 'Evet', Icons.check),
                const SizedBox(width: 12),
                choice(false, 'Hayır', Icons.close),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
