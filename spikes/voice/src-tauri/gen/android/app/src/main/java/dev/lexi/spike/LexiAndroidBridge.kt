package dev.lexi.spike

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

// Spike only: exposed to the page as window.LexiAndroid.
class LexiAndroidBridge(private val activity: Activity) {
  private val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val headsetTypes = setOf(
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
  )

  /** Voice-call audio mode turns on the phone's hardware echo cancellation. */
  @JavascriptInterface
  fun setCommunicationMode(enabled: Boolean): String {
    if (enabled) {
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // Call mode defaults to the earpiece; prefer a headset, otherwise the loudspeaker.
        val devices = audio.availableCommunicationDevices
        val preferred = devices.firstOrNull { it.type in headsetTypes }
          ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        if (preferred != null) audio.setCommunicationDevice(preferred)
      } else {
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = !headsetConnected()
      }
    } else {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audio.clearCommunicationDevice()
      } else {
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = false
      }
      audio.mode = AudioManager.MODE_NORMAL
    }
    return state()
  }

  /** WebRTC plays on the voice-call stream; point the hardware volume keys at it during a session. */
  @JavascriptInterface
  fun setVolumeKeysToCall(enabled: Boolean): String {
    activity.runOnUiThread {
      activity.volumeControlStream =
        if (enabled) AudioManager.STREAM_VOICE_CALL else AudioManager.USE_DEFAULT_STREAM_TYPE
    }
    return "volume keys -> ${if (enabled) "call" else "default"}"
  }

  /** Foreground service keeps the mic and audio running while the app is in the background. */
  @JavascriptInterface
  fun startKeepAlive(): String {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      activity.runOnUiThread {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
      }
    }
    ContextCompat.startForegroundService(activity, Intent(activity, VoiceSessionService::class.java))
    return "keep-alive started"
  }

  @JavascriptInterface
  fun stopKeepAlive(): String {
    activity.stopService(Intent(activity, VoiceSessionService::class.java))
    return "keep-alive stopped"
  }

  @JavascriptInterface
  fun state(): String {
    val mode = when (audio.mode) {
      AudioManager.MODE_NORMAL -> "normal"
      AudioManager.MODE_IN_COMMUNICATION -> "in-communication"
      AudioManager.MODE_IN_CALL -> "in-call"
      else -> audio.mode.toString()
    }
    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.communicationDevice?.let { "${it.productName} (type ${it.type})" } ?: "none"
    } else {
      @Suppress("DEPRECATION")
      if (audio.isSpeakerphoneOn) "speakerphone" else "default"
    }
    fun vol(stream: Int) = "${audio.getStreamVolume(stream)}/${audio.getStreamMaxVolume(stream)}"
    return "audio mode=$mode, comm device=$device, headset=${headsetConnected()}, " +
      "call vol=${vol(AudioManager.STREAM_VOICE_CALL)}, media vol=${vol(AudioManager.STREAM_MUSIC)}"
  }

  private fun headsetConnected() =
    audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in headsetTypes }
}
