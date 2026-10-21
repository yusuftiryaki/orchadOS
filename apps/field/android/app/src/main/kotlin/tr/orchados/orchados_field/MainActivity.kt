package tr.orchados.orchados_field

import android.media.AudioManager
import android.media.ToneGenerator
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var tones: ToneGenerator? = null

    // "Dur-çek-yürü" beep (lib/features/route/beeper.dart): no audio
    // package needed for one short tone.
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "orchados/beep")
            .setMethodCallHandler { call, result ->
                if (call.method == "beep") {
                    val ms = call.argument<Int>("ms") ?: 200
                    val gen = tones ?: ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
                        .also { tones = it }
                    gen.startTone(ToneGenerator.TONE_PROP_BEEP, ms)
                    result.success(null)
                } else {
                    result.notImplemented()
                }
            }
    }

    override fun onDestroy() {
        tones?.release()
        tones = null
        super.onDestroy()
    }
}
