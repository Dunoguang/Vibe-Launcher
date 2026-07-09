import { state } from './state.js';

// ==================== 全屏动态背景 ====================
// 根据时间/电量/应用状态动态渐变

let currentGradient = '';
let animFrame = null;
let bgOverlay = null;

// 时间段配色方案
const TIME_PALETTES = {
    dawn:    { // 5-8 黎明
        colors: ['#1a0533', '#2d1b4e', '#4a2c6e', '#6b3fa0', '#8b5fbf'],
        accent: '#da77f2'
    },
    morning: { // 8-12 早晨
        colors: ['#0a1628', '#152040', '#1e3a5f', '#2d5986', '#4a90d9'],
        accent: '#74c0fc'
    },
    noon:    { // 12-15 正午
        colors: ['#0d1117', '#161b22', '#1f2937', '#2d3748', '#4a5568'],
        accent: '#ffd43b'
    },
    afternoon: { // 15-18 下午
        colors: ['#1a0a00', '#2d1500', '#4a2500', '#6b3500', '#8b4513'],
        accent: '#ff922b'
    },
    evening: { // 18-21 傍晚
        colors: ['#0d0221', '#150535', '#1f0a4a', '#2d1060', '#3d1a7e'],
        accent: '#b197fc'
    },
    night:   { // 21-5 夜晚
        colors: ['#000000', '#050510', '#0a0a1a', '#0f0f25', '#14142e'],
        accent: '#4dabf7'
    }
};

function getTimePalette() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return TIME_PALETTES.dawn;
    if (hour >= 8 && hour < 12) return TIME_PALETTES.morning;
    if (hour >= 12 && hour < 15) return TIME_PALETTES.noon;
    if (hour >= 15 && hour < 18) return TIME_PALETTES.afternoon;
    if (hour >= 18 && hour < 21) return TIME_PALETTES.evening;
    return TIME_PALETTES.night;
}

function buildGradient(palette, batteryLevel, isCharging) {
    const colors = palette.colors;
    let grad = 'linear-gradient(180deg, ' + colors[0] + ' 0%';

    // 根据电量调整颜色过渡
    const chargeBoost = isCharging ? 0.1 : 0;
    const lowBattery = batteryLevel < 20;

    for (let i = 1; i < colors.length; i++) {
        const pct = Math.round((i / (colors.length - 1)) * 100);
        grad += ', ' + colors[i] + ' ' + pct + '%';
    }

    // 低电量添加红色脉冲
    if (lowBattery) {
        grad += ', rgba(255,0,0,0.05) 100%';
    }

    grad += ')';
    return grad;
}

export function initDynamicBackground() {
    // 创建覆盖层
    bgOverlay = document.createElement('div');
    bgOverlay.id = 'dynamic-bg-overlay';
    bgOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:-2;pointer-events:none;transition:background 2s ease';
    document.body.insertBefore(bgOverlay, document.body.firstChild);

    updateBackground();

    // 每5分钟更新
    setInterval(updateBackground, 300000);

    // 电量变化时更新
    setInterval(function() {
        try {
            if (typeof NativeBridge !== 'undefined') {
                const bl = JSON.parse(NativeBridge.getBatteryLevel());
                const ch = JSON.parse(NativeBridge.isCharging());
                if (bl.success) {
                    updateBackgroundForBattery(bl.level, ch.charging);
                }
            }
        } catch (e) {}
    }, 10000);
}

function updateBackground() {
    const palette = getTimePalette();
    let batteryLevel = 100, isCharging = false;

    try {
        if (typeof NativeBridge !== 'undefined') {
            const bl = JSON.parse(NativeBridge.getBatteryLevel());
            const ch = JSON.parse(NativeBridge.isCharging());
            if (bl.success) batteryLevel = bl.level;
            isCharging = ch.charging;
        }
    } catch (e) {}

    const gradient = buildGradient(palette, batteryLevel, isCharging);
    if (gradient !== currentGradient && bgOverlay) {
        currentGradient = gradient;
        bgOverlay.style.background = gradient;
    }
}

function updateBackgroundForBattery(level, charging) {
    const palette = getTimePalette();
    const gradient = buildGradient(palette, level, charging);
    if (gradient !== currentGradient && bgOverlay) {
        currentGradient = gradient;
        bgOverlay.style.background = gradient;
    }
}

// 为应用打开时提供特定背景色
export function flashAppColor(packageName) {
    if (!bgOverlay) return;
    // 根据包名生成颜色
    let hash = 0;
    for (let i = 0; i < packageName.length; i++) {
        hash = packageName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = (hash % 360 + 360) % 360;
    const color = 'hsl(' + h + ', 50%, 15%)';

    bgOverlay.style.transition = 'background 0.3s ease';
    bgOverlay.style.background = 'radial-gradient(circle at 50% 50%, ' + color + ' 0%, transparent 70%)';

    setTimeout(function() {
        bgOverlay.style.transition = 'background 1.5s ease';
        updateBackground();
    }, 800);
}

export { getTimePalette, buildGradient };
