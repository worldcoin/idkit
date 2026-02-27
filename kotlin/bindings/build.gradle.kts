plugins {
    id("com.android.library")
    kotlin("android")
    `maven-publish`
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

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

dependencies {
    implementation("net.java.dev.jna:jna:5.14.0@aar")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
    implementation(kotlin("stdlib"))

    testImplementation(kotlin("test"))
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("maven") {
                from(components["release"])
                groupId = "com.worldcoin"
                artifactId = "idkit"
                version = project.version.toString()
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
        }
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
}
