plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace="uk.co.ukmla.gputester"; compileSdk=35
 defaultConfig { applicationId="uk.co.ukmla.gputester"; minSdk=28; targetSdk=35; versionCode=1; versionName="0.1.0" }
 signingConfigs { getByName("debug") { storeFile=rootProject.file("preview.keystore") } }
 buildTypes { getByName("release") { signingConfig=signingConfigs.getByName("debug") } }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget="17" }
}
