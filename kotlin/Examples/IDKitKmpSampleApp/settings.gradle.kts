pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "IDKitKmpSampleApp"

include(":shared")
include(":androidApp")
include(":idkit")
project(":idkit").projectDir = file("../../idkit")
