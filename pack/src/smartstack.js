import { state } from './state.js';

// ==================== 智能叠放（Smart Stack）====================
// 底部卡片流，上滑展开，智能排序

let stackExpanded = false;
let stackCards = [];
let usageStats = {}; // { packageName: { count, lastUsed } }

// 读取使用统计
function loadUsageStats() {
    try {
        const saved = localStorage.getItem('vibe-usage-stats');
        if (saved) usageStats = JSON.parse(saved);
    } catch (e) {}
}

function saveUsageStats() {
    try {
        localStorage.setItem('vibe-usage-stats', JSON.stringify(usageStats));
    } catch (e) {}
}

export function trackAppLaunch(packageName) {
    if (!usageStats[packageName]) {
        usageStats[packageName] = { count: 0, lastUsed: 0 };
    }
    usageStats[packageName].count++;
    usageStats[packageName].lastUsed = Date.now();
    saveUsageStats();
}

// 获取智能排序的卡片列表
function getSmartCards() {
    const cards = [];
    const now = new Date();
    const hour = now.getHours();

    // 1. 时间卡片（始终第一张）
    cards.push({
        type: 'time',
        title: '时钟',
        icon: '🕐',
        content: String(hour).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
        subtitle: (now.getMonth() + 1) + '月' + now.getDate() + '日',
        color: getTimeColor(hour),
        priority: 100
    });

    // 2. 电量卡片
    try {
        if (typeof NativeBridge !== 'undefined') {
            const bl = JSON.parse(NativeBridge.getBatteryLevel());
            const ch = JSON.parse(NativeBridge.isCharging());
            if (bl.success) {
                const level = bl.level;
                cards.push({
                    type: 'battery',
                    title: '电池',
                    icon: ch.charging ? '⚡' : '🔋',
                    content: level + '%',
                    subtitle: ch.charging ? '充电中' : (level < 20 ? '电量低' : '正常使用'),
                    color: level < 20 ? '#ff4444' : (ch.charging ? '#ffd43b' : '#69db7c'),
                    priority: 90
                });
            }
        }
    } catch (e) {}

    // 3. 最常用应用卡片（按使用频率排序）
    const sortedApps = Object.entries(usageStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

    sortedApps.forEach(([pkg, stats], idx) => {
        const appItem = (window._totalItems || []).find(it => it.data && it.data.packageName === pkg);
        if (appItem) {
            const timeSinceUse = Date.now() - stats.lastUsed;
            let subtitle = '';
            if (timeSinceUse < 3600000) subtitle = Math.floor(timeSinceUse / 60000) + '分钟前使用';
            else if (timeSinceUse < 86400000) subtitle = Math.floor(timeSinceUse / 3600000) + '小时前使用';
            else subtitle = '使用过' + stats.count + '次';

            cards.push({
                type: 'app',
                title: appItem.data.appName,
                icon: appItem.data.appName.charAt(0).toUpperCase(),
                packageName: pkg,
                subtitle: subtitle,
                color: state.placeholderColors[(idx + 2) % state.placeholderColors.length],
                priority: 80 - idx
            });
        }
    });

    // 4. 快捷操作卡片
    cards.push({
        type: 'search',
        title: '搜索',
        icon: '🔍',
        content: '搜索应用',
        subtitle: '双击空白区域',
        color: '#8ab4f8',
        priority: 50
    });

    return cards;
}

function getTimeColor(hour) {
    if (hour >= 6 && hour < 12) return '#ffd43b'; // 早晨-黄色
    if (hour >= 12 && hour < 18) return '#ff922b'; // 下午-橙色
    if (hour >= 18 && hour < 21) return '#da77f2'; // 傍晚-紫色
    return '#4dabf7'; // 夜晚-蓝色
}

export function initSmartStack() {
    loadUsageStats();
    createStackDOM();
    updateStack();

    // 每分钟更新
    setInterval(updateStack, 60000);
}

function createStackDOM() {
    const container = document.getElementById('smart-stack');
    if (!container) return;

    // 触摸手势
    let startY = 0, isDragging = false;
    container.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        isDragging = true;
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        const dy = startY - e.touches[0].clientY;
        if (dy > 50 && !stackExpanded) {
            expandStack();
        } else if (dy < -50 && stackExpanded) {
            collapseStack();
        }
    }, { passive: true });

    container.addEventListener('touchend', function() { isDragging = false; }, { passive: true });

    // 点击展开/折叠
    container.addEventListener('click', function(e) {
        if (e.target.closest('.stack-card')) return; // 卡片有自己的点击
        if (stackExpanded) collapseStack();
        else expandStack();
    });
}

function updateStack() {
    const container = document.getElementById('smart-stack');
    if (!container) return;

    stackCards = getSmartCards();

    // 折叠态：只显示第一张卡片的peek
    renderStackCards(stackCards, stackExpanded);
}

function renderStackCards(cards, expanded) {
    const container = document.getElementById('smart-stack');
    if (!container) return;

    container.innerHTML = '';

    // 右上角展开/折叠指示
    const indicator = document.createElement('div');
    indicator.className = 'stack-indicator';
    indicator.textContent = expanded ? '▼' : '▲';
    container.appendChild(indicator);

    const visibleCards = expanded ? cards : cards.slice(0, 1);

    visibleCards.forEach(function(card, idx) {
        const el = document.createElement('div');
        el.className = 'stack-card' + (expanded ? ' expanded' : '');
        if (idx === 0 && !expanded) el.className += ' peek';

        el.style.background = 'linear-gradient(135deg, ' + card.color + '22, ' + card.color + '08)';
        el.style.borderColor = card.color + '33';
        el.style.animationDelay = (idx * 60) + 'ms';

        if (card.type === 'app') {
            el.innerHTML = '<div class="card-icon" style="background:' + card.color + '33;color:' + card.color + '">' + card.icon + '</div>' +
                '<div class="card-body"><div class="card-title">' + card.title + '</div>' +
                '<div class="card-subtitle">' + card.subtitle + '</div></div>';
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                try { if (typeof NativeBridge !== 'undefined') NativeBridge.launchApp(card.packageName); } catch (e) {}
                collapseStack();
            });
        } else if (card.type === 'search') {
            el.innerHTML = '<div class="card-icon" style="background:' + card.color + '33;color:' + card.color + '">' + card.icon + '</div>' +
                '<div class="card-body"><div class="card-title">' + card.title + '</div>' +
                '<div class="card-subtitle">' + card.subtitle + '</div></div>';
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                collapseStack();
                if (typeof window._openSearch === 'function') window._openSearch();
            });
        } else {
            el.innerHTML = '<div class="card-icon" style="background:' + card.color + '33;color:' + card.color + '">' + card.icon + '</div>' +
                '<div class="card-body"><div class="card-title">' + card.content + '</div>' +
                '<div class="card-subtitle">' + card.subtitle + '</div></div>';
        }

        container.appendChild(el);
    });
}

function expandStack() {
    stackExpanded = true;
    const container = document.getElementById('smart-stack');
    if (container) container.classList.add('expanded');
    renderStackCards(stackCards, true);
}

function collapseStack() {
    stackExpanded = false;
    const container = document.getElementById('smart-stack');
    if (container) container.classList.remove('expanded');
    renderStackCards(stackCards, false);
}

export { stackExpanded, collapseStack, expandStack };
