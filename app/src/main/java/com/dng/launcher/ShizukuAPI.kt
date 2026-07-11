package com.dng.launcher

import android.os.ParcelFileDescriptor
import moe.shizuku.server.IShizukuService
import rikka.shizuku.Shizuku

object ShizukuAPI {

    fun isConnected(): Boolean {
        return try {
            Shizuku.pingBinder()
        } catch (e: Exception) {
            false
        }
    }

    fun execute(command: String, callback: (CommandResult) -> Unit) {
        if (command.isBlank()) {
            callback(CommandResult("", "Command is empty", -1))
            return
        }

        if (!isConnected()) {
            callback(CommandResult("", "Shizuku is not connected", -1))
            return
        }

        Thread {
            try {
                val binder = Shizuku.getBinder()
                    ?: throw IllegalStateException("Binder is null")
                val service = IShizukuService.Stub.asInterface(binder)
                val remote = service.newProcess(arrayOf("sh", "-c", command), null, null)

                val stdout = readFromPfd(remote.inputStream)
                val stderr = readFromPfd(remote.errorStream)
                val statusCode = remote.waitFor()

                callback(CommandResult(stdout, stderr, statusCode))
            } catch (e: Exception) {
                callback(CommandResult("", e.message ?: "Unknown error", -1))
            }
        }.start()
    }

    private fun readFromPfd(pfd: ParcelFileDescriptor?): String {
        if (pfd == null) return ""
        return ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().readText().trim()
    }

    data class CommandResult(
        val stdout: String,
        val stderr: String,
        val statusCode: Int
    )
}
