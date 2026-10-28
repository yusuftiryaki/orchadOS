plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// One fixed signing key for every APK CI builds (docs: apps/field/README.md,
// "Dağıtım"), so a newer APK installs over the older one. Without the variables
// (local builds) the debug key is used.
val keystorePath: String? = System.getenv("ORCHADOS_ANDROID_KEYSTORE")
val keystorePassword: String? = System.getenv("ORCHADOS_ANDROID_KEYSTORE_PASSWORD")
val fixedKey = !keystorePath.isNullOrEmpty() && !keystorePassword.isNullOrEmpty()

android {
    namespace = "tr.orchados.orchados_field"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "tr.orchados.orchados_field"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (fixedKey) {
            create("orchados") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = System.getenv("ORCHADOS_ANDROID_KEY_ALIAS") ?: "orchados"
                keyPassword = keystorePassword
                storeType = "PKCS12"
            }
        }
    }

    buildTypes {
        // Debug builds (test APK) are a separate app next to the pilot one.
        debug {
            applicationIdSuffix = ".test"
            manifestPlaceholders["appLabel"] = "orchadOS Saha (test)"
            if (fixedKey) signingConfig = signingConfigs.getByName("orchados")
        }
        release {
            manifestPlaceholders["appLabel"] = "orchadOS Saha"
            signingConfig =
                if (fixedKey) signingConfigs.getByName("orchados") else signingConfigs.getByName("debug")
        }
        getByName("profile") {
            manifestPlaceholders["appLabel"] = "orchadOS Saha (profile)"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
