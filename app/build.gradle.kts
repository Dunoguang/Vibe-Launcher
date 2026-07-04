plugins {
    id("com.android.application")
}

val signingKeystorePath = System.getenv("ANDROID_SIGNING_KEYSTORE_PATH") ?: "vibe-launcher.p12"
val signingStorePassword = System.getenv("ANDROID_SIGNING_STORE_PASSWORD")
val signingKeyAlias = System.getenv("ANDROID_SIGNING_KEY_ALIAS")
val signingKeyPassword = System.getenv("ANDROID_SIGNING_KEY_PASSWORD")
val hasReleaseSigning = (signingKeystorePath != null && file(signingKeystorePath).exists() && signingStorePassword != null)

android {
    namespace = "com.dng.launcher"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.dng.launcher"
        minSdk = 27
        targetSdk = 37
        versionCode = (System.currentTimeMillis() / 1000).toInt()
        versionName = (System.currentTimeMillis() / 1000).toString()
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(signingKeystorePath!!)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.code.gson:gson:2.11.0")
}
