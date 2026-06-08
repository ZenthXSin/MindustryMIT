plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm") version "2.3.21"
    kotlin("plugin.serialization") version "2.2.10"
    id("com.gradleup.shadow") version "8.3.6"
    `maven-publish`
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
    runtimeOnly("com.github.Anuken.Mindustry:core:$mindustryVersion")
    runtimeOnly("com.github.Anuken.Arc:arc-core:$mindustryVersion")

    // Kotlin Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")

    // Jsoup for HTML parsing
    implementation("org.jsoup:jsoup:1.22.2")

    // Java-WebSocket
    implementation("org.java-websocket:Java-WebSocket:1.5.4")

    testImplementation(kotlin("test"))
    testImplementation("com.github.Anuken.Mindustry:core:$mindustryVersion")
    testImplementation("com.github.Anuken.Arc:arc-core:$mindustryVersion")
}

group = "com.mindustry.ide"
version = project.findProperty("version")?.toString() ?: "0.0.0-SNAPSHOT"

tasks.withType<JavaExec> {
    jvmArgs("-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8")
}

tasks.jar {
    archiveBaseName.set("tool")
    archiveVersion.set(project.version.toString())
}

tasks.shadowJar {
    archiveBaseName.set("tool")
    archiveVersion.set(project.version.toString())
    archiveClassifier.set("")
    mergeServiceFiles()
}

tasks.build {
    dependsOn(tasks.shadowJar)
}

tasks.test {
    useJUnitPlatform()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            groupId = project.group.toString()
            artifactId = "tool"
            version = project.version.toString()
        }
    }
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/${System.getenv("GITHUB_REPOSITORY")}")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}
