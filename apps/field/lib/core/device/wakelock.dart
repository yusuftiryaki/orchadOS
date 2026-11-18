import 'package:flutter/foundation.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Keeps the phone's screen on. The phone sits on the handlebar during a
/// recording; the screen stays on instead of a background service.
abstract interface class Wakelock {
  Future<void> enable();
  Future<void> disable();
}

/// `wakelock_plus`. Errors are logged, never thrown.
class PluginWakelock implements Wakelock {
  const PluginWakelock();

  @override
  Future<void> enable() => _toggle(true);

  @override
  Future<void> disable() => _toggle(false);

  static Future<void> _toggle(bool on) async {
    try {
      await WakelockPlus.toggle(enable: on);
    } catch (e) {
      debugPrint('wakelock: $e');
    }
  }
}

/// Remembers the state instead of touching the screen (tests).
class FakeWakelock implements Wakelock {
  bool enabled = false;

  @override
  Future<void> enable() async => enabled = true;

  @override
  Future<void> disable() async => enabled = false;
}
