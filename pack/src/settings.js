import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { createGearTexture } from './textures.js';
import { createSprites } from './sprites.js';
            export const initSettingsPanel = () => {
            const wallpaperPickBtn = document.getElementById('s-wallpaper-pick');
            const wallpaperRemoveBtn = document.getElementById('s-wallpaper-remove');
            window._onWallpaperPicked = function(json) {
                try { var r = typeof json === 'string' ? JSON.parse(json) : json;
                    if (r.success) {
                        var cb = '?t=' + Date.now();
                        document.body.style.backgroundImage = 'url(' + r.path + cb + ')';
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundPosition = 'center';
                        var img = new Image();
                        img.onload = function() { state._wallpaperImg = img; state.updateTimeSpriteBgOnly(true); };
                        img.src = r.path;
                    }
                } catch(e) {}
            };
            (function initWallpaper() {
                if (typeof NativeBridge !== 'undefined') {
                    try { var raw = NativeBridge.getWallpaperPath(); var r = JSON.parse(raw);
                        if (r.success) { document.body.style.backgroundImage = 'url(' + r.path + '?t=' + Date.now() + ')'; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center'; wallpaperPickBtn.textContent = '重新选择'; var img = new Image(); img.onload = function() { state._wallpaperImg = img; }; img.src = r.path; }
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
            var timeBgPickBtn = document.getElementById('s-timebg-pick');
            var timeBgRemoveBtn = document.getElementById('s-timebg-remove');
            window._onTimeBgPicked = function(json) {
                try { var r = typeof json === 'string' ? JSON.parse(json) : json;
                    if (r.success) {
                        state._timeBgPath = r.path;
                        // 用XHR加载本地文件，绕过可能的file://限制
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', r.path, true);
                        xhr.responseType = 'blob';
                        xhr.onload = function() {
                            if (xhr.status === 0 || xhr.status === 200) {
                                var url = URL.createObjectURL(xhr.response);
                                var img = new Image();
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
                            // fallback: 直接img.src
                            var img = new Image();
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
                const overlay = document.getElementById('settings-overlay');
                const backBtn = document.getElementById('settings-close-btn');
                const saveBtn = document.getElementById('s-save');
                // Load from localStorage
                let saved = {};
                try { saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}'); } catch(e) {}
                // Setup radio button clicks
                // Apply saved values
                const iconInput = document.getElementById('s-icon');
                if (saved.iconRes && iconInput) iconInput.value = saved.iconRes;
                const sphereInput = document.getElementById('settings-sphere-input');
                if (saved.sphereSize && sphereInput) sphereInput.value = parseFloat(saved.sphereSize);
                if (saved.layoutMode) {
                    const radios = document.getElementsByName('layoutMode');
                    for (let ri = 0; ri < radios.length; ri++) {
                        if (radios[ri].value === saved.layoutMode) radios[ri].checked = true;
                    }
                }
                // FPS显示开关
                const fpsCb = document.getElementById('s-fps');
                if (fpsCb) {
                    fpsCb.checked = !!(saved.showFps);
                    fpsCb.onchange = function() {
                        state._fpsShow = this.checked;
                        const fpsEl = document.getElementById('fps-counter');
                        if (fpsEl) fpsEl.style.display = this.checked ? 'block' : 'none';
                        // 即时保存
                        try {
                            const s = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                            s.showFps = this.checked;
                            localStorage.setItem('vibe-settings', JSON.stringify(s));
                        } catch(e) {}
                    };
                    // 初始同步
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
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                    });
                });
                const clearBtn = document.getElementById('s-clear-cache');
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
                    const iconRes = document.getElementById('s-icon');
                    const sphereSizeInput = document.getElementById('settings-sphere-input');
                    let sphereSize = sphereSizeInput ? sphereSizeInput.value : '2.5';
                    // 最小半径校验
                    const minR = state.updateSphereMinHint();
                    let inputR = parseFloat(sphereSize);
                    if (isNaN(inputR) || inputR <= 0) inputR = 2.5;
                    if (inputR < minR) {
                        inputR = minR;
                        if (sphereSizeInput) sphereSizeInput.value = Math.ceil(minR * 100) / 100;
                        saveBtn.textContent = '已自动调整至最小 ✓';
                        saveBtn.style.background = '#e67e22';
                        setTimeout(function() {
                            saveBtn.textContent = '保存';
                            saveBtn.style.background = '#8ab4f8';
                        }, 2000);
                    }
                    sphereSize = '' + inputR;
                    const layoutRadios = document.getElementsByName('layoutMode');
                    let layoutVal = 'sphere';
                    for (let lr = 0; lr < layoutRadios.length; lr++) {
                        if (layoutRadios[lr].checked) { layoutVal = layoutRadios[lr].value; break; }
                    }
                    const animInput = document.getElementById('settings-anim-input');
                    const animSpeedVal = animInput ? parseInt(animInput.value) || 250 : 250;
                    if (animSpeedVal < 10) animInput.value = 10;
                    if (animSpeedVal > 5000) animInput.value = 5000;
                    const hotreloadCb = document.getElementById('s-hotreload');
                    const hotreloadEnabled = hotreloadCb ? hotreloadCb.checked : false;
                    const settings = {
                        iconRes: iconRes ? iconRes.value : '512',
                        sphereSize: sphereSize || '2.5',
                        layoutMode: layoutVal,
                        hotReload: hotreloadEnabled,
                        animSpeed: animSpeedVal,
                        showFps: !!(document.getElementById('s-fps') || {}).checked
                    };
                    localStorage.setItem('vibe-settings', JSON.stringify(settings));
                    state.ANIM_DURATION = animSpeedVal;
                    try { NativeBridge.setHotReload(hotreloadEnabled); } catch(e) {}
                    // 统一：应用所有更改，无需刷新页面
                    const prevIconRes = state.ICON_RES;
                    state.ICON_RES = Math.max(16, parseInt(settings.iconRes) || 512);
                    const layoutChanged = state.layoutMode !== layoutVal;
                    const sphereChanged = Math.abs(state.SPHERE_RADIUS - inputR) > 0.001;
                    state.layoutMode = layoutVal;
                    state.SPHERE_RADIUS = inputR;
                    if (layoutChanged || sphereChanged) {
                        // 变更布局/球体大小 → 重建所有精灵（球体大小兜底在createSprites内自动计算）
                        createSprites(state.apps, null, true);
                        // 重建后重置到默认视角
                        state.zoomLevel = state.defaultZoom;
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                        // 重建后重新加载图标
                        if (state.nativeBridgeReady) NativeBridge.clearIconCache();
                        if (window._allPkgs && state.nativeBridgeReady) {
                            NativeBridge.requestAppIcons(JSON.stringify(window._allPkgs), state.ICON_RES);
                        }
                    } else {
                        // 仅分辨率/速度等变化，原地重建纹理
                        if (state.ICON_RES !== prevIconRes) {
                            state.sprites.forEach(function(spr) {
                                if (spr.userData.isTimeSprite) {
                                    spr.material.map = state.createTimeTexture();
                                } else if (spr.userData.app && spr.userData.app.packageName === '__settings__') {
                                    spr.material.map = createGearTexture();
                                } else if (spr.userData._iconUrl) {
                                    (function(s) {
                                        const img = new Image();
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
                            // 仅球体大小变化（布局不变），重新分布位置
                            let rawPoints = state.sphereCoulomb(window._totalItems.length, { radius: state.SPHERE_RADIUS, iter: 500 });
                            const timeIdx = window._totalItems.findIndex(function(it) { return it.type === 'time'; });
                            if (timeIdx >= 0) {
                                const timePos = new THREE.Vector3(rawPoints[timeIdx][0], rawPoints[timeIdx][1], rawPoints[timeIdx][2]);
                                const alignQ = new THREE.Quaternion().setFromUnitVectors(timePos.clone().normalize(), new THREE.Vector3(0,0,1));
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
                    // 纹理重建（布局变更时createSprites已经做了，不需要重复）
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
                        saveBtn.style.background = '#8ab4f8';
                    }, 1500);
                });
            }
