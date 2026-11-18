// Generates assets/sounds/alert.wav, the sound of a kit recorder alert during
// a recording (lib/core/audio/alert_sound.dart).
//
//   dart run tool/alert_sound.dart
//
// 0.4 s of an 880 Hz sine, 16-bit mono PCM at 22 050 Hz, with 10 ms fades so
// that it does not click. Deterministic: the same bytes on every run.
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

const sampleRate = 22050;
const frequencyHz = 880.0;
const durationS = 0.4;
const fadeS = 0.01;

/// Peak amplitude, a little under full scale.
const amplitude = 0.8 * 32767;

Uint8List alertWav() {
  final n = (sampleRate * durationS).round();
  final fade = (sampleRate * fadeS).round();
  final data = ByteData(n * 2);
  for (var i = 0; i < n; i++) {
    final envelope = math.min(1.0, math.min(i, n - 1 - i) / fade);
    final v =
        amplitude *
        envelope *
        math.sin(2 * math.pi * frequencyHz * i / sampleRate);
    data.setInt16(i * 2, v.round(), Endian.little);
  }
  final header = ByteData(44);
  void ascii(int at, String s) {
    for (var i = 0; i < s.length; i++) {
      header.setUint8(at + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  header.setUint32(4, 36 + n * 2, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header
    ..setUint32(16, 16, Endian.little) // fmt chunk size
    ..setUint16(20, 1, Endian.little) // PCM
    ..setUint16(22, 1, Endian.little) // mono
    ..setUint32(24, sampleRate, Endian.little)
    ..setUint32(28, sampleRate * 2, Endian.little) // byte rate
    ..setUint16(32, 2, Endian.little) // block align
    ..setUint16(34, 16, Endian.little); // bits per sample
  ascii(36, 'data');
  header.setUint32(40, n * 2, Endian.little);
  return Uint8List.fromList([
    ...header.buffer.asUint8List(),
    ...data.buffer.asUint8List(),
  ]);
}

void main() {
  final out = File('assets/sounds/alert.wav');
  out.parent.createSync(recursive: true);
  out.writeAsBytesSync(alertWav());
  stdout.writeln('wrote ${out.path} (${out.lengthSync()} bytes)');
}
