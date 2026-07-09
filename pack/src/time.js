import * as THREE from 'three/webgpu';
import html2canvas from 'html2canvas';
import { state } from './state.js';
import { drawTimeCircleBackground, drawCircleFrame } from './textures.js';
export let timeTextureUpdateInterval = null;
            export const updateTimeSpriteBgOnly = function() {
                state._texVersion++;
                if (!state.timeSprite || !state.timeSprite.material) return;
                var s = Math.max(window.innerWidth, window.innerHeight);
                var c = document.createElement('canvas');
                c.width = s; c.height = s;
                var ctx = c.getContext('2d');
                var cx = s/2, cy = s/2, r = s * 0.44;
                drawTimeCircleBackground(ctx, cx, cy, r, s);
                var oldMap = state.timeSprite.material.map;
                var tex = new THREE.CanvasTexture(c);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                state.timeSprite.material.map = tex;
                state.timeSprite.material.needsUpdate = true;
                if (oldMap && oldMap !== tex) oldMap.dispose();
                if (state.renderer) state.renderer.render(state.scene, state.camera);
            };
            // 状态机：DOM可见 → bg-only，DOM隐藏 → full
            export const syncTimeSpriteTexture = function() {
                updateTimeSpriteBgOnly();
            };
            const drawCircleBackground = function(ctx, cx, cy, r, s) {
                var bg = _wallpaperImg;
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
            export const createTimeTexture = () => {
                const s = Math.max(window.innerWidth, window.innerHeight);
                let c = document.createElement('canvas');
                c.width = s;
                c.height = s;
                const ctx = c.getContext('2d');
let cx = s / 2, cy = s / 2, r = s * 0.44;
                drawTimeCircleBackground(ctx, cx, cy, r, s);
                const tex = new THREE.CanvasTexture(c);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }
            export const updateTimeSpriteTexture = () => {
                if (!state.timeSprite || !state.timeSprite.material) return;
                const newTex = createTimeTexture();
                if (state.timeSprite.material.map) {
                    state.timeSprite.material.map.dispose();
                }
                state.timeSprite.material.map = newTex;
                state.timeSprite.material.needsUpdate = true;
            }
            export const scheduleMinuteUpdate = () => {
                if (timeTextureUpdateInterval) clearTimeout(timeTextureUpdateInterval);
                const now = new Date();
                const sec = now.getSeconds();
                const ms = now.getMilliseconds();
                const wait = (60 - sec) * 1000 - ms + 50;
                timeTextureUpdateInterval = setTimeout(() => {
                    // 先刷新DOM，确保截图是最新分钟
                    const el = document.getElementById('time-page-clock');
                    if (el) {
                        const n = new Date();
                        el.textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
                        const de = document.getElementById('time-page-date');
                        if (de) {
                            const wd = ['周日','周一','周二','周三','周四','周五','周六'];
                            de.textContent = (n.getMonth()+1) + '月' + n.getDate() + '日 ' + wd[n.getDay()];
                        }
                    }
                    syncTimeSpriteTexture();
                    try { state.updateBatteryFromNative(); } catch(e) {}
                    scheduleMinuteUpdate();
                }, wait);
            };
            export const startTimeTextureUpdates = () => {
                syncTimeSpriteTexture();
                scheduleMinuteUpdate();
            };
            export const stopTimeTextureUpdates = () => {
                // 不再清除全局分钟调度器，仅保留接口兼容
            };
            // ========== 进入/退出时间视图 ==========
            export const enterTimeView = (animate, onComplete) => {
                if (state.isInTimeView || !state.timeSprite) return;
                state.isInTimeView = true;
                state.cancelZoomAnimation();
                state.rotationAnimData = null;
                state.inertiaQ.identity();
                state.inertiaStrength = 0;
                state.recentSpeeds = [];
                state.clearHover();
                document.body.style.cursor = 'default';
                const targetZoom = state.computeTimeViewZoom();
                state.timeViewZoom = targetZoom;
                if (animate) {
                    state.startZoomAnimation(targetZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = targetZoom;
                        state.applyZoom();
                        if (onComplete) onComplete();
                        // 显示原生时间页面覆盖层（最高分辨率）
                        const tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                        syncTimeSpriteTexture();
                    });
                } else {
                    state.zoomLevel = targetZoom;
                    state.applyZoom();
                    if (onComplete) onComplete();
                    const tp = document.getElementById('time-page');
                    if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                    syncTimeSpriteTexture();
                }
            }
            export const exitTimeView = (animate, callback) => {
                if (!state.isInTimeView) { NativeBridge.log('EXIT skipped isInTimeView=' + state.isInTimeView); return; }
                state.isInTimeView = false;
                // 隐藏原生时间页面
                const tp = document.getElementById('time-page');
                if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; tp.style.pointerEvents = 'none'; }
                syncTimeSpriteTexture()
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
                const targetZoom = state.defaultZoom;
                if (animate) {
                    state.startZoomAnimation(targetZoom, state.ANIM_DURATION, function() {
                        state.zoomLevel = targetZoom;
                        state.applyZoom();
                        if (callback) callback();
                    });
                } else {
                    state.zoomLevel = targetZoom;
                    state.applyZoom();
                    if (callback) callback();
                }
            }
            // 点击时间图标返回时间视图
            export const returnToTimeView = () => {
                if (state.isInTimeView || !state.timeSprite) { NativeBridge.log('RTTV skipped: isInTimeView=' + state.isInTimeView + ' sprite=' + !!state.timeSprite); return; }
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
                const timePos = state.timeSprite.position.clone();
                const targetDir = timePos.clone().normalize();
                const cameraDir = new THREE.Vector3(0, 0, 1);
                const targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, cameraDir);
                // 同时执行旋转和缩放动画
let zoomComplete = false, rotationComplete = false;
                const targetZoom = state.computeTimeViewZoom();
                state.timeViewZoom = targetZoom;
                const checkBothComplete = () => {
                    if (zoomComplete && rotationComplete) {
                        const tp = document.getElementById('time-page');
                        if (tp) { NativeBridge.log('RTTV showing DOM'); tp.style.visibility = 'visible'; tp.style.zIndex = '100'; tp.style.pointerEvents = 'none'; }
                        else { NativeBridge.log('RTTV DOM element not found'); }
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
            export const renderTimePageToTexture = () => {
                const page = document.getElementById('time-page');
                if (!page || !state.timeSprite || !state.timeSprite.material || typeof html2canvas === 'undefined') return;
                const s = Math.max(window.innerWidth, window.innerHeight);
                var ver = ++state._texVersion;
                var _wasHidden = page.style.visibility === 'hidden';
                page.style.visibility = 'visible';
                html2canvas(page, { scale: 1, useCORS: true, backgroundColor: null }).then(function(domCanvas) {
                    // 检查是否用户已松手（DOM被pointerUpTimeView显示），在恢复隐藏之前保存
                    const _userShowed = _wasHidden && page.style.visibility === 'visible';
                    // 从缓存绘制背景圆，再覆盖DOM截图
                    const texCanvas = document.createElement('canvas');
                    texCanvas.width = s; texCanvas.height = s;
                    const ctx = texCanvas.getContext('2d');
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
                    const aspect = window.innerWidth / window.innerHeight;
                    const diag = Math.sqrt(aspect*aspect + 1);
                    const rectW = 2 * r * (aspect / diag);
                    const rectH = 2 * r * (1 / diag);
                    ctx.drawImage(domCanvas, cx - rectW/2, cy - rectH/2, rectW, rectH);
                    ctx.restore();
                    const ts = new Date();
                    const oldMap = state.timeSprite.material.map;
                    const tex = new THREE.CanvasTexture(texCanvas);
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
