package com.dng.launcher

import android.content.Context
import android.graphics.Bitmap
import android.media.session.MediaSessionManager
import android.webkit.JavascriptInterface
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream

class MediaModule(private val bridge: JsBridge) {
    private val gson = Gson()

    @JavascriptInterface
    fun getMusicInfo(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val sm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val sessions = sm.getActiveSessions(null)
            if (sessions.isNotEmpty()) {
                val controller = sessions[0]
                val metadata = controller.metadata
                if (metadata != null) {
                    val title = metadata.getString(android.media.MediaMetadata.METADATA_KEY_TITLE) ?: ""
                    val artist = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST) ?: ""
                    val album = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM) ?: ""
                    val duration = metadata.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION)
                    val isPlaying = controller.playbackState?.state == android.media.session.PlaybackState.STATE_PLAYING
                    return """{"success":true,"title":"${title.replace("\"","\\\"")}","artist":"${artist.replace("\"","\\\"")}","album":"${album.replace("\"","\\\"")}","duration":$duration,"isPlaying":$isPlaying}"""
                }
            }
            """{"success":false,"error":"no music"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }

    @JavascriptInterface
    fun getMusicCoverUrl(): String {
        return try {
            val ctx = bridge.contextRef.get() ?: return """{"success":false,"error":"context lost"}"""
            val sm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
            val sessions = sm.getActiveSessions(null)
            if (sessions.isNotEmpty()) {
                val controller = sessions[0]
                val metadata = controller.metadata
                if (metadata != null) {
                    val bitmap = metadata.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART)
                    if (bitmap != null) {
                        val file = File(ctx.cacheDir, "music_cover.png")
                        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 80, it) }
                        return """{"success":true,"url":"file://${file.absolutePath}"}"""
                    }
                }
            }
            """{"success":false,"error":"no cover"}"""
        } catch (e: Exception) {
            """{"success":false,"error":"${e.message}"}"""
        }
    }
}