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

rootProject.name = "IDKitSampleApp"

include(":app")

includeBuild("../..") {
    dependencySubstitution {
        substitute(module("com.worldcoin:idkit")).using(project(":bindings"))
    }
}
