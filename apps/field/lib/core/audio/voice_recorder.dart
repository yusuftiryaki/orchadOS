import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Short voice notes of the crew on a close-up tree (docs/MVP.md, Module 3).
abstract interface class VoiceRecorder {
  /// False when the microphone permission is refused.
  Future<bool> start();

  /// Stops and returns the recording (AAC in MP4, `audio/mp4`); null when
  /// nothing was recorded.
  Future<Uint8List?> stop();

  Future<void> cancel();
}

/// The phone's microphone through the `record` plugin.
class MicVoiceRecorder implements VoiceRecorder {
  final AudioRecorder _recorder = AudioRecorder();
  String? _path;

  @override
  Future<bool> start() async {
    if (!await _recorder.hasPermission()) return false;
    final dir = await getTemporaryDirectory();
    _path = p.join(
      dir.path,
      'voice_${DateTime.now().microsecondsSinceEpoch}.m4a',
    );
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 64000,
        numChannels: 1,
      ),
      path: _path!,
    );
    return true;
  }

  @override
  Future<Uint8List?> stop() async {
    final path = await _recorder.stop() ?? _path;
    _path = null;
    if (path == null) return null;
    final file = File(path);
    if (!await file.exists()) return null;
    final bytes = await file.readAsBytes();
    await file.delete();
    return bytes.isEmpty ? null : bytes;
  }

  @override
  Future<void> cancel() async {
    await _recorder.cancel();
    _path = null;
  }
}

/// Test and demo recorder: a fixed byte string per note.
class FakeVoiceRecorder implements VoiceRecorder {
  FakeVoiceRecorder({this.allow = true});

  final bool allow;
  int _n = 0;
  bool _on = false;

  @override
  Future<bool> start() async => _on = allow;

  @override
  Future<Uint8List?> stop() async {
    if (!_on) return null;
    _on = false;
    return Uint8List.fromList('fake-voice-note-${_n++}'.codeUnits);
  }

  @override
  Future<void> cancel() async => _on = false;
}
