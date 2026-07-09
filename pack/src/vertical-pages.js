// ==================== 垂直分页系统 ====================
// 像 Apple Watch 健身应用一样，每页只显示一个纯净信息

import { getCurrentMood, getMoodAccent } from './mood.js';

let pages = [];
let currentPage = 0;
let totalPages = 0;
let containerEl = null;

export function initVerticalPages() {
    containerEl = document.getElementById('vertical-pages');
    if (!containerEl) return;

    buildPages();
    renderPage(0);

    // 触摸手势
    let startY = 0, isDragging = false;
    containerEl.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        isDragging = true;
    }, { passive: true });

    containerEl.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        const dy = startY - e.touches[0].clientY;
        if (Math.abs(dy) > 60) {
            isDragging = false;
            if (dy > 0) nextPage();
            else prevPage();
        }
    }, { passive: true });

    containerEl.addEventListener('touchend', function() { isDragging = false; }, { passive: true });
}

function buildPages() {
    pages = [];
    const mood = getCurrentMood();

    // Page 1: 时间（全屏大字）
    const now = new Date();
    pages.push({
        type: 'time',
        title: '',
        content: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
        subtitle: (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()],
        color: mood.accent,
        icon: ''
    });

    // Page 2: 电量环
    try {
        if (typeof NativeBridge !== 'undefined') {
            const bl = JSON.parse(NativeBridge.getBatteryLevel());
            const ch = JSON.parse(NativeBridge.isCharging());
            if (bl.success) {
                pages.push({
                    type: 'battery',
                    title: '',
                    content: bl.level + '%',
                    subtitle: ch.charging ? '⚡ 充电中' : (bl.level < 20 ? '⚠ 电量低' : '🔋 正常'),
                    color: bl.level < 20 ? '#ff6b6b' : (ch.charging ? '#69db7c' : mood.accent),
                    icon: '',
                    progress: bl.level / 100
                });
            }
        }
    } catch (e) {}

    // Page 3: 最近通知
    try {
        if (typeof NativeBridge !== 'undefined') {
            const raw = NativeBridge.getActiveNotifications();
            const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (result.success && result.notifications && result.notifications.length > 0) {
                const latest = result.notifications[0];
                pages.push({
                    type: 'notification',
                    title: '🔔 最新通知',
                    content: latest.title,
                    subtitle: latest.text || '',
                    color: mood.accent,
                    icon: ''
                });
            }
        }
    } catch (e) {}

    // Page 4: 使用统计
    try {
        const stats = JSON.parse(localStorage.getItem('vibe-usage-stats') || '{}');
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);
        if (sorted.length > 0) {
            const top = sorted[0];
            const appItem = (window._totalItems || []).find(it => it.data && it.data.packageName === top[0]);
            pages.push({
                type: 'usage',
                title: '📊 最常用',
                content: appItem ? appItem.data.appName : top[0],
                subtitle: '使用 ' + top[1].count + ' 次',
                color: '#ffd43b',
                icon: ''
            });
        }
    } catch (e) {}

    totalPages = pages.length;
}

function renderPage(index) {
    if (!containerEl || index < 0 || index >= totalPages) return;
    currentPage = index;

    const page = pages[index];
    const mood = getCurrentMood();

    containerEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'vp-card';
    card.style.background = 'linear-gradient(135deg, ' + page.color + '15, ' + page.color + '05)';
    card.style.borderColor = page.color + '30';

    if (page.type === 'battery' && page.progress !== undefined) {
        // 电量环
        const ringSize = Math.min(window.innerWidth, window.innerHeight) * 0.5;
        const strokeWidth = ringSize * 0.06;
        const radius = (ringSize - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - page.progress);

        card.innerHTML = '<div class="vp-ring-container" style="width:' + ringSize + 'px;height:' + ringSize + 'px">' +
            '<svg class="vp-ring" viewBox="0 0 ' + ringSize + ' ' + ringSize + '">' +
            '<circle cx="' + ringSize/2 + '" cy="' + ringSize/2 + '" r="' + radius + '" ' +
            'stroke="rgba(255,255,255,0.08)" stroke-width="' + strokeWidth + '" fill="none"/>' +
            '<circle cx="' + ringSize/2 + '" cy="' + ringSize/2 + '" r="' + radius + '" ' +
            'stroke="' + page.color + '" stroke-width="' + strokeWidth + '" fill="none" ' +
            'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" ' +
            'stroke-linecap="round" transform="rotate(-90 ' + ringSize/2 + ' ' + ringSize/2 + ')" ' +
            'style="transition: stroke-dashoffset 1s ease"/>' +
            '</svg>' +
            '<div class="vp-ring-text">' +
            '<div class="vp-ring-value" style="color:' + page.color + '">' + page.content + '</div>' +
            '<div class="vp-ring-label">' + page.subtitle + '</div>' +
            '</div></div>';
    } else {
        card.innerHTML = (page.title ? '<div class="vp-title">' + page.title + '</div>' : '') +
            '<div class="vp-content" style="color:' + page.color + '">' + page.content + '</div>' +
            '<div class="vp-subtitle">' + page.subtitle + '</div>';
    }

    containerEl.appendChild(card);

    // 页码指示器
    const dots = document.createElement('div');
    dots.className = 'vp-dots';
    for (let i = 0; i < totalPages; i++) {
        const dot = document.createElement('div');
        dot.className = 'vp-dot' + (i === currentPage ? ' active' : '');
        dot.style.background = i === currentPage ? page.color : 'rgba(255,255,255,0.2)';
        dots.appendChild(dot);
    }
    containerEl.appendChild(dots);
}

function nextPage() {
    if (currentPage < totalPages - 1) {
        animateTransition('up');
        setTimeout(function() { renderPage(currentPage + 1); }, 150);
    }
}

function prevPage() {
    if (currentPage > 0) {
        animateTransition('down');
        setTimeout(function() { renderPage(currentPage - 1); }, 150);
    }
}

function animateTransition(direction) {
    if (!containerEl) return;
    const card = containerEl.querySelector('.vp-card');
    if (!card) return;
    const offset = direction === 'up' ? -30 : 30;
    card.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    card.style.transform = 'translateY(' + offset + 'px)';
    card.style.opacity = '0';
}

export { buildPages, renderPage, nextPage, prevPage };
