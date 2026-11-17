package dev.lexi.app

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Edge-to-edge is mandatory from Android 15 (targetSdk 35+), so the web content would
    // otherwise sit under the status bar, navigation bar and keyboard. Pad the content view
    // by those insets instead; Android WebView doesn't reliably report them to CSS.
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    // Matches --surface in apps/lexi/src/styles.css, so the bars blend into the header/footer.
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES
    content.setBackgroundColor(if (night) Color.parseColor("#20201f") else Color.WHITE)

    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime(),
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    // Lexi's voice starts playing several seconds after the Talk tap (token fetch + WebRTC
    // setup), which can fall outside WebView's user-gesture window and leave the agent
    // silent. Lexi only loads its own bundled page, so allow playback without a gesture.
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }
}
