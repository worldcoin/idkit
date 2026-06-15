plugins {
    id("com.android.library") version "8.7.3" apply false
    kotlin("android") version "1.9.24" apply false
    // 0.35.0+ requires Gradle >= 8.13 (0.36.0: Gradle 9 / AGP 8.13 / Kotlin 2.2);
    // do not bump past 0.34.0 without upgrading the toolchain
    id("com.vanniktech.maven.publish") version "0.34.0" apply false
}
