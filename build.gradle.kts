plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm") version "2.3.21"
    kotlin("plugin.serialization") version "2.2.10"
}

repositories{
    mavenCentral()
    maven { url = uri("https://raw.githubusercontent.com/Zelaux/MindustryRepo/master/repository") }
    maven { url = uri("https://jitpack.io") }
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

    // Java-WebSocket
    implementation("org.java-websocket:Java-WebSocket:1.5.4")
}