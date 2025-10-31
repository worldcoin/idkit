plugins {
    kotlin("multiplatform") version "2.0.0"
    kotlin("plugin.serialization") version "2.0.0"
    id("com.android.library") version "8.2.0"
    id("maven-publish")
}

group = "org.worldcoin"
version = "3.0.0"

repositories {
    google()
    mavenCentral()
}

kotlin {
    androidTarget {
        publishLibraryVariants("release", "debug")
    }

    jvm()

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
            }
        }

        val androidMain by getting {
            dependencies {
                implementation("androidx.core:core-ktx:1.12.0")
            }
        }

        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }
    }
}

android {
    namespace = "org.worldcoin.idkit"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.register("generateUniFFI") {
    doLast {
        exec {
            workingDir = file("../")
            commandLine("cargo", "build", "-p", "idkit-uniffi", "--release")
        }
        exec {
            workingDir = file("../")
            commandLine(
                "cargo",
                "run",
                "--bin",
                "uniffi-bindgen",
                "generate",
                "--library",
                "../target/release/libidkit.so",
                "--language",
                "kotlin",
                "--out-dir",
                "./kotlin/idkit/src/commonMain/kotlin"
            )
        }
    }
}
