package com.example.MMIT

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.mindustry.ide.tool.json.JsonApi
import fi.iki.elonen.NanoHTTPD
import kotlin.concurrent.thread

class BackendService : Service() {

    private var httpServer: NanoHTTPD? = null
    private var jsonApi: JsonApi? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification("正在启动..."))
        thread(isDaemon = true) { startBackend() }
        return START_STICKY
    }

    private fun startBackend() {
        try {
            arc.Core.settings = arc.Settings()
            mindustry.core.ContentLoader().load()
        } catch (_: Exception) {}

        httpServer = object : NanoHTTPD(HTTP_PORT) {
            override fun serve(session: IHTTPSession): Response {
                val html = assets.open("web.html").bufferedReader().readText()
                return newFixedLengthResponse(Response.Status.OK, "text/html", html)
            }
        }.also { it.start() }

        jsonApi = JsonApi().also {
            it.server.port = WS_PORT
            it.server.start()
        }

        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification("服务运行中 · 端口 $WS_PORT"))
        sendBroadcast(Intent(ACTION_BACKEND_READY))
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
        const val WS_PORT = 8317
        const val HTTP_PORT = 8080
        private const val NOTIF_ID = 1
    }
}
