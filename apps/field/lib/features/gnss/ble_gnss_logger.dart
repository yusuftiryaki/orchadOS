import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:universal_ble/universal_ble.dart';

import 'gnss_logger.dart';
import 'protocol/ble_uuids.dart';

/// BLE implementation of [GnssLogger] with universal_ble (BSD-3-Clause, free
/// for commercial use).
///
/// Not covered by tests (needs a radio); the protocol and command tracking it
/// relies on are tested through [GnssLoggerBase] and the fake logger.
class BleGnssLogger extends GnssLoggerBase {
  BleGnssLogger({this.scanTimeout = const Duration(seconds: 10)});

  final Duration scanTimeout;

  BleDevice? _device;
  BleCharacteristic? _commandChar;
  StreamSubscription<Uint8List>? _valueSub;
  StreamSubscription<bool>? _stateSub;

  @override
  String? get deviceName => _device?.name;

  @override
  Future<void> connect() async {
    if (connection != GnssConnection.disconnected) return;
    setConnection(GnssConnection.scanning);
    try {
      final device = await _scan();
      if (device == null) {
        setConnection(GnssConnection.disconnected);
        return;
      }
      setConnection(GnssConnection.connecting);
      await device.connect();
      _device = device;
      await _stateSub?.cancel();
      _stateSub = device.connectionStream.listen((connected) {
        if (!connected) _onDisconnected();
      });

      final services = await device.discoverServices();
      final service = services.firstWhere(
        (s) => BleUuidParser.compareStrings(s.uuid, gnssServiceUuid),
      );
      BleCharacteristic characteristic(String uuid) => service.characteristics
          .firstWhere((c) => BleUuidParser.compareStrings(c.uuid, uuid));
      final statusChar = characteristic(gnssStatusUuid);
      _commandChar = characteristic(gnssCommandUuid);
      // Android needs an explicit request; iOS negotiates on its own.
      if (defaultTargetPlatform == TargetPlatform.android) {
        await device.requestMtu(gnssRequestedMtu);
      }

      await _valueSub?.cancel();
      _valueSub = statusChar.onValueReceived.listen(
        (v) => onStatusBytes(v, DateTime.now()),
      );
      await statusChar.notifications.subscribe();
      setConnection(GnssConnection.connected);
      onStatusBytes(await statusChar.read(), DateTime.now());
    } catch (e) {
      debugPrint('gnss: connect failed: $e');
      await _disconnectQuietly();
      _onDisconnected();
    }
  }

  Future<BleDevice?> _scan() async {
    final found = Completer<BleDevice?>();
    final sub = UniversalBle.scanStream.listen((d) {
      if ((d.name ?? '').startsWith(gnssDeviceNamePrefix) &&
          !found.isCompleted) {
        found.complete(d);
      }
    });
    try {
      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [gnssServiceUuid]),
      );
      return await found.future.timeout(scanTimeout, onTimeout: () => null);
    } finally {
      await sub.cancel();
      await UniversalBle.stopScan();
    }
  }

  Future<void> _disconnectQuietly() async {
    try {
      await _device?.disconnect();
    } catch (e) {
      debugPrint('gnss: disconnect failed: $e');
    }
  }

  void _onDisconnected() {
    _commandChar = null;
    _valueSub?.cancel();
    _valueSub = null;
    setConnection(GnssConnection.disconnected);
  }

  @override
  @protected
  Future<void> writeCommand(Uint8List bytes) async {
    final c = _commandChar;
    if (c == null) throw StateError('not connected');
    await c.write(bytes, withResponse: true);
  }

  @override
  Future<void> disconnect() async {
    await _disconnectQuietly();
    _onDisconnected();
  }

  @override
  Future<void> dispose() async {
    await _valueSub?.cancel();
    await _stateSub?.cancel();
    await _disconnectQuietly();
    await super.dispose();
  }
}
