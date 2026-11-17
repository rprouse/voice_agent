package dev.lexi.voice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/** Keeps the app at foreground priority, with mic access, during a voice conversation. */
class VoiceSessionService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Voice conversation", NotificationManager.IMPORTANCE_LOW),
      )
    }
    // Tapping the notification returns to the app.
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Lexi is listening")
      .setContentText("Voice conversation in progress")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setContentIntent(openApp)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    if (wakeLock == null) {
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lexi:voice")
        .apply { acquire(MAX_SESSION_MS) }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  private companion object {
    const val CHANNEL_ID = "voice-session"
    const val NOTIFICATION_ID = 1
    const val MAX_SESSION_MS = 60 * 60 * 1000L
  }
}
