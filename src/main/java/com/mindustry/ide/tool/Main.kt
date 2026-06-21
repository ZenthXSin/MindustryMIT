package com.mindustry.ide.tool

import com.mindustry.ide.tool.json.JsonApi

/**
 * MindustryMIT 程序入口
 * @author ZenXSin
 */
fun main(args: Array<String>) {
    println("MindustryMIT - Mindustry 图形化模组编辑器后端")
    println("正在启动 WebSocket 服务器...")

    println("请输入WebSocket 服务器端口")
    print("> ")
    val line = readlnOrNull()?.trim()?.toIntOrNull() ?: 19190
    if (line == 19190) println("使用默认端口 19190")

    println("是否启用 SSL/WSS？HTTPS 页面连接必须选 y (y/N)")
    print("> ")
    val sslInput = readlnOrNull()?.trim()?.lowercase()
    val useSSL = sslInput == "y" || sslInput == "yes"
    if (useSSL) System.setProperty("mindustrymit.useSSL", "true")

    val api = JsonApi()
    api.server.port = line
    api.server.start()

    println("服务器已启动，按 Ctrl+C 停止")
    Runtime.getRuntime().addShutdownHook(Thread {
        println("正在停止服务器...")
        api.server.stop()
        println("服务器已停止")
    })
}
