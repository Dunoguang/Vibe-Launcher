import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { sphereCoulomb } from './sphere-coulomb.js';
import { createGearTexture, createPlaceholderTexture, createIconTextureFromImage, drawCircleFrame, drawTimeCircleBackground } from './textures.js';
import { enterTimeView, createTimeTexture, syncTimeSpriteTexture, scheduleMinuteUpdate } from './time.js';

            export const clearAllSprites = () => {
                stopTimeTextureUpdates();
                for (let i = 0; i < sprites.length; i++) {
                    const s = sprites[i];
                    if (s.material) {
                        if (s.material.map) s.material.map.dispose();
                        s.material.dispose();
                    }
                    sphereGroup.remove(s);
                }
                sprites = [];
                timeSprite = null;
                state.timeSprite = null;
            }

state.pendingIconLoads = 0;
let enterAnimationComplete = false;

            export const createSprites = (appList, iconMap, skipEnter) => {
                clearAllSprites();

                const totalItems = [];
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

                const isHemi = (layoutMode === 'hemisphere');
                const isRing = (layoutMode === 'ring');
                const isHbar = (layoutMode === 'hbar');
                const isFlatring = (layoutMode === 'flatring');

                // 半球模式：复制透明占位精灵填充后半球
                if (isHemi) {
                    const bc = totalItems.length;
                    for (let ri = 0; ri < bc; ri++) {
                        totalItems.push({
                            type: 'redTest',
                            data: { packageName: '__red__' + ri, appName: '', isSystem: true },
                            colorIndex: bc + ri
                        });
                    }
                }

                const N = totalItems.length;
                let ringRadius = 0;
                if (isRing || isHbar || isFlatring) {
                    ringRadius = Math.max(SPHERE_RADIUS, (N * BASE_SCALE * 1.1) / (2 * Math.PI));
                    SPHERE_RADIUS = ringRadius;
                    SPHERE_DIAMETER = SPHERE_RADIUS * 2;
                    defaultZoom = isFlatring ? ringRadius * 0.09 : ringRadius * 1.15;
                    state.defaultZoom = defaultZoom;
                    zoomLevel = defaultZoom;
                    applyZoom();
                }

                let rawPoints = sphereCoulomb(N, { radius: SPHERE_RADIUS, iter: 500 });

                const timeItemIndex = totalItems.findIndex(function(item) { return item.type === 'time'; });
                const timeRaw = rawPoints[timeItemIndex];
                const timePos = new THREE.Vector3(timeRaw[0], timeRaw[1], timeRaw[2]);
                const targetDir = timePos.clone().normalize();
                const cameraDir = new THREE.Vector3(0, 0, 1);
                const alignQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, cameraDir);

                let allRotated;
                if (isRing) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        const a = (ri2 / N) * Math.PI * 2;
                        allRotated.push(new THREE.Vector3(0, Math.sin(a) * ringRadius, Math.cos(a) * ringRadius));
                    }
                } else if (isHbar) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        const a = (ri2 / N) * Math.PI * 2;
                        allRotated.push(new THREE.Vector3(Math.sin(a) * ringRadius, 0, Math.cos(a) * ringRadius));
                    }
                } else if (isFlatring) {
                    allRotated = [];
                    for (let ri2 = 0; ri2 < N; ri2++) {
                        const a = (ri2 / N) * Math.PI * 2 + Math.PI / 2;
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
                const rotatedPoints = allRotated;
                // 确保 time 和 settings 始终占据最靠近摄像机的两个位置
                {
                    const indexed = rotatedPoints.map((p, i) => ({ p, i }));
                    indexed.sort((a, b) => b.p.z - a.p.z);
                    const newPts = indexed.map(x => x.p);
                    const newItems = indexed.map(x => totalItems[x.i]);
                    // 分离 time/settings 和其他 app
                    const frontItems = [], restItems = [];
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
                    const merged = [];
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
                    const item = totalItems[j];
                    let p = rotatedPoints[j];

                    if (item.type === 'settings') {
                        const gearTex = createGearTexture();
                        const gearMat = new THREE.SpriteMaterial({ map: gearTex, transparent: true, depthTest: true, depthWrite: true });
                        const gearSprite = new THREE.Sprite(gearMat);
                        gearSprite.position.copy(p);
                        gearSprite.scale.set(BASE_SCALE, BASE_SCALE, 1);
                        gearSprite.userData = { isTimeSprite: false, app: item.data, baseScale: BASE_SCALE };
                        sphereGroup.add(gearSprite);
                        sprites.push(gearSprite);
                    } else if (item.type === 'redTest') {
                        const redC = document.createElement('canvas');
                        redC.width = ICON_RES; redC.height = ICON_RES;
                        const rtx = redC.getContext('2d');
                        rtx.fillStyle = '#ff0000';
                        rtx.fillRect(0, 0, ICON_RES, ICON_RES);
                        const redTex = new THREE.CanvasTexture(redC);
                        redTex.minFilter = THREE.LinearFilter;
                        redTex.magFilter = THREE.LinearFilter;
                        const redMat = new THREE.SpriteMaterial({ map: redTex, transparent: true, depthTest: true, depthWrite: true, opacity: 0 });
                        const redSprite = new THREE.Sprite(redMat);
                        redSprite.position.copy(p);
                        redSprite.scale.set(BASE_SCALE, BASE_SCALE, 1);
                        redSprite.userData = { isTimeSprite: false, app: item.data, baseScale: BASE_SCALE, isDecor: true };
                        sphereGroup.add(redSprite);
                        sprites.push(redSprite);
                    } else if (item.type === 'time') {
                        const timeTex = createTimeTexture();
                        const timeMat = new THREE.SpriteMaterial({
                            map: timeTex,
                            transparent: true,
                            depthTest: true,
                            depthWrite: true
                        });
                        const sprite = new THREE.Sprite(timeMat);
                        sprite.position.copy(p);
                        sprite.scale.set(BASE_SCALE, BASE_SCALE, 1);
                        sprite.userData = {
                            isTimeSprite: true,
                            app: item.data,
                            baseScale: BASE_SCALE
                        };
                        sphereGroup.add(sprite);
                        sprites.push(sprite);
                        timeSprite = sprite;
                        state.timeSprite = sprite;
                    } else {
                        const app = item.data;
                        const color = placeholderColors[item.colorIndex % placeholderColors.length];
                        const placeholderTex = createPlaceholderTexture(app.appName, color);
                        const mat = new THREE.SpriteMaterial({
                            map: placeholderTex,
                            transparent: true,
                            depthTest: true,
                            depthWrite: true
                        });
                        const appSprite = new THREE.Sprite(mat);
                        appSprite.position.copy(p);
                        appSprite.scale.set(BASE_SCALE, BASE_SCALE, 1);
                        appSprite.userData = {
                            isTimeSprite: false,
                            app: app,
                            color: color,
                            hasRealIcon: false,
                            baseScale: BASE_SCALE
                        };
                        sphereGroup.add(appSprite);
                        sprites.push(appSprite);

                        if (iconMap && iconMap[app.packageName]) {
                            loadRealIcon(appSprite, iconMap[app.packageName]);
                        }
                    }
                }

                state.rotationQuat.identity();
                sphereGroup.quaternion.identity();
                if (layoutMode === 'flatring' && sprites.length > 0) {
                    const tw = new THREE.Vector3();
                    sprites[0].getWorldPosition(tw);
                    camera.lookAt(tw);
                }

updateSphereMinHint();
                // 启动时应用已保存的球体大小
                try {
                    let saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                    if (saved.sphereSize && parseFloat(saved.sphereSize) > 0 && layoutMode !== 'ring' && layoutMode !== 'hbar' && layoutMode !== 'flatring') {
                        SPHERE_RADIUS = parseFloat(saved.sphereSize);
                        // sphereGroup now uses Coulomb points directly, no need for scale
                        // 重新分布
                        let rawPts = sphereCoulomb(totalItems.length, { radius: SPHERE_RADIUS, iter: 500 });
                        const tIdx = totalItems.findIndex(function(it) { return it.type === 'time'; });
                        if (tIdx >= 0) {
                            const tp = new THREE.Vector3(rawPts[tIdx][0], rawPts[tIdx][1], rawPts[tIdx][2]);
                            const aq = new THREE.Quaternion().setFromUnitVectors(tp.clone().normalize(), new THREE.Vector3(0,0,1));
                            rawPts = rawPts.map(function(pt) {
                                let v = new THREE.Vector3(pt[0],pt[1],pt[2]);
                                v.applyQuaternion(aq);
                                return v;
                            });
                            rawPts.sort(function(a, b) { return b.z - a.z; });
                        }
                        for (let k = 0; k < sprites.length; k++) {
                            if (k < rawPts.length) sprites[k].position.copy(rawPts[k]);
                        }
                        SPHERE_DIAMETER = SPHERE_RADIUS * 2;
                        defaultZoom = computeInitDistance();
                        state.defaultZoom = defaultZoom;
                        timeViewZoom = computeTimeViewZoom();
                        zoomLevel = defaultZoom;
                        state.zoomLevel = zoomLevel;
                        applyZoom();
                    }
                } catch(e) {}

                timeViewZoom = computeTimeViewZoom();

                console.log('createSprites DONE, calling hideLoadingIfReady');
                // 初始化时间精灵纹理 + 启动分钟调度
                setTimeout(() => {
                    console.log('INIT-TIME: starting time sprite updates');
                    syncTimeSpriteTexture();
                    scheduleMinuteUpdate();
                }, 500);
                hideLoadingIfReady();  // 先隐藏loading
                if (!skipEnter) {
                    enterTimeView(true, function() {
                        enterAnimationComplete = true;
                        checkAllIconsLoaded();
                    });
                } else {
                    enterAnimationComplete = true;
                    checkAllIconsLoaded();
                }
            }

            export function loadRealIcon(sprite, iconUrl) {
                state.pendingIconLoads++;
                const img = new Image();
                img.onload = function() {
                    try {
                        const tex = createIconTextureFromImage(img);
                        if (sprite.material && sprite.material.map && !sprite.userData.hasRealIcon) {
                            sprite.material.map.dispose();
                        }
                        sprite.material.map = tex;
                        sprite.material.needsUpdate = true;
                        sprite.userData.hasRealIcon = true;
                        sprite.userData._iconUrl = iconUrl;
                    } catch (e) { console.warn('图标处理失败:', iconUrl, e); }
                    state.pendingIconLoads--;
                    checkAllIconsLoaded();
                };
                img.onerror = function() { console.warn('图标加载失败:', iconUrl); state.pendingIconLoads--; checkAllIconsLoaded(); };
                img.src = iconUrl;
            }

            export function checkAllIconsLoaded() {
                state.checkAllIconsLoaded = checkAllIconsLoaded;
                if (state.pendingIconLoads <= 0 && enterAnimationComplete) {
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

            export const tryLoadApps = () => {
                if (typeof NativeBridge !== 'undefined' && NativeBridge.requestInstalledApps) {
                    state.nativeBridgeReady = true;
                    NativeBridge.requestInstalledApps();
                } else {
                    setTimeout(async function() {
                        if (typeof NativeBridge !== 'undefined' && NativeBridge.requestInstalledApps) {
                            state.nativeBridgeReady = true;
                            NativeBridge.requestInstalledApps();
                        } else {
                            state.loadingEl.textContent = 'NativeBridge 不可用，使用演示数据';
                            createDemoApps();
                        }
                    }, 800);
                }
            }

            export function createDemoApps() {
                const demoNames = [
                    '微信', 'QQ', '淘宝', '支付宝', '抖音', '美团', '饿了么', 'B站', '知乎', '微博',
                    '网易云', '高德', '百度', '京东', '拼多多', '小红书', '快手', '滴滴', '闲鱼', '携程',
                    '酷狗', 'UC', 'WPS', '钉钉', '飞书',
                ];
                const demoApps = [];
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


            // Predictive back gesture for time page exit
            var _backProgress = -1; // back gesture progress, -1=inactive
            var _backType = ''; // 'time' or 'settings'
            var _backStartZoom = 0;
            var _backSavedQuat = null;
            window._onBackStarted = function() {
                console.log('[BACK] onBackStarted state.isInTimeView=' + state.isInTimeView);
                var overlay = document.getElementById('settings-overlay');
                if (overlay && overlay.style.display === 'flex') {
                    state._backType = 'settings';
                    state._backProgress = 0;
                    state._backStartZoom = zoomLevel;
                    if (!state.animFrameId) state.animFrameId = requestAnimationFrame(animate);
                    return;
                }
                if (state.cancelableAction && state.cancelableAction.phase === 'animating') {
                    state._backType = 'cancelable';
                    state._backProgress = 0;
                    state._backStartZoom = zoomLevel;
                    _backSavedQuat = sphereGroup.quaternion.clone();
                    cancelZoomAnimation();
                    rotationAnimData = null;
                    if (!state.animFrameId) state.animFrameId = requestAnimationFrame(animate);
                    return;
                }
                if (!state.isInTimeView) {
                    state._backProgress = -1;
                    state._backType = '';
                    return;
                }
                state._backType = 'time';
                state._backProgress = 0;
                state._backStartZoom = zoomLevel;
                // Cancel in-progress returnToTimeView animations
                cancelZoomAnimation();
                rotationAnimData = null;
                if (!state.animFrameId) state.animFrameId = requestAnimationFrame(animate);
                var tp = document.getElementById('time-page');
                if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; }
                syncTimeSpriteTexture();
            };
            window._onBackProgress = function(p) {
                console.log('[BACK] onBackProgress p=' + p + ' state._backProgress=' + state._backProgress);
                if (state._backProgress < 0) return;
                state._backProgress = p;
                if (state._backType === 'settings') {
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = 1 - materialEasing(p);
                    var card = document.getElementById('settings-card');
                    if (card) {
                        var s = Math.max(0.01, 1 - materialEasing(p) * 2);
                        card.style.transform = 'scale(' + s + ')';
                    }
                    zoomLevel = state._backStartZoom + (defaultZoom - state._backStartZoom) * materialEasing(p);
                    applyZoom();
                } else if (state._backType === 'cancelable') {
                    if (state.cancelableAction && !state.cancelableAction.cancelled) {
                        state.cancelableAction.cancelled = true;
                    }
                    zoomLevel = state._backStartZoom + (defaultZoom - state._backStartZoom) * materialEasing(p);
                    applyZoom();
                } else {
                    var t = materialEasing(p);
                    var z = state._backStartZoom + (defaultZoom - state._backStartZoom) * t;
                    zoomLevel = z;
                    applyZoom();
                }
                if (!state.animFrameId) state.animFrameId = requestAnimationFrame(animate);
            };
            // Installed APK has bug: calls _onProgress instead of _onBackProgress
            window._onProgress = window._onBackProgress;
            window._onBackCancelled = function() {
                console.log('[BACK] onBackCancelled state._backProgress=' + state._backProgress);
                if (state._backProgress < 0) return;
                var _cancelP = state._backProgress;
                state._backProgress = -1;
                if (state._backType === 'settings') {
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = '1';
                    var card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    zoomLevel = state._backStartZoom;
                    applyZoom();
                } else if (state._backType === 'cancelable') {
                    if (_cancelP < 0.3 && state.cancelableAction) {
                        // Resume opening from saved state
                        state.cancelableAction.cancelled = false;
                        var targetSprite = state.cancelableAction.sprite;
                        var targetDir = targetSprite.position.clone().normalize();
                        var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        startRotationAnimation(targetQuat, ANIM_DURATION, function() {
                            if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                state.cancelableAction.rotDone = true; tryCommitCancelable();
                            }
                        });
                        startZoomAnimation(state.cancelableAction.zoomTarget, ANIM_DURATION, function() {
                            if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                zoomLevel = state.cancelableAction.zoomTarget; applyZoom();
                                state.cancelableAction.zoomDone = true; tryCommitCancelable();
                            }
                        });
                    } else {
                        state.cancelableAction = null;
                        startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                            zoomLevel = defaultZoom; applyZoom();
                        });
                    }
                } else {
                    var tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                    zoomLevel = state._backStartZoom;
                    applyZoom();
                    // Restart entry animation if was in progress (DOM wasn't shown before gesture)
                    var timePos = timeSprite ? timeSprite.position.clone() : null;
                    if (timePos) {
                        var td = timePos.clone().normalize();
                        var tq = new THREE.Quaternion().setFromUnitVectors(td, new THREE.Vector3(0, 0, 1));
                        startRotationAnimation(tq, ANIM_DURATION, function() {});
                        startZoomAnimation(timeViewZoom || computeTimeViewZoom(), ANIM_DURATION, function() {
                            zoomLevel = timeViewZoom; applyZoom();
                        });
                    }
                    syncTimeSpriteTexture();
                }
                state._backType = '';
            };
            window._onBackPressed = function() {
                if (state._backProgress >= 0 && state._backType === 'settings') {
                    state._backProgress = -1;
                    state._backType = '';
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '1'; }
                    var card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    state.canvas.style.pointerEvents = 'auto';
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        state.zoomLevel = zoomLevel;
                        applyZoom();
                    });
                    return;
                }
                if (state._backProgress >= 0 && state._backType === 'cancelable') {
                    state._backProgress = -1;
                    state._backType = '';
                    state.cancelableAction = null;
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        state.zoomLevel = zoomLevel;
                        applyZoom();
                    });
                    return;
                }
                if (state._backProgress >= 0 && state.isInTimeView) {
                    var finalP = state._backProgress;
                    state._backProgress = -1;
                    state._backType = '';
                    var curZ = zoomLevel;
                    var remain = (defaultZoom - curZ);
                    if (remain > 0.001) {
                        var dur = Math.min(ANIM_DURATION * 0.6, ANIM_DURATION * (1 - finalP) * 1.2);
                        startZoomAnimation(defaultZoom, dur, function() {
                            zoomLevel = defaultZoom;
                            applyZoom();
                            exitTimeView(false);
                            state.inertiaStrength = 0.4;
                            infiniteInertia = true;
                            let spinAxis;
                            if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                            else spinAxis = new THREE.Vector3(1, 0, 0);
                            const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                            state.inertiaQ.copy(smallQ);
                        });
                    } else {
                        exitTimeView(false);
                        state.inertiaStrength = 0.4;
                        infiniteInertia = true;
                        let spinAxis;
                        if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                        else spinAxis = new THREE.Vector3(1, 0, 0);
                        const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                        state.inertiaQ.copy(smallQ);
                    }
                    return;
                }
                // 优先级：菜单 > 设置 > 动画 > 时间视图 > 重置摄像头
                if (state.contextMenuOpen) {
                    hideContextMenu();
                    return;
                }
                var overlay = document.getElementById("settings-overlay");
                if (overlay && overlay.style.display === "flex") {
                    overlay.style.display = "none";
                    state.canvas.style.pointerEvents = "auto";
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        state.zoomLevel = zoomLevel;
                        applyZoom();
                    });
                    return;
                }
                if (state.cancelableAction && state.cancelableAction.phase === 'animating') {
                    cancelCurrentAction('back');
                    return;
                }
                if (state.isInTimeView) {
                    exitTimeView(true);
                    return;
                }
                // 兜底：重置摄像头拉近（保留当前朝向）
                state.inertiaQ.identity();
                state.inertiaStrength = 0;
                startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                    zoomLevel = defaultZoom;
                    applyZoom();
                });
            };

            window._onHotReloadLoaded = function(json) {
                try {
                    const data = typeof json === 'string' ? JSON.parse(json) : json;
                    if (data.success) {
                        const cb = document.getElementById('s-hotreload');
                        if (cb) cb.checked = data.enabled;
                    }
                } catch(e) {}
            };

            window._onAppsLoaded = function(json) {
                try {
                    const data = typeof json === 'string' ? JSON.parse(json) : json;
                    if (data.success && data.apps && data.apps.length > 0) {
                        const newPkgs = [];
                        for (let i = 0; i < data.apps.length; i++) newPkgs.push(data.apps[i].packageName);
                        const oldPkgs = window._allPkgs || [];
                        let changed = newPkgs.length !== oldPkgs.length;
                        if (!changed) {
                            const oldSet = {}; for (let j = 0; j < oldPkgs.length; j++) oldSet[oldPkgs[j]] = true;
                            for (let k = 0; k < newPkgs.length; k++) { if (!oldSet[newPkgs[k]]) { changed = true; break; } }
                        }
                        if (!changed && sprites.length > 0) return; // 没变化，不重建
                        state.apps = data.apps;
                        state.loadingEl.textContent = '正在加载图标…';
                        createSprites(state.apps, null);
                        window._allPkgs = newPkgs;
                        if (state.nativeBridgeReady) NativeBridge.requestAppIcons(JSON.stringify(newPkgs), ICON_RES);
                    } else {
                        state.loadingEl.textContent = '没有找到应用';
                        createSprites([], null);
                    }
                } catch (e) {
                    console.error('解析应用列表失败:', e);
                    state.loadingEl.textContent = '加载失败';
                }
            };

            window._onIconsLoaded = function(json) {
                try {
                    const iconData = typeof json === 'string' ? JSON.parse(json) : json;
                    const iconMap = {};
                    if (Array.isArray(iconData)) {
                        for (let i = 0; i < iconData.length; i++) {
                            const item = iconData[i];
                            if (item.packageName && item.iconUrl) iconMap[item.packageName] = item.iconUrl;
                        }
                    }
                    for (let j = 0; j < sprites.length; j++) {
                        const sprite = sprites[j];
                        if (sprite.userData.isTimeSprite) continue;
                        const app = sprite.userData.app;
                        if (app && iconMap[app.packageName] && !sprite.userData.hasRealIcon) {
                            loadRealIcon(sprite, iconMap[app.packageName]);
                        }
                    }
                } catch (e) { console.error('解析图标数据失败:', e); }
            };

            // ========== 旋转控制 ==========