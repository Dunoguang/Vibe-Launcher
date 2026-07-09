import { state } from './state.js';

            export const updateBatteryFromNative = () => {
                try {
                    const bl = JSON.parse(NativeBridge.getBatteryLevel());
                    const level = bl.success ? bl.level : -1;
                    if (level !== state._lastBatteryLevel) {
                        state._lastBatteryLevel = level;
                        updateBatteryDisplay();
                        // 电量变化触发纹理更新
                        syncTimeSpriteTexture();
                    }
                } catch(e) {}
            };
            export const updateBatteryDisplay = () => {
                try {
                    const batteryEl = document.getElementById('time-page-battery');
                    if (!batteryEl) return;
                    const bl = JSON.parse(NativeBridge.getBatteryLevel());
                    const ch = JSON.parse(NativeBridge.isCharging());
                    if (bl.success) {
                        batteryEl.textContent = (ch.charging ? '⚡' : '🔋') + ' ' + bl.level + '%';
                    }
                } catch(e) {}
            }
            export const startTimePageClock = () => {
                const el = document.getElementById('time-page-clock');
                if (!el) return;
                const tick = () => {
                    const now = new Date();
                    el.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                    const dateEl = document.getElementById('time-page-date');
                    if (dateEl) {
                        const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
                        dateEl.textContent = (now.getMonth()+1) + '月' + now.getDate() + '日 ' + weekdays[now.getDay()];
                    }
                }
                tick();
                if (state._timePageTimer) clearInterval(state._timePageTimer);
                state._timePageTimer = setInterval(function() { tick(); }, 1000);
                updateBatteryFromNative();
            }
            startTimePageClock();
            // initial render handled in startTimePageClock

            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    const tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; console.log('[TIME-DOM] HIDE'); }
                } else if (!document.hidden && !state.isInTimeView && zoomTarget === null) {
                    startZoomAnimation(defaultZoom, state.ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        state.zoomLevel = zoomLevel;
                        applyZoom();
                    });
                }
                // 返回前台时检测应用列表变动
                if (!document.hidden && state.nativeBridgeReady) {
                    setTimeout(function() {
                        NativeBridge.requestInstalledApps();
                    }, 500);
                }
            });

            // 全局设置选项切换
            window.setRadio = function(group, val) {
                const cards = document.querySelectorAll('.layout-card');
                cards.forEach(function(c) {
                    const radio = c.querySelector('input[name="' + group + '"]');
                    if (radio && radio.value === val) {
                        radio.checked = true;
                        c.classList.add('active');
                    } else if (radio) {
                        radio.checked = false;
                        c.classList.remove('active');
                    }
                });
            }

            window.highlightRadio = function(group, val) {
                console.log('highlightRadio', group, val);
                const btns = document.querySelectorAll('#' + group + ' .settings-radio');
                btns.forEach(function(b) {
                    if (b.getAttribute('data-val') === val) {
                        b.style.background = '#4a90d9';
                        b.style.color = '#fff';
                        b.style.borderColor = '#4a90d9';
                        b.classList.add('active');
                    } else {
                        b.style.background = '#1a1a2e';
                        b.style.color = 'rgba(255,255,255,0.6)';
                        b.style.borderColor = 'rgba(255,255,255,0.2)';
                        b.classList.remove('active');
                    }
                });
            }

