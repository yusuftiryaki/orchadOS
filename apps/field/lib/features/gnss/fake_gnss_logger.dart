import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/geo/geo.dart';
import '../../core/time/clock.dart';
import '../../core/time/gps_time.dart';
import 'gnss_logger.dart';
import 'protocol/command_result.dart';
import 'protocol/gnss_command.dart';
import 'protocol/gnss_status.dart';

/// In-memory stand-in for the ESP32 logger.
///
/// It decodes the same bytes the real device would receive and answers with
/// encoded status messages, so the protocol code runs end to end. Used by
/// tests and by the development build when no device is available.
class FakeGnssLogger extends GnssLoggerBase {
  FakeGnssLogger({
    this.clock = const SystemClock(),
    this.provideGpsTime = true,
    this.phoneClockErrorMs = 0,
    this.autoTick = false,
    this.position,
    this.path,
    GnssStatus? initialStatus,
    super.commandTimeout,
  }) : _status = initialStatus ?? healthyStatus;

  final Clock clock;

  /// Send the 39-byte status of firmware 0.2.0+ (with `gps_time_ns`); false
  /// imitates firmware 0.1.0 (31 bytes, no GPS time).
  bool provideGpsTime;

  /// How far the simulated phone clock lags true GPS time (ms).
  int phoneClockErrorMs;

  /// Emit a status every second like the firmware. Off in widget tests,
  /// which call [tick] instead.
  final bool autoTick;

  /// Receiver position sent in the status (51-byte form); null sends no
  /// position block, like firmware 0.2.0.
  GeoPoint? position;

  /// Moves [position] on every [tick] (demo walk); null keeps it.
  final GeoPoint? Function(DateTime now)? path;

  /// Every command received, in order.
  final List<GnssCommand> receivedCommands = [];

  /// Forced result for the next command (e.g. [CommandResult.sdMissing]).
  CommandResult? nextResult;

  /// When set, commands are swallowed without a status reply.
  bool unresponsive = false;

  GnssStatus _status;
  Timer? _timer;
  final Set<String> _sessionsOnCard = {};

  static const GnssStatus healthyStatus = GnssStatus(
    version: 1,
    recording: false,
    flags:
        GnssStatus.flagSdPresent |
        GnssStatus.flagTimeMapped |
        GnssStatus.flagGnssFixOk,
    rxConfig: RxConfig.ok,
    ppsState: PpsState.locked,
    fixType: 3,
    carrierSolution: CarrierSolution.fixed,
    numSv: 24,
    hAccMm: 14,
    bytesWritten: 0,
    sdFreeMib: 30000,
    batteryMv: 18200,
    firmwareVersion: '0.1.0',
    droppedBytes: 0,
    lastCmdSeq: 0,
    lastCmdResult: CommandResult.none,
  );

  GnssStatus get status => _status;

  /// Replaces the simulated device state (e.g. to remove the SD card).
  set status(GnssStatus s) {
    _status = s;
    tick();
  }

  @override
  String? get deviceName =>
      connection == GnssConnection.connected ? 'orchados-gnss-FAKE' : null;

  @override
  Future<void> connect() async {
    setConnection(GnssConnection.connected);
    tick();
    if (autoTick) {
      _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => tick());
    }
  }

  @override
  Future<void> disconnect() async {
    _timer?.cancel();
    _timer = null;
    setConnection(GnssConnection.disconnected);
  }

  /// Sends one status notification.
  void tick() {
    if (connection != GnssConnection.connected) return;
    final now = clock.now();
    final withTime = provideGpsTime && _status.timeMapped;
    final walked = path?.call(now);
    if (walked != null) position = walked;
    final at = position;
    if (_status.recording) {
      _status = _status.copyWith(bytesWritten: _status.bytesWritten + 6000);
    }
    final gpsNs = (utcToGpsUs(now) + phoneClockErrorMs * 1000) * 1000;
    var status = withTime ? _status.copyWith(gpsTimeNs: gpsNs) : _status;
    if (at != null) {
      status = status.copyWith(
        latE7: (at.lat * 1e7).round(),
        lonE7: (at.lon * 1e7).round(),
        heightMm: 850000,
      );
    }
    final bytes = status.encode(
      includeGpsTime: withTime,
      includePosition: at != null,
    );
    onStatusBytes(bytes, now);
  }

  @override
  @protected
  Future<void> writeCommand(Uint8List bytes) async {
    final decoded = GnssCommand.decode(bytes);
    final command = decoded.command;
    if (command != null) receivedCommands.add(command);
    if (unresponsive) return;
    final seq = command?.seq ?? decoded.seq ?? 0;
    final result = nextResult ?? _apply(decoded);
    nextResult = null;
    _status = _status.copyWith(lastCmdSeq: seq, lastCmdResult: result);
    // The firmware notifies right after processing a command.
    scheduleMicrotask(tick);
  }

  CommandResult _apply(GnssCommandDecode decoded) {
    final command = decoded.command;
    if (command == null) return decoded.result;
    switch (command) {
      case StartSession(:final sessionId):
        if (_status.recording) return CommandResult.alreadyRecording;
        if (!_status.sdPresent) return CommandResult.sdMissing;
        if (_status.sdLowSpace) return CommandResult.sdFull;
        if (_status.sdError) return CommandResult.sdError;
        if (!_sessionsOnCard.add(sessionId)) {
          return CommandResult.sessionExists;
        }
        _status = _status.copyWith(recording: true, bytesWritten: 0);
        return CommandResult.ok;
      case StopSession():
        if (!_status.recording) return CommandResult.notRecording;
        _status = _status.copyWith(recording: false);
        return CommandResult.ok;
      case MarkEvent():
        return _status.recording
            ? CommandResult.ok
            : CommandResult.notRecording;
    }
  }

  @override
  Future<void> dispose() async {
    _timer?.cancel();
    await super.dispose();
  }
}
