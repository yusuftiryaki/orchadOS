# shared_preferences_android 2.5.0 calls its Kotlin API through JNI (Pigeon
# JNI) and ships no consumer rules. R8 renamed kotlin.coroutines.Continuation
# in the method signatures, so release builds failed on startup with
# NoSuchMethodError. tool/check_apk_jni.py checks the built APK.
-keep class io.flutter.plugins.sharedpreferences.** { *; }
-keep class kotlin.coroutines.Continuation
-keep class kotlin.Unit
