plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "uk.co.ukmla.reader"
    compileSdk = 35
    ndkVersion = "27.2.12479018"
    defaultConfig {
        applicationId = "uk.co.ukmla.reader"
        minSdk = 28
        targetSdk = 35
        versionCode = 3
        versionName = "0.1.2"
        ndk { abiFilters += (project.findProperty("readerAbi") as String? ?: "arm64-v8a") }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        externalNativeBuild { cmake {
            arguments += listOf("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON")
            (project.findProperty("readerExperimentalVulkan") as String?)?.let { arguments += "-DUKMLA_READER_EXPERIMENTAL_VULKAN=$it" }
            (project.findProperty("spirvHeadersDir") as String?)?.let { arguments += "-DSPIRV-Headers_DIR=$it" }
            (project.findProperty("spirvIncludeDir") as String?)?.let { arguments += "-DSPIRV_INCLUDE_DIR=$it" }
            (project.findProperty("vulkanIncludeDir") as String?)?.let { arguments += "-DVulkan_INCLUDE_DIR=$it" }
            (project.findProperty("vulkanLibrary") as String?)?.let { arguments += "-DVulkan_LIBRARY=$it" }
            (project.findProperty("vulkanGlslcExecutable") as String?)?.let { arguments += "-DVulkan_GLSLC_EXECUTABLE=$it" }
        } }
    }
    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.22.1" } }
    signingConfigs { getByName("debug") { storeFile = rootProject.file("preview.keystore") } }
    buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("debug"); isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
