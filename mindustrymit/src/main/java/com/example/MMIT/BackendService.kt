package com.example.MMIT

import android.app.*
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.mindustry.ide.tool.json.JsonApi
import fi.iki.elonen.NanoHTTPD
import java.io.*
import kotlin.concurrent.thread

class BackendService : Service() {

    private var httpServer: NanoHTTPD? = null
    private var jsonApi: JsonApi? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification("运行中"))
        thread(isDaemon = true) { startBackend() }
        return START_STICKY
    }

    private fun sendLog(msg: String) {
        Log.d("MMIT", msg)
        LocalBroadcastManager.getInstance(this)
            .sendBroadcast(Intent(ACTION_LOG).putExtra("message", msg))
    }

    private fun captureStream(inputStream: InputStream, tag: String) {
        thread(isDaemon = true) {
            try {
                BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { reader ->
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        sendLog("[$tag] $line")
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun startBackend() {
        // 捕获 stdout/stderr
        val origOut = System.out
        val origErr = System.err
        val outPipe = PipedInputStream()
        val errPipe = PipedInputStream()
        System.setOut(PrintStream(PipedOutputStream(outPipe), true, "UTF-8"))
        System.setErr(PrintStream(PipedOutputStream(errPipe), true, "UTF-8"))
        captureStream(outPipe, "OUT")
        captureStream(errPipe, "ERR")

        sendLog("[INIT] MindustryMIT 启动中...")
        sendLog("[INIT] 正在加载 Mindustry 内容...")
        try {
            arc.Core.settings = arc.Settings()
            mindustry.core.ContentLoader().load()
            sendLog("[INIT] 内容加载完成")
        } catch (e: Exception) {
            sendLog("[WARN] 内容加载异常: ${e.message}")
        }

        sendLog("[HTTP] 启动 Web 服务器 -> 0.0.0.0:${HTTP_PORT}")
        httpServer = object : NanoHTTPD(HTTP_PORT) {
            override fun serve(session: IHTTPSession): Response {
                sendLog("[HTTP] ${session.method} ${session.uri}")
                val path = java.net.URLDecoder.decode(session.uri.trimStart('/').substringAfterLast('/'), "UTF-8")
                val assetName = when (path) {
                    "", "web.html" -> "web.html"
                    "workspace", "workspace.html" -> "workspace.html"
                    "web.css" -> "web.css"
                    "web.js" -> "web.js"
                    "icon.png", "favicon.ico" -> "icon.png"
                    "MMIT中文语言包.json" -> "MMIT中文语言包.json"
                    "MMIT权重包.json" -> "MMIT权重包.json"
                    else -> "web.html"
                }
                val mimeType = when (assetName) {
                    "web.css" -> "text/css"
                    "web.js" -> "application/javascript"
                    "icon.png" -> "image/png"
                    "MMIT中文语言包.json", "MMIT权重包.json" -> "application/json"
                    else -> "text/html"
                }
                val input = assets.open(assetName)
                return newChunkedResponse(Response.Status.OK, mimeType, input)
            }
        }.also { it.start() }
        sendLog("[HTTP] Web 服务器已启动")

        sendLog("[WS]   启动 WebSocket 服务器 -> 0.0.0.0:${WS_PORT}")
        jsonApi = JsonApi().also {
            it.server.port = WS_PORT
            it.server.start()
        }
        sendLog("[WS]   WebSocket 服务器已启动")

        sendLog("========================================")
        sendLog("[READY] 服务已就绪")
        sendLog("[HTTP]  http://127.0.0.1:${HTTP_PORT}")
        sendLog("[WS]    ws://127.0.0.1:${WS_PORT}")
        sendLog("========================================")

        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification("运行中 · HTTP:$HTTP_PORT · WS:$WS_PORT"))

        LocalBroadcastManager.getInstance(this)
            .sendBroadcast(Intent(ACTION_BACKEND_READY))
    }

    private fun buildNotification(text: String): Notification {
        val channelId = "mmit_bg"
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(channelId, "MindustryMIT", NotificationManager.IMPORTANCE_LOW)
        )
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("MindustryMIT")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .build()
    }

    override fun onDestroy() {
        httpServer?.stop()
        jsonApi?.server?.stop()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_BACKEND_READY = "com.example.MMIT.BACKEND_READY"
        const val ACTION_LOG = "com.example.MMIT.LOG"
        const val WS_PORT = 8317
        const val HTTP_PORT = 8080
        private const val NOTIF_ID = 1
    }
}
