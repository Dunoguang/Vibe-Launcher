import { state } from './state.js';
import { computeInitDistance, applyZoom, computeTimeViewZoom } from './zoom.js';
import { initSettingsPanel } from './settings.js';
import { hideContextMenu } from './gestures.js';
import { tryLoadApps } from './sprites.js';
import { updateBatteryDisplay } from './battery.js';
            export function init() {
                state.zoomLevel = state.computeInitDistance();
                state.defaultZoom = state.zoomLevel;
                state.timeViewZoom = state.computeTimeViewZoom();
                state.camera.position.set(0, 0, state.zoomLevel);
                state.applyZoom();
                state.isInTimeView = false;
                initSettingsPanel();
                // 上下文菜单事件
                const ctxInfo = document.getElementById('ctx-app-info');
                const ctxUninstall = document.getElementById('ctx-uninstall');
                if (ctxInfo) ctxInfo.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    hideContextMenu();
                });
                if (ctxUninstall) ctxUninstall.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    hideContextMenu();
                });
                 requestAnimationFrame(state.animate);
                tryLoadApps();
                setTimeout(function() { updateBatteryDisplay(); }, 3000);
            }
