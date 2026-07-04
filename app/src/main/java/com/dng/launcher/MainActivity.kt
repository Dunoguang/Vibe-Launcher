package com.dng.launcher

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            TextView(this).apply {
                text = "Hello Kotlin!\nAGP 9.2.1 + Kotlin (AGP built-in KGP 2.2.10)"
                textSize = 20f
                setPadding(48, 48, 48, 48)
            }
        )
    }
}
