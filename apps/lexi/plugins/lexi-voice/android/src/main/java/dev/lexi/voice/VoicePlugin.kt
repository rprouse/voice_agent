package dev.lexi.voice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * Native side of a Lexi voice conversation (see docs/stage0-results.md): a foreground
 * service keeps audio running in the background, and WebRTC plays on the call stream so the
 * volume keys must point there.
 */
@TauriPlugin
class VoicePlugin(private val activity: Activity) : Plugin(activity) {
  private var active = false

  @Command
  fun startSession(invoke: Invoke) {
    if (!active) {
      active = true
      requestNotificationPermission()
      enterCallAudio()
      ContextCompat.startForegroundService(activity, Intent(activity, VoiceSessionService::class.java))
    }
    invoke.resolve()
  }

  @Command
  fun stopSession(invoke: Invoke) {
    if (active) {
      active = false
      activity.stopService(Intent(activity, VoiceSessionService::class.java))
      leaveCallAudio()
    }
    invoke.resolve()
  }

  // Lexi doesn't change the audio mode or output device itself: the WebView's WebRTC stack
  // manages call audio (and echo cancellation), and overriding it silenced Lexi's voice.
  // It only points the volume keys at the call stream, which WebRTC plays on.
  private fun enterCallAudio() {
    activity.runOnUiThread { activity.volumeControlStream = AudioManager.STREAM_VOICE_CALL }
  }

  private fun leaveCallAudio() {
    activity.runOnUiThread { activity.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE }
  }

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      // Without it the service still runs; only its notification is hidden.
      activity.runOnUiThread {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4210)
      }
    }
  }
}
