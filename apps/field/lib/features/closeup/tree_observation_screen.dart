import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/media/media_store.dart';
import '../../core/quality/photo_quality.dart';
import '../../core/time/gps_clock.dart';
import '../../core/ui/widgets.dart';
import '../camera/capture_screen.dart';
import '../session/session_controller.dart';
import '../tasks/field_task.dart';
import 'closeup_protocol.dart';

/// Photos and questions for one tree. Every question can also be answered
/// "Göremedim"; the tree is complete when every required photo is taken and
/// every question has an answer.
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
  final Map<String, StaffAnswer> _answers = {};

  /// The protocol's optional block (winter "kuru şüphesi") is open.
  bool _extraOpen = false;
  final List<PendingVoiceNote> _voice = [];
  String? _capturing;
  bool _saving = false;
  bool _recording = false;
  GpsTimeReading? _voiceStart;
  DateTime? _voiceStartedAt;

  /// Starts a voice note, or stops it and keeps it for the save.
  Future<void> _toggleVoice() async {
    final recorder = ref.read(voiceRecorderProvider);
    if (!_recording) {
      _voiceStart = ref.read(gpsClockProvider).now();
      _voiceStartedAt = ref.read(clockProvider).now();
      final ok = await recorder.start();
      if (!mounted) return;
      if (!ok) {
        showError(context, 'Mikrofon izni yok: ayarlardan izin verin.');
        return;
      }
      setState(() => _recording = true);
      return;
    }
    try {
      final bytes = await recorder.stop();
      if (bytes == null) return;
      final hash = sha256Hex(bytes);
      final path = await ref
          .read(mediaStoreProvider)
          .put(bytes, sha256: hash, ext: 'm4a');
      if (!mounted) return;
      setState(
        () => _voice.add(
          PendingVoiceNote(
            sha256: hash,
            localPath: path,
            byteSize: bytes.length,
            capturedAt: _voiceStartedAt!,
            gpsTimeMs: _voiceStart!.gpsTimeMs,
            timeSource: _voiceStart!.source,
          ),
        ),
      );
    } catch (e) {
      if (mounted) showError(context, 'Sesli not kaydedilemedi: $e');
    } finally {
      if (mounted) setState(() => _recording = false);
    }
  }

  CloseupProtocol get _protocol => CloseupProtocol.forSeason(
    ref.read(sessionControllerProvider).task?.season ?? Season.winter,
  );

  bool get _complete =>
      _protocol
          .shotsWith(extraOpen: _extraOpen)
          .where((s) => s.required)
          .every((s) => _shots.containsKey(s.code)) &&
      _protocol
          .questionsWith(extraOpen: _extraOpen)
          .every((q) => _answers.containsKey(q.metricCode));

  /// Closing the block drops its photos and answers: they are not saved.
  Future<void> _setExtraOpen(bool open) async {
    final extra = _protocol.extra;
    if (extra == null) return;
    if (!open) {
      final store = ref.read(mediaStoreProvider);
      for (final spec in extra.shots) {
        final shot = _shots.remove(spec.code);
        if (shot != null) await store.discard(shot.localPath);
      }
      for (final q in extra.questions) {
        _answers.remove(q.metricCode);
      }
    }
    if (mounted) setState(() => _extraOpen = open);
  }

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
            for (final s in protocol.shotsWith(extraOpen: _extraOpen))
              if (_shots[s.code] != null) _shots[s.code]!,
          ],
          answers: {
            for (final q in protocol.questionsWith(extraOpen: _extraOpen))
              q.metricCode: _answers[q.metricCode]!,
          },
          methodVersion: protocol.version,
          voiceNotes: _voice,
          time: ref.read(gpsClockProvider).now(),
        );
    if (mounted) Navigator.of(context).pop();
  }

  Widget _shotCard(ShotSpec spec) => _ShotCard(
    spec: spec,
    shot: _shots[spec.code],
    busy: _capturing == spec.code,
    onTake: _capturing == null ? () => _take(spec) : null,
  );

  Widget _questionCard(CloseupQuestion q) => _QuestionCard(
    question: q,
    answer: _answers[q.metricCode],
    onAnswer: (v) => setState(() => _answers[q.metricCode] = v),
  );

  @override
  Widget build(BuildContext context) {
    final protocol = _protocol;
    final extra = protocol.extra;
    return Scaffold(
      appBar: AppBar(title: Text('Ağaç ${widget.tree.slotCode}')),
      // Not lazy: the form is short and every field must stay mounted.
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _SectionTitle('Fotoğraflar'),
            for (final spec in protocol.shots) _shotCard(spec),
            const SizedBox(height: 16),
            const _SectionTitle('Sorular'),
            for (final q in protocol.questions) _questionCard(q),
            if (extra != null) ...[
              const SizedBox(height: 16),
              Card(
                child: SwitchListTile(
                  key: Key('extra-${extra.code}'),
                  minTileHeight: 72,
                  title: Text(
                    extra.label,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: _extraOpen ? Text(extra.detail) : null,
                  value: _extraOpen,
                  onChanged: _capturing == null ? _setExtraOpen : null,
                ),
              ),
              if (_extraOpen) ...[
                for (final spec in extra.shots) _shotCard(spec),
                for (final q in extra.questions) _questionCard(q),
              ],
            ],
            const SizedBox(height: 16),
            const _SectionTitle('Sesli not (isteğe bağlı)'),
            OutlinedButton.icon(
              key: const Key('tree-voice'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(56),
                foregroundColor: _recording ? Colors.red : null,
              ),
              icon: Icon(_recording ? Icons.stop : Icons.mic),
              label: Text(
                _recording
                    ? 'Durdur'
                    : _voice.isEmpty
                    ? 'Sesli not ekle'
                    : 'Bir sesli not daha (${_voice.length} kayıtlı)',
                style: const TextStyle(fontSize: 18),
              ),
              onPressed: _saving ? null : _toggleVoice,
            ),
            const SizedBox(height: 24),
            BigButton(
              key: const Key('tree-save'),
              icon: Icons.save,
              label: 'Kaydet',
              busy: _saving,
              onPressed: _complete && !_recording ? _save : null,
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

  final CloseupQuestion question;
  final StaffAnswer? answer;
  final ValueChanged<StaffAnswer> onAnswer;

  static String _keyOf(StaffAnswer a) => switch (a) {
    YesNoAnswer(:final value) => '$value',
    CategoryAnswer(:final code) => code,
    UnseenAnswer() => 'unseen',
  };

  static IconData? _iconOf(StaffAnswer a) => switch (a) {
    YesNoAnswer(value: true) => Icons.check,
    YesNoAnswer(value: false) => Icons.close,
    CategoryAnswer() => null,
    UnseenAnswer() => Icons.visibility_off,
  };

  Widget _choice(StaffAnswer value, String label, {double height = 60}) {
    final selected = answer == value;
    final key = Key('q-${question.metricCode}-${_keyOf(value)}');
    final size = Size.fromHeight(height);
    const text = TextStyle(fontSize: 20);
    final icon = _iconOf(value);
    final child = Text(label);
    if (selected) {
      final style = FilledButton.styleFrom(minimumSize: size, textStyle: text);
      return icon == null
          ? FilledButton(
              key: key,
              style: style,
              onPressed: () => onAnswer(value),
              child: child,
            )
          : FilledButton.icon(
              key: key,
              style: style,
              onPressed: () => onAnswer(value),
              icon: Icon(icon),
              label: child,
            );
    }
    final style = OutlinedButton.styleFrom(minimumSize: size, textStyle: text);
    return icon == null
        ? OutlinedButton(
            key: key,
            style: style,
            onPressed: () => onAnswer(value),
            child: child,
          )
        : OutlinedButton.icon(
            key: key,
            style: style,
            onPressed: () => onAnswer(value),
            icon: Icon(icon),
            label: child,
          );
  }

  @override
  Widget build(BuildContext context) {
    final choices = question.choices;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
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
                for (final (i, (value, label)) in choices.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: _choice(value, label)),
                ],
              ],
            ),
            const SizedBox(height: 8),
            _choice(const UnseenAnswer(), 'Göremedim', height: 52),
          ],
        ),
      ),
    );
  }
}
