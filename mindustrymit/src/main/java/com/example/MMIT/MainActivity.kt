package com.example.MMIT

import android.content.*
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://localhost:${BackendService.HTTP_PORT}")))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        ContextCompat.registerReceiver(
            this, receiver, IntentFilter(BackendService.ACTION_BACKEND_READY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        startForegroundService(Intent(this, BackendService::class.java))
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(receiver)
    }
}
