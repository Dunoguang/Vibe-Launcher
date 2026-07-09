import * as THREE from 'three/webgpu';
import { initScene } from './src/scene.js';
import { state } from './src/state.js';
import { sphereCoulomb } from './src/sphere-coulomb.js';
import { cubicBezier, animateValue, materialEasing, easeOutCubic } from './src/utils.js';
import { createGearTexture, drawCircleFrame, drawCircleBackground, drawTimeCircleBackground, createPlaceholderTexture, createIconTextureFromImage } from './src/textures.js';
import { enterTimeView, exitTimeView, returnToTimeView, syncTimeSpriteTexture, updateTimeSpriteBgOnly, renderTimePageToTexture, createTimeTexture } from './src/time.js';
import html2canvas from 'html2canvas';
window.THREE = THREE;

(async function() {
console.log("IIFE starting, THREE:", typeof THREE);
            if (typeof THREE === 'undefined') {
                document.getElementById('loadingIndicator').textContent = 'Three.js 未加载';
                return;
            }

            // ========== 球面库仑斥力分布（Thomson 问题）==========
            const labelEl = document.getElementById('appLabel');
            const loadingEl = document.getElementById('loadingIndicator');

            // ========== 场景（从 scene.js 导入）==========
            const sceneInit = await initScene(loadingEl);
            if (!sceneInit) return;
            const { scene, camera, renderer, rendererType, canvas, sphereGroup } = sceneInit;
            state.renderer = renderer;
            state.scene = scene;
            state.camera = camera;
            state.sphereGroup = sphereGroup;

            // ========== 常量 ==========
            let SPHERE_RADIUS = 2.5, layoutMode = 'sphere';
            state.SPHERE_RADIUS = SPHERE_RADIUS;
            state.layoutMode = layoutMode;
            (function() {
                try {
                    const _s = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                    if (_s.layoutMode) layoutMode = _s.layoutMode;
                } catch(e) {}
            })();
            let SPHERE_DIAMETER = SPHERE_RADIUS * 2;
            const BASE_SCALE = 0.52;
            let ICON_RES = 512;
            state.ICON_RES = ICON_RES;
            try {
                const _saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                if (_saved.iconRes && parseInt(_saved.iconRes) >= 16) ICON_RES = parseInt(_saved.iconRes);
            } catch(e) {}
            const HOVER_SCALE = 0.72;
            const FOV_RAD = THREE.MathUtils.degToRad(50);
            const MIN_ZOOM = 0.1;
            
            let ANIM_DURATION = (function() {
        try {
            const s = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
            const v = parseInt(s.animSpeed);
            if (v >= 10 && v <= 5000) return v;
        } catch(e) {}
        return 250;
    })();
            const exitThresholdRatio = 0.35;
            let cancelableAction = null;
            let bottomSwipeData = null, topSwipeData = null, cancelSwipeData = null;
            const TOP_ZONE_RATIO = 0.15, BOTTOM_ZONE_RATIO = 0.15;

            // 缩放动画
            let zoomTarget = null, zoomAnimStart = null, zoomAnimDuration = 0, zoomAnimElapsed = 0, zoomAnimStartVal = 0, zoomAnimEndVal = 0, zoomAnimCallback = null;

            // 旋转动画（用于点击时间图标返回时间视图）
            let rotationAnimData = null;
            const placeholderColors = [
                '#ff6b6b', '#ff8e72', '#ffa94d', '#ffd43b', '#a9e34b',
                '#69db7c', '#38d9a9', '#3bc9db', '#4dabf7', '#5c7cfa',
                '#748ffc', '#9775fa', '#da77f2', '#f783ac', '#ff8787',
                '#ffb8a8', '#ffc078', '#ffe066', '#c0eb75', '#8ce99a',
                '#63e6be', '#66d9e8', '#74c0fc', '#91a7ff', '#b197fc',
            ];

            let nativeBridgeReady = false;
            const DRAG_THRESHOLD = 3;
            const prevScreen = new THREE.Vector2();
            const inertiaQ = new THREE.Quaternion();
            let inertiaStrength = 0, infiniteInertia = false;
            const INERTIA_DECAY = 0.975;
            const INERTIA_FAST_DECAY = 0.85;
            const INERTIA_MIN = 0.0005;
            let recentSpeeds = [];
            const SPEED_SAMPLES = 5;
            const activePointerIds = new Set();

            const raycaster = new THREE.Raycaster();
            raycaster.params.Sprite = { threshold: 0.8 };
            const mouse = new THREE.Vector2();
            let hoveredSprite = null, longPressTimer = null, longPressFired = false, contextMenuOpen = false;
            const LONG_PRESS_MS = 600;
            let lastTap = 0, lastTapX = 0, lastTapY = 0, lastTapOnIcon = false, _prevTapOnIcon = false;
            let _timePageTimer = null;

            const computeInitDistance = () => {
                const w = window.innerWidth;
                let h = window.innerHeight;
                const shortEdgeFactor = Math.min(1, w / h);
                const minVisible = SPHERE_DIAMETER / (2 * Math.tan(FOV_RAD / 2) * shortEdgeFactor);
                return minVisible * 1.15;
            }

let zoomLevel = computeInitDistance(), defaultZoom = zoomLevel;
            camera.position.set(0, 0, zoomLevel);

            function applyZoom() { camera.position.z = zoomLevel; }

            const computeTimeViewZoom = () => {
                const R = BASE_SCALE * 0.44;
                const fovHalfRad = THREE.MathUtils.degToRad(camera.fov / 2);
                const aspect = window.innerWidth / window.innerHeight;
                const halfDiagonalNDC = Math.sqrt(aspect * aspect + 1);
                const distance = R / (Math.tan(fovHalfRad) * halfDiagonalNDC);
                return SPHERE_RADIUS + distance;
            }

let timeViewZoom = computeTimeViewZoom(), isInTimeView = false, timeSprite = null, timeTextureUpdateInterval = null;
            state.timeViewZoom = timeViewZoom;
            state.isInTimeView = isInTimeView;
            state.timeSprite = timeSprite;

            // ========== 可取消动作状态机 ==========

            const startCancelableAction = (sprite, rotTarget, zoomTarget, onCommit) => {
                cancelSwipeData = null; if (cancelableAction) cancelCurrentAction('superseded');
                cancelableAction = {
                    sprite: sprite, onCommit: onCommit, phase: 'animating',
                    rotDone: false, zoomDone: false, cancelled: false,
                    zoomTarget: zoomTarget
                };
                inertiaQ.identity(); inertiaStrength = 0; infiniteInertia = false;
                startRotationAnimation(rotTarget, ANIM_DURATION, function() {
                    if (cancelableAction && !cancelableAction.cancelled) {
                        cancelableAction.rotDone = true; tryCommitCancelable();
                    }
                });
                startZoomAnimation(zoomTarget, ANIM_DURATION, function() {
                    zoomLevel = zoomTarget; applyZoom();
                    if (cancelableAction && !cancelableAction.cancelled) {
                        cancelableAction.zoomDone = true; tryCommitCancelable();
                    }
                });
            }

            function tryCommitCancelable() {
                const a = cancelableAction;
                if (!a || a.cancelled || a.phase !== 'animating') return;
                if (a.rotDone && a.zoomDone) {
                    a.phase = 'committed';
                    const cb = a.onCommit; cancelableAction = null;
                    if (cb) cb();
                }
            }

            function cancelCurrentAction(reason) { cancelSwipeData = null;
                if (!cancelableAction || cancelableAction.cancelled) return;
                cancelableAction.cancelled = true;
                try { NativeBridge.log('cancel:' + reason); } catch(e) {}
                cancelZoomAnimation();
                startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                    zoomLevel = defaultZoom; applyZoom();
                });
                cancelableAction = null;
            }


            function startZoomAnimation(targetVal, duration, callback) {
                zoomAnimStart = performance.now();
                wakeUp();
                zoomAnimDuration = duration || 250;
                zoomAnimStartVal = zoomLevel;
                zoomAnimEndVal = targetVal;
                zoomAnimElapsed = 0;
                zoomTarget = targetVal;
                zoomAnimCallback = callback || null;
            }

            function cancelZoomAnimation() {
                zoomTarget = null;
                zoomAnimStart = null;
                zoomAnimDuration = 0;
                zoomAnimCallback = null;
            }

            // ====== 三次贝塞尔求解器 ======
            // ====== 通用动画函数 ======

            const updateZoomAnimation = (now) => {
                if (zoomTarget === null) return;
                zoomAnimElapsed = now - zoomAnimStart;
                let t = Math.min(1, zoomAnimElapsed / zoomAnimDuration);
                const eased = materialEasing(t);
                zoomLevel = zoomAnimStartVal + (zoomAnimEndVal - zoomAnimStartVal) * eased;
                applyZoom();
                if (t >= 1) {
                    zoomLevel = zoomAnimEndVal;
                    applyZoom();
                    const cb = zoomAnimCallback;
                    cancelZoomAnimation();
                    if (cb) cb();
                }
            }

            const updateRotationAnimation = (now) => {
                if (!rotationAnimData) return;
                const elapsed = now - rotationAnimData.startTime;
                let t = Math.min(1, elapsed / rotationAnimData.duration);
                const eased = materialEasing(t);
                rotationQuat.copy(rotationAnimData.from).slerp(rotationAnimData.to, eased);
                sphereGroup.quaternion.copy(rotationQuat);
                if (t >= 1) {
                    rotationQuat.copy(rotationAnimData.to);
                    sphereGroup.quaternion.copy(rotationQuat);
                    const cb = rotationAnimData.callback;
                    rotationAnimData = null;
                    if (cb) cb();
                }
            }

            function startRotationAnimation(targetQuat, duration, callback) {
                rotationAnimData = {
                    from: rotationQuat.clone(),
                    to: targetQuat.clone(),
                    startTime: performance.now(),
                    duration: duration || ANIM_DURATION,
                    callback: callback || null
                };
                if (callback && duration <= 0) {
                    rotationQuat.copy(targetQuat);
                    sphereGroup.quaternion.copy(rotationQuat);
                    rotationAnimData = null;
                    callback();
                }
            }

            // ========== 设置纹理 ==========
            const createGearTexture = () => {
                console.log('createGearTexture size:', ICON_RES);
                const s = Math.max(16, ICON_RES), ca = document.createElement('canvas');
                ca.width = s; ca.height = s;
                const ctx = ca.getContext('2d'), cx = s/2, cy = s/2, rr = s * 0.44;
                ctx.fillStyle = '#000000';
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = s * 0.012;
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = 'bold ' + (s * 0.45) + 'px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('⚙', cx, cy);
                const tex = new THREE.CanvasTexture(ca);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }

            // ========== 时间纹理 ==========
            // 壁纸缓存
            let _wallpaperImg = null, _timeBgImg = null, _timeBgPath = null;
            state._wallpaperImg = _wallpaperImg;
            state._timeBgImg = _timeBgImg;
            state._timeBgPath = _timeBgPath;
            (function preloadWallpaper() {
                if (typeof NativeBridge !== 'undefined') {
                    try { var raw = NativeBridge.getWallpaperPath(); var r = JSON.parse(raw);
                        if (r.success) { document.body.style.backgroundImage = 'url(' + r.path + '?t=' + Date.now() + ')'; var img = new Image(); img.onload = function() { _wallpaperImg = img; updateTimeSpriteBgOnly(); }; img.src = r.path; }
                    } catch(e) {}
                    try { var raw2 = NativeBridge.getTimeBgPath(); var r2 = JSON.parse(raw2);
                        if (r2.success) { var img2 = new Image(); img2.onload = function() { _timeBgImg = img2; }; img2.src = r2.path; }
                    } catch(e) {}
                    // Update time bg button text after DOM ready
                    setTimeout(function() {
                        var tbb = document.getElementById('s-timebg-pick');
                        if (tbb && _timeBgImg) tbb.textContent = '重新选择';
                    }, 100);
                }
            })();

            const createPlaceholderTexture = (appName, colorHex) => {
                console.log('createPlaceholderTexture', appName, 'size:', ICON_RES);
                const s = Math.max(16, ICON_RES),
                    c = document.createElement('canvas');
                c.width = s;
                c.height = s;
                const ctx = c.getContext('2d'),
                    cx = s / 2,
                    cy = s / 2,
                    r = s * 0.44;
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = colorHex + 'aa';
                ctx.lineWidth = s * 0.03;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                const initial = (appName || '?').charAt(0).toUpperCase();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold ' + (s * 0.5) + 'px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = colorHex;
                ctx.shadowBlur = s * 0.1;
                ctx.fillText(initial, cx, cy);
                ctx.shadowBlur = 0;
                const tex = new THREE.CanvasTexture(c);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }

            let apps = [], sprites = [];
            state.apps = apps;
            state.sprites = sprites;

                        const updateSphereMinHint = () => {
                const iconCount = window._totalItems ? window._totalItems.length : (sprites.length || 100);
                const iconVisRadius = BASE_SCALE * 0.44 * 1.1;
                const minR = iconVisRadius / Math.sqrt(Math.PI / Math.max(1, iconCount));
                const hint = document.getElementById('sphere-min-hint');
                if (hint) hint.textContent = '最少 ' + minR.toFixed(2) + '（默认2.5）';
                return minR;
            };

            const clearAllSprites = () => {
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
            }

let pendingIconLoads = 0, enterAnimationComplete = false;

            const createSprites = (appList, iconMap, skipEnter) => {
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

                rotationQuat.identity();
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
                        timeViewZoom = computeTimeViewZoom();
                        zoomLevel = defaultZoom;
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

            function loadRealIcon(sprite, iconUrl) {
                pendingIconLoads++;
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
                    pendingIconLoads--;
                    checkAllIconsLoaded();
                };
                img.onerror = function() { console.warn('图标加载失败:', iconUrl); pendingIconLoads--; checkAllIconsLoaded(); };
                img.src = iconUrl;
            }

            function checkAllIconsLoaded() {
                if (pendingIconLoads <= 0 && enterAnimationComplete) {
                    loadingEl.style.opacity = '0';
                    setTimeout(function() { loadingEl.textContent = ''; }, 500);
                }
            }
            function hideLoadingIfReady() {
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                }
            }

            // ========== NativeBridge ==========

            const tryLoadApps = () => {
                if (typeof NativeBridge !== 'undefined' && NativeBridge.requestInstalledApps) {
                    nativeBridgeReady = true;
                    NativeBridge.requestInstalledApps();
                } else {
                    setTimeout(async function() {
                        if (typeof NativeBridge !== 'undefined' && NativeBridge.requestInstalledApps) {
                            nativeBridgeReady = true;
                            NativeBridge.requestInstalledApps();
                        } else {
                            loadingEl.textContent = 'NativeBridge 不可用，使用演示数据';
                            createDemoApps();
                        }
                    }, 800);
                }
            }

            function createDemoApps() {
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
                apps = demoApps;
                createSprites(demoApps, null);
            }


            // Predictive back gesture for time page exit
            var _backProgress = -1; // back gesture progress, -1=inactive
            var _backType = ''; // 'time' or 'settings'
            var _backStartZoom = 0;
            var _backSavedQuat = null;
            window._onBackStarted = function() {
                console.log('[BACK] onBackStarted isInTimeView=' + isInTimeView);
                var overlay = document.getElementById('settings-overlay');
                if (overlay && overlay.style.display === 'flex') {
                    _backType = 'settings';
                    _backProgress = 0;
                    _backStartZoom = zoomLevel;
                    if (!animFrameId) animFrameId = requestAnimationFrame(animate);
                    return;
                }
                if (cancelableAction && cancelableAction.phase === 'animating') {
                    _backType = 'cancelable';
                    _backProgress = 0;
                    _backStartZoom = zoomLevel;
                    _backSavedQuat = sphereGroup.quaternion.clone();
                    cancelZoomAnimation();
                    rotationAnimData = null;
                    if (!animFrameId) animFrameId = requestAnimationFrame(animate);
                    return;
                }
                if (!isInTimeView) {
                    _backProgress = -1;
                    _backType = '';
                    return;
                }
                _backType = 'time';
                _backProgress = 0;
                _backStartZoom = zoomLevel;
                // Cancel in-progress returnToTimeView animations
                cancelZoomAnimation();
                rotationAnimData = null;
                if (!animFrameId) animFrameId = requestAnimationFrame(animate);
                var tp = document.getElementById('time-page');
                if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; }
                syncTimeSpriteTexture();
            };
            window._onBackProgress = function(p) {
                console.log('[BACK] onBackProgress p=' + p + ' _backProgress=' + _backProgress);
                if (_backProgress < 0) return;
                _backProgress = p;
                if (_backType === 'settings') {
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = 1 - materialEasing(p);
                    var card = document.getElementById('settings-card');
                    if (card) {
                        var s = Math.max(0.01, 1 - materialEasing(p) * 2);
                        card.style.transform = 'scale(' + s + ')';
                    }
                    zoomLevel = _backStartZoom + (defaultZoom - _backStartZoom) * materialEasing(p);
                    applyZoom();
                } else if (_backType === 'cancelable') {
                    if (cancelableAction && !cancelableAction.cancelled) {
                        cancelableAction.cancelled = true;
                    }
                    zoomLevel = _backStartZoom + (defaultZoom - _backStartZoom) * materialEasing(p);
                    applyZoom();
                } else {
                    var t = materialEasing(p);
                    var z = _backStartZoom + (defaultZoom - _backStartZoom) * t;
                    zoomLevel = z;
                    applyZoom();
                }
                if (!animFrameId) animFrameId = requestAnimationFrame(animate);
            };
            // Installed APK has bug: calls _onProgress instead of _onBackProgress
            window._onProgress = window._onBackProgress;
            window._onBackCancelled = function() {
                console.log('[BACK] onBackCancelled _backProgress=' + _backProgress);
                if (_backProgress < 0) return;
                var _cancelP = _backProgress;
                _backProgress = -1;
                if (_backType === 'settings') {
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) overlay.style.opacity = '1';
                    var card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    zoomLevel = _backStartZoom;
                    applyZoom();
                } else if (_backType === 'cancelable') {
                    if (_cancelP < 0.3 && cancelableAction) {
                        // Resume opening from saved state
                        cancelableAction.cancelled = false;
                        var targetSprite = cancelableAction.sprite;
                        var targetDir = targetSprite.position.clone().normalize();
                        var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        startRotationAnimation(targetQuat, ANIM_DURATION, function() {
                            if (cancelableAction && !cancelableAction.cancelled) {
                                cancelableAction.rotDone = true; tryCommitCancelable();
                            }
                        });
                        startZoomAnimation(cancelableAction.zoomTarget, ANIM_DURATION, function() {
                            if (cancelableAction && !cancelableAction.cancelled) {
                                zoomLevel = cancelableAction.zoomTarget; applyZoom();
                                cancelableAction.zoomDone = true; tryCommitCancelable();
                            }
                        });
                    } else {
                        cancelableAction = null;
                        startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                            zoomLevel = defaultZoom; applyZoom();
                        });
                    }
                } else {
                    var tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                    zoomLevel = _backStartZoom;
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
                _backType = '';
            };
            window._onBackPressed = function() {
                if (_backProgress >= 0 && _backType === 'settings') {
                    _backProgress = -1;
                    _backType = '';
                    var overlay = document.getElementById('settings-overlay');
                    if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '1'; }
                    var card = document.getElementById('settings-card');
                    if (card) card.style.transform = 'scale(1)';
                    canvas.style.pointerEvents = 'auto';
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        applyZoom();
                    });
                    return;
                }
                if (_backProgress >= 0 && _backType === 'cancelable') {
                    _backProgress = -1;
                    _backType = '';
                    cancelableAction = null;
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        applyZoom();
                    });
                    return;
                }
                if (_backProgress >= 0 && isInTimeView) {
                    var finalP = _backProgress;
                    _backProgress = -1;
                    _backType = '';
                    var curZ = zoomLevel;
                    var remain = (defaultZoom - curZ);
                    if (remain > 0.001) {
                        var dur = Math.min(ANIM_DURATION * 0.6, ANIM_DURATION * (1 - finalP) * 1.2);
                        startZoomAnimation(defaultZoom, dur, function() {
                            zoomLevel = defaultZoom;
                            applyZoom();
                            exitTimeView(false);
                            inertiaStrength = 0.4;
                            infiniteInertia = true;
                            let spinAxis;
                            if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                            else spinAxis = new THREE.Vector3(1, 0, 0);
                            const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                            inertiaQ.copy(smallQ);
                        });
                    } else {
                        exitTimeView(false);
                        inertiaStrength = 0.4;
                        infiniteInertia = true;
                        let spinAxis;
                        if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                        else spinAxis = new THREE.Vector3(1, 0, 0);
                        const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                        inertiaQ.copy(smallQ);
                    }
                    return;
                }
                // 优先级：菜单 > 设置 > 动画 > 时间视图 > 重置摄像头
                if (contextMenuOpen) {
                    hideContextMenu();
                    return;
                }
                var overlay = document.getElementById("settings-overlay");
                if (overlay && overlay.style.display === "flex") {
                    overlay.style.display = "none";
                    canvas.style.pointerEvents = "auto";
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        applyZoom();
                    });
                    return;
                }
                if (cancelableAction && cancelableAction.phase === 'animating') {
                    cancelCurrentAction('back');
                    return;
                }
                if (isInTimeView) {
                    exitTimeView(true);
                    return;
                }
                // 兜底：重置摄像头拉近（保留当前朝向）
                inertiaQ.identity();
                inertiaStrength = 0;
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
                        apps = data.apps;
                        loadingEl.textContent = '正在加载图标…';
                        createSprites(apps, null);
                        window._allPkgs = newPkgs;
                        if (nativeBridgeReady) NativeBridge.requestAppIcons(JSON.stringify(newPkgs), ICON_RES);
                    } else {
                        loadingEl.textContent = '没有找到应用';
                        createSprites([], null);
                    }
                } catch (e) {
                    console.error('解析应用列表失败:', e);
                    loadingEl.textContent = '加载失败';
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
            const rotationQuat = new THREE.Quaternion();
let isDragging = false, hasMoved = false;

            const screenToSphere = (sx, sy) => {
                const rect = canvas.getBoundingClientRect();
let nx = (sx - rect.left) / rect.width, ny = (sy - rect.top) / rect.height, v = new THREE.Vector3();
                v.x = nx * 2 - 1;
                v.y = -(ny * 2 - 1);
                const a = rect.width / rect.height;
                v.x *= a;
                const magSq = v.x * v.x + v.y * v.y;
                if (magSq <= 1.0) v.z = Math.sqrt(1.0 - magSq);
                else {
                    const inv = 1.0 / Math.sqrt(magSq);
                    v.x *= inv;
                    v.y *= inv;
                    v.z = 0;
                }
                return v.normalize();
            }

            const updateMouse = (cx, cy) => {
                const rect = canvas.getBoundingClientRect();
                mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
            }

            function getAppBySprite(s) { return s && s.userData ? s.userData.app : null; }

            const checkHover = (e) => {
                if (isInTimeView) return;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(sprites);
                let newHovered = null;
                for (let hi = 0; hi < intersects.length; hi++) {
                    if (intersects[hi].object.userData.isDecor) continue;
                    newHovered = intersects[hi].object;
                    break;
                }
                if (hoveredSprite !== newHovered) {
                    if (newHovered) {
                        document.body.style.cursor = 'pointer';
                        const app = getAppBySprite(newHovered);
                        if (app) {
                            labelEl.textContent = app.appName;
                            labelEl.classList.add('visible');
                            if (e) {
                                labelEl.style.left = e.clientX + 'px';
                                labelEl.style.top = e.clientY + 'px';
                            }
                        }
                    } else {
                        document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
                        labelEl.classList.remove('visible');
                    }
                    hoveredSprite = newHovered;
                } else if (hoveredSprite && e) {
                    labelEl.style.left = e.clientX + 'px';
                    labelEl.style.top = e.clientY + 'px';
                }
            }

            const clearLongPressTimer = () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                
            }
            const showContextMenu = (sprite, x, y) => {
                const menu = document.getElementById('context-menu');
                if (!menu) return;
                const app = getAppBySprite(sprite);
                NativeBridge.log('menu-open ' + (app?app.packageName:'?') ); if (app) menu.setAttribute('data-pkg', app.packageName);
                // 定位菜单，保持在屏幕内
                const mw = 160, mh = 100;
                const left = Math.min(x, window.innerWidth - mw);
                const top = Math.min(y, window.innerHeight - mh);
                menu.style.left = Math.max(0, left) + 'px';
                menu.style.top = Math.max(0, top) + 'px';
                menu.style.display = 'flex';
            }
            const hideContextMenu = () => {
                const menu = document.getElementById('context-menu');
                if (menu) menu.style.display = 'none';
                NativeBridge.log("menu-closed");
                contextMenuOpen = false;
                longPressFired = false;
            }

            function clearHover() {
                if (hoveredSprite && hoveredSprite.userData.baseScale) {
                    hoveredSprite.scale.set(hoveredSprite.userData.baseScale, hoveredSprite.userData.baseScale, 1);
                    hoveredSprite = null;
                }
                labelEl.classList.remove('visible');
            }

            function quatAngle(q) { return 2 * Math.acos(Math.min(1, Math.abs(q.w))); }

            const startInertiaFromSpeeds = () => {
                if (recentSpeeds.length > 0) {
                    let sum = 0;
                    for (let i = 0; i < recentSpeeds.length; i++) sum += recentSpeeds[i];
                    inertiaStrength = Math.min(1.5, Math.max(0.3, (sum / recentSpeeds.length) * 80));
                } else inertiaStrength = 0.6;
                recentSpeeds = [];
            }

            const resetAllPointers = () => {
                activePointerIds.clear();
                isDragging = false;
                hasMoved = false;
                bottomSwipeData = null;
                topSwipeData = null;
                document.body.style.cursor = isInTimeView ? 'default' : (hoveredSprite ? 'pointer' : 'grab');
            }

            const isInBottomZone = (clientY) => {
                return clientY > window.innerHeight * (1 - BOTTOM_ZONE_RATIO);
            }
            const isInTopZone = (clientY) => {
                return clientY < window.innerHeight * TOP_ZONE_RATIO;
            }

            function onPointerDown(e) { try{NativeBridge.log('PDOWN');}catch(e){}
                // Touch down in time view: hide DOM, start full texture render
                if (isInTimeView) {
                    var tp = document.getElementById('time-page');
                    if (tp && tp.style.visibility === 'visible' && tp.style.zIndex === '100') {
                        tp.style.visibility = 'hidden'; tp.style.zIndex = '-1';
                        _pointerDownCount++;
                        syncTimeSpriteTexture();
                    }
                }
                // 可取消动作进行中：上滑跟手取消
                if (cancelableAction && cancelableAction.phase === 'animating') {
                    cancelSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: zoomLevel, active: true, confirmed: false, startRot: sphereGroup.quaternion.clone() };
                    activePointerIds.add(e.pointerId);
                    cancelZoomAnimation();
                    return;
                }
                // 菜单打开时：点击画布关闭菜单，不触发拖动
                if (contextMenuOpen) {
                    const menu = document.getElementById('context-menu');
                    if (menu && menu.style.display !== 'none') {
                        const rect = menu.getBoundingClientRect();
                        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                            hideContextMenu();
                        }
                    }
                    isDragging = false;
                    hasMoved = false;
                    longPressFired = false;
                    return;
                }
                infiniteInertia = false;
                if (!isInTimeView && activePointerIds.size === 0 && isInTopZone(e.clientY)) {
                    topSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: zoomLevel, active: true, confirmed: false, startTimeViewZoom: computeTimeViewZoom() };
                    activePointerIds.add(e.pointerId);
                    cancelZoomAnimation();
                    return;
                }
                if (isInTimeView && activePointerIds.size === 0) {
                    if (isInBottomZone(e.clientY)) {
                        bottomSwipeData = {
                            pointerId: e.pointerId,
                            startY: e.clientY,
                            startZoom: zoomLevel,
                            active: true,
                            confirmed: false,
                            minY: e.clientY,
                        };
                        activePointerIds.add(e.pointerId);
                        document.body.style.cursor = 'grabbing';
                        cancelZoomAnimation();
                        return;
                    } else {
                        return;
                    }
                }
                if (isInTimeView) return;

                activePointerIds.add(e.pointerId);
                if (activePointerIds.size === 1) {
                    isDragging = true;
                    hasMoved = false;
                    prevScreen.set(e.clientX, e.clientY);
                    document.body.style.cursor = 'grabbing';
updateMouse(e.clientX, e.clientY);
                    checkHover(e);
                    // 长按检测：直接定时600ms，到时raycaster检测
                    const _lpX2 = e.clientX, _lpY2 = e.clientY;
                    clearLongPressTimer();
                    longPressFired = false;
                    if (!isInTimeView) {
                        longPressTimer = setTimeout(function() {
                            NativeBridge.log("lp-timer-fired");
                            updateMouse(_lpX2, _lpY2);
                            raycaster.setFromCamera(mouse, camera);
                            let hits = raycaster.intersectObjects(sprites);
                            hits = hits.filter(function(h) { return !h.object.userData.isDecor; });
                            let spr = hits.length > 0 ? hits[0].object : null;
                            if (spr) {
                                const app = getAppBySprite(spr);
                                if (app && app.packageName !== '__settings__' && app.packageName !== '__time__') {
                                    longPressFired = true;
                                    isDragging = false;
                                    hasMoved = false;
                                    contextMenuOpen = true;
                                    showContextMenu(spr, _lpX2, _lpY2);
                                }
                            }
                        }, LONG_PRESS_MS);
                    }
                } else {
                    isDragging = false;
                    hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = 'grab';
                }
            }

            const onPointerMove = (e) => {
                if (contextMenuOpen) { activePointerIds.delete(e.pointerId); return; }
                // 可取消动作进行中 + 拖动 = 取消
                if (cancelableAction && cancelableAction.phase === 'animating' && isDragging && hasMoved) {
                    cancelCurrentAction('drag'); recentSpeeds = []; hasMoved = false; isDragging = false; return;
                }
                updateMouse(e.clientX, e.clientY);
                if (!isInTimeView && topSwipeData && topSwipeData.active && topSwipeData.pointerId === e.pointerId && activePointerIds.size === 1) {
                    const dY = e.clientY - topSwipeData.startY;
                    if (dY > 3 && !topSwipeData.confirmed) topSwipeData.confirmed = true;
                    if (topSwipeData.confirmed || dY > 8) {
                        topSwipeData.confirmed = true;
                        const md = window.innerHeight * 0.6;
                        const cd = Math.max(0, Math.min(md, dY));
                        const zr = defaultZoom - topSwipeData.startTimeViewZoom;
                        zoomLevel = Math.max(MIN_ZOOM, Math.min(defaultZoom, topSwipeData.startZoom - (cd/md) * zr));
                        applyZoom();
                    }
                    return;
                }
                if (isInTimeView && bottomSwipeData && bottomSwipeData.active &&
                    bottomSwipeData.pointerId === e.pointerId && activePointerIds.size === 1) {
                    const deltaY = bottomSwipeData.startY - e.clientY;
                    if (deltaY < -5 && e.clientY < bottomSwipeData.minY) {
                        bottomSwipeData.minY = e.clientY;
                    }
                    if (deltaY > 3 && !bottomSwipeData.confirmed) {
                        bottomSwipeData.confirmed = true;
                    }
                    if (bottomSwipeData.confirmed || deltaY > 8) {
                        bottomSwipeData.confirmed = true;
                        // 有上滑意图: 立即隐藏原生DOM
                        console.log('[TIME-SWIPE] exit intent'); const tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; }
                        syncTimeSpriteTexture();
                        const screenH = window.innerHeight;
                        const maxDelta = screenH * 0.7;
                        const clampedDelta = Math.max(0, Math.min(maxDelta, deltaY));
                        const zoomRange = defaultZoom - timeViewZoom;
                        let targetZ = bottomSwipeData.startZoom + (clampedDelta / maxDelta) * zoomRange * 1.3;
                        targetZ = Math.max(timeViewZoom, Math.min(defaultZoom * 1.3, targetZ));
                        zoomLevel = targetZ;
                        applyZoom();
                    }
                    if (e.clientY < bottomSwipeData.minY) {
                        bottomSwipeData.minY = e.clientY;
                    }
                    return;
                }
                // 取消上滑手势：跟手拉远
                if (cancelSwipeData && cancelSwipeData.active &&
                    cancelSwipeData.pointerId === e.pointerId && activePointerIds.size === 1) {
                    cancelSwipeData.confirmed = true;
                    const dy = cancelSwipeData.startY - e.clientY;  // positive = swipe up (zoom out)
                    const maxD = window.innerHeight * 0.6;
                    const cd = Math.max(-maxD, Math.min(maxD, dy));
                    const targetZoom = cancelableAction ? cancelableAction.zoomTarget : defaultZoom;
                    const zrUp = Math.max(1, defaultZoom - targetZoom);  // zoom-out range
                    const zrDown = Math.max(0.01, cancelSwipeData.startZoom - targetZoom);  // zoom-in range
                    var newZ;
                    if (cd >= 0) {
                        // 上滑无上限
                        newZ = cancelSwipeData.startZoom + (cd/maxD) * zrUp * 2;
                    } else {
                        // 下滑无下限
                        newZ = cancelSwipeData.startZoom + (cd/maxD) * zrDown * 2;
                        newZ = Math.max(MIN_ZOOM, newZ);
                    }
                    zoomLevel = newZ;
                    applyZoom();
                    return;
                }

                if (!isInTimeView && (!hasMoved || activePointerIds.size !== 1)) checkHover(e);
                // 持续追踪长按目标
                if (!isDragging || activePointerIds.size !== 1 || isInTimeView) {
                    return;
                }

                const curr = new THREE.Vector2(e.clientX, e.clientY);
                const dist = Math.sqrt(prevScreen.distanceToSquared(curr));
                if (!hasMoved && dist > DRAG_THRESHOLD) {
                    hasMoved = true;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = 'grabbing';
                    recentSpeeds = [];
                }
                if (!hasMoved || dist < 0.5) return;
                let deltaQ;
                if (layoutMode === 'flatring') {
                    let dx = curr.x - prevScreen.x;
                    deltaQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -dx * 0.001);
                } else {
                    const p0 = screenToSphere(prevScreen.x, prevScreen.y);
                    const p1 = screenToSphere(curr.x, curr.y);
                    deltaQ = new THREE.Quaternion().setFromUnitVectors(p0, p1);
                    if (layoutMode === 'ring') {
                        const euler = new THREE.Euler().setFromQuaternion(deltaQ);
                        deltaQ.setFromEuler(new THREE.Euler(euler.x * 0.25, 0, 0));
                    } else if (layoutMode === 'hbar') {
                        const euler = new THREE.Euler().setFromQuaternion(deltaQ);
                        deltaQ.setFromEuler(new THREE.Euler(0, euler.y * 0.25, 0));
                    }
                }
                rotationQuat.premultiply(deltaQ);
                rotationQuat.normalize();
                sphereGroup.quaternion.copy(rotationQuat);
                const speed = quatAngle(deltaQ);
                recentSpeeds.push(speed);
                if (recentSpeeds.length > SPEED_SAMPLES) recentSpeeds.shift();
                inertiaQ.copy(deltaQ);
                prevScreen.copy(curr);
            }

            const onPointerUp = (e) => {
                if (contextMenuOpen) { activePointerIds.delete(e.pointerId); if (activePointerIds.size===0) document.body.style.cursor='default'; return; }
                try{NativeBridge.log("PU drag:"+isDragging+" move:"+hasMoved+" hov:"+!!hoveredSprite+" tv:"+isInTimeView);}catch(e){}
                if (cancelSwipeData && cancelSwipeData.pointerId === e.pointerId && cancelSwipeData.active) {
                    activePointerIds.delete(e.pointerId);
                    const sd = cancelSwipeData; cancelSwipeData = null;
                    if (sd.confirmed && cancelableAction && !cancelableAction.cancelled) {
                        // 上滑超过35% → 取消展开；下滑超过35% → 直接打开
                        var progressUp = (zoomLevel - sd.startZoom) / Math.max(0.001, defaultZoom - sd.startZoom);
                        var progressDown = (sd.startZoom - zoomLevel) / Math.max(0.001, sd.startZoom - (cancelableAction.zoomTarget || defaultZoom));
                        if (zoomLevel >= sd.startZoom && progressUp > 0.35) {
                            // 上滑超过阈值：取消
                            cancelCurrentAction('swipe');
                        } else if (zoomLevel < sd.startZoom && progressDown > 0.35) {
                            // 下滑超过阈值：直接完成展开
                            cancelZoomAnimation();
                            startZoomAnimation(cancelableAction.zoomTarget, 150, function() {
                                zoomLevel = cancelableAction.zoomTarget; applyZoom();
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.zoomDone = true; tryCommitCancelable();
                                }
                            });
                            var targetSprite = cancelableAction.sprite;
                            var targetDir = targetSprite.position.clone().normalize();
                            var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            startRotationAnimation(targetQuat, 150, function() {
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.rotDone = true; tryCommitCancelable();
                                }
                            });
                        } else {
                            // 没超过阈值：弹回继续展开
                            if (!animFrameId) animFrameId = requestAnimationFrame(animate);
                            startZoomAnimation(cancelableAction.zoomTarget, ANIM_DURATION, function() {
                                zoomLevel = cancelableAction.zoomTarget; applyZoom();
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.zoomDone = true; tryCommitCancelable();
                                }
                            });
                            var targetSprite = cancelableAction.sprite;
                            var targetDir = targetSprite.position.clone().normalize();
                            var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            startRotationAnimation(targetQuat, ANIM_DURATION, function() {
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.rotDone = true; tryCommitCancelable();
                                }
                            });
                        }
                    }
                    return;
                }
                if (!isInTimeView && topSwipeData && topSwipeData.pointerId === e.pointerId && topSwipeData.active) {
                    activePointerIds.delete(e.pointerId);
                    const sd = topSwipeData; topSwipeData = null;
                    if (sd.confirmed && zoomLevel <= sd.startTimeViewZoom + (defaultZoom - sd.startTimeViewZoom) * 0.5) {
                        returnToTimeView();
                    } else {
                        startZoomAnimation(defaultZoom, ANIM_DURATION, function() { zoomLevel = defaultZoom; applyZoom(); });
                    }
                    return;
                }
                if (isInTimeView && bottomSwipeData && bottomSwipeData.pointerId === e.pointerId && bottomSwipeData.active) {
                    activePointerIds.delete(e.pointerId);
                    const swipeData = bottomSwipeData;
                    bottomSwipeData = null;
                topSwipeData = null;
                    document.body.style.cursor = 'default';
                    if (swipeData.confirmed) {
                        const currentZoom = zoomLevel;
                        const zoomRange = defaultZoom - timeViewZoom;
                        const thresholdZoom = timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true, function() {
                                inertiaStrength = 0.4;
                                infiniteInertia = true;
                                let spinAxis;
                                if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                                else spinAxis = new THREE.Vector3(1, 0, 0);
                                const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                                inertiaQ.copy(smallQ);
                            });
                        } else {
                            startZoomAnimation(timeViewZoom, ANIM_DURATION, function() {
                                zoomLevel = timeViewZoom;
                                applyZoom();
                                // 恢复原生时间覆盖层
                                const tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
                                syncTimeSpriteTexture();
                            });
                        }
                    } else {
                        if (Math.abs(zoomLevel - timeViewZoom) > 0.02) {
                            startZoomAnimation(timeViewZoom, ANIM_DURATION, function() {
                                zoomLevel = timeViewZoom;
                                applyZoom();
                                const tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
                                syncTimeSpriteTexture();
                            });
                        } else {
                            const tp = document.getElementById('time-page');
                            if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
                        }
                    }
                    if (activePointerIds.size === 0) {
                        document.body.style.cursor = 'default';
                    }
                    return;
                }

                activePointerIds.delete(e.pointerId);
                clearLongPressTimer();
                // 点击菜单外部时关闭
                const menu = document.getElementById('context-menu');
                if (menu && menu.style.display !== 'none' && e.target !== menu && !menu.contains(e.target)) {
                    hideContextMenu();
                }
                if (activePointerIds.size === 0) {
                    if (isDragging && !hasMoved && hoveredSprite && !isInTimeView && !longPressFired) {
                        lastTapOnIcon = true;
                        try { NativeBridge.log('click-detect:' + (getAppBySprite(hoveredSprite)||{}).packageName); } catch(e) {}
                        const a=getAppBySprite(hoveredSprite); try{NativeBridge.log("CLICK:"+(a?a.packageName:"null"));}catch(e){}
                        const app = getAppBySprite(hoveredSprite);
                        const targetDir = hoveredSprite.position.clone().normalize();
                        const targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        const appZoom = computeTimeViewZoom();
                        if (app && app.packageName === '__settings__') {
                            window._lastSettingsClick = Date.now();
                            try { NativeBridge.log('settings clicked'); } catch(e) {}
                            startCancelableAction(hoveredSprite, targetQuat, appZoom, function() {
                                let saved = {};
                                try { saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}'); } catch(e) {}
                                const iconInput = document.getElementById('s-icon');
                                if (saved.iconRes && iconInput) iconInput.value = saved.iconRes;
                                const sphereInput = document.getElementById('settings-sphere-input');
                                if (saved.sphereSize && sphereInput) sphereInput.value = parseFloat(saved.sphereSize);
                                const animInput = document.getElementById('settings-anim-input');
                                if (saved.animSpeed && animInput) animInput.value = saved.animSpeed;
                                else if (animInput) animInput.value = ANIM_DURATION;
                                const hotreloadCb = document.getElementById('s-hotreload');
                                if (hotreloadCb) hotreloadCb.checked = !!(saved.hotReload);
                                if (saved.layoutMode) {
                                    const radios = document.getElementsByName('layoutMode');
                                    for (let ri = 0; ri < radios.length; ri++) {
                                        if (radios[ri].value === saved.layoutMode) radios[ri].checked = true;
                                    }
                                }
                                document.getElementById('settings-overlay').style.display = 'flex';
                                canvas.style.pointerEvents = "none";
                            });
                        } else if (app && app.packageName === '__time__') {
                            returnToTimeView();
                        } else if (app && !isInTimeView) {
                            startCancelableAction(hoveredSprite, targetQuat, appZoom, function() {
                                if (app && nativeBridgeReady) {
                                    try {
                                        const result = NativeBridge.launchApp(app.packageName);
                                        if (result && !result.success) console.warn('启动失败:', result.error);
                                    } catch (err) { console.error('启动应用异常:', err); }
                                }
                            });
                        }
                    }
                    if (isDragging && hasMoved && !isInTimeView) startInertiaFromSpeeds();
                    isDragging = false;
                    hasMoved = false;
                    document.body.style.cursor = hoveredSprite ? 'pointer' : 'grab';
                }
            }

            const onPointerLeave = (e) => {
                if (activePointerIds.has(e.pointerId) && activePointerIds.size === 1 && isDragging && !hasMoved && !isInTimeView) {
                    clearHover();
                }
                if (isInTimeView && bottomSwipeData && bottomSwipeData.pointerId === e.pointerId && bottomSwipeData.active) {
                    activePointerIds.delete(e.pointerId);
                    const bsd = bottomSwipeData;
                    bottomSwipeData = null;
                topSwipeData = null;
                    if (bsd.confirmed && zoomLevel > timeViewZoom + 0.1) {
                        const currentZoom = zoomLevel;
                        const zoomRange = defaultZoom - timeViewZoom;
                        const thresholdZoom = timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            startZoomAnimation(timeViewZoom, ANIM_DURATION);
                        }
                    } else {
                        startZoomAnimation(timeViewZoom, ANIM_DURATION);
                    }
                    document.body.style.cursor = 'default';
                }
            }

            const onPointerCancel = (e) => {
                activePointerIds.delete(e.pointerId);
                if (isInTimeView && bottomSwipeData && bottomSwipeData.pointerId === e.pointerId) {
                    const bsd = bottomSwipeData;
                    bottomSwipeData = null;
                topSwipeData = null;
                    if (bsd.confirmed && zoomLevel > timeViewZoom + 0.1) {
                        const currentZoom = zoomLevel;
                        const zoomRange = defaultZoom - timeViewZoom;
                        const thresholdZoom = timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            startZoomAnimation(timeViewZoom, ANIM_DURATION);
                        }
                    } else {
                        startZoomAnimation(timeViewZoom, ANIM_DURATION);
                    }
                }
                if (activePointerIds.size === 0) {
                    isDragging = false;
                    hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = isInTimeView ? 'default' : 'grab';
                }
            }

            // ========== 缩放 ==========
            const onWheel = (e) => {
                if (isInTimeView) return;
                if (e.cancelable) e.preventDefault();
                zoomLevel += e.deltaY * 0.01;
                zoomLevel = Math.max(MIN_ZOOM, zoomLevel);
                applyZoom();
            }

let pinchStartDist = 0, pinchStartZoom = zoomLevel, wasPinching = false;

            const getTouchDist = (touches) => {
let dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }

            const onTouchStart = (e) => {
                if (e.touches.length === 2) {
                    pinchStartDist = getTouchDist(e.touches);
                    pinchStartZoom = zoomLevel;
                    isDragging = false;
                    hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    wasPinching = true;
                    cancelZoomAnimation();
                    bottomSwipeData = null;
                topSwipeData = null;
                    activePointerIds.clear();
                }
            }

            const onTouchMove = (e) => {
                if (e.touches.length === 2) {
                    if (e.cancelable) e.preventDefault();
                    const dist = getTouchDist(e.touches);
                    if (pinchStartDist > 0) {
                        const ratio = pinchStartDist / dist;
                        zoomLevel = pinchStartZoom * ratio;
                        zoomLevel = Math.max(MIN_ZOOM, zoomLevel);
                        if (isInTimeView) {
                            zoomLevel = Math.max(timeViewZoom, zoomLevel);
                        }
                        applyZoom();
                    }
                }
            }

            const onTouchEnd = (e) => {
                if (e.touches.length < 2) {
                    if (wasPinching && isInTimeView && zoomLevel > timeViewZoom + 0.15) {
                        const zoomRange = defaultZoom - timeViewZoom;
                        const thresholdZoom = timeViewZoom + zoomRange * exitThresholdRatio;
                        if (zoomLevel >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            startZoomAnimation(timeViewZoom, ANIM_DURATION);
                        }
                    }
                    pinchStartDist = 0;
                    if (wasPinching) setTimeout(async function() { wasPinching = false; }, 400);
                }
            }

            // ========== 事件绑定 ==========
            canvas.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            // Restore DOM when finger lifts in time view (no exit happened)
            var _pointerDownCount = 0;
            window.addEventListener('pointerup', function onPointerUpTimeView() {
                if (isInTimeView && !isDragging && activePointerIds.size === 0 && !bottomSwipeData && !topSwipeData) {
                    var tp = document.getElementById('time-page');
                    if (tp && _pointerDownCount > 0) {
                        tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none';
                        syncTimeSpriteTexture();
                    }
                }
            });
            canvas.addEventListener('pointerleave', onPointerLeave);
            window.addEventListener('pointercancel', onPointerCancel);
            canvas.addEventListener('wheel', onWheel, { passive: false });
            canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            canvas.addEventListener('touchend', onTouchEnd);
            canvas.addEventListener('touchcancel', function(e) {
                onTouchEnd(e);
                resetAllPointers();
            });

            window.addEventListener('touchend', function(e) {
                if (isInTimeView) return;
                if (wasPinching || e.touches.length > 0) return;
                const now = Date.now();
                if (now - lastTap < 300 && !isDragging && !lastTapOnIcon && !_prevTapOnIcon) {
                    // Check distance: if taps are far apart, it's not a double-tap
                    if (e && 'clientX' in e) {
                        var dx = e.clientX - lastTapX, dy = e.clientY - lastTapY;
                        if (dx * dx + dy * dy > 2500) { // > 50px = not double-tap
                            lastTap = now;
                            lastTapX = e.clientX;
                            lastTapY = e.clientY;
                            lastTapOnIcon = true;
                            return;
                        }
                    }
                    rotationQuat.identity();
                    sphereGroup.quaternion.identity();
                    inertiaQ.identity();
                    inertiaStrength = 0;
                    zoomLevel = defaultZoom;
                    applyZoom();
                    lastTap = 0;
                    return;
                }
                _prevTapOnIcon = lastTapOnIcon;
                lastTap = now;
                if (e && 'clientX' in e) { lastTapX = e.clientX; lastTapY = e.clientY; }
                lastTapOnIcon = false;  // Reset for next tap
            });

            window.addEventListener('resize', function() {
                const w = window.innerWidth,
                    h = window.innerHeight;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                defaultZoom = computeInitDistance();
                timeViewZoom = computeTimeViewZoom();
                if (!isInTimeView && zoomTarget === null) {
                    zoomLevel = defaultZoom;
                    applyZoom();
                }
            });

            // ========== 动画循环 ==========
            let animFrameId = null;
            const isBusy = () => {
                return !!zoomAnimStart || !!rotationAnimData || inertiaStrength > INERTIA_MIN || isDragging || _backProgress >= 0;
            };
            const wakeUp = () => {
                if (!animFrameId) {
                    animFrameId = requestAnimationFrame(animate);
                }
            };
            const animate = (timestamp) => {
                const now = timestamp || performance.now();
                updateZoomAnimation(now);
                updateRotationAnimation(now);
                if (inertiaStrength > INERTIA_MIN && !isInTimeView && !rotationAnimData) {
                    const decay = (isDragging && hasMoved) ? INERTIA_FAST_DECAY : INERTIA_DECAY;
                    const factor = Math.min(inertiaStrength, 1.0);
                    const applyQ = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), inertiaQ, factor);
                    rotationQuat.premultiply(applyQ);
                    rotationQuat.normalize();
                    sphereGroup.quaternion.copy(rotationQuat);
                    if (!infiniteInertia) {
                        inertiaStrength *= decay;
                        if (inertiaStrength < INERTIA_MIN) {
                            inertiaStrength = 0;
                            inertiaQ.identity();
                        }
                    }
                }
                renderer.render(scene, camera);
                if (isBusy()) {
                    animFrameId = requestAnimationFrame(animate);
                } else {
                    animFrameId = null;
                }
            };
            // 首次启动
            animFrameId = requestAnimationFrame(animate);
            // 任何输入都唤醒
            document.addEventListener('pointerdown', wakeUp, { passive: true });
            document.addEventListener('pointermove', wakeUp, { passive: true });
            document.addEventListener('wheel', wakeUp, { passive: true });
            document.addEventListener('touchstart', wakeUp, { passive: true });

            let _texVersion = 0;
            const updateBatteryFromNative = () => {
                try {
                    const bl = JSON.parse(NativeBridge.getBatteryLevel());
                    const level = bl.success ? bl.level : -1;
                    if (level !== _lastBatteryLevel) {
                        _lastBatteryLevel = level;
                        updateBatteryDisplay();
                        // 电量变化触发纹理更新
                        syncTimeSpriteTexture();
                    }
                } catch(e) {}
            };
            const updateBatteryDisplay = () => {
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
            const startTimePageClock = () => {
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
                if (_timePageTimer) clearInterval(_timePageTimer);
                _timePageTimer = setInterval(function() { tick(); }, 1000);
                updateBatteryFromNative();
            }
            startTimePageClock();
            // initial render handled in startTimePageClock

            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    const tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; console.log('[TIME-DOM] HIDE'); }
                } else if (!document.hidden && !isInTimeView && zoomTarget === null) {
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        applyZoom();
                    });
                }
                // 返回前台时检测应用列表变动
                if (!document.hidden && nativeBridgeReady) {
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

            const initSettingsPanel = () => {
// ========== 壁纸 ==========
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
                        img.onload = function() { _wallpaperImg = img; updateTimeSpriteBgOnly(); };
                        img.src = r.path;
                    }
                } catch(e) {}
            };
            (function initWallpaper() {
                if (typeof NativeBridge !== 'undefined') {
                    try { var raw = NativeBridge.getWallpaperPath(); var r = JSON.parse(raw);
                        if (r.success) { document.body.style.backgroundImage = 'url(' + r.path + '?t=' + Date.now() + ')'; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center'; wallpaperPickBtn.textContent = '重新选择'; var img = new Image(); img.onload = function() { _wallpaperImg = img; }; img.src = r.path; }
                    } catch(e) {}
                }
            })();
            wallpaperPickBtn.onclick = function() {
                console.log('[wallpaper] click');
                if (typeof NativeBridge !== 'undefined') NativeBridge.pickWallpaper();
            };
            wallpaperRemoveBtn.onclick = function() {
                document.body.style.backgroundImage = 'none';
                _wallpaperImg = null;
                updateTimeSpriteBgOnly();
                renderTimePageToTexture();
                wallpaperPickBtn.textContent = '选择图片';
                if (typeof NativeBridge !== 'undefined') NativeBridge.removeWallpaper();
            };

            // 时间页面背景
            var timeBgPickBtn = document.getElementById('s-timebg-pick');
            var timeBgRemoveBtn = document.getElementById('s-timebg-remove');
            window._onTimeBgPicked = function(json) {
                try { var r = typeof json === 'string' ? JSON.parse(json) : json;
                    if (r.success) {
                        _timeBgPath = r.path;
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
                                    _timeBgImg = img;
                                    updateTimeSpriteBgOnly();
                                    renderTimePageToTexture();
                                };
                                img.src = url;
                            }
                        };
                        xhr.onerror = function() {
                            // fallback: 直接img.src
                            var img = new Image();
                            img.onload = function() { _timeBgImg = img; updateTimeSpriteBgOnly(); renderTimePageToTexture(); };
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
                _timeBgImg = null; _timeBgPath = null;
                updateTimeSpriteBgOnly();
                renderTimePageToTexture();
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
// Radio clicks now use inline onclick="setRadio(...)" — see HTML

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

                backBtn.addEventListener('click', function() {
                    overlay.style.display = 'none';
                    canvas.style.pointerEvents = 'auto';
                    startZoomAnimation(defaultZoom, ANIM_DURATION, function() {
                        zoomLevel = defaultZoom;
                        applyZoom();
                    });
                });

                const clearBtn = document.getElementById('s-clear-cache');
                clearBtn.addEventListener('click', function() {
                    if (nativeBridgeReady) {
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
                    const minR = updateSphereMinHint();
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
                        animSpeed: animSpeedVal
                    };
                    localStorage.setItem('vibe-settings', JSON.stringify(settings));
                    ANIM_DURATION = animSpeedVal;
                    try { NativeBridge.setHotReload(hotreloadEnabled); } catch(e) {}

                    // 统一：应用所有更改，无需刷新页面
                    const prevIconRes = ICON_RES;
                    ICON_RES = Math.max(16, parseInt(settings.iconRes) || 512);
                    const layoutChanged = layoutMode !== layoutVal;
                    const sphereChanged = Math.abs(SPHERE_RADIUS - inputR) > 0.001;
                    layoutMode = layoutVal;
                    SPHERE_RADIUS = inputR;

                    if (layoutChanged || sphereChanged) {
                        // 变更布局/球体大小 → 重建所有精灵（球体大小兜底在createSprites内自动计算）
                        createSprites(apps, null, true);
                        // 重建后重置到默认视角
                        zoomLevel = defaultZoom;
                        applyZoom();
                        // 重建后重新加载图标
                        if (nativeBridgeReady) NativeBridge.clearIconCache();
                        if (window._allPkgs && nativeBridgeReady) {
                            NativeBridge.requestAppIcons(JSON.stringify(window._allPkgs), ICON_RES);
                        }
                    } else {
                        // 仅分辨率/速度等变化，原地重建纹理
                        if (ICON_RES !== prevIconRes) {
                            console.log('Rebuilding textures at ICON_RES:', ICON_RES);
                            sprites.forEach(function(spr) {
                                if (spr.userData.isTimeSprite) {
                                    spr.material.map = createTimeTexture();
                                } else if (spr.userData.app && spr.userData.app.packageName === '__settings__') {
                                    spr.material.map = createGearTexture();
                                } else if (spr.userData._iconUrl) {
                                    (function(s) {
                                        const img = new Image();
                                        img.onload = function() {
                                            s.material.map = createIconTextureFromImage(img);
                                            s.material.needsUpdate = true;
                                        };
                                        img.src = s.userData._iconUrl;
                                    })(spr);
                                } else if (spr.userData.color) {
                                    spr.material.map = createPlaceholderTexture(spr.userData.app.appName, spr.userData.color);
                                }
                                spr.material.needsUpdate = true;
                            });
                        }
                        if (sphereGroup && inputR > 0) {
                            // 仅球体大小变化（布局不变），重新分布位置
                            let rawPoints = sphereCoulomb(window._totalItems.length, { radius: SPHERE_RADIUS, iter: 500 });
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
                            for (let k = 0; k < sprites.length; k++) {
                                if (k < rawPoints.length) {
                                    sprites[k].position.copy(rawPoints[k]);
                                }
                            }
                            sphereGroup.quaternion.copy(rotationQuat);
                            SPHERE_DIAMETER = SPHERE_RADIUS * 2;
                            defaultZoom = computeInitDistance();
                            timeViewZoom = computeTimeViewZoom();
                            zoomLevel = defaultZoom;
                            applyZoom();
                        }
                    }

                    // 纹理重建（布局变更时createSprites已经做了，不需要重复）
                    if (!layoutChanged && !sphereChanged && ICON_RES !== prevIconRes) {
                        if (nativeBridgeReady) NativeBridge.clearIconCache();
                        sprites.forEach(function(spr) { spr.userData.hasRealIcon = false; });
                        if (window._allPkgs && nativeBridgeReady) {
                            NativeBridge.requestAppIcons(JSON.stringify(window._allPkgs), ICON_RES);
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

            function init() {
                zoomLevel = computeInitDistance();
                defaultZoom = zoomLevel;
                timeViewZoom = computeTimeViewZoom();
                camera.position.set(0, 0, zoomLevel);
                applyZoom();
                isInTimeView = false;
                initSettingsPanel();
                // 上下文菜单事件
                const ctxInfo = document.getElementById('ctx-app-info');
                const ctxUninstall = document.getElementById('ctx-uninstall');
                if (ctxInfo) ctxInfo.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    NativeBridge.log("ctx-info " + pkg); if (pkg && nativeBridgeReady) NativeBridge.log('details-result ' + NativeBridge.openAppDetails(pkg));
                    hideContextMenu();
                });
                if (ctxUninstall) ctxUninstall.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    NativeBridge.log("ctx-uninstall " + pkg); if (pkg && nativeBridgeReady) NativeBridge.log('uninst-result ' + NativeBridge.uninstallApp(pkg));
                    hideContextMenu();
                });
                requestAnimationFrame(animate);
                tryLoadApps();
                setTimeout(function() { updateBatteryDisplay(); }, 3000);
                console.log('🚀 3D 桌面已就绪');
            }

            init();
        })();