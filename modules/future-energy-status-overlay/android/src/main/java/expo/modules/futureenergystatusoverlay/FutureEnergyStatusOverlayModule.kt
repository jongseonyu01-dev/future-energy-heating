package expo.modules.futureenergystatusoverlay

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max

/**
 * A deliberately optional, non-sensitive status surface. It has no location
 * collection, networking, identity, detailed place, coordinate, credential, or stop logic.
 * The existing FGS notification remains the reliable control surface.
 *
 * Every native call carries a monotonic owner generation. Delayed A show/update/hide
 * calls are ignored after terminal invalidation or replacement B has claimed a newer
 * generation. The displayed storage age is derived only from the native device clock
 * and the last server-accepted timestamp supplied by JS; it never proves a future
 * callback, request, response, or server save.
 */
class FutureEnergyStatusOverlayModule : Module() {
  private var overlay: LinearLayout? = null
  private var label: TextView? = null
  private var activeOwnerId: String? = null
  private var activeOwnerGeneration: Long = 0
  private var statusText: String = "위치 공유 상태 확인 중"
  private var lastStoredAt: Long? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var ageTicker: Runnable? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("FutureEnergyStatusOverlay")

    AsyncFunction("getStatus") {
      status()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openPermissionSettings") {
      if (canDrawOverlays()) {
        status()
      } else {
        try {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          mapOf("available" to true, "permission" to false, "visible" to isVisible(), "settingsOpened" to true)
        } catch (_: Exception) {
          mapOf("available" to true, "permission" to false, "visible" to isVisible(), "settingsOpened" to false)
        }
      }
    }.runOnQueue(Queues.MAIN)

    // Claiming a newer owner hides any old optional window, but does not open a
    // new one. The technician must explicitly choose to show it again.
    AsyncFunction("activateOwner") { ownerId: String, generation: Double ->
      activateOwner(ownerId, generation.toLong())
      status()
    }.runOnQueue(Queues.MAIN)

    // Terminal/stop/close revokes the matching owner's visual authority before
    // native location cleanup awaits. A late A invalidation cannot hide newer B.
    AsyncFunction("invalidateOwner") { ownerId: String, generation: Double ->
      invalidateOwner(ownerId, generation.toLong())
      status()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("show") { ownerId: String, generation: Double, nextStatusText: String, storedAt: Double? ->
      if (!owns(ownerId, generation.toLong()) || !canDrawOverlays()) return@AsyncFunction status()
      val manager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      setPresentation(nextStatusText, storedAt)
      try {
        if (overlay == null) {
          val root = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(8), dp(8))
            setBackgroundColor(Color.argb(235, 22, 30, 43))
            elevation = dp(8).toFloat()
            contentDescription = "위치 공유 상태창"
          }
          label = TextView(context).apply {
            setTextColor(Color.WHITE)
            textSize = 12f
            maxLines = 2
            setPadding(0, 0, dp(8), 0)
          }
          val open = TextView(context).apply {
            text = "앱 열기"
            setTextColor(Color.rgb(125, 211, 252))
            textSize = 12f
            setPadding(dp(8), dp(8), dp(8), dp(8))
            setOnClickListener { openApp() }
          }
          val close = TextView(context).apply {
            text = "닫기"
            setTextColor(Color.rgb(203, 213, 225))
            textSize = 12f
            setPadding(dp(8), dp(8), 0, dp(8))
            // This only closes the visual surface. JS owner invalidation blocks
            // a concurrently delayed show/update from reopening it.
            setOnClickListener {
              val currentOwner = activeOwnerId
              if (currentOwner != null) invalidateOwner(currentOwner, activeOwnerGeneration + 1)
              else hideOverlay()
            }
          }
          root.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
          root.addView(open)
          root.addView(close)
          val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
          }
          val params = WindowManager.LayoutParams(
            dp(280),
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
          ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(8)
            y = dp(56)
          }
          manager.addView(root, params)
          overlay = root
        }
        refreshLabelAndScheduleTicker()
      } catch (_: Exception) {
        // Permission can be revoked while Settings is open; degrade without
        // touching the independent FGS/task/session lifecycle.
        hideOverlay()
      }
      status()
    }.runOnQueue(Queues.MAIN)

    // Headless task diagnostics may update a window the technician already
    // chose to show, but must never reopen one after close/terminal/replacement.
    AsyncFunction("updateIfVisible") { ownerId: String, generation: Double, nextStatusText: String, storedAt: Double? ->
      if (!owns(ownerId, generation.toLong()) || !isVisible()) return@AsyncFunction status()
      setPresentation(nextStatusText, storedAt)
      refreshLabelAndScheduleTicker()
      status()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("hide") { ownerId: String, generation: Double ->
      if (owns(ownerId, generation.toLong())) hideOverlay()
      status()
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      activeOwnerId = null
      activeOwnerGeneration += 1
      hideOverlay()
    }
  }

  private fun activateOwner(ownerId: String, generation: Long) {
    if (generation < activeOwnerGeneration) return
    val changed = activeOwnerId != ownerId || activeOwnerGeneration != generation
    activeOwnerId = ownerId
    activeOwnerGeneration = generation
    if (changed) hideOverlay()
  }

  private fun invalidateOwner(ownerId: String, generation: Long) {
    if (generation < activeOwnerGeneration) return
    if (activeOwnerId != ownerId) return
    activeOwnerId = null
    activeOwnerGeneration = generation
    hideOverlay()
  }

  private fun owns(ownerId: String, generation: Long): Boolean =
    activeOwnerId == ownerId && activeOwnerGeneration == generation

  private fun setPresentation(nextStatusText: String, storedAt: Double?) {
    statusText = sanitize(nextStatusText)
    lastStoredAt = storedAt?.takeIf { it.isFinite() && it > 0 }?.toLong()
  }

  private fun refreshLabelAndScheduleTicker() {
    label?.text = renderedStatusText()
    ageTicker?.let { mainHandler.removeCallbacks(it) }
    if (!isVisible() || lastStoredAt == null) {
      ageTicker = null
      return
    }
    val ticker = Runnable {
      if (!isVisible() || lastStoredAt == null) return@Runnable
      label?.text = renderedStatusText()
      mainHandler.postDelayed(ageTicker!!, 1_000)
    }
    ageTicker = ticker
    mainHandler.postDelayed(ticker, 1_000)
  }

  private fun renderedStatusText(): String {
    val storedAt = lastStoredAt ?: return statusText
    val ageSeconds = max(0, (System.currentTimeMillis() - storedAt) / 1_000)
    val age = if (ageSeconds < 60) "${ageSeconds}초 전" else "${ageSeconds / 60}분 전"
    return "$statusText · 마지막 서버 저장 $age"
  }

  private fun status(): Map<String, Any> = mapOf(
    "available" to true,
    "permission" to canDrawOverlays(),
    "visible" to isVisible(),
  )

  private fun canDrawOverlays(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

  private fun isVisible(): Boolean = overlay != null

  private fun hideOverlay() {
    ageTicker?.let { mainHandler.removeCallbacks(it) }
    ageTicker = null
    val current = overlay ?: return
    try {
      val manager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      manager.removeView(current)
    } catch (_: Exception) {
      // Removing an already-detached window is harmless.
    } finally {
      overlay = null
      label = null
    }
  }

  private fun openApp() {
    try {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      if (launch != null) context.startActivity(launch)
    } catch (_: Exception) {
      // The overlay is informational; failing to open UI must not affect sharing.
    }
  }

  private fun sanitize(value: String): String {
    val normalized = value.replace(Regex("[\\r\\n\\t]"), " ").trim()
    return normalized.take(120).ifEmpty { "위치 공유 상태 확인 중" }
  }

  private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
}
