plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace="uk.co.ukmla.gputester"; compileSdk=35
 defaultConfig { applicationId="uk.co.ukmla.gputester"; minSdk=28; targetSdk=35; versionCode=2; versionName="0.1.1"; testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner" }
 if(project.hasProperty("testNoNative")) sourceSets.getByName("main").jniLibs.setSrcDirs(emptyList<String>())
 signingConfigs { getByName("debug") { storeFile=rootProject.file("preview.keystore") } }
 buildTypes { getByName("release") { signingConfig=signingConfigs.getByName("debug") } }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget="17" }
}

dependencies { androidTestImplementation("androidx.test:runner:1.6.2"); androidTestImplementation("androidx.test.ext:junit:1.2.1") }
