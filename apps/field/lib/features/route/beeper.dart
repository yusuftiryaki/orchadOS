import 'package:flutter/services.dart';

/// Short sound for the "dur-çek-yürü" mode.
abstract interface class Beeper {
  Future<void> beep();
}

/// Android `ToneGenerator` beep on the notification stream (MainActivity,
/// channel `orchados/beep`), with a vibration. Where the channel is missing
/// the system click sound plays instead.
class ToneBeeper implements Beeper {
  const ToneBeeper();

  static const _channel = MethodChannel('orchados/beep');

  @override
  Future<void> beep() async {
    try {
      await _channel.invokeMethod<void>('beep', {'ms': 200});
    } on MissingPluginException {
      await SystemSound.play(SystemSoundType.click);
    } on PlatformException {
      await SystemSound.play(SystemSoundType.click);
    }
    await HapticFeedback.heavyImpact();
  }
}
