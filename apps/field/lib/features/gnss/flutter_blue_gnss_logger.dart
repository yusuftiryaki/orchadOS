import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

import 'gnss_logger.dart';
import 'protocol/ble_uuids.dart';

/// flutter_blue_plus is free only for personal, nonprofit and educational
/// use; a commercial deployment needs a paid license or another BLE package.
/// Swapping is cheap because everything else depends on [GnssLogger] only.
const License flutterBluePlusLicense = License.nonprofit;

/// BLE implementation of [GnssLogger] with flutter_blue_plus.
///
/// Not covered by tests (needs a radio); the protocol and command tracking it
/// relies on are tested through [GnssLoggerBase] and the fake logger.
class FlutterBlueGnssLogger extends GnssLoggerBase {
  FlutterBlueGnssLogger({this.scanTimeout = const Duration(seconds: 10)});

  final Duration scanTimeout;

  BluetoothDevice? _device;
  BluetoothCharacteristic? _commandChar;
  StreamSubscription<List<int>>? _valueSub;
  StreamSubscription<BluetoothConnectionState>? _stateSub;

  @override
  String? get deviceName => _device?.advName;

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
      // On Android `mtu` triggers requestMtu after connecting; iOS negotiates.
      await device.connect(
        license: flutterBluePlusLicense,
        mtu: gnssRequestedMtu,
      );
      _device = device;
      await _stateSub?.cancel();
      _stateSub = device.connectionState.listen((s) {
        if (s == BluetoothConnectionState.disconnected) _onDisconnected();
      });

      final services = await device.discoverServices();
      final service = services.firstWhere(
        (s) => s.uuid == Guid(gnssServiceUuid),
      );
      final statusChar = service.characteristics.firstWhere(
        (c) => c.uuid == Guid(gnssStatusUuid),
      );
      _commandChar = service.characteristics.firstWhere(
        (c) => c.uuid == Guid(gnssCommandUuid),
      );

      await _valueSub?.cancel();
      _valueSub = statusChar.onValueReceived.listen(
        (v) => onStatusBytes(v, DateTime.now()),
      );
      device.cancelWhenDisconnected(_valueSub!);
      await statusChar.setNotifyValue(true);
      setConnection(GnssConnection.connected);
      onStatusBytes(await statusChar.read(), DateTime.now());
    } catch (e) {
      debugPrint('gnss: connect failed: $e');
      await _device?.disconnect();
      _onDisconnected();
    }
  }

  Future<BluetoothDevice?> _scan() async {
    final found = Completer<BluetoothDevice?>();
    final sub = FlutterBluePlus.onScanResults.listen((results) {
      for (final r in results) {
        if (r.advertisementData.advName.startsWith(gnssDeviceNamePrefix) &&
            !found.isCompleted) {
          found.complete(r.device);
        }
      }
    });
    try {
      await FlutterBluePlus.startScan(
        withServices: [Guid(gnssServiceUuid)],
        timeout: scanTimeout,
      );
      return await found.future.timeout(scanTimeout, onTimeout: () => null);
    } finally {
      await sub.cancel();
      await FlutterBluePlus.stopScan();
    }
  }

  void _onDisconnected() {
    _commandChar = null;
    setConnection(GnssConnection.disconnected);
  }

  @override
  @protected
  Future<void> writeCommand(Uint8List bytes) async {
    final c = _commandChar;
    if (c == null) throw StateError('not connected');
    await c.write(bytes, withoutResponse: false);
  }

  @override
  Future<void> disconnect() async {
    await _device?.disconnect();
    _onDisconnected();
  }

  @override
  Future<void> dispose() async {
    await _valueSub?.cancel();
    await _stateSub?.cancel();
    await _device?.disconnect();
    await super.dispose();
  }
}
