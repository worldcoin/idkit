⚠️ IDkit Kotlin SDK is still in development.

## Installation

The Kotlin package is published to GitHub Packages as `com.worldcoin:idkit`.

GitHub Packages requires authentication for Maven downloads, even for public packages.
Create a token with `read:packages` and expose it through environment variables.

```kotlin
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven {
            url = uri("https://maven.pkg.github.com/worldcoin/idkit")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}
```

Then add the dependency:

```kotlin
implementation("com.worldcoin:idkit:<version>")
```
