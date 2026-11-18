import 'dart:async';

import 'package:flutter/foundation.dart';

import 'protocol/command_result.dart';
import 'protocol/gnss_command.dart';
import 'protocol/gnss_status.dart';

/// Connection state of the BLE link to the logger.
enum GnssConnection {
  disconnected('Bağlı değil'),
  scanning('Aranıyor'),
  connecting('Bağlanıyor'),
  connected('Bağlı');

  const GnssConnection(this.label);
  final String label;
}

/// A status message and the phone time at which it arrived.
class GnssStatusSample {
  const GnssStatusSample(this.status, this.receivedAt);

  final GnssStatus status;
  final DateTime receivedAt;
}

/// The GNSS logger as the app sees it: the ESP32, or the kit recorder on the
/// Raspberry Pi, which speaks the same protocol and adds the kit extension
/// to the status (`GnssStatus.kit`).
///
/// The real implementation talks BLE (`FlutterBlueGnssLogger`); tests and the
/// development build use `FakeGnssLogger`.
abstract interface class GnssLogger {
  GnssConnection get connection;
  Stream<GnssConnection> get connectionChanges;

  /// Latest status, null before the first message.
  GnssStatusSample? get lastStatus;
  Stream<GnssStatusSample> get statusStream;

  /// Name of the connected device (e.g. `orchados-gnss-1A2B`).
  String? get deviceName;

  Future<void> connect();
  Future<void> disconnect();

  /// Starts a recording. [overrideMask] lists the kit pre-check items the
  /// crew overrode ([KitCheck] bits); it goes only to the kit recorder, since
  /// the ESP32 rejects the extra byte as malformed.
  Future<CommandResult> startSession({
    required String sessionId,
    required String parcelId,
    int? overrideMask,
  });
  Future<CommandResult> stopSession();
  Future<CommandResult> markEvent(MarkType type, String payload);

  Future<void> dispose();
}

/// Shared command and status handling. Subclasses provide the transport by
/// implementing [writeCommand] and feeding notifications to [onStatusBytes].
///
/// A command gets the next sequence number; its result is the first status
/// received after the write whose `last_cmd_seq` matches.
abstract class GnssLoggerBase implements GnssLogger {
  GnssLoggerBase({this.commandTimeout = const Duration(seconds: 3)});

  final Duration commandTimeout;

  final _statusController = StreamController<GnssStatusSample>.broadcast();
  final _connectionController = StreamController<GnssConnection>.broadcast();

  GnssConnection _connection = GnssConnection.disconnected;
  GnssStatusSample? _lastStatus;
  int _seq = 0;

  @override
  GnssConnection get connection => _connection;

  @override
  Stream<GnssConnection> get connectionChanges => _connectionController.stream;

  @override
  GnssStatusSample? get lastStatus => _lastStatus;

  @override
  Stream<GnssStatusSample> get statusStream => _statusController.stream;

  /// Writes an encoded command to the command characteristic.
  @protected
  Future<void> writeCommand(Uint8List bytes);

  @protected
  void setConnection(GnssConnection c) {
    if (c == _connection) return;
    _connection = c;
    if (!_connectionController.isClosed) _connectionController.add(c);
  }

  /// Decodes a status notification. Malformed messages are dropped.
  @protected
  void onStatusBytes(List<int> bytes, DateTime receivedAt) {
    final GnssStatus status;
    try {
      status = GnssStatus.decode(bytes);
    } on FormatException catch (e) {
      debugPrint('gnss: dropped status: ${e.message}');
      return;
    }
    final sample = GnssStatusSample(status, receivedAt.toUtc());
    _lastStatus = sample;
    if (!_statusController.isClosed) _statusController.add(sample);
  }

  int _nextSeq() => _seq = (_seq + 1) & 0xFF;

  Future<CommandResult> _send(GnssCommand Function(int seq) build) async {
    if (_connection != GnssConnection.connected) {
      return CommandResult.disconnected;
    }
    final command = build(_nextSeq());
    final bytes = command.encode();
    final done = Completer<CommandResult>();
    final sub = statusStream.listen((s) {
      if (s.status.lastCmdSeq == command.seq &&
          s.status.lastCmdResult != CommandResult.none &&
          !done.isCompleted) {
        done.complete(s.status.lastCmdResult);
      }
    });
    try {
      await writeCommand(bytes);
      return await done.future.timeout(
        commandTimeout,
        onTimeout: () => CommandResult.timeout,
      );
    } catch (e) {
      debugPrint('gnss: command $command failed: $e');
      return _connection == GnssConnection.connected
          ? CommandResult.timeout
          : CommandResult.disconnected;
    } finally {
      await sub.cancel();
    }
  }

  @override
  Future<CommandResult> startSession({
    required String sessionId,
    required String parcelId,
    int? overrideMask,
  }) {
    // Known from the latest status: only the kit appends its extension.
    final kit = _lastStatus?.status.isKit ?? false;
    final mask = kit && overrideMask != null && overrideMask != 0
        ? overrideMask
        : null;
    return _send(
      (seq) => StartSession(
        seq: seq,
        sessionId: sessionId,
        parcelId: parcelId,
        overrideMask: mask,
      ),
    );
  }

  @override
  Future<CommandResult> stopSession() => _send((seq) => StopSession(seq: seq));

  @override
  Future<CommandResult> markEvent(MarkType type, String payload) =>
      _send((seq) => MarkEvent(seq: seq, type: type, payload: payload));

  @override
  @mustCallSuper
  Future<void> dispose() async {
    await _statusController.close();
    await _connectionController.close();
  }
}
