import com.vanniktech.maven.publish.AndroidSingleVariantLibrary
import org.gradle.api.publish.maven.MavenPublication
import org.gradle.api.publish.maven.tasks.PublishToMavenLocal
import org.gradle.api.publish.maven.tasks.PublishToMavenRepository
import org.gradle.jvm.tasks.Jar

plugins {
    id("com.android.library")
    kotlin("android")
    id("com.vanniktech.maven.publish.base") version "0.34.0"
}

val libraryGroup = "com.worldcoin"
val libraryArtifactId = "idkit"

// Allow callers to exercise the Maven publication with an explicit artifact version.
val libraryVersion = System.getenv("PKG_VERSION")?.takeIf { it.isNotBlank() }
    ?: project.version.toString().takeIf { it.isNotBlank() && it != "unspecified" }
    ?: throw GradleException("Could not find version in kotlin/gradle.properties")

val enableMavenCentralPublishing = providers.gradleProperty("idkit.publish.mavenCentral")
    .map(String::toBoolean)
    .orElse(false)

val emptyJavadocJar by tasks.registering(Jar::class) {
    archiveClassifier.set("javadoc")
}

val requiredNativeAbis = listOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
val verifyKotlinNativeLibraries by tasks.registering {
    group = "verification"
    description = "Verifies that Kotlin publishing includes native IDKit libraries for every Android ABI."

    doLast {
        val missingLibraries = requiredNativeAbis.map { abi ->
            abi to layout.projectDirectory.file("src/main/jniLibs/$abi/libidkit.so").asFile
        }.filter { (_, library) ->
            !library.isFile || library.length() == 0L
        }

        if (missingLibraries.isNotEmpty()) {
            val missing = missingLibraries.joinToString(separator = "\n") { (abi, library) ->
                "- $abi: ${library.relativeTo(projectDir)}"
            }
            throw GradleException(
                "Missing native libraries required for publishing:\n$missing\n" +
                    "Run `bash scripts/build-kotlin.sh` from the repository root before publishing.",
            )
        }
    }
}

group = libraryGroup
version = libraryVersion

android {
    namespace = "com.worldcoin.idkit"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        minSdk = 23
        buildConfigField("String", "IDKIT_PACKAGE_VERSION", "\"$libraryVersion\"")
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
    configure(
        AndroidSingleVariantLibrary(
            variant = "release",
            sourcesJar = true,
            publishJavadocJar = false,
        ),
    )

    coordinates(libraryGroup, libraryArtifactId, libraryVersion)

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

    if (enableMavenCentralPublishing.get()) {
        publishToMavenCentral()
        signAllPublications()
    }
}

publishing {
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = providers.environmentVariable("GITHUB_ACTOR")
                    .orElse(providers.environmentVariable("GITHUB_USER"))
                    .orNull
                password = providers.environmentVariable("GITHUB_TOKEN").orNull
            }
        }
    }
}

tasks.withType<PublishToMavenRepository>().configureEach {
    dependsOn(verifyKotlinNativeLibraries)
}

tasks.withType<PublishToMavenLocal>().configureEach {
    dependsOn(verifyKotlinNativeLibraries)
}

afterEvaluate {
    publishing {
        publications.withType<MavenPublication>().configureEach {
            artifact(emptyJavadocJar)
        }
    }
}
