package com.example.esp32pairingapp.alerts

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat

const val MOTION_CHANNEL_ID = "motion_alerts"
const val MOTION_NOTIFICATION_ID = 1001

fun createMotionNotificationChannel(context: Context) {
    val channel = NotificationChannel(
        MOTION_CHANNEL_ID,
        "Motion Alerts",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Security camera motion detection alerts"
        enableLights(true)
        enableVibration(true)
    }
    context.getSystemService(NotificationManager::class.java)
        .createNotificationChannel(channel)
}

fun showMotionNotification(context: Context, deviceId: String) {
    val notification = NotificationCompat.Builder(context, MOTION_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_alert)
        .setContentTitle("⚠️ Intruder Detected!")
        .setContentText("Motion on $deviceId — open app to respond.")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setAutoCancel(true)
        .build()
    context.getSystemService(NotificationManager::class.java)
        .notify(MOTION_NOTIFICATION_ID, notification)
}
