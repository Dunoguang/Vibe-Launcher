// ========== Shell 执行封装 ==========
export function execShell(command) {
    return new Promise((resolve, reject) => {
        if (typeof NativeBridge === 'undefined' || !NativeBridge.execShell) {
            reject('NativeBridge.execShell 不可用');
            return;
        }
        const callbackId = 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        window._onShellResult = function(result) {
            try {
                const r = (typeof result === 'string') ? JSON.parse(result) : result;
                if (r.callbackId !== callbackId) return;
                resolve({
                    stdout: r.stdout || '',
                    stderr: r.stderr || '',
                    success: r.statusCode === 0,
                    statusCode: r.statusCode
                });
            } catch (e) {
                reject('回调解析失败: ' + e.message);
            }
        };
        NativeBridge.execShell(command, callbackId);
    });
}

// ========== Shizuku Shell 执行封装 ==========
export function execShellShizuku(command) {
    return new Promise((resolve, reject) => {
        if (typeof NativeBridge === 'undefined' || !NativeBridge.shizukuExecShell) {
            reject('NativeBridge.shizukuExecShell 不可用');
            return;
        }
        const callbackId = 'cb_shizuku_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        window._onShizukuResult = function(j) {
            try {
                var r = typeof j === "string" ? JSON.parse(j) : j;
                if (r.callbackId === callbackId) {
                    resolve({
                        stdout: r.stdout || '',
                        stderr: r.stderr || '',
                        success: r.statusCode === 0,
                        statusCode: r.statusCode
                    });
                }
            } catch(e) {
                reject('Shizuku 回调解析失败: ' + e.message);
            }
        };
        NativeBridge.shizukuExecShell(command, callbackId);
    });
}

// ========== 设备能力检测 ==========
export const deviceCapabilities = {
    apiLevel: null, uid: null, isRoot: false, isShell: false,
    hasSU: false, shizukuConnected: false, detected: false
};

export async function detectCapabilities() {
    if (deviceCapabilities.detected) return deviceCapabilities;
    try {
        try {
            const res = await execShell('getprop ro.build.version.sdk');
            const match = (res.stdout || '').match(/(\d+)/);
            deviceCapabilities.apiLevel = match ? parseInt(match[1]) : null;
        } catch (e) { deviceCapabilities.apiLevel = null; }
        try {
            const res = await execShell('id -u');
            const uid = (res.stdout || '').trim();
            deviceCapabilities.uid = uid;
            deviceCapabilities.isRoot = uid === '0';
            deviceCapabilities.isShell = uid === '2000';
        } catch (e) { deviceCapabilities.uid = null; }
        try {
            const res = await execShell('su -c whoami');
            deviceCapabilities.hasSU = res.success && (res.stdout || '').trim() === 'root';
        } catch (e) { deviceCapabilities.hasSU = false; }
        try {
            var raw = NativeBridge.shizukuIsConnected();
            var info = JSON.parse(raw);
            deviceCapabilities.shizukuConnected = info.connected === true;
        } catch (e) { deviceCapabilities.shizukuConnected = false; }
        deviceCapabilities.detected = true;
    } catch (e) {}
    return deviceCapabilities;
}

export function autoSelectMethod(cap) {
    if (cap.shizukuConnected) return 'shizuku';
    if (cap.isRoot) return 'svc';
    if (cap.isShell) return 'svc';
    if (cap.hasSU) return 'svc_su';
    if (cap.apiLevel !== null) return cap.apiLevel <= 28 ? 'manager' : 'settingsPage';
    return 'settingsPage';
}
