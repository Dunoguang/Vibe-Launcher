import * as THREE from 'three/webgpu';
import { init } from './init.js';
import { initScene } from './scene.js';
import { state } from './state.js';
import { sphereCoulomb } from './sphere-coulomb.js';
import { cubicBezier, animateValue, materialEasing, easeOutCubic } from './utils.js';
state.materialEasing = materialEasing;
import { createGearTexture, drawCircleFrame, drawCircleBackground, drawTimeCircleBackground, createPlaceholderTexture, createIconTextureFromImage } from './textures.js';
state.createIconTextureFromImage = createIconTextureFromImage;
state.createPlaceholderTexture = createPlaceholderTexture;
import { initSettingsPanel } from './settings.js';
import { checkHover, clearLongPressTimer, showContextMenu, hideContextMenu, clearHover, startInertiaFromSpeeds, resetAllPointers, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onWheel, onTouchStart, onTouchMove, onTouchEnd, getTouchDist, quatAngle, isInBottomZone, isInTopZone } from './gestures.js';
state.hideContextMenu = hideContextMenu;
import { updateBatteryFromNative, updateBatteryDisplay, startTimePageClock } from './battery.js';
state.updateBatteryFromNative = updateBatteryFromNative;
import { computeInitDistance, applyZoom, computeTimeViewZoom, startCancelableAction, tryCommitCancelable, cancelCurrentAction, startZoomAnimation, cancelZoomAnimation, startRotationAnimation } from './zoom.js';
import { screenToSphere, updateMouse, getAppBySprite, wakeUp, isBusy } from './helpers.js';
import { BASE_SCALE, HOVER_SCALE, FOV_RAD, MIN_ZOOM, TOP_ZONE_RATIO, BOTTOM_ZONE_RATIO, DRAG_THRESHOLD, INERTIA_DECAY, INERTIA_FAST_DECAY, INERTIA_MIN, SPEED_SAMPLES, LONG_PRESS_MS } from './config.js';
import { createSprites, clearAllSprites, tryLoadApps, createDemoApps } from './sprites.js';
import { enterTimeView, exitTimeView, returnToTimeView, syncTimeSpriteTexture, updateTimeSpriteBgOnly, renderTimePageToTexture, createTimeTexture, stopTimeTextureUpdates, scheduleMinuteUpdate, timeTextureUpdateInterval } from './time.js';
state.syncTimeSpriteTexture = syncTimeSpriteTexture;
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
            state.camera = camera;
            state.renderer = renderer;
            state.scene = scene;
            state.canvas = canvas;
            state.sphereGroup = sphereGroup;
            const exitThresholdRatio = 0.35;
            state.exitThresholdRatio = exitThresholdRatio;
            let cancelableAction = null;
            state.cancelableAction = cancelableAction;
            let bottomSwipeData = null, topSwipeData = null, cancelSwipeData = null;
            state.bottomSwipeData = bottomSwipeData;
            state.topSwipeData = topSwipeData;
            state.cancelSwipeData = cancelSwipeData;
            // TOP_ZONE_RATIO, BOTTOM_ZONE_RATIO moved to config.js
            state.TOP_ZONE_RATIO = TOP_ZONE_RATIO;
            state.BOTTOM_ZONE_RATIO = BOTTOM_ZONE_RATIO;

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
            state.prevScreen = prevScreen;
            const inertiaQ = new THREE.Quaternion();
            state.inertiaQ = inertiaQ;
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
            state.activePointerIds = activePointerIds;

            const raycaster = new THREE.Raycaster();
            raycaster.params.Sprite = { threshold: 0.8 };
            const mouse = new THREE.Vector2();
            state.raycaster = raycaster;
            state.mouse = mouse;
            let hoveredSprite = null, longPressTimer = null, longPressFired = false, contextMenuOpen = false;
            state.contextMenuOpen = contextMenuOpen;
            state.hoveredSprite = hoveredSprite;
            state.longPressTimer = longPressTimer;
            // LONG_PRESS_MS moved to config.js
            state.DRAG_THRESHOLD = DRAG_THRESHOLD;
            state.LONG_PRESS_MS = LONG_PRESS_MS;
            state.MIN_ZOOM = MIN_ZOOM;
            state.SPEED_SAMPLES = SPEED_SAMPLES;
            let lastTap = 0, lastTapX = 0, lastTapY = 0, lastTapOnIcon = false, _prevTapOnIcon = false;
            state.lastTap = lastTap;
            state.lastTapX = lastTapX;
            state.lastTapY = lastTapY;
            state.lastTapOnIcon = lastTapOnIcon;
            state._prevTapOnIcon = _prevTapOnIcon;
            var _pointerDownCount = 0;
            state._pointerDownCount = _pointerDownCount;
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
            state.computeInitDistance = computeInitDistance;

            // ====== 三次贝塞尔求解器 ======
            // ====== 通用动画函数 ======

            state.startRotationAnimation = startRotationAnimation;

            // ========== 设置纹理 ==========
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
            state.isDragging = isDragging;
            state.hasMoved = hasMoved;

            const animate = (timestamp) => {
                const now = timestamp || performance.now();
                state.updateZoomAnimation(now);
                state.updateRotationAnimation(now);
                if (state.inertiaStrength > INERTIA_MIN && !state.isInTimeView && !state.rotationAnimData) {
                    const decay = (state.isDragging && state.hasMoved) ? INERTIA_FAST_DECAY : INERTIA_DECAY;
                    const factor = Math.min(state.inertiaStrength, 1.0);
                    const applyQ = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), state.inertiaQ, factor);
                    state.rotationQuat.premultiply(applyQ);
                    state.rotationQuat.normalize();
                    state.sphereGroup.quaternion.copy(state.rotationQuat);
                    if (!state.infiniteInertia) {
                        state.inertiaStrength *= decay;
                        if (state.inertiaStrength < INERTIA_MIN) {
                            state.inertiaStrength = 0;
                            state.inertiaQ.identity();
                        }
                    }
                }
                state.renderer.render(state.scene, state.camera);
                if (isBusy()) {
                     state.animFrameId = requestAnimationFrame(animate);
                } else {
                    state.animFrameId = null;
                }
            };
            
            // ========== 事件绑定 ==========
            state.canvas.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            // Restore DOM when finger lifts in time view (no exit happened)
            var _pointerDownCount = 0;
            state._pointerDownCount = _pointerDownCount;
            window.addEventListener('pointerup', function onPointerUpTimeView() {
                if (state.isInTimeView && !state.isDragging && activePointerIds.size === 0 && !state.bottomSwipeData && !state.topSwipeData) {
                    var tp = document.getElementById('time-page');
                    if (tp && _pointerDownCount > 0) {
                        tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none';
                        state.syncTimeSpriteTexture();
                    }
                }
            });
            state.canvas.addEventListener('pointerleave', onPointerLeave);
            window.addEventListener('pointercancel', onPointerCancel);
            state.canvas.addEventListener('wheel', onWheel, { passive: false });
            state.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            state.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            state.canvas.addEventListener('touchend', onTouchEnd);
            state.canvas.addEventListener('touchcancel', function(e) {
                onTouchEnd(e);
                state.resetAllPointers();

                        });

            state.animate = animate; 
            // 首次启动
             state.animFrameId = requestAnimationFrame(animate);
            // 任何输入都唤醒
            document.addEventListener('pointerdown', wakeUp, { passive: true });
            document.addEventListener('pointermove', wakeUp, { passive: true });
            document.addEventListener('wheel', wakeUp, { passive: true });
            document.addEventListener('touchstart', wakeUp, { passive: true });

            let _texVersion = 0;
             init();
})();

state.resetAllPointers = resetAllPointers;
