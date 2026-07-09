// === Entry Point ===
import './src/setup.js';
import { initNotifications, toggleNotificationPanel, closeNotificationPanel, clearAllNotifications, openNotificationPanel } from './src/notification.js';
import { initSmartStack, trackAppLaunch } from './src/smartstack.js';
import { initDynamicBackground, flashAppColor } from './src/dynamic-bg.js';
import { initFisheye, fisheyeTick } from './src/fisheye.js';
import { initMoodSystem, applyMood } from './src/mood.js';
import { initVerticalPages } from './src/vertical-pages.js';

// 初始化通知系统
initNotifications();

// 初始化智能叠放
initSmartStack();
const stackEl = document.getElementById('smart-stack');
if (stackEl) stackEl.style.display = 'none'; // 默认隐藏，非时间视图时显示

// 初始化动态背景
initDynamicBackground();

// 初始化鱼眼缩放（蜂窝模式下生效）
initFisheye();
// 鱼眼每帧更新
setInterval(fisheyeTick, 16);

// 初始化动态色彩情绪系统
initMoodSystem();

// 初始化垂直分页
initVerticalPages();

// Smart Stack 与 Vertical Pages 互斥控制
window._showSmartStack = function() {
    const stack = document.getElementById('smart-stack');
    const pages = document.getElementById('vertical-pages');
    if (stack) stack.style.display = 'flex';
    if (pages) pages.style.display = 'none';
};
window._hideSmartStack = function() {
    const stack = document.getElementById('smart-stack');
    if (stack) stack.style.display = 'none';
};

// 全局：记录应用启动
window._trackAppLaunch = trackAppLaunch;
window._flashAppColor = flashAppColor;

// ==================== 权限管理面板 ====================
window._openPermPanel = function() {
    const panel = document.getElementById('perm-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    loadPermissionStatus();
};

function loadPermissionStatus() {
    const list = document.getElementById('perm-list');
    if (!list) return;
    try {
        if (typeof NativeBridge === 'undefined') {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3)">NativeBridge 不可用</div>';
            return;
        }
        const raw = NativeBridge.checkAllPermissions();
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!result.success) return;

        const icons = { write_settings: '⚙', notification: '🔔', bluetooth: '🔵', location: '📍' };
        list.innerHTML = '';
        result.permissions.forEach(function(perm) {
            const granted = perm.granted;
            const item = document.createElement('div');
            item.className = 'perm-item ' + (granted ? 'granted' : 'denied');
            item.innerHTML = '<div class="perm-icon ' + (granted ? 'granted' : 'denied') + '">' + (icons[perm.id] || '🔑') + '</div>' +
                '<div class="perm-info"><div class="perm-name">' + perm.name + '</div>' +
                '<div class="perm-desc">' + perm.desc + '</div></div>' +
                '<div class="perm-status ' + (granted ? 'granted' : 'denied') + '">' + (granted ? '已授权' : '未授权') + '</div>';
            if (!granted) {
                item.addEventListener('click', function() {
                    try { NativeBridge.requestPermission(perm.action); } catch(e) {}
                });
            }
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3)">检查失败: ' + e.message + '</div>';
    }
}

// 全局通知面板控制
window._toggleNotifications = toggleNotificationPanel;
window._closeNotifications = closeNotificationPanel;
window._clearAllNotifications = clearAllNotifications;

// 通知徽标点击
const notifBadge = document.getElementById('notif-badge');
if (notifBadge) {
    notifBadge.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleNotificationPanel();
    });
}

// 通知面板点击外部关闭
const notifPanel = document.getElementById('notification-panel');
if (notifPanel) {
    notifPanel.addEventListener('click', function(e) {
        if (e.target === notifPanel) {
            closeNotificationPanel();
        }
    });
}

// ==================== 独立状态栏 ====================
(function initStatusBar() {
    const bar = document.getElementById('status-bar');
    if (!bar) return;

    // 显示状态栏
    bar.style.display = 'flex';

    // 更新时间
    function updateTime() {
        const el = document.getElementById('sb-time');
        if (!el) return;
        const now = new Date();
        el.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    updateTime();
    setInterval(updateTime, 10000);

    // 更新电池
    function updateBattery() {
        const el = document.getElementById('sb-battery');
        if (!el) return;
        try {
            const bl = JSON.parse(NativeBridge.getBatteryLevel());
            const ch = JSON.parse(NativeBridge.isCharging());
            if (bl.success) {
                el.textContent = (ch.charging ? '⚡' : '🔋') + bl.level + '%';
            }
        } catch (e) {}
    }
    updateBattery();
    setInterval(updateBattery, 30000);

    // 更新WiFi状态
    function updateWifi() {
        const el = document.getElementById('sb-wifi');
        if (!el) return;
        try {
            const r = JSON.parse(NativeBridge.getWifiEnabled());
            el.style.opacity = (r.success && r.enabled) ? '1' : '0.3';
        } catch (e) {}
    }
    updateWifi();
    setInterval(updateWifi, 10000);

    // 更新通知红点
    window._updateStatusBarNotifDot = function(count) {
        const dot = document.getElementById('sb-notif-dot');
        if (dot) dot.style.display = count > 0 ? 'block' : 'none';
    };
})();

// ==================== 通知权限弹窗 ====================
(function initNotifPerm() {
    const dialog = document.getElementById('notif-perm-dialog');
    if (!dialog) return;

    // 检查是否已授权
    try {
        if (typeof NativeBridge !== 'undefined') {
            const r = JSON.parse(NativeBridge.isNotificationListenerEnabled());
            if (r.success && r.enabled) return; // 已授权，不显示
        }
    } catch (e) {}

    // 检查是否已跳过
    try {
        const skipUntil = localStorage.getItem('notif-perm-skip');
        if (skipUntil && Date.now() < parseInt(skipUntil)) return;
    } catch (e) {}

    // 延迟显示弹窗
    setTimeout(function() {
        dialog.style.display = 'block';
    }, 2000);

    window._grantNotifPerm = function() {
        dialog.style.display = 'none';
        try {
            if (typeof NativeBridge !== 'undefined') {
                NativeBridge.openNotificationSettings();
            }
        } catch (e) {}
    };

    window._dismissNotifPerm = function() {
        dialog.style.display = 'none';
        try {
            localStorage.setItem('notif-perm-skip', '' + (Date.now() + 7 * 24 * 3600 * 1000));
        } catch (e) {}
    };
})();

// ==================== 壁纸模糊/暗度 ====================
(function initWallpaperEffects() {
    const blurSlider = document.getElementById('s-wallpaper-blur');
    const blurVal = document.getElementById('s-wallpaper-blur-val');
    const dimSlider = document.getElementById('s-wallpaper-dim');
    const dimVal = document.getElementById('s-wallpaper-dim-val');

    // 读取已保存的设置
    try {
        const saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
        if (saved.wallpaperBlur !== undefined && blurSlider) {
            blurSlider.value = saved.wallpaperBlur;
            if (blurVal) blurVal.textContent = saved.wallpaperBlur + 'px';
        }
        if (saved.wallpaperDim !== undefined && dimSlider) {
            dimSlider.value = saved.wallpaperDim;
            if (dimVal) dimVal.textContent = saved.wallpaperDim + '%';
        }
        applyWallpaperEffects(saved.wallpaperBlur || 0, saved.wallpaperDim || 0);
    } catch (e) {}

    if (blurSlider) {
        blurSlider.addEventListener('input', function() {
            const v = parseInt(this.value);
            if (blurVal) blurVal.textContent = v + 'px';
            applyWallpaperEffects(v, parseInt(dimSlider ? dimSlider.value : 0));
        });
    }
    if (dimSlider) {
        dimSlider.addEventListener('input', function() {
            const v = parseInt(this.value);
            if (dimVal) dimVal.textContent = v + '%';
            applyWallpaperEffects(parseInt(blurSlider ? blurSlider.value : 0), v);
        });
    }

    function applyWallpaperEffects(blur, dim) {
        const body = document.body;
        body.style.backdropFilter = blur > 0 ? 'blur(' + blur + 'px)' : '';
        body.style.webkitBackdropFilter = blur > 0 ? 'blur(' + blur + 'px)' : '';
        // 暗度通过覆盖层实现
        let overlay = document.getElementById('wallpaper-dim-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wallpaper-dim-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:-1';
            document.body.appendChild(overlay);
        }
        overlay.style.background = dim > 0 ? 'rgba(0,0,0,' + (dim / 100) + ')' : '';
    }
})();

// ==================== 搜索功能 ====================
let searchOpen = false;
let searchDebounce = null;

function openSearch() {
    const bar = document.getElementById('search-bar');
    const input = document.getElementById('search-input');
    if (!bar || !input) return;
    searchOpen = true;
    bar.style.display = 'block';
    input.value = '';
    input.focus();
    document.getElementById('search-results').innerHTML = '';
}

function closeSearch() {
    const bar = document.getElementById('search-bar');
    if (!bar) return;
    searchOpen = false;
    bar.style.display = 'none';
    document.getElementById('search-results').innerHTML = '';
}

window._openSearch = openSearch;
window._closeSearch = closeSearch;

const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        clearTimeout(searchDebounce);
        const query = this.value.trim();
        if (!query) {
            document.getElementById('search-results').innerHTML = '';
            return;
        }
        searchDebounce = setTimeout(() => { performSearch(query); }, 150);
    });
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeSearch();
    });
}

function performSearch(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;
    const items = window._totalItems || [];
    const matches = items.filter(it => {
        if (!it.data) return false;
        const name = (it.data.appName || '').toLowerCase();
        const pkg = (it.data.packageName || '').toLowerCase();
        return name.includes(query.toLowerCase()) || pkg.includes(query.toLowerCase());
    }).slice(0, 10);

    if (matches.length === 0) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:13px">未找到应用</div>';
        return;
    }
    resultsEl.innerHTML = '';
    matches.forEach(it => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const initial = (it.data.appName || '?').charAt(0).toUpperCase();
        item.innerHTML = '<div class="search-result-icon">' + initial + '</div><div><div class="search-result-name">' + escapeHtmlSearch(it.data.appName) + '</div><div class="search-result-pkg">' + (it.data.packageName || '') + '</div></div>';
        item.addEventListener('click', function() {
            if (it.data.packageName === '__time__' || it.data.packageName === '__settings__') { closeSearch(); return; }
            try { if (typeof NativeBridge !== 'undefined') NativeBridge.launchApp(it.data.packageName); } catch (e) {}
            closeSearch();
        });
        resultsEl.appendChild(item);
    });
}

function escapeHtmlSearch(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 双击空白区域打开搜索
let lastTapTime = 0;
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTapTime < 300) {
        if (!searchOpen && !e.target.closest('#search-bar') && !e.target.closest('#settings-overlay') && !e.target.closest('#notification-panel') && !e.target.closest('#context-menu') && !e.target.closest('#status-bar')) {
            openSearch();
        }
    }
    lastTapTime = now;
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && searchOpen) closeSearch();
});

// ==================== 通知下滑手势 ====================
(function() {
    let touchStartY = 0, touchStartX = 0, isNotifSwipe = false;
    const NOTIF_ZONE = 0.08;

    document.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (t.clientY < window.innerHeight * NOTIF_ZONE) {
            touchStartY = t.clientY; touchStartX = t.clientX; isNotifSwipe = true;
        } else { isNotifSwipe = false; }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (!isNotifSwipe) return;
        const t = e.touches[0];
        if ((t.clientY - touchStartY) > 30 && Math.abs(t.clientX - touchStartX) < 50) {
            isNotifSwipe = false;
            openNotificationPanel();
        }
    }, { passive: true });

    document.addEventListener('touchend', function() { isNotifSwipe = false; }, { passive: true });
})();

// 点击搜索栏外部关闭
document.addEventListener('click', function(e) {
    if (searchOpen && !e.target.closest('#search-bar') && !e.target.closest('.search-result-item')) closeSearch();
});
