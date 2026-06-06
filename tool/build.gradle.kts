plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
    kotlin("plugin.serialization") version "2.2.10"
    `maven-publish`
}

group = "com.github.zenthxsin.mindustrymit"
version = (findProperty("version") as? String)?.takeIf { it.isNotBlank() && it != "unspecified" } ?: "0.0.0-SNAPSHOT"

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            artifactId = "tool"
        }
    }
    repositories {
        maven {
            name = "GitHubPackages"
            val repo = System.getenv("GITHUB_REPOSITORY") ?: "ZenthXSin/MindustryMIT"
            url = uri("https://maven.pkg.github.com/$repo")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: (findProperty("gpr.user") as String?)
                password = System.getenv("GITHUB_TOKEN") ?: (findProperty("gpr.token") as String?)
            }
        }
    }
}

dependencies {
    // Mindustry Core
    val mindustryVersion = "v157.4"
    compileOnly("com.github.Anuken.Mindustry:core:$mindustryVersion")
    compileOnly("com.github.Anuken.Arc:arc-core:$mindustryVersion")
    
    // Kotlin Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    
    // Jsoup for HTML parsing
    implementation("org.jsoup:jsoup:1.22.2")

    // WebSocket Server
    implementation("org.java-websocket:Java-WebSocket:1.5.7")
}
