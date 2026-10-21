import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Tells the sync when the phone gets a network connection back.
///
/// "Online" only means a network interface is up (Wi-Fi, mobile data); the
/// server may still be out of reach, which the SyncWorker handles with
/// retries.
abstract interface class ConnectivityMonitor {
  /// Emits true when a connection comes up and false when the last one goes.
  Stream<bool> get onlineChanges;
}

class PluginConnectivityMonitor implements ConnectivityMonitor {
  PluginConnectivityMonitor([Connectivity? connectivity])
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Stream<bool> get onlineChanges => _connectivity.onConnectivityChanged
      .map((r) => r.any((c) => c != ConnectivityResult.none))
      .distinct();
}

/// For tests and builds without a network plugin.
class ManualConnectivityMonitor implements ConnectivityMonitor {
  final _changes = StreamController<bool>.broadcast();

  void set(bool online) => _changes.add(online);

  @override
  Stream<bool> get onlineChanges => _changes.stream;

  Future<void> dispose() => _changes.close();
}
