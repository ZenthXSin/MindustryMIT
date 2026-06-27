package com.example.MMIT

import android.content.*
import android.net.Uri
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var consoleOutput: TextView
    private lateinit var consoleScroll: ScrollView

    private val logReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val msg = intent.getStringExtra("message") ?: return
            appendLog(msg)
        }
    }

    private val readyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:${BackendService.HTTP_PORT}")))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        consoleOutput = findViewById(R.id.consoleOutput)
        consoleScroll = findViewById(R.id.consoleScroll)

        ContextCompat.registerReceiver(
            this, logReceiver, IntentFilter(ACTION_LOG),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        ContextCompat.registerReceiver(
            this, readyReceiver, IntentFilter(BackendService.ACTION_BACKEND_READY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        startForegroundService(Intent(this, BackendService::class.java))
    }

    private fun appendLog(msg: String) {
        runOnUiThread {
            consoleOutput.append(msg + "\n")
            consoleScroll.post { consoleScroll.fullScroll(ScrollView.FOCUS_DOWN) }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(logReceiver)
        unregisterReceiver(readyReceiver)
    }

    companion object {
        const val ACTION_LOG = "com.example.MMIT.LOG"
    }
}
