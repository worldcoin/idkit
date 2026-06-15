import com.vanniktech.maven.publish.AndroidSingleVariantLibrary
import org.gradle.api.publish.maven.tasks.PublishToMavenLocal
import org.gradle.api.publish.maven.tasks.PublishToMavenRepository

plugins {
    id("com.android.library")
    kotlin("android")
    `maven-publish`
    id("com.vanniktech.maven.publish")
}

group = "com.worldcoin"

// Support version override from CI for dev releases
version = System.getenv("PKG_VERSION")?.takeIf { it.isNotBlank() }
    ?: project.version.toString().takeIf { it.isNotBlank() && it != "unspecified" }
    ?: throw GradleException("Could not find version in kotlin/gradle.properties")

android {
    namespace = "com.worldcoin.idkit"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.all { test ->
            val rustLibDir = project.projectDir.resolve("../../target/release").canonicalPath
            test.jvmArgs("-Djna.library.path=$rustLibDir")
        }
    }
}

dependencies {
    implementation("net.java.dev.jna:jna:5.14.0@aar")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
    implementation(kotlin("stdlib"))

    testImplementation(kotlin("test"))
    // The @aar variant doesn't bundle libjnidispatch — use the plain JVM jar for unit tests
    testImplementation("net.java.dev.jna:jna:5.14.0")
}

mavenPublishing {
    // Registers a repository named "mavenCentral", so the plain `publish` task now
    // targets Central too. For GitHub-Packages-only publishing use
    // `publishAllPublicationsToGitHubPackagesRepository` (what CI does for dev releases).
    publishToMavenCentral()

    // Sign only when CI supplies a key (the Maven Central publish step). Dev releases
    // to GitHub Packages run without signing secrets and must not require them.
    // Blank counts as absent: a missing GitHub secret renders as an empty env var.
    if (providers.gradleProperty("signingInMemoryKey").getOrElse("").isNotBlank()) {
        signAllPublications()
    }

    coordinates("com.worldcoin", "idkit", version.toString())

    configure(
        AndroidSingleVariantLibrary(
            variant = "release",
            sourcesJar = true,
            // Maven Central requires a javadoc jar; AGP generates a valid (near-empty) one
            publishJavadocJar = true,
        )
    )

    pom {
        name.set("IDKit Kotlin")
        description.set("Kotlin bindings for IDKit backed by the Rust core")
        url.set("https://github.com/worldcoin/idkit")
        licenses {
            license {
                name.set("MIT License")
                url.set("https://opensource.org/licenses/MIT")
            }
        }
        developers {
            developer {
                id.set("worldcoin")
                name.set("Worldcoin")
            }
        }
        scm {
            connection.set("scm:git:https://github.com/worldcoin/idkit.git")
            developerConnection.set("scm:git:ssh://git@github.com/worldcoin/idkit.git")
            url.set("https://github.com/worldcoin/idkit")
        }
    }
}

publishing {
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}

val requiredNativeAbis = listOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64")

val verifyKotlinNativeLibraries by tasks.registering {
    group = "verification"
    description = "Verifies that publishing includes native IDKit libraries for every Android ABI."

    doLast {
        val missing = requiredNativeAbis
            .map { abi -> abi to layout.projectDirectory.file("src/main/jniLibs/$abi/libidkit.so").asFile }
            .filter { (_, library) -> !library.isFile || library.length() == 0L }

        if (missing.isNotEmpty()) {
            val details = missing.joinToString(separator = "\n") { (abi, library) ->
                "- $abi: ${library.relativeTo(projectDir)}"
            }
            throw GradleException(
                "Missing native libraries required for publishing:\n$details\n" +
                    "Run `bash scripts/build-kotlin.sh` from the repository root before publishing.",
            )
        }
    }
}

tasks.withType<PublishToMavenRepository>().configureEach {
    dependsOn(verifyKotlinNativeLibraries)
}

tasks.withType<PublishToMavenLocal>().configureEach {
    dependsOn(verifyKotlinNativeLibraries)
}
