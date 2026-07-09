import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { createGearTexture } from './textures.js';
import { createSprites } from './sprites.js';
            export let initSettingsPanel = () => {
            let wallpaperPickBtn = document.getElementById('s-wallpaper-pick');
            let wallpaperRemoveBtn = document.getElementById('s-wallpaper-remove');
            window._onWallpaperPicked = function(json) {
                try { let r = typeof json === 'string' ? JSON.parse(json) : json;
                    if (r.success) {
                        let cb = '?t=' + Date.now();
                        document.body.style.backgroundImage = 'url(' + r.path + cb + ')';
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundPosition = 'center';
                        let img = new Image();
                        img.onload = function() { state._wallpaperImg = img; state.updateTimeSpriteBgOnly(true); };
                        img.src = r.path;
                    }
                } catch(e) {}
            };
            (function initWallpaper() {
                if (typeof NativeBridge !== 'undefined') {
                    try { let raw = NativeBridge.getWallpaperPath(); let r = JSON.parse(raw);
                        if (r.success) { document.body.style.backgroundImage = 'url(' + r.path + '?t=' + Date.now() + ')'; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center'; wallpaperPickBtn.textContent = '重新选择'; let img = new Image(); img.onload = function() { state._wallpaperImg = img; }; img.src = r.path; }
                    } catch(e) {}
                }
            })();
            wallpaperPickBtn.onclick = function() {
                if (typeof NativeBridge !== 'undefined') NativeBridge.pickWallpaper();
            };
            wallpaperRemoveBtn.onclick = function() {
                document.body.style.backgroundImage = 'none';
                state._wallpaperImg = null;
                state.updateTimeSpriteBgOnly(true);
                state.renderTimePageToTexture();
                wallpaperPickBtn.textContent = '选择图片';
                if (typeof NativeBridge !== 'undefined') NativeBridge.removeWallpaper();
            };
            // 时间页面背景
            let timeBgPickBtn = document.getElementById('s-timebg-pick');
            let timeBgRemoveBtn = document.getElementById('s-timebg-remove');
            window._onTimeBgPicked = function(json) {
                try { let r = typeof json === 'string' ? JSON.parse(json) : json;
                    if (r.success) {
                        state._timeBgPath = r.path;
                        let xhr = new XMLHttpRequest();
                        xhr.open('GET', r.path, true);
                        xhr.responseType = 'blob';
                        xhr.onload = function() {
                            if (xhr.status === 0 || xhr.status === 200) {
                                let url = URL.createObjectURL(xhr.response);
                                let img = new Image();
                                img.onload = function() {
                                    URL.revokeObjectURL(url);
                                    state._timeBgImg = img;
                                    state.updateTimeSpriteBgOnly(true);
                                    state.renderTimePageToTexture();
                                };
                                img.src = url;
                            }
                        };
                        xhr.onerror = function() {
                            let img = new Image();
                            img.onload = function() { state._timeBgImg = img; state.updateTimeSpriteBgOnly(true); state.renderTimePageToTexture(); };
                            img.src = r.path;
                        };
                        xhr.send();
                        timeBgPickBtn.textContent = '重新选择';
                    }
                } catch(e) {}
            };
            timeBgPickBtn.onclick = function() {
                if (typeof NativeBridge !== 'undefined') NativeBridge.pickTimeBg();
            };
            timeBgRemoveBtn.onclick = function() {
                state._timeBgImg = null; state._timeBgPath = null;
                state.updateTimeSpriteBgOnly(true);
                state.renderTimePageToTexture();
                timeBgPickBtn.textContent = '选择图片';
                if (typeof NativeBridge !== 'undefined') NativeBridge.removeTimeBg();
            };

            // ==================== 主题色 ====================
            let currentThemeColor = '#8ab4f8';
            try {
                if (typeof NativeBridge !== 'undefined') {
                    let tc = JSON.parse(NativeBridge.getThemeColor());
                    if (tc.success && tc.color) currentThemeColor = tc.color;
                }
            } catch(e) {}

            // Apply theme color to CSS variables
            applyThemeColor(currentThemeColor);

            let colorSwatches = document.querySelectorAll('.color-swatch');
            colorSwatches.forEach(function(swatch) {
                if (swatch.getAttribute('data-color') === currentThemeColor) {
                    swatch.classList.add('active');
                } else {
                    swatch.classList.remove('active');
                }
                swatch.addEventListener('click', function() {
                    colorSwatches.forEach(s => s.classList.remove('active'));
                    swatch.classList.add('active');
                    currentThemeColor = swatch.getAttribute('data-color');
                    applyThemeColor(currentThemeColor);
                });
            });

            function applyThemeColor(color) {
                document.documentElement.style.setProperty('--theme-color', color);
                // Update save button and slider thumbs
                let saveBtn = document.getElementById('s-save');
                if (saveBtn) saveBtn.style.background = color;
            }

            // ==================== 快捷方式管理 ====================
            let pinnedShortcuts = [];
            try {
                if (typeof NativeBridge !== 'undefined') {
                    let sc = JSON.parse(NativeBridge.getPinnedShortcuts());
                    if (sc.success && sc.shortcuts) pinnedShortcuts = sc.shortcuts;
                }
            } catch(e) {}

            function renderShortcutList() {
                let listEl = document.getElementById('shortcut-list');
                let countEl = document.getElementById('shortcut-count');
                if (!listEl) return;

                let allApps = state.apps || [];
                // Show all apps with pin status
                let sorted = allApps.slice().sort(function(a, b) {
                    let aPinned = pinnedShortcuts.indexOf(a.packageName) >= 0 ? 0 : 1;
                    let bPinned = pinnedShortcuts.indexOf(b.packageName) >= 0 ? 0 : 1;
                    return aPinned - bPinned;
                });

                if (countEl) countEl.textContent = pinnedShortcuts.length + '个已钉选';

                listEl.innerHTML = '';
                sorted.slice(0, 30).forEach(function(app) {
                    let isPinned = pinnedShortcuts.indexOf(app.packageName) >= 0;
                    let item = document.createElement('div');
                    item.className = 'shortcut-item' + (isPinned ? ' pinned' : '');
                    let initial = (app.appName || '?').charAt(0).toUpperCase();
                    item.innerHTML = `
                        <div class="shortcut-icon">${initial}</div>
                        <div class="shortcut-name">${app.appName}</div>
                        <div class="shortcut-pin">${isPinned ? '📌' : '📍'}</div>
                    `;
                    item.addEventListener('click', function() {
                        let idx = pinnedShortcuts.indexOf(app.packageName);
                        if (idx >= 0) {
                            pinnedShortcuts.splice(idx, 1);
                        } else {
                            pinnedShortcuts.push(app.packageName);
                        }
                        renderShortcutList();
                    });
                    listEl.appendChild(item);
                });
            }

            // Render shortcut list when settings open
            let _origOpenSettings = window._openSettings;
            window._openSettings = function() {
                renderShortcutList();
                if (_origOpenSettings) _origOpenSettings();
            };

            // ==================== 通知权限 ====================
            let notifGrantBtn = document.getElementById('s-notif-grant');
            if (notifGrantBtn) {
                notifGrantBtn.addEventListener('click', function() {
                    if (typeof NativeBridge !== 'undefined') {
                        NativeBridge.openNotificationSettings();
                    }
                });
            }

                let overlay = document.getElementById('settings-overlay');
                let backBtn = document.getElementById('settings-close-btn');
                let saveBtn = document.getElementById('s-save');
                // Load from localStorage
                let saved = {};
                try { saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}'); } catch(e) {}
                // Apply saved values
                let iconInput = document.getElementById('s-icon');
                if (saved.iconRes && iconInput) iconInput.value = saved.iconRes;
                let sphereInput = document.getElementById('settings-sphere-input');
                if (saved.sphereSize && sphereInput) sphereInput.value = parseFloat(saved.sphereSize);
                if (saved.layoutMode) {
                    let radios = document.getElementsByName('layoutMode');
                    for (let ri = 0; ri < radios.length; ri++) {
                        if (radios[ri].value === saved.layoutMode) radios[ri].checked = true;
                    }
                }
                // FPS显示开关
                let fpsCb = document.getElementById('s-fps');
                if (fpsCb) {
                    fpsCb.checked = !!(saved.showFps);
                    fpsCb.onchange = function() {
                        state._fpsShow = this.checked;
                        let fpsEl = document.getElementById('fps-counter');
                        if (fpsEl) fpsEl.style.display = this.checked ? 'block' : 'none';
                        try {
                            let s = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                            s.showFps = this.checked;
                            localStorage.setItem('vibe-settings', JSON.stringify(s));
                        } catch(e) {}
                    };
                    if (fpsCb.checked) {
                        state._fpsShow = true;
                        document.getElementById('fps-counter').style.display = 'block';
                    }
                }
                backBtn.addEventListener('click', function() {
                    overlay.style.display = 'none';
                    state.canvas.style.pointerEvents = 'auto';
                    state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = state.defaultZoom;
                        state.applyZoom();
                    });
                });
                let clearBtn = document.getElementById('s-clear-cache');
                clearBtn.addEventListener('click', function() {
                    if (state.nativeBridgeReady) {
                        NativeBridge.clearIconCache();
                        clearBtn.textContent = '已清除 ✓';
                        clearBtn.style.background = 'rgba(46,204,113,0.15)';
                        clearBtn.style.color = '#2ecc71';
                        setTimeout(() => {
                            clearBtn.textContent = '清除图标缓存';
                            clearBtn.style.background = '';
                            clearBtn.style.color = '';
                        }, 2000);
                    }
                });
                saveBtn.addEventListener('click', function() {
                    let iconRes = document.getElementById('s-icon');
                    let sphereSizeInput = document.getElementById('settings-sphere-input');
                    let sphereSize = sphereSizeInput ? sphereSizeInput.value : '2.5';
                    // 最小半径校验
                    let minR = state.updateSphereMinHint();
                    let inputR = parseFloat(sphereSize);
                    if (isNaN(inputR) || inputR <= 0) inputR = 2.5;
                    if (inputR < minR) {
                        inputR = minR;
                        if (sphereSizeInput) sphereSizeInput.value = Math.ceil(minR * 100) / 100;
                        saveBtn.textContent = '已自动调整至最小 ✓';
                        saveBtn.style.background = '#e67e22';
                        setTimeout(function() {
                            saveBtn.textContent = '保存';
                            saveBtn.style.background = currentThemeColor;
                        }, 2000);
                    }
                    sphereSize = '' + inputR;
                    let layoutRadios = document.getElementsByName('layoutMode');
                    let layoutVal = 'sphere';
                    for (let lr = 0; lr < layoutRadios.length; lr++) {
                        if (layoutRadios[lr].checked) { layoutVal = layoutRadios[lr].value; break; }
                    }
                    let animInput = document.getElementById('settings-anim-input');
                    let animSpeedVal = animInput ? parseInt(animInput.value) || 250 : 250;
                    if (animSpeedVal < 10) animInput.value = 10;
                    if (animSpeedVal > 5000) animInput.value = 5000;
                    let hotreloadCb = document.getElementById('s-hotreload');
                    let hotreloadEnabled = hotreloadCb ? hotreloadCb.checked : false;
                    let settings = {
                        iconRes: iconRes ? iconRes.value : '512',
                        sphereSize: sphereSize || '2.5',
                        layoutMode: layoutVal,
                        hotReload: hotreloadEnabled,
                        animSpeed: animSpeedVal,
                        showFps: !!(document.getElementById('s-fps') || {}).checked,
                        themeColor: currentThemeColor,
                        pinnedShortcuts: pinnedShortcuts,
                        wallpaperBlur: parseInt(document.getElementById('s-wallpaper-blur')?.value || 0),
                        wallpaperDim: parseInt(document.getElementById('s-wallpaper-dim')?.value || 0)
                    };
                    localStorage.setItem('vibe-settings', JSON.stringify(settings));
                    state.ANIM_DURATION = animSpeedVal;
                    try { NativeBridge.setHotReload(hotreloadEnabled); } catch(e) {}
                    // Save theme color to native
                    try { NativeBridge.setThemeColor(currentThemeColor); } catch(e) {}
                    // Save pinned shortcuts to native
                    try { NativeBridge.setPinnedShortcuts(JSON.stringify(pinnedShortcuts)); } catch(e) {}
                    // 统一：应用所有更改，无需刷新页面
                    let prevIconRes = state.ICON_RES;
                    state.ICON_RES = Math.max(16, parseInt(settings.iconRes) || 512);
                    let layoutChanged = state.layoutMode !== layoutVal;
                    let sphereChanged = Math.abs(state.SPHERE_RADIUS - inputR) > 0.001;
                    state.layoutMode = layoutVal;
                    state.SPHERE_RADIUS = inputR;
                    if (layoutChanged || sphereChanged) {
                        createSprites(state.apps, null, true);
                        state.zoomLevel = state.defaultZoom;
                        state.applyZoom();
                        if (state.nativeBridgeReady) NativeBridge.clearIconCache();
                        if (window._allPkgs && state.nativeBridgeReady) {
                            NativeBridge.requestAppIcons(JSON.stringify(window._allPkgs), state.ICON_RES);
                        }
                    } else {
                        if (state.ICON_RES !== prevIconRes) {
                            state.sprites.forEach(function(spr) {
                                if (spr.userData.isTimeSprite) {
                                    spr.material.map = state.createTimeTexture();
                                } else if (spr.userData.app && spr.userData.app.packageName === '__settings__') {
                                    spr.material.map = createGearTexture();
                                } else if (spr.userData._iconUrl) {
                                    (function(s) {
                                        let img = new Image();
                                        img.onload = function() {
                                            s.material.map = state.createIconTextureFromImage(img);
                                            s.material.needsUpdate = true;
                                        };
                                        img.src = s.userData._iconUrl;
                                    })(spr);
                                } else if (spr.userData.color) {
                                    spr.material.map = state.createPlaceholderTexture(spr.userData.app.appName, spr.userData.color);
                                }
                                spr.material.needsUpdate = true;
                            });
                        }
                        if (state.sphereGroup && inputR > 0) {
                            let rawPoints = state.sphereCoulomb(window._totalItems.length, { radius: state.SPHERE_RADIUS, iter: 500 });
                            let timeIdx = window._totalItems.findIndex(function(it) { return it.type === 'time'; });
                            if (timeIdx >= 0) {
                                let timePos = new THREE.Vector3(rawPoints[timeIdx][0], rawPoints[timeIdx][1], rawPoints[timeIdx][2]);
                                let alignQ = new THREE.Quaternion().setFromUnitVectors(timePos.clone().normalize(), new THREE.Vector3(0,0,1));
                                rawPoints = rawPoints.map(function(p) {
                                    let v = new THREE.Vector3(p[0],p[1],p[2]);
                                    v.applyQuaternion(alignQ);
                                    return v;
                                });
                                rawPoints.sort(function(a, b) { return b.z - a.z; });
                            }
                            for (let k = 0; k < state.sprites.length; k++) {
                                if (k < rawPoints.length) {
                                    state.sprites[k].position.copy(rawPoints[k]);
                                }
                            }
                            state.sphereGroup.quaternion.copy(state.rotationQuat);
                            state.SPHERE_DIAMETER = state.SPHERE_RADIUS * 2;
                            state.defaultZoom = state.computeInitDistance();
                            state.timeViewZoom = state.computeTimeViewZoom();
                            state.zoomLevel = state.defaultZoom;
                            state.applyZoom();
                        }
                    }
                    if (!layoutChanged && !sphereChanged && state.ICON_RES !== prevIconRes) {
                        if (state.nativeBridgeReady) NativeBridge.clearIconCache();
                        state.sprites.forEach(function(spr) { spr.userData.hasRealIcon = false; });
                        if (window._allPkgs && state.nativeBridgeReady) {
                            NativeBridge.requestAppIcons(JSON.stringify(window._allPkgs), state.ICON_RES);
                        }
                    }
                    saveBtn.textContent = '已保存 ✓';
                    saveBtn.style.background = '#2ecc71';
                    setTimeout(function() {
                        saveBtn.textContent = '保存';
                        saveBtn.style.background = currentThemeColor;
                    }, 1500);
                });
            }
