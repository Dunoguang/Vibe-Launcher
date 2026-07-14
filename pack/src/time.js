import * as THREE from 'three/webgpu';
import html2canvas from 'html2canvas';
import { state } from './state.js';
import { drawTimeCircleBackground, drawCircleFrame } from './textures.js';
export let timeTextureUpdateInterval = null;
            export let updateTimeSpriteBgOnly = function() {
                state._texVersion++;
                // 重建缓存纹理
                if (state.timeTexture) { state.timeTexture.dispose(); state.timeTexture = null; }
                let tex = createTimeTexture();
                // 更新当前精灵
                if (state.timeSprite && state.timeSprite.material) {
                    let oldMap = state.timeSprite.material.map;
                    state.timeSprite.material.map = tex;
                    state.timeSprite.material.needsUpdate = true;
                    if (oldMap && oldMap !== tex) oldMap.dispose();
                    if (state.renderer) state.renderer.render(state.scene, state.camera);
                }
            };
            // 状态机：DOM可见 → bg-only，DOM隐藏 → full
            export let syncTimeSpriteTexture = function() {
                // 应用缓存的纹理到精灵，不重建
                if (!state.timeSprite || !state.timeSprite.material) return;
                if (state.timeTexture) {
                    let oldMap = state.timeSprite.material.map;
                    state.timeSprite.material.map = state.timeTexture;
                    state.timeSprite.material.needsUpdate = true;
                    if (oldMap && oldMap !== state.timeTexture) oldMap.dispose();
                }
            };
            let drawCircleBackground = function(ctx, cx, cy, r, s) {
                let bg = _wallpaperImg;
                if (bg) {
                    ctx.save();
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
                    ctx.drawImage(bg, cx-r, cy-r, r*2, r*2);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#0a0e18';
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
                }
                drawCircleFrame(ctx, cx, cy, r, s);
            };
            export let createTimeTexture = () => {
                if (state.timeTexture) return state.timeTexture;
                let s = Math.max(window.innerWidth, window.innerHeight);
                let c = document.createElement('canvas');
                c.width = s;
                c.height = s;
                let ctx = c.getContext('2d');
let cx = s / 2, cy = s / 2, r = s * 0.44;
                drawTimeCircleBackground(ctx, cx, cy, r, s);
                let tex = new THREE.CanvasTexture(c);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                state.timeTexture = tex;
                return tex;
            }
            export let updateTimeSpriteTexture = () => {
                if (!state.timeSprite || !state.timeSprite.material) return;
                let newTex = createTimeTexture();
                if (state.timeSprite.material.map) {
                    state.timeSprite.material.map.dispose();
                }
                state.timeSprite.material.map = newTex;
                state.timeSprite.material.needsUpdate = true;
            }
            export let scheduleMinuteUpdate = () => {
                if (timeTextureUpdateInterval) clearTimeout(timeTextureUpdateInterval);
                let now = new Date();
                let sec = now.getSeconds();
                let ms = now.getMilliseconds();
                let wait = (60 - sec) * 1000 - ms + 50;
                timeTextureUpdateInterval = setTimeout(() => {
                    // 先刷新DOM，确保截图是最新分钟
                    let el = document.getElementById('time-page-clock');
                    if (el) {
                        let n = new Date();
                        el.textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
                        let de = document.getElementById('time-page-date');
                        if (de) {
                            let wd = ['周日','周一','周二','周三','周四','周五','周六'];
                            de.textContent = (n.getMonth()+1) + '月' + n.getDate() + '日 ' + wd[n.getDay()];
                        }
                    }
                    syncTimeSpriteTexture();
                    try { state.updateBatteryFromNative(); } catch(e) {}
                    scheduleMinuteUpdate();
                }, wait);
            };
            export let startTimeTextureUpdates = () => {
                syncTimeSpriteTexture();
                scheduleMinuteUpdate();
            };
            export let stopTimeTextureUpdates = () => {
                // 不再清除全局分钟调度器，仅保留接口兼容
            };
            // ========== 进入/退出时间视图 ==========
            export let enterTimeView = (animate, onComplete) => {
                if (state.isInTimeView || !state.timeSprite) return;
                state.isInTimeView = true;
                state.cancelZoomAnimation();
                state.rotationAnimData = null;
                state.inertiaQ.identity();
                state.inertiaStrength = 0;
                state.recentSpeeds = [];
                state.clearHover();
                document.body.style.cursor = 'default';
                let targetZoom = state.computeTimeViewZoom();
                state.timeViewZoom = targetZoom;
                if (animate) {
                    state.startZoomAnimation(targetZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = targetZoom;
                        state.applyZoom();
                        if (onComplete) onComplete();
                        // 显示原生时间页面覆盖层（最高分辨率）
                        let tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                        syncTimeSpriteTexture();
                    });
                } else {
                    state.zoomLevel = targetZoom;
                    state.applyZoom();
                    if (onComplete) onComplete();
                    let tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                    syncTimeSpriteTexture();
                }
            }
            export let exitTimeView = (animate, callback) => {
                if (!state.isInTimeView) { return; }
                state.isInTimeView = false;
                                // 隐藏原生时间页面
                let tp = document.getElementById('time-page');
                if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; }
                // 不在这里重建纹理（即将缩小的精灵不需要全分辨率画布）
                state.cancelZoomAnimation();
                state.rotationAnimData = null;
                stopTimeTextureUpdates();
                state.bottomSwipeData = null;
                state.topSwipeData = null;
                document.body.style.cursor = 'grab';
                if (state.timeSprite) {
                    state.timeSprite.scale.set(state.BASE_SCALE, state.BASE_SCALE, 1);
                }
                state._pointerDownCount = 0;
                let targetZoom = state.defaultZoom;
                if (animate) {
                    state.startZoomAnimation(targetZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = targetZoom;
                        state.applyZoom();
                                                state.infiniteInertia = true;
                        state.inertiaStrength = 0.4;
                        let spinAxis = state.layoutMode === 'hbar' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                        state.inertiaQ.copy(new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015));
                        state.wakeUp();
                        if (callback) callback();
                    });
                } else {
                    state.zoomLevel = targetZoom;
                    state.applyZoom();
                                        state.infiniteInertia = true;
                    state.inertiaStrength = 0.4;
                    let spinAxis = state.layoutMode === 'hbar' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                    state.inertiaQ.copy(new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015));
                    state.wakeUp();
                    if (callback) callback();
                }
            }
            // 点击时间图标返回时间视图
            export let returnToTimeView = () => {
                if (state.isInTimeView || !state.timeSprite) { return; }
                state.isInTimeView = true;
                state._timeEnteredAt = performance.now();
                // 取消当前所有动画
                state.cancelZoomAnimation();
                state.rotationAnimData = null;
                state.inertiaQ.identity();
                state.inertiaStrength = 0;
                state.recentSpeeds = [];
                state.clearHover();
                document.body.style.cursor = 'default';
                // 计算需要旋转的目标四元数：使时间图标正对摄像机
                let timePos = state.timeSprite.position.clone();
                let targetDir = timePos.clone().normalize();
                let cameraDir = new THREE.Vector3(0, 0, 1);
                let targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, cameraDir);
                // 同时执行旋转和缩放动画
let zoomComplete = false, rotationComplete = false;
                let targetZoom = state.computeTimeViewZoom();
                state.timeViewZoom = targetZoom;
                let checkBothComplete = () => {
                    if (zoomComplete && rotationComplete) {
                        let tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                        else { }
                        syncTimeSpriteTexture();
                    }
                }
                state.startRotationAnimation(targetQuat, state.ANIM_DURATION, function() {
                    rotationComplete = true;
                    checkBothComplete();
                });
                state.startZoomAnimation(targetZoom, state.ANIM_DURATION, function() {
                    state.zoomLevel = targetZoom;
                    state.applyZoom();
                    zoomComplete = true;
                    checkBothComplete();
                });
            }
            // ========== 纹理生成 ==========
            export let renderTimePageToTexture = () => {
                let page = document.getElementById('time-page');
                if (!page || !state.timeSprite || !state.timeSprite.material || typeof html2canvas === 'undefined') return;
                let s = Math.max(window.innerWidth, window.innerHeight);
                let ver = ++state._texVersion;
                let _wasHidden = page.style.visibility === 'hidden';
                page.style.visibility = 'visible';
                html2canvas(page, { scale: 1, useCORS: true, backgroundColor: null }).then(function(domCanvas) {
                    // 检查是否用户已松手（DOM被pointerUpTimeView显示），在恢复隐藏之前保存
                    let _userShowed = _wasHidden && page.style.visibility === 'visible';
                    // 从缓存绘制背景圆，再覆盖DOM截图
                    let texCanvas = document.createElement('canvas');
                    texCanvas.width = s; texCanvas.height = s;
                    let ctx = texCanvas.getContext('2d');
                    let cx = s/2, cy = s/2, r = s * 0.44;
                    // 如果用户已松手，不应用完整纹理
                    if (_userShowed) {
                        if (ver !== state._texVersion) return;
                        updateTimeSpriteBgOnly();
                        return;
                    }
                    // 恢复DOM隐藏（只有DOM原本隐藏时才恢复）
                    if (_wasHidden) page.style.visibility = 'hidden';
                    if (_bgCanvas) {
                        ctx.drawImage(_bgCanvas, 0, 0);
                    } else {
                        drawTimeCircleBackground(ctx, cx, cy, r, s);
                    }
                    // 裁切圆内，绘制 DOM 截图
                    ctx.save();
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.clip();
                    let aspect = window.innerWidth / window.innerHeight;
                    let diag = Math.sqrt(aspect*aspect + 1);
                    let rectW = 2 * r * (aspect / diag);
                    let rectH = 2 * r * (1 / diag);
                    ctx.drawImage(domCanvas, cx - rectW/2, cy - rectH/2, rectW, rectH);
                    ctx.restore();
                    let ts = new Date();
                    let oldMap = state.timeSprite.material.map;
                    let tex = new THREE.CanvasTexture(texCanvas);
                    tex.minFilter = THREE.LinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                    if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                    state.timeSprite.material.map = tex;
                    state.timeSprite.material.needsUpdate = true;
                    if (oldMap && oldMap !== tex) oldMap.dispose();
                    if (ver !== state._texVersion) { return; }
                }).catch(function(e) { console.warn('html2canvas error:', e); if (_wasHidden) page.style.visibility = 'hidden'; });
            }
let _lastBatteryLevel = -1;
state.updateTimeSpriteBgOnly = updateTimeSpriteBgOnly;
state.createTimeTexture = createTimeTexture;
state.syncTimeSpriteTexture = syncTimeSpriteTexture;
state.renderTimePageToTexture = renderTimePageToTexture;
state.enterTimeView = enterTimeView;
state.exitTimeView = exitTimeView;
state.returnToTimeView = returnToTimeView;
