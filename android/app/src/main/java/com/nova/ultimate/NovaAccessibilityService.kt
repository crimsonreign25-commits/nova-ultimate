package com.nova.ultimate

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class NovaAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Read-only observation foundation. NOVA may inspect accessible UI metadata here.
        // Any future action path must request explicit confirmation before consequential actions.
        val root: AccessibilityNodeInfo? = rootInActiveWindow
        root?.recycle()
    }
    override fun onInterrupt() {}
}
