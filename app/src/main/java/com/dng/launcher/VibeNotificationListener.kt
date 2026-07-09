package com.dng.launcher

import android.app.Notification
import android.content.Intent
import android.os.IBinder
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.google.gson.Gson

class VibeNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "VibeNotifListener"
        private var instance: VibeNotificationListener? = null

        fun getInstance(): VibeNotificationListener? = instance

        fun getActiveNotifications(): List<NotifInfo> {
            return try {
                instance?.activeNotifications?.map { sbn ->
                    NotifInfo(
                        id = sbn.id,
                        packageName = sbn.packageName,
                        title = sbn.notification.extras.getString(Notification.EXTRA_TITLE, ""),
                        text = sbn.notification.extras.getString(Notification.EXTRA_TEXT, ""),
                        subText = sbn.notification.extras.getString(Notification.EXTRA_SUB_TEXT, ""),
                        postTime = sbn.postTime,
                        isOngoing = (sbn.notification.flags and Notification.FLAG_ONGOING_EVENT) != 0
                    )
                }?.filter { !it.isOngoing && it.title.isNotEmpty() } ?: emptyList()
            } catch (e: Exception) {
                Log.e(TAG, "getActiveNotifications error: ${e.message}")
                emptyList()
            }
        }
    }

    data class NotifInfo(
        val id: Int,
        val packageName: String,
        val title: String,
        val text: String,
        val subText: String,
        val postTime: Long,
        val isOngoing: Boolean
    )

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "NotificationListener created")
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return super.onBind(intent)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        try {
            val notif = sbn.notification
            if (notif.flags and Notification.FLAG_ONGOING_EVENT != 0) return
            val title = notif.extras.getString(Notification.EXTRA_TITLE, "")
            if (title.isEmpty()) return

            val info = NotifInfo(
                id = sbn.id,
                packageName = sbn.packageName,
                title = title,
                text = notif.extras.getString(Notification.EXTRA_TEXT, ""),
                subText = notif.extras.getString(Notification.EXTRA_SUB_TEXT, ""),
                postTime = sbn.postTime,
                isOngoing = false
            )
            // Notify JS via bridge
            JsBridge.notifyNewNotification(info)
        } catch (e: Exception) {
            Log.e(TAG, "onNotificationPosted error: ${e.message}")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Could notify JS about removal if needed
    }
}
