package com.nova.ultimate

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40,60,40,40) }
        root.addView(TextView(this).apply { text = "NOVA Ultimate\nUniversal Mobile Assistant"; textSize = 26f })
        root.addView(TextView(this).apply { text = "Voice, accessibility, vision and safe device assistance. NOVA never performs sensitive actions silently."; textSize = 16f; setPadding(0,24,0,24) })
        root.addView(Button(this).apply { text = "Open NOVA Web App"; setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://nova-ultimate-8scp.onrender.com"))) } })
        root.addView(Button(this).apply { text = "Configure Android Accessibility"; setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } })
        setContentView(root)
    }
}
