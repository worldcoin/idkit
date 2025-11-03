import java.io.ByteArrayOutputStream

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("maven-publish")
}

android {
    namespace = "org.worldcoin.idkit"
    compileSdk = 34

    defaultConfig {
        minSdk = 24

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
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

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("maven") {
                groupId = "org.worldcoin"
                artifactId = "idkit-android"

                version = if (project.hasProperty("versionName")) {
                    project.property("versionName") as String
                } else {
                    val stdout = ByteArrayOutputStream()
                    project.exec {
                        commandLine = listOf(
                            "curl", "-s", "-H",
                            "Authorization: token ${System.getenv("GITHUB_TOKEN")}",
                            "https://api.github.com/repos/worldcoin/idkit/releases/latest"
                        )
                        standardOutput = stdout
                    }
                    val response = stdout.toString()
                    val tag = Regex("\"tag_name\":\\s*\"(.*?)\"")
                        .find(response)?.groupValues?.get(1) ?: "0.0.0"
                    "$tag"
                }

                afterEvaluate {
                    from(components["release"])
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

dependencies {
    implementation("net.java.dev.jna:jna:5.13.0@aar")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
