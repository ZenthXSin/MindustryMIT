// Top-level build file where you can add configuration options common to all subprojects/modules.
plugins {
    id("org.jetbrains.kotlin.jvm") version "2.3.21" apply false
}

// 配置 tool 模块
subprojects {
    if (name == "tool") {
        apply(plugin = "java-library")
        apply(plugin = "org.jetbrains.kotlin.jvm")
    }
}