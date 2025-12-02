plugins {
    kotlin("jvm") version "1.9.24"
    `maven-publish`
}

group = "com.worldcoin"
version = "4.0.0"

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

java {
    // ship sources for easier debugging/IDE usage
    withSourcesJar()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            groupId = "com.worldcoin"
            artifactId = "idkit"
            version = project.version.toString()
        }
    }
    repositories {
        maven {
            name = "githubPackages"
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: ""
                password = System.getenv("GITHUB_TOKEN") ?: ""
            }
        }
    }
}
