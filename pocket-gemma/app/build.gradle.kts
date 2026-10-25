plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.pocketgemma"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.clara.assistant"
        minSdk = 26
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Every GitHub workflow run receives a higher Android versionCode;
        // users can install future builds as upgrades rather than downgrades.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()?.let { 1000 + it } ?: 13
        versionName = "2.1.0"
    }

    // Build the original package and an independently installable companion.
    // The companion keeps the currently installed Clara's data untouched.
    flavorDimensions += "edition"
    productFlavors {
        create("regular") {
            dimension = "edition"
            resValue("string", "clara_app_name", "Clara")
        }
        create("study") {
            dimension = "edition"
            applicationIdSuffix = ".study"
            versionNameSuffix = "-study"
            resValue("string", "clara_app_name", "Clara Study")
        }
        // Rescue installation for users with earlier, differently signed Clara
        // Study builds. This is a NEW package, not an in-place data migration.
        create("cards") {
            dimension = "edition"
            applicationIdSuffix = ".cards"
            versionNameSuffix = "-cards"
            resValue("string", "clara_app_name", "Clara Cards")
        }
    }
    // Explicitly bind all test APKs to the version-controlled debug key.
    // Relying on Android's implicit debug.keystore location caused GitHub's
    // ephemeral runners to sign successive versions with different keys.
    signingConfigs {
        create("claraFixedDebug") {
            storeFile = rootProject.file("clara-fixed-debug.keystore")
            storeType = "jks"
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("claraFixedDebug")
        }
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
    packaging { jniLibs.useLegacyPackaging = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.9.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.9.2")
    implementation("androidx.core:core-ktx:1.17.0")
    // Sanitize imported rich HTML before allowing native WebView text selection.
    implementation("org.jsoup:jsoup:1.21.2")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.ui:ui:1.9.2")
    implementation("androidx.compose.ui:ui-tooling-preview:1.9.2")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.17.1")
    debugImplementation("androidx.compose.ui:ui-tooling:1.9.2")
}
