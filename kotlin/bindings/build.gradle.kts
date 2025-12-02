plugins {
    kotlin("jvm") version "1.9.24"
    `maven-publish`
    signing
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
    // align with external android lib publishing expectations
    withJavadocJar()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
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
            name = "githubPackages"
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: ""
                password = System.getenv("GITHUB_TOKEN") ?: ""
            }
        }
        // Sonatype (Maven Central) kept for later enablement; requires OSSRH credentials and signing
        // maven {
        //     name = "sonatype"
        //     url = uri(
        //         if (version.toString().endsWith("SNAPSHOT"))
        //             "https://s01.oss.sonatype.org/content/repositories/snapshots/"
        //         else
        //             "https://s01.oss.sonatype.org/service/local/staging/deploy/maven2/"
        //     )
        //     credentials {
        //         username = System.getenv("OSSRH_USERNAME")
        //         password = System.getenv("OSSRH_PASSWORD")
        //     }
        // }
    }
}

signing {
    val signingKey = System.getenv("SIGNING_KEY")
    val signingPassword = System.getenv("SIGNING_PASSWORD")
    val wantsPublish = gradle.startParameter.taskNames.any { it.contains("publish", ignoreCase = true) }

    if (wantsPublish && (signingKey.isNullOrBlank() || signingPassword.isNullOrBlank())) {
        throw GradleException("SIGNING_KEY and SIGNING_PASSWORD must be set for publishing")
    }

    useInMemoryPgpKeys(signingKey, signingPassword)
    sign(publishing.publications["maven"])
}
