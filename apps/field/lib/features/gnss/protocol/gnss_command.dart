import 'dart:convert';
import 'dart:typed_data';

import 'command_result.dart';

/// Event types for `mark_event`.
enum MarkType {
  corner(0x01),
  qrSync(0x02);

  const MarkType(this.code);
  final int code;
}

/// A command written to the logger's command characteristic.
///
/// Every command starts with `[opcode u8][seq u8]`; strings are
/// `[length u8][bytes…]` (firmware/gnss-logger/README.md, "Komutlar").
sealed class GnssCommand {
  const GnssCommand(this.seq);

  static const int opStartSession = 0x01;
  static const int opStopSession = 0x02;
  static const int opMarkEvent = 0x03;

  static const int maxSessionIdLength = 36;
  static const int maxParcelIdLength = 64;
  static const int maxPayloadLength = 200;

  /// Sequence number chosen by the app (0–255).
  final int seq;

  /// Encodes the command. Throws [ArgumentError] when an argument would be
  /// rejected by the firmware.
  Uint8List encode();

  /// Decodes a command the way the firmware does. Used by the fake logger.
  static GnssCommandDecode decode(List<int> data) {
    if (data.length < 2) {
      return const GnssCommandDecode.failure(CommandResult.malformed, null);
    }
    final seq = data[1];
    final reader = _Reader(data, 2);
    switch (data[0]) {
      case opStartSession:
        final sessionId = reader.string();
        final parcelId = reader.string();
        if (sessionId == null || parcelId == null || !reader.atEnd) {
          return GnssCommandDecode.failure(CommandResult.malformed, seq);
        }
        if (!isValidSessionId(sessionId) || !isValidParcelId(parcelId)) {
          return GnssCommandDecode.failure(CommandResult.invalidArgument, seq);
        }
        return GnssCommandDecode.success(
          StartSession(seq: seq, sessionId: sessionId, parcelId: parcelId),
        );
      case opStopSession:
        if (!reader.atEnd) {
          return GnssCommandDecode.failure(CommandResult.malformed, seq);
        }
        return GnssCommandDecode.success(StopSession(seq: seq));
      case opMarkEvent:
        if (data.length < 3) {
          return GnssCommandDecode.failure(CommandResult.malformed, seq);
        }
        final type = data[2];
        reader.pos = 3;
        final payload = reader.bytes();
        if (payload == null || !reader.atEnd) {
          return GnssCommandDecode.failure(CommandResult.malformed, seq);
        }
        final mark = MarkType.values.where((m) => m.code == type).firstOrNull;
        if (mark == null || !_isValidPayloadBytes(payload)) {
          return GnssCommandDecode.failure(CommandResult.invalidArgument, seq);
        }
        return GnssCommandDecode.success(
          MarkEvent(
            seq: seq,
            type: mark,
            payload: utf8.decode(payload, allowMalformed: true),
          ),
        );
      default:
        return GnssCommandDecode.failure(CommandResult.unknownOpcode, seq);
    }
  }

  /// `[A-Za-z0-9_-]`, 1–36 characters (used as a directory name).
  static bool isValidSessionId(String s) =>
      s.isNotEmpty &&
      s.length <= maxSessionIdLength &&
      RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(s);

  /// Printable ASCII, 1–64 characters.
  static bool isValidParcelId(String s) =>
      s.isNotEmpty &&
      s.length <= maxParcelIdLength &&
      s.codeUnits.every((c) => c >= 0x20 && c <= 0x7E);

  /// 0–200 bytes of UTF-8 without control characters.
  static bool isValidPayload(String s) => _isValidPayloadBytes(utf8.encode(s));

  static bool _isValidPayloadBytes(List<int> b) =>
      b.length <= maxPayloadLength && b.every((c) => c >= 0x20 && c != 0x7F);

  void _checkSeq() {
    if (seq < 0 || seq > 0xFF) {
      throw ArgumentError.value(seq, 'seq', 'must be 0–255');
    }
  }
}

final class StartSession extends GnssCommand {
  const StartSession({
    required int seq,
    required this.sessionId,
    required this.parcelId,
  }) : super(seq);

  final String sessionId;
  final String parcelId;

  @override
  Uint8List encode() {
    _checkSeq();
    if (!GnssCommand.isValidSessionId(sessionId)) {
      throw ArgumentError.value(sessionId, 'sessionId');
    }
    if (!GnssCommand.isValidParcelId(parcelId)) {
      throw ArgumentError.value(parcelId, 'parcelId');
    }
    final sid = ascii.encode(sessionId);
    final pid = ascii.encode(parcelId);
    return Uint8List.fromList([
      GnssCommand.opStartSession,
      seq,
      sid.length,
      ...sid,
      pid.length,
      ...pid,
    ]);
  }

  @override
  String toString() => 'StartSession($seq, $sessionId, $parcelId)';
}

final class StopSession extends GnssCommand {
  const StopSession({required int seq}) : super(seq);

  @override
  Uint8List encode() {
    _checkSeq();
    return Uint8List.fromList([GnssCommand.opStopSession, seq]);
  }

  @override
  String toString() => 'StopSession($seq)';
}

final class MarkEvent extends GnssCommand {
  const MarkEvent({required int seq, required this.type, required this.payload})
    : super(seq);

  final MarkType type;
  final String payload;

  @override
  Uint8List encode() {
    _checkSeq();
    final p = utf8.encode(payload);
    if (!GnssCommand._isValidPayloadBytes(p)) {
      throw ArgumentError.value(payload, 'payload');
    }
    return Uint8List.fromList([
      GnssCommand.opMarkEvent,
      seq,
      type.code,
      p.length,
      ...p,
    ]);
  }

  @override
  String toString() => 'MarkEvent($seq, ${type.name}, $payload)';
}

/// Outcome of [GnssCommand.decode].
class GnssCommandDecode {
  const GnssCommandDecode.success(GnssCommand this.command)
    : result = CommandResult.ok,
      seq = null;

  const GnssCommandDecode.failure(this.result, this.seq) : command = null;

  final GnssCommand? command;
  final CommandResult result;

  /// Sequence number of a rejected frame, when it was long enough to carry
  /// one. For successes use `command.seq`.
  final int? seq;
}

class _Reader {
  _Reader(this.data, this.pos);

  final List<int> data;
  int pos;

  bool get atEnd => pos == data.length;

  List<int>? bytes() {
    if (pos >= data.length) return null;
    final len = data[pos];
    if (pos + 1 + len > data.length) return null;
    final out = data.sublist(pos + 1, pos + 1 + len);
    pos += 1 + len;
    return out;
  }

  String? string() {
    final b = bytes();
    return b == null ? null : latin1.decode(b);
  }
}
