plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.android.library")
}

kotlin {
    jvmToolchain(17)

    androidTarget()

    listOf(iosArm64(), iosSimulatorArm64(), iosX64()).forEach { target ->
        target.binaries.framework {
            baseName = "SampleShared"
            isStatic = true
            // Export the SDK so Swift sees IDKit types through this framework.
            export(project(":idkit"))
        }
    }

    sourceSets {
        commonMain {
            dependencies {
                api(project(":idkit"))
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
                implementation("io.ktor:ktor-client-core:3.5.1")
            }
        }
        androidMain {
            dependencies {
                implementation("io.ktor:ktor-client-okhttp:3.5.1")
            }
        }
        iosMain {
            dependencies {
                implementation("io.ktor:ktor-client-darwin:3.5.1")
            }
        }
    }
}

android {
    namespace = "com.worldcoin.idkit.kmpsample.shared"
    compileSdk = 35

    defaultConfig {
        minSdk = 23
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
