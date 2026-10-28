# Plugins built on jni (jnigen / Pigeon JNI, e.g. shared_preferences_android
# 2.5.0) look classes and members up by name and signature at runtime and ship
# no R8 rules for it. Renaming or removing them crashed the release build on
# startup (NoSuchMethodError, ClassNotFoundException). Shrinking stays on;
# renaming is off, and the classes the lookups need are kept.
# tool/check_apk_jni.py checks the built APK against every lookup.
-dontobfuscate
-keep class io.flutter.plugins.sharedpreferences.** { *; }
# Kotlin runtime used by package:jni (lib/src/kotlin.dart) for suspend calls.
-keep class kotlin.Unit { *; }
-keep class kotlin.Result { *; }
-keep class kotlin.Result$Failure { *; }
-keep class kotlin.coroutines.Continuation { *; }
-keep class kotlin.coroutines.intrinsics.** { *; }
-keep class kotlin.jvm.internal.DefaultConstructorMarker
-keep class kotlin.enums.EnumEntries
