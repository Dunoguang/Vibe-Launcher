import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { materialEasing } from './utils.js';
            let checkHover = (e) => {
                if (state.isInTimeView) return;
                state.raycaster.setFromCamera(state.mouse, state.camera);
                let intersects = state.raycaster.intersectObjects(state.sprites);
                let newHovered = null;
                for (let hi = 0; hi < intersects.length; hi++) {
                    if (intersects[hi].object.userData.isDecor) continue;
                    newHovered = intersects[hi].object;
                    break;
                }
                if (state.hoveredSprite !== newHovered) {
                    if (newHovered) {
                        document.body.style.cursor = 'pointer';
                        let app = state.getAppBySprite(newHovered);
                        if (app) {
                            state.labelEl.textContent = app.appName;
                            state.labelEl.classList.add('visible');
                            if (e) {
                                state.labelEl.style.left = e.clientX + 'px';
                                state.labelEl.style.top = e.clientY + 'px';
                            }
                        }
                    } else {
                        document.body.style.cursor = state.isDragging ? 'grabbing' : 'grab';
                        state.labelEl.classList.remove('visible');
                    }
                    state.hoveredSprite = newHovered;
                } else if (state.hoveredSprite && e) {
                    state.labelEl.style.left = e.clientX + 'px';
                    state.labelEl.style.top = e.clientY + 'px';
                }
            }
            let clearLongPressTimer = () => {
                if (state.longPressTimer) { clearTimeout(state.longPressTimer); state.longPressTimer = null; }
                
            }
            let showContextMenu = (sprite, x, y) => {
                let menu = document.getElementById('context-menu');
                if (!menu) return;
                let app = state.getAppBySprite(sprite);
                // 定位菜单，保持在屏幕内
                let mw = 160, mh = 100;
                let left = Math.min(x, window.innerWidth - mw);
                let top = Math.min(y, window.innerHeight - mh);
                menu.style.left = Math.max(0, left) + 'px';
                menu.style.top = Math.max(0, top) + 'px';
                menu.style.display = 'flex';
            }
            let hideContextMenu = () => {
                let menu = document.getElementById('context-menu');
                if (menu) menu.style.display = 'none';
                state.contextMenuOpen = false;
                state.longPressFired = false;
            }
            function clearHover() {
                if (state.hoveredSprite && state.hoveredSprite.userData.baseScale) {
                    state.hoveredSprite.scale.set(state.hoveredSprite.userData.baseScale, state.hoveredSprite.userData.baseScale, 1);
                    state.hoveredSprite = null;
                }
                state.labelEl.classList.remove('visible');
            }
            state.clearHover = clearHover;
            function quatAngle(q) { return 2 * Math.acos(Math.min(1, Math.abs(q.w))); }
            let startInertiaFromSpeeds = () => {
                if (state.recentSpeeds.length > 0) {
                    let sum = 0;
                    for (let i = 0; i < state.recentSpeeds.length; i++) sum += state.recentSpeeds[i];
                    state.inertiaStrength = Math.min(1.5, Math.max(0.3, (sum / state.recentSpeeds.length) * 80));
                } else state.inertiaStrength = 0.6;
                state.recentSpeeds = [];
            }
            let resetAllPointers = () => {
                state.activePointerIds.clear();
                state.isDragging = false;
                state.hasMoved = false;
                state.bottomSwipeData = null;
                state.topSwipeData = null;
                document.body.style.cursor = state.isInTimeView ? 'default' : (state.hoveredSprite ? 'pointer' : 'grab');
            }
            let isInBottomZone = (clientY) => {
                return clientY > window.innerHeight * (1 - state.BOTTOM_ZONE_RATIO);
            }
            let isInTopZone = (clientY) => {
                return clientY < window.innerHeight * state.TOP_ZONE_RATIO;
            }
            function onPointerDown(e) {                 // No longer hide DOM on touch - always show bg-only texture
                // 可取消动作进行中：上滑跟手取消
                if (state.cancelableAction && state.cancelableAction.phase === 'animating') {
                    state.cancelSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: state.zoomLevel, active: true, confirmed: false, startRot: state.sphereGroup.quaternion.clone() };
                    state.activePointerIds.add(e.pointerId);
                    state.cancelZoomAnimation();
                    return;
                }
                // 菜单打开时：点击画布关闭菜单，不触发拖动
                if (state.contextMenuOpen) {
                    let menu = document.getElementById('context-menu');
                    if (menu && menu.style.display !== 'none') {
                        let rect = menu.getBoundingClientRect();
                        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                            hideContextMenu();
                        }
                    }
                    state.isDragging = false;
                    state.hasMoved = false;
                    state.longPressFired = false;
                    return;
                }
                state.infiniteInertia = false;
                if (!state.isInTimeView && state.activePointerIds.size === 0 && isInTopZone(e.clientY)) {
                    state.topSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: state.zoomLevel, active: true, confirmed: false, startTimeViewZoom: state.computeTimeViewZoom() };
                    state.activePointerIds.add(e.pointerId);
                    state.cancelZoomAnimation();
                    return;
                }
                if (state.isInTimeView && state.activePointerIds.size === 0) {
                    if (isInBottomZone(e.clientY)) {
                        state.bottomSwipeData = {
                            pointerId: e.pointerId,
                            startY: e.clientY,
                            startZoom: state.zoomLevel,
                            active: true,
                            confirmed: false,
                            minY: e.clientY,
                        };
                        state.activePointerIds.add(e.pointerId);
                        document.body.style.cursor = 'grabbing';
                        state.cancelZoomAnimation();
                        return;
                    } else {
                        return;
                    }
                }
                if (state.isInTimeView) return;
                state.activePointerIds.add(e.pointerId);
                if (state.activePointerIds.size === 1) {
                    state.isDragging = true;
                    state.hasMoved = false;
                    state.prevScreen.set(e.clientX, e.clientY);
                    document.body.style.cursor = 'grabbing';
state.updateMouse(e.clientX, e.clientY);
                    checkHover(e);
                    // 长按检测：直接定时600ms，到时raycaster检测
                    let _lpX2 = e.clientX, _lpY2 = e.clientY;
                    clearLongPressTimer();
                    state.longPressFired = false;
                    if (!state.isInTimeView) {
                        state.longPressTimer = setTimeout(function() {
                            state.updateMouse(_lpX2, _lpY2);
                            state.raycaster.setFromCamera(state.mouse, state.camera);
                            let hits = state.raycaster.intersectObjects(state.sprites);
                            hits = hits.filter(function(h) { return !h.object.userData.isDecor; });
                            let spr = hits.length > 0 ? hits[0].object : null;
                            if (spr) {
                                let app = state.getAppBySprite(spr);
                                if (app && app.packageName !== '__settings__' && app.packageName !== '__time__') {
                                    state.longPressFired = true;
                                    state.isDragging = false;
                                    state.hasMoved = false;
                                    state.contextMenuOpen = true;
                                    showContextMenu(spr, _lpX2, _lpY2);
                                }
                            }
                        }, state.LONG_PRESS_MS);
                    }
                } else {
                    state.isDragging = false;
                    state.hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = 'grab';
                }
            }
            let onPointerMove = (e) => {
                if (state.contextMenuOpen) { state.activePointerIds.delete(e.pointerId); return; }
                // 可取消动作进行中 + 拖动 = 取消
                if (state.cancelableAction && state.cancelableAction.phase === 'animating' && state.isDragging && state.hasMoved) {
                    state.cancelCurrentAction('drag'); state.recentSpeeds = []; state.hasMoved = false; state.isDragging = false; return;
                }
                state.updateMouse(e.clientX, e.clientY);
                if (!state.isInTimeView && state.topSwipeData && state.topSwipeData.active && state.topSwipeData.pointerId === e.pointerId && state.activePointerIds.size === 1) {
                    let dY = e.clientY - state.topSwipeData.startY;
                    if (dY > 3 && !state.topSwipeData.confirmed) state.topSwipeData.confirmed = true;
                    if (state.topSwipeData.confirmed || dY > 8) {
                        state.topSwipeData.confirmed = true;
                        let md = window.innerHeight * 0.6;
                        let cd = Math.max(0, Math.min(md, dY));
                        let zr = state.defaultZoom - state.topSwipeData.startTimeViewZoom;
                        state.zoomLevel = Math.max(state.MIN_ZOOM, Math.min(state.defaultZoom, state.topSwipeData.startZoom - (cd/md) * zr));
                        state.applyZoom();
                    }
                    return;
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.active &&
                    state.bottomSwipeData.pointerId === e.pointerId && state.activePointerIds.size === 1) {
                    let deltaY = state.bottomSwipeData.startY - e.clientY;
                    if (deltaY < -5 && e.clientY < state.bottomSwipeData.minY) {
                        state.bottomSwipeData.minY = e.clientY;
                    }
                    if (deltaY > 3 && !state.bottomSwipeData.confirmed) {
                        state.bottomSwipeData.confirmed = true;
                    }
                    if (state.bottomSwipeData.confirmed || deltaY > 8) {
                        state.bottomSwipeData.confirmed = true;
                        // 有上滑意图: 立即隐藏原生DOM
                        let tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; }
                        state.syncTimeSpriteTexture();
                        let screenH = window.innerHeight;
                        let maxDelta = screenH * 0.7;
                        let clampedDelta = Math.max(0, Math.min(maxDelta, deltaY));
                        let zoomRange = state.defaultZoom - state.timeViewZoom;
                        let targetZ = state.bottomSwipeData.startZoom + (clampedDelta / maxDelta) * zoomRange * 1.3;
                        targetZ = Math.max(state.timeViewZoom, Math.min(state.defaultZoom * 1.3, targetZ));
                        state.zoomLevel = targetZ;
                        state.applyZoom();
                    }
                    if (e.clientY < state.bottomSwipeData.minY) {
                        state.bottomSwipeData.minY = e.clientY;
                    }
                    return;
                }
                // 取消上滑手势：跟手拉远
                if (state.cancelSwipeData && state.cancelSwipeData.active &&
                    state.cancelSwipeData.pointerId === e.pointerId && state.activePointerIds.size === 1) {
                    state.cancelSwipeData.confirmed = true;
                    let dy = state.cancelSwipeData.startY - e.clientY;  // positive = swipe up (zoom out)
                    let maxD = window.innerHeight * 0.6;
                    let cd = Math.max(-maxD, Math.min(maxD, dy));
                    let targetZoom = state.cancelableAction ? state.cancelableAction.zoomTarget : state.defaultZoom;
                    let zrUp = Math.max(1, state.defaultZoom - targetZoom);  // zoom-out range
                    let zrDown = Math.max(0.01, state.cancelSwipeData.startZoom - targetZoom);  // zoom-in range
                    let newZ;
                    if (cd >= 0) {
                        // 上滑无上限
                        newZ = state.cancelSwipeData.startZoom + (cd/maxD) * zrUp * 2;
                    } else {
                        // 下滑无下限
                        newZ = state.cancelSwipeData.startZoom + (cd/maxD) * zrDown * 2;
                        newZ = Math.max(state.MIN_ZOOM, newZ);
                    }
                    state.zoomLevel = newZ;
                    state.applyZoom();
                    return;
                }
                if (!state.isInTimeView && (!state.hasMoved || state.activePointerIds.size !== 1)) checkHover(e);
                // 持续追踪长按目标
                if (!state.isDragging || state.activePointerIds.size !== 1 || state.isInTimeView) {
                    return;
                }
                let curr = new THREE.Vector2(e.clientX, e.clientY);
                let dist = Math.sqrt(state.prevScreen.distanceToSquared(curr));
                if (!state.hasMoved && dist > state.DRAG_THRESHOLD) {
                    state.hasMoved = true;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = 'grabbing';
                    state.recentSpeeds = [];
                }
                if (!state.hasMoved || dist < 0.5) return;
                let deltaQ;
                if (state.layoutMode === 'flatring' || state.layoutMode === 'waterfall') {
                    let dx = curr.x - state.prevScreen.x;
                    let dy = curr.y - state.prevScreen.y;
                    deltaQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -dx * 0.001);
                    // 瀑布流支持平移（上下拖动）
                    if (state.layoutMode === 'waterfall' && Math.abs(dy) > 1) {
                        // 平移整个 sphereGroup
                        state.sphereGroup.position.y += dy * 0.005 * state.zoomLevel;
                        state.sphereGroup.position.x -= dx * 0.005 * state.zoomLevel;
                    }
                } else {
                    let p0 = state.screenToSphere(state.prevScreen.x, state.prevScreen.y);
                    let p1 = state.screenToSphere(curr.x, curr.y);
                    deltaQ = new THREE.Quaternion().setFromUnitVectors(p0, p1);
                    if (state.layoutMode === 'ring') {
                        let euler = new THREE.Euler().setFromQuaternion(deltaQ);
                        deltaQ.setFromEuler(new THREE.Euler(euler.x * 0.25, 0, 0));
                    } else if (state.layoutMode === 'hbar') {
                        let euler = new THREE.Euler().setFromQuaternion(deltaQ);
                        deltaQ.setFromEuler(new THREE.Euler(0, euler.y * 0.25, 0));
                    }
                }
                state.rotationQuat.premultiply(deltaQ);
                state.rotationQuat.normalize();
                state.sphereGroup.quaternion.copy(state.rotationQuat);
                let speed = quatAngle(deltaQ);
                state.recentSpeeds.push(speed);
                if (state.recentSpeeds.length > state.SPEED_SAMPLES) state.recentSpeeds.shift();
                state.inertiaQ.copy(deltaQ);
                state.prevScreen.copy(curr);
            }
            let onPointerUp = (e) => {
                if (state.contextMenuOpen) { state.activePointerIds.delete(e.pointerId); if (state.activePointerIds.size===0) document.body.style.cursor='default'; return; }
                                if (state.cancelSwipeData && state.cancelSwipeData.pointerId === e.pointerId && state.cancelSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    let sd = state.cancelSwipeData; state.cancelSwipeData = null;
                    if (sd.confirmed && state.cancelableAction && !state.cancelableAction.cancelled) {
                        // 上滑超过35% → 取消展开；下滑超过35% → 直接打开
                        let progressUp = (state.zoomLevel - sd.startZoom) / Math.max(0.001, state.defaultZoom - sd.startZoom);
                        let progressDown = (sd.startZoom - state.zoomLevel) / Math.max(0.001, sd.startZoom - (state.cancelableAction.zoomTarget || state.defaultZoom));
                        if (state.zoomLevel >= sd.startZoom && progressUp > 0.35) {
                            // 上滑超过阈值：取消
                            state.cancelCurrentAction('swipe');
                        } else if (state.zoomLevel < sd.startZoom && progressDown > 0.35) {
                            // 下滑超过阈值：直接完成展开
                            state.cancelZoomAnimation();
                            state.startZoomAnimation(state.cancelableAction.zoomTarget, 150, function() {
                                state.zoomLevel = state.cancelableAction.zoomTarget; state.applyZoom();
                                if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                    state.cancelableAction.zoomDone = true; state.tryCommitCancelable();
                                }
                            });
                            let targetSprite = state.cancelableAction.sprite;
                            let targetDir = targetSprite.position.clone().normalize();
                            let targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            state.startRotationAnimation(targetQuat, 150, function() {
                                if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                    state.cancelableAction.rotDone = true; state.tryCommitCancelable();
                                }
                            });
                        } else {
                            // 没超过阈值：弹回继续展开
                            if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
                            state.startZoomAnimation(state.cancelableAction.zoomTarget, state.ANIM_DURATION, function() {
                                state.zoomLevel = state.cancelableAction.zoomTarget; state.applyZoom();
                                if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                    state.cancelableAction.zoomDone = true; state.tryCommitCancelable();
                                }
                            });
                            let targetSprite = state.cancelableAction.sprite;
                            let targetDir = targetSprite.position.clone().normalize();
                            let targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            state.startRotationAnimation(targetQuat, state.ANIM_DURATION, function() {
                                if (state.cancelableAction && !state.cancelableAction.cancelled) {
                                    state.cancelableAction.rotDone = true; state.tryCommitCancelable();
                                }
                            });
                        }
                    }
                    return;
                }
                if (!state.isInTimeView && state.topSwipeData && state.topSwipeData.pointerId === e.pointerId && state.topSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    let sd = state.topSwipeData; state.topSwipeData = null;
                    if (sd.confirmed && state.zoomLevel <= sd.startTimeViewZoom + (state.defaultZoom - sd.startTimeViewZoom) * 0.5) {
                        state.returnToTimeView();
                        return;
                    } else {
                        state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() { state.zoomLevel = state.defaultZoom; state.applyZoom(); });
                        state.isDragging = true;
                        state.hasMoved = false;
                        state.updateMouse(e.clientX, e.clientY);
                        state.raycaster.setFromCamera(state.mouse, state.camera);
                        let hits = state.raycaster.intersectObjects(state.sprites);
                        hits = hits.filter(function(h) { return !h.object.userData.isDecor; });
                        if (hits.length > 0) {
                            state.hoveredSprite = hits[0].object;
                        } else {
                        }
                    }
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId && state.bottomSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    let swipeData = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    document.body.style.cursor = 'default';
                    if (swipeData.confirmed) {
                        let currentZoom = state.zoomLevel;
                        let zoomRange = state.defaultZoom - state.timeViewZoom;
                        let thresholdZoom = state.timeViewZoom + zoomRange * state.exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            state.exitTimeView(true, function() {
                                state.inertiaStrength = 0.4;
                                state.infiniteInertia = true;
                                let spinAxis;
                                if (state.layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                                else spinAxis = new THREE.Vector3(1, 0, 0);
                                let smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                                state.inertiaQ.copy(smallQ);
                            });
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION, function() {
                                state.zoomLevel = state.timeViewZoom;
                                state.applyZoom();
                                // 恢复原生时间覆盖层
                                let tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; }
                                state.syncTimeSpriteTexture();
                            });
                        }
                    } else {
                        if (Math.abs(state.zoomLevel - state.timeViewZoom) > 0.02) {
                            state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION, function() {
                                state.zoomLevel = state.timeViewZoom;
                                state.applyZoom();
                                let tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; }
                                state.syncTimeSpriteTexture();
                            });
                        } else {
                            let tp = document.getElementById('time-page');
                            if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; }
                        }
                    }
                    if (state.activePointerIds.size === 0) {
                        document.body.style.cursor = 'default';
                    }
                    return;
                }
                state.activePointerIds.delete(e.pointerId);
                clearLongPressTimer();
                // 点击菜单外部时关闭
                let menu = document.getElementById('context-menu');
                if (menu && menu.style.display !== 'none' && e.target !== menu && !menu.contains(e.target)) {
                    hideContextMenu();
                }
                if (state.activePointerIds.size === 0) {
                    if (state.isDragging && !state.hasMoved && state.hoveredSprite && !state.isInTimeView && !state.longPressFired) {
                        state.lastTapOnIcon = true;
                                                                        let app = state.getAppBySprite(state.hoveredSprite);
                        let targetDir = state.hoveredSprite.position.clone().normalize();
                        let targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        let appZoom = state.computeTimeViewZoom();
                        if (app && app.packageName === '__settings__') {
                            window._lastSettingsClick = Date.now();
                                                        state.startCancelableAction(state.hoveredSprite, targetQuat, appZoom, function() {
                                let saved = {};
                                try { saved = JSON.parse(localStorage.getItem('vibe-settings') || '{}'); } catch(e) {}
                                let iconInput = document.getElementById('s-icon');
                                if (saved.iconRes && iconInput) iconInput.value = saved.iconRes;
                                let sphereInput = document.getElementById('settings-sphere-input');
                                if (saved.sphereSize && sphereInput) sphereInput.value = parseFloat(saved.sphereSize);
                                let animInput = document.getElementById('settings-anim-input');
                                if (saved.animSpeed && animInput) animInput.value = saved.animSpeed;
                                else if (animInput) animInput.value = state.ANIM_DURATION;
                                let hotreloadCb = document.getElementById('s-hotreload');
                                if (hotreloadCb) hotreloadCb.checked = !!(saved.hotReload);
                                if (saved.layoutMode) {
                                    let radios = document.getElementsByName('state.layoutMode');
                                    for (let ri = 0; ri < radios.length; ri++) {
                                        if (radios[ri].value === saved.layoutMode) radios[ri].checked = true;
                                    }
                                }
                                document.getElementById('settings-overlay').style.display = 'flex';
                                state.canvas.style.pointerEvents = "none";
                            });
                        } else if (app && app.packageName === '__time__') {
                            state.returnToTimeView();
                        } else if (app && !state.isInTimeView) {
                            state.startCancelableAction(state.hoveredSprite, targetQuat, appZoom, function() {
                                if (app && state.nativeBridgeReady) {
                                    try { if (window._trackAppLaunch) window._trackAppLaunch(app.packageName); } catch(_){}
                                    try { if (window._flashAppColor) window._flashAppColor(app.packageName); } catch(_){}
                                    try {
                                        let result = JSON.parse(NativeBridge.launchApp(app.packageName));
                                        if (result && !result.success) console.warn('启动失败:', result.error);
                                    } catch (err) { console.error('启动应用异常:', err); }
                                }
                            });
                        }
                    }
                    if (state.isDragging && state.hasMoved && !state.isInTimeView) startInertiaFromSpeeds();
                    state.isDragging = false;
                    state.hasMoved = false;
                    document.body.style.cursor = state.hoveredSprite ? 'pointer' : 'grab';
                }
            }
            let onPointerLeave = (e) => {
                if (state.activePointerIds.has(e.pointerId) && state.activePointerIds.size === 1 && state.isDragging && !state.hasMoved && !state.isInTimeView) {
                    clearHover();
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId && state.bottomSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    let bsd = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    if (bsd.confirmed && state.zoomLevel > state.timeViewZoom + 0.1) {
                        let currentZoom = state.zoomLevel;
                        let zoomRange = state.defaultZoom - state.timeViewZoom;
                        let thresholdZoom = state.timeViewZoom + zoomRange * state.exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            state.exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION);
                        }
                    } else {
                        state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION);
                    }
                    document.body.style.cursor = 'default';
                }
            }
            let onPointerCancel = (e) => {
                state.activePointerIds.delete(e.pointerId);
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId) {
                    let bsd = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    if (bsd.confirmed && state.zoomLevel > state.timeViewZoom + 0.1) {
                        let currentZoom = state.zoomLevel;
                        let zoomRange = state.defaultZoom - state.timeViewZoom;
                        let thresholdZoom = state.timeViewZoom + zoomRange * state.exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            state.exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION);
                        }
                    } else {
                        state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION);
                    }
                }
                if (state.activePointerIds.size === 0) {
                    state.isDragging = false;
                    state.hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = state.isInTimeView ? 'default' : 'grab';
                }
            }
            // ========== 缩放 ==========
            let onWheel = (e) => {
                if (state.isInTimeView) return;
                if (e.cancelable) e.preventDefault();
                state.zoomLevel += e.deltaY * 0.01;
                state.zoomLevel = Math.max(state.MIN_ZOOM, state.zoomLevel);
                state.applyZoom();
            }
let pinchStartDist = 0, pinchStartZoom = state.zoomLevel, wasPinching = false;
            state.wasPinching = wasPinching;
            let getTouchDist = (touches) => {
let dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }
            let onTouchStart = (e) => {
                if (e.touches.length === 2) {
                    pinchStartDist = getTouchDist(e.touches);
                    pinchStartZoom = state.zoomLevel;
                    state.isDragging = false;
                    state.hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    state.wasPinching = true;
                    state.cancelZoomAnimation();
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    state.activePointerIds.clear();
                }
            }
            let onTouchMove = (e) => {
                if (e.touches.length === 2) {
                    if (e.cancelable) e.preventDefault();
                    let dist = getTouchDist(e.touches);
                    if (pinchStartDist > 0) {
                        let ratio = pinchStartDist / dist;
                        state.zoomLevel = pinchStartZoom * ratio;
                        state.zoomLevel = Math.max(state.MIN_ZOOM, state.zoomLevel);
                        if (state.isInTimeView) {
                            state.zoomLevel = Math.max(state.timeViewZoom, state.zoomLevel);
                        }
                        state.applyZoom();
                    }
                }
            }
            let onTouchEnd = (e) => {
                // ====== 双击复位检测 ======
                if (!state.isInTimeView && !state.wasPinching && e.touches.length === 0) {
                    let now = Date.now();
                    if (now - state.lastTap < 300 && !state.isDragging && !state.lastTapOnIcon && !state._prevTapOnIcon) {
                        if (e.changedTouches && e.changedTouches[0]) {
                            let dx = e.changedTouches[0].clientX - state.lastTapX;
                            let dy = e.changedTouches[0].clientY - state.lastTapY;
                            if (dx * dx + dy * dy > 2500) {
                                state.lastTap = now;
                                state.lastTapX = e.changedTouches[0].clientX;
                                state.lastTapY = e.changedTouches[0].clientY;
                                state.lastTapOnIcon = true;
                                return;
                            }
                        }
                        state.rotationQuat.identity();
                        state.sphereGroup.quaternion.identity();
                        state.inertiaQ.identity();
                        state.inertiaStrength = 0;
                        state.zoomLevel = state.defaultZoom;
                        state.applyZoom();
                        state.lastTap = 0;
                        return;
                    }
                    state.lastTap = now;
                    if (e.changedTouches && e.changedTouches[0]) {
                        state.lastTapX = e.changedTouches[0].clientX;
                        state.lastTapY = e.changedTouches[0].clientY;
                    }
                    state.lastTapOnIcon = false;
                    state._prevTapOnIcon = state.lastTapOnIcon;
                }
                if (e.touches.length < 2) {
                    if (state.wasPinching && state.isInTimeView && state.zoomLevel > state.timeViewZoom + 0.15) {
                        let zoomRange = state.defaultZoom - state.timeViewZoom;
                        let thresholdZoom = state.timeViewZoom + zoomRange * state.exitThresholdRatio;
                        if (state.zoomLevel >= thresholdZoom) {
                            state.exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, state.ANIM_DURATION);
                        }
                    }
                    pinchStartDist = 0;
                    state.wasPinching = false;
                }
            }
            
export { checkHover, clearLongPressTimer, showContextMenu, hideContextMenu, clearHover, startInertiaFromSpeeds, resetAllPointers, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onWheel, onTouchStart, onTouchMove, onTouchEnd, getTouchDist, quatAngle, isInBottomZone, isInTopZone };
