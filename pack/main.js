import * as THREE from 'three/webgpu';
import { initScene } from './src/scene.js';
import { state } from './src/state.js';
import { sphereCoulomb } from './src/sphere-coulomb.js';
import { cubicBezier, animateValue, materialEasing, easeOutCubic } from './src/utils.js';
import { createGearTexture, drawCircleFrame, drawCircleBackground, drawTimeCircleBackground, createPlaceholderTexture, createIconTextureFromImage } from './src/textures.js';
import { initSettingsPanel } from './src/settings.js';
import { checkHover, clearLongPressTimer, showContextMenu, hideContextMenu, clearHover, startInertiaFromSpeeds, resetAllPointers, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onWheel, onTouchStart, onTouchMove, onTouchEnd, isBusy, wakeUp, getTouchDist, quatAngle, isInBottomZone, isInTopZone } from './src/gestures.js';
import { updateBatteryFromNative, updateBatteryDisplay, startTimePageClock } from './src/battery.js';
import { computeInitDistance, applyZoom, computeTimeViewZoom, startCancelableAction, tryCommitCancelable, cancelCurrentAction, startZoomAnimation, cancelZoomAnimation, startRotationAnimation } from './src/zoom.js';
import { BASE_SCALE, HOVER_SCALE, FOV_RAD, MIN_ZOOM, TOP_ZONE_RATIO, BOTTOM_ZONE_RATIO, DRAG_THRESHOLD, INERTIA_DECAY, INERTIA_FAST_DECAY, INERTIA_MIN, SPEED_SAMPLES, LONG_PRESS_MS } from './src/config.js';
import { createSprites, clearAllSprites, tryLoadApps, createDemoApps } from './src/sprites.js';
import { enterTimeView, exitTimeView, returnToTimeView, syncTimeSpriteTexture, updateTimeSpriteBgOnly, renderTimePageToTexture, createTimeTexture, stopTimeTextureUpdates, scheduleMinuteUpdate, timeTextureUpdateInterval } from './src/time.js';
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
            state.labelEl = labelEl;
            const loadingEl = document.getElementById('loadingIndicator');
            state.loadingEl = loadingEl;

            // ========== 场景（从 scene.js 导入）==========
            const sceneInit = await initScene(loadingEl);
            if (!sceneInit) return;
            const { scene, camera, renderer, rendererType, canvas, sphereGroup } = sceneInit;
            state.canvas = canvas;
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
            // BASE_SCALE moved to config.js
            let ICON_RES = 512;
            state.ICON_RES = ICON_RES;
            try {
                const _saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}');
                if (_saved.iconRes && parseInt(_saved.iconRes) >= 16) ICON_RES = parseInt(_saved.iconRes);
            } catch(e) {}
            // HOVER_SCALE moved to config.js
            // FOV_RAD moved to config.js
            // MIN_ZOOM moved to config.js
            
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
            state.bottomSwipeData = bottomSwipeData;
            state.topSwipeData = topSwipeData;
            state.cancelSwipeData = cancelSwipeData;
            // TOP_ZONE_RATIO, BOTTOM_ZONE_RATIO moved to config.js

            // 缩放动画
            let zoomTarget = null, zoomAnimStart = null, zoomAnimDuration = 0, zoomAnimElapsed = 0, zoomAnimStartVal = 0, zoomAnimEndVal = 0, zoomAnimCallback = null;
            state.zoomTarget = zoomTarget;
            state.zoomAnimStart = zoomAnimStart;
            state.zoomAnimDuration = zoomAnimDuration;
            state.zoomAnimElapsed = zoomAnimElapsed;
            state.zoomAnimStartVal = zoomAnimStartVal;
            state.zoomAnimEndVal = zoomAnimEndVal;
            state.zoomAnimCallback = zoomAnimCallback;
            state.zoomTarget = state.zoomTarget;
            state.zoomAnimStart = state.zoomAnimStart;
            state.zoomAnimDuration = state.zoomAnimDuration;
            state.zoomAnimElapsed = state.zoomAnimElapsed;
            state.zoomAnimStartVal = state.zoomAnimStartVal;
            state.zoomAnimEndVal = state.zoomAnimEndVal;
            state.zoomAnimCallback = state.zoomAnimCallback;

            // 旋转动画（用于点击时间图标返回时间视图）
            let rotationAnimData = null;
            state.rotationAnimData = rotationAnimData;
            const placeholderColors = [
                '#ff6b6b', '#ff8e72', '#ffa94d', '#ffd43b', '#a9e34b',
                '#69db7c', '#38d9a9', '#3bc9db', '#4dabf7', '#5c7cfa',
                '#748ffc', '#9775fa', '#da77f2', '#f783ac', '#ff8787',
                '#ffb8a8', '#ffc078', '#ffe066', '#c0eb75', '#8ce99a',
                '#63e6be', '#66d9e8', '#74c0fc', '#91a7ff', '#b197fc',
            ];
            state.placeholderColors = placeholderColors;

            let nativeBridgeReady = false;
            state.nativeBridgeReady = state.nativeBridgeReady;
            // DRAG_THRESHOLD moved to config.js
            const prevScreen = new THREE.Vector2();
            const inertiaQ = new THREE.Quaternion();
            state.inertiaQ = inertiaQ;
            let inertiaStrength = 0, infiniteInertia = false;
            state.infiniteInertia = infiniteInertia;
            state.inertiaStrength = inertiaStrength;
            // INERTIA_DECAY moved to config.js
            // INERTIA_FAST_DECAY moved to config.js
            // INERTIA_MIN moved to config.js
            let recentSpeeds = [];
            state.recentSpeeds = recentSpeeds;
            // SPEED_SAMPLES moved to config.js
            const activePointerIds = new Set();

            const raycaster = new THREE.Raycaster();
            raycaster.params.Sprite = { threshold: 0.8 };
            const mouse = new THREE.Vector2();
            let hoveredSprite = null, longPressTimer = null, longPressFired = false, contextMenuOpen = false;
            state.hoveredSprite = hoveredSprite;
            state.longPressTimer = longPressTimer;
            // LONG_PRESS_MS moved to config.js
            let lastTap = 0, lastTapX = 0, lastTapY = 0, lastTapOnIcon = false, _prevTapOnIcon = false;
            let _timePageTimer = null;
            state._timePageTimer = _timePageTimer;


let zoomLevel = computeInitDistance(), defaultZoom = zoomLevel;
            state.defaultZoom = defaultZoom;
            state.zoomLevel = zoomLevel;
            camera.position.set(0, 0, zoomLevel);
            state.computeTimeViewZoom = computeTimeViewZoom;

let timeViewZoom = computeTimeViewZoom(), isInTimeView = false, timeSprite = null;
            state.timeViewZoom = timeViewZoom;
            state.isInTimeView = isInTimeView;
            state.timeSprite = timeSprite;

            // ========== 可取消动作状态机 ==========





            state.startZoomAnimation = startZoomAnimation;

            state.cancelZoomAnimation = cancelZoomAnimation;

            // ====== 三次贝塞尔求解器 ======
            // ====== 通用动画函数 ======



            state.startRotationAnimation = startRotationAnimation;

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
            state.apps = apps; state.sprites = sprites;
            state.apps = apps;
            state.sprites = sprites;

                        const updateSphereMinHint = () => {
                const iconCount = window._totalItems ? window._totalItems.length : (sprites.length || 100);
                const iconVisRadius = BASE_SCALE * 0.44 * 1.1;
                const minR = iconVisRadius / Math.sqrt(Math.PI / Math.max(1, iconCount));
                const hint = document.getElementById('sphere-min-hint');
                if (hint) hint.textContent = '最少 ' + minR.toFixed(2) + '（默认2.5）';
                return minR;
            }
            state.updateSphereMinHint = updateSphereMinHint;

            const rotationQuat = new THREE.Quaternion();
            state.rotationQuat = rotationQuat;
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

// ========== 事件绑定 ==========
            canvas.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            // Restore DOM when finger lifts in time view (no exit happened)
            var _pointerDownCount = 0;
            state._pointerDownCount = _pointerDownCount;
            window.addEventListener('pointerup', function onPointerUpTimeView() {
                if (state.isInTimeView && !isDragging && activePointerIds.size === 0 && !bottomSwipeData && !topSwipeData) {
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
                if (state.isInTimeView) return;
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
                if (!state.isInTimeView && state.zoomTarget === null) {
                    zoomLevel = defaultZoom;
                    applyZoom();
                }
            });

            // ========== 动画循环 ==========
            let animFrameId = null;
            state.animFrameId = animFrameId
            const isBusy = () => {
                return !!state.zoomAnimStart || !!rotationAnimData || inertiaStrength > INERTIA_MIN || isDragging || state._backProgress >= 0;
            };
            const wakeUp = () => {
                if (!animFrameId) {
                    animFrameId = requestAnimationFrame(animate);
                }
            };
            state.wakeUp = wakeUp;
            const animate = (timestamp) => {
                const now = timestamp || performance.now();
                state.updateZoomAnimation(now);
                state.updateRotationAnimation(now);
                if (inertiaStrength > INERTIA_MIN && !state.isInTimeView && !rotationAnimData) {
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
            state.animate = animate;
            function init() {
                zoomLevel = computeInitDistance();
                defaultZoom = zoomLevel;
                timeViewZoom = computeTimeViewZoom();
                camera.position.set(0, 0, zoomLevel);
                applyZoom();
                state.isInTimeView = false;
                initSettingsPanel();
                // 上下文菜单事件
                const ctxInfo = document.getElementById('ctx-app-info');
                const ctxUninstall = document.getElementById('ctx-uninstall');
                if (ctxInfo) ctxInfo.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    NativeBridge.log("ctx-info " + pkg); if (pkg && state.nativeBridgeReady) NativeBridge.log('details-result ' + NativeBridge.openAppDetails(pkg));
                    hideContextMenu();
                });
                if (ctxUninstall) ctxUninstall.addEventListener('click', function() {
                    const menu = document.getElementById('context-menu');
                    const pkg = menu ? menu.getAttribute('data-pkg') : null;
                    NativeBridge.log("ctx-uninstall " + pkg); if (pkg && state.nativeBridgeReady) NativeBridge.log('uninst-result ' + NativeBridge.uninstallApp(pkg));
                    hideContextMenu();
                });
                requestAnimationFrame(animate);
                tryLoadApps();
                setTimeout(function() { updateBatteryDisplay(); }, 3000);
                console.log('🚀 3D 桌面已就绪');
            }

            init();
        })();