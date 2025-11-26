plugins {
    kotlin("jvm") version "1.9.24"
}

group = "com.worldcoin"
version = "3.0.8"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

dependencies {
    implementation("org.mozilla.uniffi:uniffi-runtime:0.30.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation(kotlin("stdlib"))
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

sourceSets {
    named("main") {
        java.srcDir("src/main/kotlin")
        resources.srcDir("src/main/resources")
    }
}
