// ==================== 动态色彩情绪系统 ====================
// 根据时间、电量、使用状态生成 UI 色彩语言

const MOODS = {
    // 凌晨 0-5: 深邃夜蓝 - 安静
    lateNight: {
        bg: ['#000000', '#050510', '#0a0a20'],
        accent: '#4dabf7',
        text: 'rgba(255,255,255,0.6)',
        card: 'rgba(20,20,50,0.8)',
        glow: 'rgba(77,171,247,0.15)'
    },
    // 清晨 5-8: 破晓紫金 - 温暖唤醒
    dawn: {
        bg: ['#0d0221', '#1a0533', '#2d1060'],
        accent: '#da77f2',
        text: 'rgba(255,255,255,0.7)',
        card: 'rgba(45,16,96,0.6)',
        glow: 'rgba(218,119,242,0.15)'
    },
    // 上午 8-12: 清晨蓝 - 专注
    morning: {
        bg: ['#0a1628', '#152040', '#1e3a5f'],
        accent: '#74c0fc',
        text: 'rgba(255,255,255,0.8)',
        card: 'rgba(30,58,95,0.6)',
        glow: 'rgba(116,192,252,0.15)'
    },
    // 中午 12-15: 暖金 - 活力
    noon: {
        bg: ['#0d1117', '#161b22', '#1f2937'],
        accent: '#ffd43b',
        text: 'rgba(255,255,255,0.85)',
        card: 'rgba(31,41,55,0.7)',
        glow: 'rgba(255,212,59,0.12)'
    },
    // 下午 15-18: 琥珀橙 - 渐变
    afternoon: {
        bg: ['#1a0a00', '#2d1500', '#4a2500'],
        accent: '#ff922b',
        text: 'rgba(255,255,255,0.75)',
        card: 'rgba(74,37,0,0.6)',
        glow: 'rgba(255,146,43,0.12)'
    },
    // 傍晚 18-21: 暮光紫 - 放松
    evening: {
        bg: ['#0d0221', '#150535', '#1f0a4a'],
        accent: '#b197fc',
        text: 'rgba(255,255,255,0.7)',
        card: 'rgba(31,10,74,0.7)',
        glow: 'rgba(177,151,252,0.12)'
    },
    // 夜晚 21-0: 深蓝黑 - 安眠
    night: {
        bg: ['#000000', '#030308', '#06060f'],
        accent: '#4dabf7',
        text: 'rgba(255,255,255,0.5)',
        card: 'rgba(6,6,15,0.8)',
        glow: 'rgba(77,171,247,0.1)'
    }
};

// 特殊状态覆盖
const STATE_OVERRIDES = {
    lowBattery: { accent: '#ff6b6b', glow: 'rgba(255,107,107,0.2)' },
    charging: { accent: '#69db7c', glow: 'rgba(105,219,124,0.15)' },
    weekend: { accent: '#f783ac', glow: 'rgba(247,131,172,0.12)' }
};

let currentMood = null;
let moodTransitionTimer = null;

export function getCurrentMood() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;

    let mood;
    if (hour >= 0 && hour < 5) mood = MOODS.lateNight;
    else if (hour >= 5 && hour < 8) mood = MOODS.dawn;
    else if (hour >= 8 && hour < 12) mood = MOODS.morning;
    else if (hour >= 12 && hour < 15) mood = MOODS.noon;
    else if (hour >= 15 && hour < 18) mood = MOODS.afternoon;
    else if (hour >= 18 && hour < 21) mood = MOODS.evening;
    else mood = MOODS.night;

    // 应用状态覆盖
    let overrides = {};
    try {
        if (typeof NativeBridge !== 'undefined') {
            const bl = JSON.parse(NativeBridge.getBatteryLevel());
            const ch = JSON.parse(NativeBridge.isCharging());
            if (bl.success && bl.level < 20) overrides = STATE_OVERRIDES.lowBattery;
            if (ch.charging) overrides = STATE_OVERRIDES.charging;
        }
    } catch (e) {}

    if (isWeekend) overrides = { ...overrides, ...STATE_OVERRIDES.weekend };

    return { ...mood, ...overrides };
}

export function applyMood(mood) {
    if (!mood) mood = getCurrentMood();
    currentMood = mood;

    const root = document.documentElement;
    root.style.setProperty('--mood-accent', mood.accent);
    root.style.setProperty('--mood-text', mood.text);
    root.style.setProperty('--mood-card', mood.card);
    root.style.setProperty('--mood-glow', mood.glow);
    root.style.setProperty('--mood-bg-0', mood.bg[0]);
    root.style.setProperty('--mood-bg-1', mood.bg[1]);
    root.style.setProperty('--mood-bg-2', mood.bg[2]);

    // 更新动态背景叠加层
    const overlay = document.getElementById('dynamic-bg-overlay');
    if (overlay) {
        overlay.style.background = 'linear-gradient(180deg, ' +
            mood.bg[0] + ' 0%, ' + mood.bg[1] + ' 50%, ' + mood.bg[2] + ' 100%)';
    }

    // 更新状态栏色调
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
        statusBar.style.borderColor = mood.accent + '22';
    }

    // 更新Smart Stack卡片色调
    document.querySelectorAll('.stack-card').forEach(function(card) {
        card.style.borderColor = mood.accent + '22';
    });
}

export function initMoodSystem() {
    applyMood();

    // 每15分钟检查一次情绪变化
    moodTransitionTimer = setInterval(function() {
        const newMood = getCurrentMood();
        if (JSON.stringify(newMood) !== JSON.stringify(currentMood)) {
            applyMood(newMood);
        }
    }, 900000); // 15分钟
}

// 获取当前情绪色（供其他模块使用）
export function getMoodAccent() {
    return currentMood ? currentMood.accent : '#8ab4f8';
}

export function getMoodGlow() {
    return currentMood ? currentMood.glow : 'rgba(138,180,248,0.15)';
}
