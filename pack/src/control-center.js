import { execShell, execShellShizuku, detectCapabilities, autoSelectMethod, deviceCapabilities } from './shell.js';

    // ========== NativeBridge 方法封装 ==========
    function bridgeCall(method, ...args) {
        try {
            if (typeof NativeBridge !== 'undefined' && NativeBridge[method]) {
                const raw = NativeBridge[method](...args);
                if (typeof raw === 'string') {
                    try { return JSON.parse(raw); } catch (e) { return { success: false }; }
                }
                return raw || { success: false };
            }
        } catch (e) {}
        return { success: false };
    }
    const getWifiState = () => bridgeCall('getWifiState');
    const setWifiEnabled = (enable) => bridgeCall('setWifiEnabled', enable);
    const openWifiSettings = () => bridgeCall('openWifiSettings');
    const getCurrentWifiInfo = () => bridgeCall('getCurrentWifiInfo');
    const getMobileDataEnabled = () => bridgeCall('getMobileDataEnabled');
    const setMobileDataEnabled = (enabled) => bridgeCall('setMobileDataEnabled', enabled);
    const getBrightness = () => bridgeCall('getBrightness');
    const setBrightness = (val) => bridgeCall('setBrightness', val);
    const getVolume = () => bridgeCall('getVolume');
    const setVolume = (val) => bridgeCall('setVolume', val);
    const setFlashlight = (enabled) => bridgeCall('setFlashlight', enabled);
    window._onAdminStatusResult = function(j) {
        try { var r = typeof j === "string" ? JSON.parse(j) : j;
            console.log("[ADMIN] isAdminActive result:", JSON.stringify(r));
        } catch(e) {}
    };
    const LOCK_CB = "lock_cb";
    window._onLockScreenResult = function(j) {
        console.log("[LOCK] _onLockScreenResult:", JSON.stringify(j));
        try { var r = typeof j === 'string' ? JSON.parse(j) : j;
            if (r.callbackId === LOCK_CB) document.getElementById('btnLock').classList.remove('active');
        } catch(e) {}
    };
    const lockScreen = async () => {
        var cap = await detectCapabilities();
        if (cap.shizukuConnected) {
            var r = await execShellShizuku("input keyevent 26");
            if (r.success) { document.getElementById("btnLock").classList.remove("active"); return; }
        }
        if (cap.isRoot || cap.isShell) {
            var r = await execShell("input keyevent 26");
            if (r.success) { document.getElementById("btnLock").classList.remove("active"); return; }
        }
        if (cap.hasSU) {
            var r = await execShell('su -c "input keyevent 26"');
            if (r.success) { document.getElementById("btnLock").classList.remove("active"); return; }
        }
        try { NativeBridge.lockScreen(LOCK_CB); } catch(e) {}
    };
    const openSettings = () => bridgeCall('openSettings');
    const openAirplaneModeSettings = () => bridgeCall('openAirplaneModeSettings');
    const requestNotificationListener = () => bridgeCall('requestNotificationListener');
    const getMusicInfo = () => bridgeCall('getMusicInfo');
    const getSimInfo = () => bridgeCall('getSimInfo');
    const getNetworkInfo = () => bridgeCall('getNetworkInfo');
    const getSystemInfo = () => bridgeCall('getSystemInfo');
    const getBatteryLevel = () => bridgeCall('getBatteryLevel');
    const isCharging = () => bridgeCall('isCharging');
    const getFlashlightState = () => bridgeCall('getFlashlightState');
    const mediaPlayPause = () => bridgeCall('mediaPlayPause');
    const mediaNext = () => bridgeCall('mediaNext');
    const mediaPrevious = () => bridgeCall('mediaPrevious');
    const canWriteSettings = () => bridgeCall('canWriteSettings');
    const hotspotEnabled = () => bridgeCall('hotspotEnabled');
    // ========== WiFi 图标更新（6档：0-5） ==========
    function updateWifiIcon(rssi) {
        let level = 0;
        if (rssi >= -50) level = 5;
        else if (rssi >= -60) level = 4;
        else if (rssi >= -70) level = 3;
        else if (rssi >= -80) level = 2;
        else if (rssi >= -90) level = 1;
        else level = 0;
        const arc0 = document.getElementById('arc0');
        const arc1 = document.getElementById('arc1');
        const arc2 = document.getElementById('arc2');
        const arc3 = document.getElementById('arc3');
        const dot1 = document.getElementById('dot1');
        [arc0, arc1, arc2, arc3, dot1].forEach(el => el.classList.add('dim'));
        if (level >= 1) dot1.classList.remove('dim');
        if (level >= 2) arc3.classList.remove('dim');
        if (level >= 3) arc2.classList.remove('dim');
        if (level >= 4) arc1.classList.remove('dim');
        if (level >= 5) arc0.classList.remove('dim');
    }
    // ========== WiFi 信息显示 ==========
    function updateWifiLabel() {
        const result = getCurrentWifiInfo();
        const wifiLabel = document.getElementById('wifiLabel');
        
        if (result && result.success) {
            if (result.ssid) {
                wifiLabel.textContent = result.ssid;
            } else {
                wifiLabel.textContent = 'Wi-Fi';
            }
            updateWifiIcon(result.rssi);
        } else {
            wifiLabel.textContent = 'Wi-Fi';
            document.querySelectorAll('.wifi-arc, .wifi-dot').forEach(el => el.classList.add('dim'));
        }
    }
    // ========== 运营商标签更新 ==========
    function updateCarrierLabel() {
        const simInfo = getSimInfo();
        const labelEl = document.getElementById('dataLabel');
        if (!simInfo || !simInfo.success || !simInfo.sims || simInfo.sims.length === 0) {
            labelEl.textContent = '无信号';
            return;
        }
        const readySims = simInfo.sims.filter(sim => sim.state === 5 && sim.operator && sim.operator.trim() !== '');
        if (readySims.length === 0) {
            labelEl.textContent = '无信号';
            return;
        }
        const names = readySims.map(sim => sim.operator);
        const uniqueNames = [...new Set(names)];
        if (uniqueNames.length === 1) {
            labelEl.textContent = uniqueNames[0];
        } else {
            labelEl.textContent = uniqueNames.join('/');
        }
    }
    // ========== WiFi 开关逻辑 ==========
    // ========== 飞行模式状态读取 ==========
    async function getAirplaneMode() {
        var cap = await detectCapabilities();
        var method = autoSelectMethod(cap);
        var cmd = "settings get global airplane_mode_on";
        try {
            var res;
            if (method === 'shizuku') {
                res = await execShellShizuku(cmd);
            } else if (method === 'svc' || method === 'svc_su') {
                res = await execShell(method === 'svc_su' ? 'su -c "' + cmd + '"' : cmd);
            }
            if (res && res.success) {
                return { enabled: res.stdout.trim() === '1', success: true };
            }
        } catch(e) {}
        return { enabled: false, success: false };
    }
    // ========== 飞行模式开关 ==========
    async function toggleAirplaneMode(enable) {
        var cap = await detectCapabilities();
        var cmd = "settings put global airplane_mode_on " + (enable ? "1" : "0");
        if (cap.shizukuConnected) {
            var r = await execShellShizuku(cmd);
            if (r.success) return { success: true, method: 'shizuku' };
        }
        if (cap.isRoot || cap.isShell) {
            var r = await execShell(cmd);
            if (r.success) return { success: true, method: 'svc' };
        }
        if (cap.hasSU) {
            var r = await execShell('su -c "' + cmd + '"');
            if (r.success) return { success: true, method: 'svc_su' };
        }
        openAirplaneModeSettings();
        return { success: true, method: 'settingsPage', panelOpened: true };
    }
    async function toggleWifi(enable) {
        const cap = await detectCapabilities();
        const cmd = enable ? 'svc wifi enable' : 'svc wifi disable';
        // 按优先级尝试：shizuku → svc → svc_su → manager → settingsPage
        if (cap.shizukuConnected) {
            const result = await execShellShizuku(cmd);
            if (result.success) return { success: true, method: 'shizuku' };
        }
        if (cap.isRoot || cap.isShell) {
            const result = await execShell(cmd);
            if (result.success) return { success: true, method: 'svc' };
        }
        if (cap.hasSU) {
            const result = await execShell('su -c "' + cmd + '"');
            if (result.success) return { success: true, method: 'svc_su' };
        }
        if (cap.apiLevel !== null && cap.apiLevel <= 28) {
            const result = setWifiEnabled(enable);
            return { success: result.success, method: 'manager', panelOpened: false };
        }
        const result = openWifiSettings();
        return { success: result.success, method: 'settingsPage', panelOpened: true };
    }
    // ========== 面板拖拽 ==========
    export const panel = document.getElementById('panel');
    export let startYPanel, isDraggingPanel = false, isOpen = false, panelHeight, startTranslateY, sliderActive = false;
    export function onPanelDown(e) {
        if (sliderActive) return;
        startYPanel = e.touches ? e.touches[0].clientY : e.clientY;
        isDraggingPanel = true;
        panelHeight = panel.offsetHeight;
        panel.classList.remove('animate');
        const matrix = new WebKitCSSMatrix(getComputedStyle(panel).transform);
        startTranslateY = matrix.m42;
    }
    export function onPanelMove(e) {
        if (!isDraggingPanel) return;
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        let translateY = startTranslateY + (y - startYPanel);
        translateY = Math.max(-panelHeight, Math.min(0, translateY));
        panel.style.transform = `translateY(${translateY}px)`;
    }
    export function onPanelUp() {
        if (!isDraggingPanel) return;
        isDraggingPanel = false;
        const matrix = new WebKitCSSMatrix(getComputedStyle(panel).transform);
        const currentY = matrix.m42;
        const hideRatio = -currentY / panelHeight;
        panel.classList.add('animate');
        if (isOpen) {
            if (hideRatio >= 0.1) {
                panel.style.transform = `translateY(-${panelHeight}px)`;
                isOpen = false;
            } else {
                panel.style.transform = 'translateY(0)';
            }
        } else {
            if (hideRatio <= 0.9) {
                panel.style.transform = 'translateY(0)';
                isOpen = true;
                syncInitialState();
            } else {
                panel.style.transform = `translateY(-${panelHeight}px)`;
            }
        }
    }
    // 面板事件由 gestures.js 统一调度
    // ========== 滑块 ==========
    function setupSlider(cardId, fillId, getVal, setVal, maxVal) {
        const card = document.getElementById(cardId);
        const fill = document.getElementById(fillId);
        let active = false;
        function update(e) {
            const rect = card.getBoundingClientRect();
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            let pct = (rect.bottom - y) / rect.height;
            pct = Math.max(0, Math.min(1, pct));
            fill.style.height = (pct * 100) + '%';
            setVal(Math.round(pct * maxVal));
        }
        card.addEventListener('touchstart', (e) => { active = true; sliderActive = true; update(e); e.preventDefault(); e.stopPropagation(); }, { passive: false });
        card.addEventListener('touchmove', (e) => { if (active) { update(e); e.preventDefault(); e.stopPropagation(); } }, { passive: false });
        card.addEventListener('touchend', (e) => { active = false; sliderActive = false; e.stopPropagation(); });
        card.addEventListener('mousedown', (e) => { active = true; sliderActive = true; update(e); e.preventDefault(); e.stopPropagation(); });
        card.addEventListener('mousemove', (e) => { if (active) { update(e); e.preventDefault(); e.stopPropagation(); } });
        card.addEventListener('mouseup', (e) => { active = false; sliderActive = false; e.stopPropagation(); });
        const res = getVal();
        if (res?.success) {
            const cur = res.brightness ?? res.current ?? 0;
            const max = res.max || maxVal;
            fill.style.height = ((cur / max) * 100) + '%';
        }
    }
    setupSlider('brightnessCard', 'brightnessBarFill', getBrightness, (val) => {
        const res = setBrightness(val);
        if (!res.success && res.needPermission) alert('需要授予修改系统设置权限');
    }, 255);
    (function() {
        const info = getVolume();
        const max = (info?.success && info.max) ? info.max : 15;
        setupSlider('volumeCard', 'volumeBarFill', getVolume, (val) => setVolume(val), max);
    })();
    // ========== 按钮事件 ==========
    function setActive(id, active) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', active);
    }
    document.getElementById('wifiCard').addEventListener('click', async () => {
        const state = getWifiState();
        if (!state?.success) return;
        const result = await toggleWifi(!state.enabled);
        if (result.success) {
            if (result.panelOpened) {
                setActive('wifiCard', true);
                setTimeout(() => setActive('wifiCard', state.enabled), 400);
            } else {
                setActive('wifiCard', !state.enabled);
                updateWifiLabel();
            }
        }
    });
    document.getElementById('dataCard').addEventListener('click', () => {
        const state = getMobileDataEnabled();
        if (state?.success) {
            setMobileDataEnabled(!state.enabled);
            setActive('dataCard', !state.enabled);
        }
    });
    document.getElementById('btnAirplane').addEventListener('click', async () => {
        var state = await getAirplaneMode();
        var result = await toggleAirplaneMode(!state.enabled);
        if (result.success) {
            if (result.panelOpened) {
                setActive('btnAirplane', true);
                setTimeout(() => setActive('btnAirplane', state.enabled), 400);
            } else {
                setActive('btnAirplane', !state.enabled);
            }
        }
    });
    let flashlightOn = false;
    document.getElementById('btnFlashlight').addEventListener('click', () => {
        const res = setFlashlight(!flashlightOn);
        if (res?.success) {
            flashlightOn = !flashlightOn;
            setActive('btnFlashlight', flashlightOn);
        }
    });
    document.getElementById('btnLock').addEventListener('click', () => {
        lockScreen();
        setActive('btnLock', true);
        setTimeout(() => setActive('btnLock', false), 300);
    });
    document.getElementById('btnSettings').addEventListener('click', () => {
        openSettings();
        setActive('btnSettings', true);
        setTimeout(() => setActive('btnSettings', false), 300);
    });

    document.getElementById('btnPrev').addEventListener('click', () => {
        mediaPrevious();
        setActive('btnPrev', true);
        setTimeout(() => setActive('btnPrev', false), 200);
    });

    document.getElementById('btnPlay').addEventListener('click', () => {
        mediaPlayPause();
        setActive('btnPlay', true);
        setTimeout(() => setActive('btnPlay', false), 200);
    });

    document.getElementById('btnNext').addEventListener('click', () => {
        mediaNext();
        setActive('btnNext', true);
        setTimeout(() => setActive('btnNext', false), 200);
    });
    // ========== 状态同步 ==========
    async function syncInitialState() {
        detectCapabilities();
        const wifi = getWifiState();
        if (wifi?.success) setActive('wifiCard', wifi.enabled);
        updateWifiLabel();
        
        const data = getMobileDataEnabled();
        if (data?.success) setActive('dataCard', data.enabled);
        
        const flash = getFlashlightState();
        if (flash?.success) {
            flashlightOn = flash.enabled;
            setActive('btnFlashlight', flash.enabled);
        }
        updateCarrierLabel();
        try {
            getAirplaneMode().then(function(airplaneRes) { if (airplaneRes.success) setActive("btnAirplane", airplaneRes.enabled); }).catch(function(){});
        } catch(e) {}
        var bri = getBrightness();
        if (bri?.success) {
            var cur = bri.brightness ?? bri.current ?? 0;
            var max = bri.max || 255;
            document.getElementById('brightnessBarFill').style.height = ((cur / max) * 100) + '%';
        }
        var vol = getVolume();
        if (vol?.success) {
            var cur2 = vol.current ?? 0;
            var max2 = vol.max || 15;
            document.getElementById('volumeBarFill').style.height = ((cur2 / max2) * 100) + '%';
        }
        const music = getMusicInfo();
        if (music?.success && music.title) {
            document.getElementById('musicTitle').textContent = music.title;
            document.getElementById('musicArtist').textContent = music.artist || '未知艺术家';
            document.getElementById('playIcon').style.display = music.isPlaying ? 'none' : 'block';
            document.getElementById('pauseIcon').style.display = music.isPlaying ? 'block' : 'none';
        } else {
            document.getElementById('musicTitle').textContent = '未在播放';
            document.getElementById('musicArtist').textContent = '—';
            document.getElementById('playIcon').style.display = 'block';
            document.getElementById('pauseIcon').style.display = 'none';
        }
    }
    // ========== 定时同步 ==========
    let syncInterval = null, airplaneInterval = null;
    function startSyncInterval() {
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(syncInitialState, 1000);
        if (typeof airplaneInterval === 'undefined' || !airplaneInterval) {
            airplaneInterval = setInterval(async function() {
                try {
                    var state = await getAirplaneMode();
                    if (state.success) {
                        // 状态已通过 setActive 同步
                    }
                } catch(e) {}
            }, 1000);
        }
    }
    function stopSyncInterval() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
        if (typeof airplaneInterval !== 'undefined' && airplaneInterval) {
            clearInterval(airplaneInterval);
            airplaneInterval = null;
        }
    }
export function initControlCenter() {
    setTimeout(syncInitialState, 100);
    setTimeout(function() {
        try {
            var raw = NativeBridge.shizukuIsConnected();
            var info = JSON.parse(raw);
            if (info.connected) {
                // Shizuku 已就绪
            }
        } catch(e) {}
    }, 2000);
    startSyncInterval();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            syncInitialState();
            startSyncInterval();
        } else {
            stopSyncInterval();
        }
    });

    window.refreshControlCenter = syncInitialState;
}