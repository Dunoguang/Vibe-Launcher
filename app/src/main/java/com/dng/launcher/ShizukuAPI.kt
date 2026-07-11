package com.dng.launcher

import rikka.shizuku.Shizuku

object ShizukuAPI {
    
    // 1. 检查是否连接
    fun isConnected(): Boolean {
        return try {
            Shizuku.pingBinder()
        } catch (e: Exception) {
            false
        }
    }
    
    // 2. 执行命令返回三要素
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
                val result = Shizuku.newShell(command).exec()
                val stdout = result.output.joinToString("\n")
                val stderr = result.error.joinToString("\n")
                val statusCode = if (result.isSuccess) 0 else -1
                
                callback(CommandResult(stdout, stderr, statusCode))
            } catch (e: Exception) {
                callback(CommandResult("", e.message ?: "Unknown error", -1))
            }
        }.start()
    }
    
    // 三要素数据类
    data class CommandResult(
        val stdout: String,
        val stderr: String,
        val statusCode: Int
    )
}