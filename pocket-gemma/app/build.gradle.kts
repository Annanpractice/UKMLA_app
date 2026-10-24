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
        // Every GitHub workflow run receives a higher Android versionCode;
        // users can install future builds as upgrades rather than downgrades.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()?.let { 1000 + it } ?: 13
        versionName = "2.0.2"
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
    }
    // Use the standard Android development signing configuration. GitHub
    // restores the same fixed test-only debug keystore for each build.
    buildTypes {
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
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.ui:ui:1.9.2")
    implementation("androidx.compose.ui:ui-tooling-preview:1.9.2")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.17.1")
    debugImplementation("androidx.compose.ui:ui-tooling:1.9.2")
}
