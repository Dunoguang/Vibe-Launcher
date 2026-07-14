window.__T = { _start: performance.now() };
(function(){const _s=window.__T._start;window.__T=function(l){const n=performance.now();if(!window.__T[l])window.__T[l]=n;console.log('[time] '+l+' +'+(n-_s).toFixed(0)+'ms')}})();
import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { sphereCoulomb } from './sphere-coulomb.js';
import { createGearTexture, createPlaceholderTexture, createAtlasSliceTexture, drawCircleFrame, drawTimeCircleBackground } from './textures.js';
import { enterTimeView, exitTimeView, createTimeTexture, syncTimeSpriteTexture, scheduleMinuteUpdate, stopTimeTextureUpdates } from './time.js';
            export let clearAllSprites = () => {
                stopTimeTextureUpdates();
                for (let i = 0; i < state.sprites.length; i++) {
                    let s = state.sprites[i];
                    if (s.material) {
                        if (s.material.map) s.material.map.dispose();
                        s.material.dispose();
                    }
                    state.sphereGroup.remove(s);
                }
                state.sprites = [];
                state.timeSprite = null;
                state.timeSprite = null;
                if (state.atlasTex) { state.atlasTex.dispose(); state.atlasTex = null; }
                state.atlasSorterPkgs = [];
                state.atlasPkgToIndex = {};
            }
state.pendingIconLoads = 0;
state.enterAnimationComplete = false;
            export let createSprites = (appList, iconMap, skipEnter) => {
                clearAllSprites();
                let totalItems = [];
window._totalItems = totalItems;
                totalItems.push({
                    type: 'time',
                    data: { packageName: '__time__', appName: '时钟', isSystem: true },
                    colorIndex: 0
                });
                totalItems.push({
                    type: 'settings',
                    data: { packageName: '__settings__', appName: '设置', isSystem: true },
                    colorIndex: 1
                });
                for (let i = 0; i < appList.length; i++) {
                    totalItems.push({
                        type: 'app',
                        data: appList[i],
                        colorIndex: i + 2
                    });
                }
                let isHemi = (state.layoutMode === 'hemisphere');
                let isRing = (state.layoutMode === 'ring');
                let isHbar = (state.layoutMode === 'hbar');
                let isFlatring = (state.layoutMode === 'flatring');
                // 半球模式：复制透明占位精灵填充后半球
                if (isHemi) {
                    let bc = totalItems.length;
                    for (let ri = 0; ri < bc; ri++) {
                        totalItems.push({
                            type: 'redTest',
                            data: { packageName: '__red__' + ri, appName: '', isSystem: true },
                            colorIndex: bc + ri
                        });
                    }
                }
                let N = totalItems.length;
                let ringRadius = 0;
                if (isRing || isHbar || isFlatring) {
                    ringRadius = Math.max(state.SPHERE_RADIUS, (N * state.BASE_SCALE * 1.1) / (2 * Math.PI));
                    state.SPHERE_RADIUS = ringRadius;
                    state.SPHERE_DIAMETER = state.SPHERE_RADIUS * 2;
                    state.defaultZoom = isFlatring ? ringRadius * 0.09 : ringRadius * 1.15;
                    state.defaultZoom = state.defaultZoom;
                    state.zoomLevel = state.defaultZoom;
                    state.applyZoom();
                }
                let rawPoints = sphereCoulomb(N, { radius: state.SPHERE_RADIUS, iter: 500 });
                let timeItemIndex = totalItems.findIndex(function(item) { return item.type === 'time'; });
                let timeRaw = rawPoints[timeItemIndex];
                let timePos = new THREE.Vector3(timeRaw[0], timeRaw[1], timeRaw[2]);
                let targetDir = timePos.clone().normalize();
                let cameraDir = new THREE.Vector3(0, 0, 1);
                let alignQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, cameraDir);
                let allRotated;
                if (isRing) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        let a = (ri2 / N) * Math.PI * 2;
                        allRotated.push(new THREE.Vector3(0, Math.sin(a) * ringRadius, Math.cos(a) * ringRadius));
                    }
                } else if (isHbar) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        let a = (ri2 / N) * Math.PI * 2;
                        allRotated.push(new THREE.Vector3(Math.sin(a) * ringRadius, 0, Math.cos(a) * ringRadius));
                    }
                } else if (isFlatring) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        let a = (ri2 / N) * Math.PI * 2 + Math.PI / 2;
                        allRotated.push(new THREE.Vector3(Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, 0));
                    }
                } else {
                    allRotated = rawPoints.map(function(p) {
                        let v = new THREE.Vector3(p[0], p[1], p[2]);
                        v.applyQuaternion(alignQuat);
                        return v;
                    });
                    if (isHemi) {
                        allRotated.sort(function(a, b) { return b.z - a.z; });
                    }
                }
                let rotatedPoints = allRotated;
                // 确保 time 和 settings 始终占据最靠近摄像机的两个位置
                {
                    let indexed = rotatedPoints.map((p, i) => ({ p, i }));
                    indexed.sort((a, b) => b.p.z - a.p.z);
                    let newPts = indexed.map(x => x.p);
                    let newItems = indexed.map(x => totalItems[x.i]);
                    // 分离 time/settings 和其他 app
                    let frontItems = [], restItems = [];
                    for (let zi = 0; zi < newItems.length; zi++) {
                        if (newItems[zi].type === 'time' || newItems[zi].type === 'settings') {
                            frontItems.push(newItems[zi]);
                        } else {
                            restItems.push(newItems[zi]);
                        }
                    }
                    // time 排最前, settings 第二
                    frontItems.sort((a, b) => (a.type === 'time' ? -1 : (b.type === 'time' ? 1 : 0)));
                    // 重组: frontItems 拿最靠近摄像机的点 (newPts[0..]), restItems 拿其余点
                    let merged = [];
                    for (let zi = 0; zi < frontItems.length; zi++) {
                        merged.push({ pt: newPts[zi], item: frontItems[zi] });
                    }
                    for (let zi = 0; zi < restItems.length; zi++) {
                        merged.push({ pt: newPts[frontItems.length + zi], item: restItems[zi] });
                    }
                    for (let zi = 0; zi < rotatedPoints.length; zi++) {
                        rotatedPoints[zi] = merged[zi].pt;
                        totalItems[zi] = merged[zi].item;
                    }
                }
                for (let j = 0; j < N; j++) {
                    let item = totalItems[j];
                    let p = rotatedPoints[j];
                    if (item.type === 'settings') {
                        let gearTex = createGearTexture();
                        let gearMat = new THREE.SpriteMaterial({ map: gearTex, transparent: true, depthTest: true, depthWrite: true });
                        let gearSprite = new THREE.Sprite(gearMat);
                        gearSprite.position.copy(p);
                        gearSprite.scale.set(state.BASE_SCALE, state.BASE_SCALE, 1);
                        gearSprite.userData = { isTimeSprite: false, app: item.data, baseScale: state.BASE_SCALE };
                        state.sphereGroup.add(gearSprite);
                        state.sprites.push(gearSprite);
                    } else if (item.type === 'redTest') {
                        let redC = document.createElement('canvas');
                        redC.width = state.ICON_RES; redC.height = state.ICON_RES;
                        let rtx = redC.getContext('2d');
                        rtx.fillStyle = '#ff0000';
                        rtx.fillRect(0, 0, state.ICON_RES, state.ICON_RES);
                        let redTex = new THREE.CanvasTexture(redC);
                        redTex.minFilter = THREE.LinearFilter;
                        redTex.magFilter = THREE.LinearFilter;
                        let redMat = new THREE.SpriteMaterial({ map: redTex, transparent: true, depthTest: true, depthWrite: true, opacity: 0 });
                        let redSprite = new THREE.Sprite(redMat);
                        redSprite.position.copy(p);
                        redSprite.scale.set(state.BASE_SCALE, state.BASE_SCALE, 1);
                        redSprite.userData = { isTimeSprite: false, app: item.data, baseScale: state.BASE_SCALE, isDecor: true };
                        state.sphereGroup.add(redSprite);
                        state.sprites.push(redSprite);
                    } else if (item.type === 'time') {
                        let timeTex = createTimeTexture();
                        let timeMat = new THREE.SpriteMaterial({
                            map: timeTex,
                            transparent: true,
                            depthTest: true,
                            depthWrite: true
                        });
                        let sprite = new THREE.Sprite(timeMat);
                        sprite.position.copy(p);
                        sprite.scale.set(state.BASE_SCALE, state.BASE_SCALE, 1);
                        sprite.userData = {
                            isTimeSprite: true,
                            app: item.data,
                            baseScale: state.BASE_SCALE
                        };
                        state.sphereGroup.add(sprite);
                        state.sprites.push(sprite);
                        state.timeSprite = sprite;
                        state.timeSprite = sprite;
                    } else {
                        let app = item.data;
                        let color = state.placeholderColors[item.colorIndex % state.placeholderColors.length];
                        let placeholderTex = createPlaceholderTexture(app.appName, color);
                        let mat = new THREE.SpriteMaterial({
                            map: placeholderTex,
                            transparent: true,
                            depthTest: true,
                            depthWrite: true
                        });
                        let appSprite = new THREE.Sprite(mat);
                        appSprite.position.copy(p);
                        appSprite.scale.set(state.BASE_SCALE, state.BASE_SCALE, 1);
                        appSprite.userData = {
                            isTimeSprite: false,
                            app: app,
                            color: color,
                            hasRealIcon: false,
                            baseScale: state.BASE_SCALE
                        };
                        state.sphereGroup.add(appSprite);
                        state.sprites.push(appSprite);
                        // 图标由 _onAtlasReady → applyAtlasToAllSprites 统一替换
                    }
                }
                state.rotationQuat.identity();
                state.sphereGroup.quaternion.identity();
                if (state.layoutMode === 'flatring' && state.sprites.length > 0) {
                    let tw = new THREE.Vector3();
                    state.sprites[0].getWorldPosition(tw);
                    state.camera.lookAt(tw);
                }
state.updateSphereMinHint();
                // 启动时应用已保存的球体大小
                try {
                    let saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                    if (saved.sphereSize && parseFloat(saved.sphereSize) > 0 && state.layoutMode !== 'ring' && state.layoutMode !== 'hbar' && state.layoutMode !== 'flatring') {
                        state.SPHERE_RADIUS = parseFloat(saved.sphereSize);
                        // state.sphereGroup now uses Coulomb points directly, no need for scale
                        // 重新分布
                        let rawPts = sphereCoulomb(totalItems.length, { radius: state.SPHERE_RADIUS, iter: 500 });
                        let tIdx = totalItems.findIndex(function(it) { return it.type === 'time'; });
                        if (tIdx >= 0) {
                            let tp = new THREE.Vector3(rawPts[tIdx][0], rawPts[tIdx][1], rawPts[tIdx][2]);
                            let aq = new THREE.Quaternion().setFromUnitVectors(tp.clone().normalize(), new THREE.Vector3(0,0,1));
                            rawPts = rawPts.map(function(pt) {
                                let v = new THREE.Vector3(pt[0],pt[1],pt[2]);
                                v.applyQuaternion(aq);
                                return v;
                            });
                            rawPts.sort(function(a, b) { return b.z - a.z; });
                        }
                        for (let k = 0; k < state.sprites.length; k++) {
                            if (k < rawPts.length) state.sprites[k].position.copy(rawPts[k]);
                        }
                        state.SPHERE_DIAMETER = state.SPHERE_RADIUS * 2;
                        state.defaultZoom = state.computeInitDistance();
                        state.defaultZoom = state.defaultZoom;
                        state.timeViewZoom = state.computeTimeViewZoom();
                        state.zoomLevel = state.defaultZoom;
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                    }
                } catch(e) {}
                state.timeViewZoom = state.computeTimeViewZoom();
                // 初始化时间精灵纹理 + 启动分钟调度
                setTimeout(() => {
                    syncTimeSpriteTexture();
                    scheduleMinuteUpdate();
                }, 500);
                hideLoadingIfReady();  // 先隐藏loading
                if (!skipEnter) {
                    enterTimeView(true, function() {
                        state.enterAnimationComplete = true;
                        checkAllIconsLoaded();
                    });
                } else {
                    state.enterAnimationComplete = true;
                    checkAllIconsLoaded();
                }
            }
            export function loadAtlasIcon(sprite, sortedIndex) {
                if (!state.atlasTex) return;
                const totalCols = state.atlasCols;
                const totalRows = Math.ceil(state.atlasSorterPkgs.length / totalCols);
                const tex = createAtlasSliceTexture(state.atlasTex, sortedIndex, totalCols, totalRows);
                if (sprite.material && sprite.material.map && !sprite.userData.hasRealIcon) {
                    sprite.material.map.dispose();
                }
                sprite.material.map = tex;
                sprite.material.needsUpdate = true;
                sprite.userData.hasRealIcon = true;
                state.pendingIconLoads--;
                checkAllIconsLoaded();
            }

            export function applyAtlasToAllSprites() {
                if (!state.atlasTex || !state.atlasSorterPkgs.length) return;
                state.atlasPkgToIndex = {};
                for (let i = 0; i < state.atlasSorterPkgs.length; i++) {
                    state.atlasPkgToIndex[state.atlasSorterPkgs[i]] = i;
                }
                let count = 0;
                for (const sprite of state.sprites) {
                    if (!sprite.userData.isTimeSprite && sprite.userData.app &&
                        state.atlasPkgToIndex[sprite.userData.app.packageName] !== undefined &&
                        !sprite.userData.hasRealIcon) count++;
                }
                state.pendingIconLoads = count;
                for (const sprite of state.sprites) {
                    if (sprite.userData.isTimeSprite) continue;
                    const app = sprite.userData.app;
                    const idx = app && state.atlasPkgToIndex[app.packageName];
                    if (idx !== undefined && !sprite.userData.hasRealIcon) {
                        loadAtlasIcon(sprite, idx);
                    }
                }
            }

            export function checkAllIconsLoaded() {
                state.checkAllIconsLoaded = checkAllIconsLoaded;
                if (state.pendingIconLoads <= 0 && state.enterAnimationComplete) {
                    state.loadingEl.style.opacity = '0';
                    setTimeout(function() { state.loadingEl.textContent = ''; }, 500);
                }
            }
            export function hideLoadingIfReady() {
                state.hideLoadingIfReady = hideLoadingIfReady;
                if (state.loadingEl) {
                    state.loadingEl.style.display = 'none';
                }
            }
            // ========== NativeBridge ==========
            export let tryLoadApps = () => {
                if (typeof NativeBridge !== 'undefined' && NativeBridge.generateAtlas) {
                    state.nativeBridgeReady = true;
                    createTimeTexture();  // 预创建时间纹理
                    __T("T0 generateAtlas called");
                    NativeBridge.generateAtlas();
                } else {
                    setTimeout(async function() {
                        if (typeof NativeBridge !== 'undefined' && NativeBridge.generateAtlas) {
                            state.nativeBridgeReady = true;
                            createTimeTexture();
                            NativeBridge.generateAtlas();
                        } else {
                            state.loadingEl.textContent = 'NativeBridge 不可用，使用演示数据';
                            createDemoApps();
                        }
                    }, 800);
                }
            }
            export function createDemoApps() {
                let demoNames = [
                    '微信', 'QQ', '淘宝', '支付宝', '抖音', '美团', '饿了么', 'B站', '知乎', '微博',
                    '网易云', '高德', '百度', '京东', '拼多多', '小红书', '快手', '滴滴', '闲鱼', '携程',
                    '酷狗', 'UC', 'WPS', '钉钉', '飞书',
                ];
                let demoApps = [];
                for (let i = 0; i < demoNames.length; i++) {
                    demoApps.push({
                        packageName: 'com.demo.' + demoNames[i].toLowerCase(),
                        appName: demoNames[i],
                        isSystem: false
                    });
                }
                state.apps = demoApps;
                createSprites(demoApps, null);
            }
            // Back gesture state managed via state.js
            window._onBackStarted = function() {
                let overlay = document.getElementById('settings-overlay');
                if (overlay && overlay.style.display === 'flex') {
                    state._backType = 'settings';
                    state._backProgress = 0;
                    state._backStartZoom = state.zoomLevel;
                    if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
                    return;
                }
                if (state.cancelableAction && state.cancelableAction.phase === 'animating') {
                    state._backType = 'cancelable';
                    state._backProgress = 0;
                    state._backStartZoom = state.zoomLevel;
                    state._backSavedQuat = state.sphereGroup.quaternion.clone();
                    state.cancelZoomAnimation();
                    state.rotationAnimData = null;
                    if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
                    return;
                }
                if (!state.isInTimeView) {
                    state._backProgress = -1;
                    state._backType = '';
                    return;
                }
                // 控制中心面板展开时，返回手势由面板接管
                var panelEl = document.getElementById('panel');
                if (panelEl) {
                    var matrix = new WebKitCSSMatrix(getComputedStyle(panelEl).transform);
                    if (matrix.m42 > -panelEl.offsetHeight * 0.9) {
                        state._backType = 'panel';
                        state._backProgress = 0;
                        return;
                    }
                }
                // 忽略进入时间视图后短时间内（500ms）的系统返回手势（可能是旋转动画触发的误判）
                if (state._backType === '' && state._timeEnteredAt && performance.now() - state._timeEnteredAt < 500) {
                    state._backProgress = -1;
                    state._backType = '';
                    return;
                }
                state._backType = 'time';
                state._backProgress = 0;
                state._backStartZoom = state.zoomLevel;
                // Cancel in-progress returnToTimeView animations
                state.cancelZoomAnimation();
                state.rotationAnimData = null;
                if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
                let tp = document.getElementById('time-page');
                if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; }
            };
            window._onBackProgress = function(p) {
                if (state._backProgress < 0) return;
                state._backProgress = p;
                if (state._backType === 'settings') {
                    let overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = 1 - state.materialEasing(p);
                    let card = document.getElementById('settings-card');
                    if (card) {
                        let s = Math.max(0.01, 1 - state.materialEasing(p) * 2);
                        card.style.transform = 'scale(' + s + ')';
                    }
                    state.zoomLevel = state._backStartZoom + (state.defaultZoom - state._backStartZoom) * state.materialEasing(p);
                    state.applyZoom();
                } else if (state._backType === 'cancelable') {
                    if (state.cancelableAction && !state.cancelableAction.cancelled) {
                        state.cancelableAction.cancelled = true;
                    }
                    state.zoomLevel = state._backStartZoom + (state.defaultZoom - state._backStartZoom) * state.materialEasing(p);
                    state.applyZoom();
                } else if (state._backType === 'panel') {
                    var panelEl = document.getElementById('panel');
                    if (panelEl) {
                        var ph = panelEl.offsetHeight;
                        var ep = state.materialEasing(p);
                        panelEl.style.transform = 'translateY(' + (-ph * ep) + 'px)';
                    }
                } else {
                    let t = state.materialEasing(p);
                    let z = state._backStartZoom + (state.defaultZoom - state._backStartZoom) * t;
                    state.zoomLevel = z;
                    state.applyZoom();
                }
                if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
            };
            // Installed APK has bug: calls _onProgress instead of _onBackProgress
            window._onProgress = window._onBackProgress;
            window._onBackCancelled = function() {
                if (state._backProgress < 0) return;
                let _cancelP = state._backProgress;
                state._backProgress = -1;
                if (state._backType === 'panel') {
                    var panelEl = document.getElementById('panel');
                    if (panelEl) {
                        panelEl.style.transform = 'translateY(0)';
                        panelEl.classList.add('animate');
                    }
                    state._backType = '';
                    return;
                }
                if (state._backType === 'settings') {
                    let overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = '1';
                    let card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    state.zoomLevel = state._backStartZoom;
                    state.applyZoom();
                } else if (state._backType === 'cancelable') {
                    if (_cancelP < 0.3 && state.cancelableAction) {
                        // Resume opening from saved state
                        state.cancelableAction.cancelled = false;
                        let targetSprite = state.cancelableAction.sprite;
                        let targetDir = targetSprite.position.clone().normalize();
                        let targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        state.startRotationAnimation(targetQuat, state.ANIM_DURATION, function() {
                            if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                state.cancelableAction.rotDone = true; state.tryCommitCancelable();
                            }
                        });
                        state.startZoomAnimation(state.cancelableAction.zoomTarget, state.ANIM_DURATION, function() {
                            if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                state.zoomLevel = state.cancelableAction.zoomTarget; state.applyZoom();
                                state.cancelableAction.zoomDone = true; state.tryCommitCancelable();
                            }
                        });
                    } else {
                        state.cancelableAction = null;
                        state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                            state.zoomLevel = state.defaultZoom; state.applyZoom();
                        });
                    }
                } else {
                    let tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                    state.zoomLevel = state._backStartZoom;
                    state.applyZoom();
                    // Restart entry animation if was in progress (DOM wasn't shown before gesture)
                    let timePos = state.timeSprite ? state.timeSprite.position.clone() : null;
                    if (timePos) {
                        let td = timePos.clone().normalize();
                        let tq = new THREE.Quaternion().setFromUnitVectors(td, new THREE.Vector3(0, 0, 1));
                        state.startRotationAnimation(tq, state.ANIM_DURATION, function() {});
                        state.startZoomAnimation(state.timeViewZoom || state.computeTimeViewZoom(), state.ANIM_DURATION, function() {
                            state.zoomLevel = state.timeViewZoom; state.applyZoom();
                        });
                    }
                    syncTimeSpriteTexture();
                }
                state._backType = '';
            };
            window._onBackPressed = function() {
                if (state._backProgress >= 0 && state._backType === 'panel') {
                    state._backType = '';
                    var panelEl = document.getElementById('panel');
                    if (panelEl) {
                        panelEl.style.transform = 'translateY(-' + panelEl.offsetHeight + 'px)';
                        panelEl.classList.add('animate');
                    }
                    state._backProgress = -1;
                    return;
                }
                if (state._backProgress >= 0 && state._backType === 'settings') {
                    state._backProgress = -1;
                    state._backType = '';
                    let overlay = document.getElementById('settings-overlay');
                    if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '1'; }
                    let card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    state.canvas.style.pointerEvents = 'auto';
                    state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = state.defaultZoom;
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                    });
                    return;
                }
                if (state._backProgress >= 0 && state._backType === 'cancelable') {
                    state._backProgress = -1;
                    state._backType = '';
                    state.cancelableAction = null;
                    state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = state.defaultZoom;
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                    });
                    return;
                }
                if (state._backProgress >= 0 && state.isInTimeView) {
                    let finalP = state._backProgress;
                    state._backProgress = -1;
                    state._backType = '';
                                        // 忽略系统误触发的返回手势（progress接近0的轻触不算）
                    if (finalP < 0.2) {
                        exitTimeView(true);
                        state.inertiaStrength = 0.4;
                        state.infiniteInertia = true;
                        let spinAxis;
                        if (state.layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                        else spinAxis = new THREE.Vector3(1, 0, 0);
                        let smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                        state.inertiaQ.copy(smallQ);
                        state.wakeUp();
                        return;
                    }
                    let curZ = state.zoomLevel;
                    let remain = (state.defaultZoom - curZ);
                    if (remain > 0.001) {
                        let dur = Math.min(state.ANIM_DURATION * 0.6, state.ANIM_DURATION * (1 - finalP) * 1.2);
                        state.startZoomAnimation(state.defaultZoom, dur, function() {
                            state.zoomLevel = state.defaultZoom;
                            state.applyZoom();
                            exitTimeView(false);
                                                        state.inertiaStrength = 0.4;
                            state.infiniteInertia = true;
                            let spinAxis;
                            if (state.layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                            else spinAxis = new THREE.Vector3(1, 0, 0);
                            let smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                            state.inertiaQ.copy(smallQ);
                                                        state.wakeUp();
                        });
                    } else {
                        exitTimeView(false);
                        state.inertiaStrength = 0.4;
                        state.infiniteInertia = true;
                        let spinAxis;
                        if (state.layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                        else spinAxis = new THREE.Vector3(1, 0, 0);
                        let smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                        state.inertiaQ.copy(smallQ);
                        state.wakeUp();
                    }
                    return;
                }
                // 优先级：菜单 > 设置 > 动画 > 时间视图 > 重置摄像头
                if (state.contextMenuOpen) {
                    state.hideContextMenu();
                    return;
                }
                let overlay = document.getElementById("settings-overlay");
                if (overlay && overlay.style.display === "flex") {
                    overlay.style.display = "none";
                    state.canvas.style.pointerEvents = "auto";
                    state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = state.defaultZoom;
                        state.zoomLevel = state.zoomLevel;
                        state.applyZoom();
                    });
                    return;
                }
                if (state.cancelableAction && state.cancelableAction.phase === 'animating') {
                    state.cancelCurrentAction('back');
                    return;
                }
                if (state.isInTimeView) {
                    exitTimeView(true);
                    return;
                }
                // 兜底：重置摄像头拉近（保留当前朝向）
                state.inertiaQ.identity();
                state.inertiaStrength = 0;
                state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                    state.zoomLevel = state.defaultZoom;
                    state.applyZoom();
                });
            };
            window._onHotReloadLoaded = function(json) {
                try {
                    let data = typeof json === 'string' ? JSON.parse(json) : json;
                    if (data.success) {
                        let cb = document.getElementById('s-hotreload');
                        if (cb) cb.checked = data.enabled;
                    }
                } catch(e) {}
            };
            window._onAppsLoaded = function(json) {
                __T('T0 _onAppsLoaded');
                try {
                    let data = typeof json === 'string' ? JSON.parse(json) : json;
                    if (data.success && data.apps && data.apps.length > 0) {
                        let newPkgs = [];
                        for (let i = 0; i < data.apps.length; i++) newPkgs.push(data.apps[i].packageName);
                        let oldPkgs = window._allPkgs || [];
                        let changed = newPkgs.length !== oldPkgs.length;
                        if (!changed) {
                            let oldSet = {}; for (let j = 0; j < oldPkgs.length; j++) oldSet[oldPkgs[j]] = true;
                            for (let k = 0; k < newPkgs.length; k++) { if (!oldSet[newPkgs[k]]) { changed = true; break; } }
                        }
                        if (!changed && state.sprites.length > 0) return; // 没变化，不重建
                        state.apps = data.apps;
                        state.loadingEl.textContent = '正在加载图标…';
                        createSprites(state.apps, null);
                        window._allPkgs = newPkgs;
                    } else {
                        state.loadingEl.textContent = '没有找到应用';
                        createSprites([], null);
                    }
                } catch (e) {
                    state.loadingEl.textContent = '加载失败';
                }
            };
            window._onIconsLoaded = function(json) {
                __T('T2 _onIconsLoaded');
                try {
                    const pkgs = typeof json === 'string' ? JSON.parse(json) : json;
                    if (Array.isArray(pkgs)) {
                        state.atlasSorterPkgs = pkgs;
                    }
                } catch (e) { console.error('[icons] parse error:', e); }
            };

            window._onIconsError = function(msg) {
                console.error('[icons] error:', msg);
            };
            window._onAtlasReady = function(url) {
                __T('T3 _onAtlasReady');
                if (!url || typeof url !== 'string') return;
                const img = new Image();
                img.onload = function() {
                    __T('T4 atlas decoded');
                    const tex = new THREE.Texture(img);
                    tex.minFilter = THREE.LinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                    if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                    tex.needsUpdate = true;
                    state.atlasTex = tex;
                    applyAtlasToAllSprites();
                    __T('T5 atlas applied');
                };
                img.onerror = function() {
                    console.error('[atlas] load failed:', url);
                };
                img.src = url;
            };

            // ========== 旋转控制 ==========