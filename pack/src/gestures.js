import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { materialEasing } from './utils.js';

// === Gesture Functions ===
            const checkHover = (e) => {
                if (state.isInTimeView) return;
                state.raycaster.setFromCamera(state.mouse, state.camera);
                const intersects = state.raycaster.intersectObjects(state.sprites);
                let newHovered = null;
                for (let hi = 0; hi < intersects.length; hi++) {
                    if (intersects[hi].object.userData.isDecor) continue;
                    newHovered = intersects[hi].object;
                    break;
                }
                if (state.hoveredSprite !== newHovered) {
                    if (newHovered) {
                        document.body.style.cursor = 'pointer';
                        const app = state.getAppBySprite(newHovered);
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

            const clearLongPressTimer = () => {
                if (state.longPressTimer) { clearTimeout(state.longPressTimer); state.longPressTimer = null; }
                
            }
            const showContextMenu = (sprite, x, y) => {
                const menu = document.getElementById('context-menu');
                if (!menu) return;
                const app = state.getAppBySprite(sprite);
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

            const startInertiaFromSpeeds = () => {
                if (state.recentSpeeds.length > 0) {
                    let sum = 0;
                    for (let i = 0; i < state.recentSpeeds.length; i++) sum += state.recentSpeeds[i];
                    state.inertiaStrength = Math.min(1.5, Math.max(0.3, (sum / state.recentSpeeds.length) * 80));
                } else state.inertiaStrength = 0.6;
                state.recentSpeeds = [];
            }

            const resetAllPointers = () => {
                state.activePointerIds.clear();
                state.isDragging = false;
                state.hasMoved = false;
                state.bottomSwipeData = null;
                state.topSwipeData = null;
                document.body.style.cursor = state.isInTimeView ? 'default' : (state.hoveredSprite ? 'pointer' : 'grab');
            }

            const isInBottomZone = (clientY) => {
                return clientY > window.innerHeight * (1 - state.BOTTOM_ZONE_RATIO);
            }
            const isInTopZone = (clientY) => {
                return clientY < window.innerHeight * state.TOP_ZONE_RATIO;
            }

            function onPointerDown(e) { try{NativeBridge.log('PDOWN');}catch(e){}
                // Touch down in time view: hide DOM, start full texture render
                if (state.isInTimeView) {
                    var tp = document.getElementById('time-page');
                    if (tp && tp.style.visibility === 'visible' && tp.style.zIndex === '100') {
                        tp.style.visibility = 'hidden'; tp.style.zIndex = '-1';
                        _pointerDownCount++;
                        syncTimeSpriteTexture();
                    }
                }
                // 可取消动作进行中：上滑跟手取消
                if (cancelableAction && cancelableAction.phase === 'animating') {
                    state.cancelSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: state.zoomLevel, active: true, confirmed: false, startRot: state.sphereGroup.quaternion.clone() };
                    state.activePointerIds.add(e.pointerId);
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
                    state.isDragging = false;
                    state.hasMoved = false;
                    state.longPressFired = false;
                    return;
                }
                state.infiniteInertia = false;
                if (!state.isInTimeView && state.activePointerIds.size === 0 && isInTopZone(e.clientY)) {
                    state.topSwipeData = { pointerId: e.pointerId, startY: e.clientY, startZoom: state.zoomLevel, active: true, confirmed: false, startTimeViewZoom: state.computeTimeViewZoom() };
                    state.activePointerIds.add(e.pointerId);
                    cancelZoomAnimation();
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
                        cancelZoomAnimation();
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
                    const _lpX2 = e.clientX, _lpY2 = e.clientY;
                    clearLongPressTimer();
                    state.longPressFired = false;
                    if (!state.isInTimeView) {
                        state.longPressTimer = setTimeout(function() {
                            NativeBridge.log("lp-timer-fired");
                            state.updateMouse(_lpX2, _lpY2);
                            state.raycaster.setFromCamera(state.mouse, state.camera);
                            let hits = state.raycaster.intersectObjects(state.sprites);
                            hits = hits.filter(function(h) { return !h.object.userData.isDecor; });
                            let spr = hits.length > 0 ? hits[0].object : null;
                            if (spr) {
                                const app = state.getAppBySprite(spr);
                                if (app && app.packageName !== '__settings__' && app.packageName !== '__time__') {
                                    state.longPressFired = true;
                                    state.isDragging = false;
                                    state.hasMoved = false;
                                    contextMenuOpen = true;
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

            const onPointerMove = (e) => {
                if (contextMenuOpen) { state.activePointerIds.delete(e.pointerId); return; }
                // 可取消动作进行中 + 拖动 = 取消
                if (cancelableAction && cancelableAction.phase === 'animating' && state.isDragging && state.hasMoved) {
                    cancelCurrentAction('drag'); state.recentSpeeds = []; state.hasMoved = false; state.isDragging = false; return;
                }
                state.updateMouse(e.clientX, e.clientY);
                if (!state.isInTimeView && state.topSwipeData && state.topSwipeData.active && state.topSwipeData.pointerId === e.pointerId && state.activePointerIds.size === 1) {
                    const dY = e.clientY - state.topSwipeData.startY;
                    if (dY > 3 && !state.topSwipeData.confirmed) state.topSwipeData.confirmed = true;
                    if (state.topSwipeData.confirmed || dY > 8) {
                        state.topSwipeData.confirmed = true;
                        const md = window.innerHeight * 0.6;
                        const cd = Math.max(0, Math.min(md, dY));
                        const zr = state.defaultZoom - state.topSwipeData.startTimeViewZoom;
                        state.zoomLevel = Math.max(state.MIN_ZOOM, Math.min(state.defaultZoom, state.topSwipeData.startZoom - (cd/md) * zr));
                        state.applyZoom();
                    }
                    return;
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.active &&
                    state.bottomSwipeData.pointerId === e.pointerId && state.activePointerIds.size === 1) {
                    const deltaY = state.bottomSwipeData.startY - e.clientY;
                    if (deltaY < -5 && e.clientY < state.bottomSwipeData.minY) {
                        state.bottomSwipeData.minY = e.clientY;
                    }
                    if (deltaY > 3 && !state.bottomSwipeData.confirmed) {
                        state.bottomSwipeData.confirmed = true;
                    }
                    if (state.bottomSwipeData.confirmed || deltaY > 8) {
                        state.bottomSwipeData.confirmed = true;
                        // 有上滑意图: 立即隐藏原生DOM
                        console.log('[TIME-SWIPE] exit intent'); const tp = document.getElementById('time-page');
                        if (tp) { tp.style.visibility = 'hidden'; tp.style.zIndex = '-1'; }
                        syncTimeSpriteTexture();
                        const screenH = window.innerHeight;
                        const maxDelta = screenH * 0.7;
                        const clampedDelta = Math.max(0, Math.min(maxDelta, deltaY));
                        const zoomRange = state.defaultZoom - state.timeViewZoom;
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
                    const dy = state.cancelSwipeData.startY - e.clientY;  // positive = swipe up (zoom out)
                    const maxD = window.innerHeight * 0.6;
                    const cd = Math.max(-maxD, Math.min(maxD, dy));
                    const targetZoom = cancelableAction ? cancelableAction.zoomTarget : state.defaultZoom;
                    const zrUp = Math.max(1, state.defaultZoom - targetZoom);  // zoom-out range
                    const zrDown = Math.max(0.01, state.cancelSwipeData.startZoom - targetZoom);  // zoom-in range
                    var newZ;
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

                const curr = new THREE.Vector2(e.clientX, e.clientY);
                const dist = Math.sqrt(state.prevScreen.distanceToSquared(curr));
                if (!state.hasMoved && dist > state.DRAG_THRESHOLD) {
                    state.hasMoved = true;
                    clearLongPressTimer();
                    clearHover();
                    document.body.style.cursor = 'grabbing';
                    state.recentSpeeds = [];
                }
                if (!state.hasMoved || dist < 0.5) return;
                let deltaQ;
                if (layoutMode === 'flatring') {
                    let dx = curr.x - state.prevScreen.x;
                    deltaQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -dx * 0.001);
                } else {
                    const p0 = screenToSphere(state.prevScreen.x, state.prevScreen.y);
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
                state.sphereGroup.quaternion.copy(rotationQuat);
                const speed = quatAngle(deltaQ);
                state.recentSpeeds.push(speed);
                if (state.recentSpeeds.length > state.SPEED_SAMPLES) state.recentSpeeds.shift();
                state.inertiaQ.copy(deltaQ);
                state.prevScreen.copy(curr);
            }

            const onPointerUp = (e) => {
                if (contextMenuOpen) { state.activePointerIds.delete(e.pointerId); if (state.activePointerIds.size===0) document.body.style.cursor='default'; return; }
                try{NativeBridge.log("PU drag:"+state.isDragging+" move:"+state.hasMoved+" hov:"+!!state.hoveredSprite+" tv:"+state.isInTimeView);}catch(e){}
                if (state.cancelSwipeData && state.cancelSwipeData.pointerId === e.pointerId && state.cancelSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    const sd = state.cancelSwipeData; state.cancelSwipeData = null;
                    if (sd.confirmed && cancelableAction && !cancelableAction.cancelled) {
                        // 上滑超过35% → 取消展开；下滑超过35% → 直接打开
                        var progressUp = (state.zoomLevel - sd.startZoom) / Math.max(0.001, state.defaultZoom - sd.startZoom);
                        var progressDown = (sd.startZoom - state.zoomLevel) / Math.max(0.001, sd.startZoom - (cancelableAction.zoomTarget || state.defaultZoom));
                        if (state.zoomLevel >= sd.startZoom && progressUp > 0.35) {
                            // 上滑超过阈值：取消
                            cancelCurrentAction('swipe');
                        } else if (state.zoomLevel < sd.startZoom && progressDown > 0.35) {
                            // 下滑超过阈值：直接完成展开
                            cancelZoomAnimation();
                            state.startZoomAnimation(cancelableAction.zoomTarget, 150, function() {
                                state.zoomLevel = cancelableAction.zoomTarget; state.applyZoom();
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.zoomDone = true; tryCommitCancelable();
                                }
                            });
                            var targetSprite = cancelableAction.sprite;
                            var targetDir = targetSprite.position.clone().normalize();
                            var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            state.startRotationAnimation(targetQuat, 150, function() {
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.rotDone = true; tryCommitCancelable();
                                }
                            });
                        } else {
                            // 没超过阈值：弹回继续展开
                            if (!state.animFrameId) state.animFrameId = requestAnimationFrame(state.animate);
                            state.startZoomAnimation(cancelableAction.zoomTarget, ANIM_DURATION, function() {
                                state.zoomLevel = cancelableAction.zoomTarget; state.applyZoom();
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.zoomDone = true; tryCommitCancelable();
                                }
                            });
                            var targetSprite = cancelableAction.sprite;
                            var targetDir = targetSprite.position.clone().normalize();
                            var targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                            state.startRotationAnimation(targetQuat, ANIM_DURATION, function() {
                                if (cancelableAction && !cancelableAction.cancelled) {
                                    cancelableAction.rotDone = true; tryCommitCancelable();
                                }
                            });
                        }
                    }
                    return;
                }
                if (!state.isInTimeView && state.topSwipeData && state.topSwipeData.pointerId === e.pointerId && state.topSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    const sd = state.topSwipeData; state.topSwipeData = null;
                    if (sd.confirmed && state.zoomLevel <= sd.startTimeViewZoom + (state.defaultZoom - sd.startTimeViewZoom) * 0.5) {
                        returnToTimeView();
                    } else {
                        state.startZoomAnimation(state.defaultZoom, ANIM_DURATION, function() { state.zoomLevel = state.defaultZoom; state.applyZoom(); });
                    }
                    return;
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId && state.bottomSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    const swipeData = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    document.body.style.cursor = 'default';
                    if (swipeData.confirmed) {
                        const currentZoom = state.zoomLevel;
                        const zoomRange = state.defaultZoom - state.timeViewZoom;
                        const thresholdZoom = state.timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true, function() {
                                state.inertiaStrength = 0.4;
                                state.infiniteInertia = true;
                                let spinAxis;
                                if (layoutMode === 'hbar') spinAxis = new THREE.Vector3(0, 1, 0);
                                else spinAxis = new THREE.Vector3(1, 0, 0);
                                const smallQ = new THREE.Quaternion().setFromAxisAngle(spinAxis, -0.015);
                                state.inertiaQ.copy(smallQ);
                            });
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION, function() {
                                state.zoomLevel = state.timeViewZoom;
                                state.applyZoom();
                                // 恢复原生时间覆盖层
                                const tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
                                syncTimeSpriteTexture();
                            });
                        }
                    } else {
                        if (Math.abs(state.zoomLevel - state.timeViewZoom) > 0.02) {
                            state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION, function() {
                                state.zoomLevel = state.timeViewZoom;
                                state.applyZoom();
                                const tp = document.getElementById('time-page');
                                if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
                                syncTimeSpriteTexture();
                            });
                        } else {
                            const tp = document.getElementById('time-page');
                            if (tp) { tp.style.visibility = 'visible'; tp.style.zIndex = '100'; console.log('[TIME-DOM] SHOW'); }
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
                const menu = document.getElementById('context-menu');
                if (menu && menu.style.display !== 'none' && e.target !== menu && !menu.contains(e.target)) {
                    hideContextMenu();
                }
                if (state.activePointerIds.size === 0) {
                    if (state.isDragging && !state.hasMoved && state.hoveredSprite && !state.isInTimeView && !state.longPressFired) {
                        state.lastTapOnIcon = true;
                        try { NativeBridge.log('click-detect:' + (state.getAppBySprite(state.hoveredSprite)||{}).packageName); } catch(e) {}
                        const a=state.getAppBySprite(state.hoveredSprite); try{NativeBridge.log("CLICK:"+(a?a.packageName:"null"));}catch(e){}
                        const app = state.getAppBySprite(state.hoveredSprite);
                        const targetDir = state.hoveredSprite.position.clone().normalize();
                        const targetQuat = new THREE.Quaternion().setFromUnitVectors(targetDir, new THREE.Vector3(0, 0, 1));
                        const appZoom = state.computeTimeViewZoom();
                        if (app && app.packageName === '__settings__') {
                            window._lastSettingsClick = Date.now();
                            try { NativeBridge.log('settings clicked'); } catch(e) {}
                            startCancelableAction(state.hoveredSprite, targetQuat, appZoom, function() {
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
                                state.canvas.style.pointerEvents = "none";
                            });
                        } else if (app && app.packageName === '__time__') {
                            returnToTimeView();
                        } else if (app && !state.isInTimeView) {
                            startCancelableAction(state.hoveredSprite, targetQuat, appZoom, function() {
                                if (app && state.nativeBridgeReady) {
                                    try {
                                        const result = JSON.parse(NativeBridge.launchApp(app.packageName));
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

            const onPointerLeave = (e) => {
                if (state.activePointerIds.has(e.pointerId) && state.activePointerIds.size === 1 && state.isDragging && !state.hasMoved && !state.isInTimeView) {
                    clearHover();
                }
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId && state.bottomSwipeData.active) {
                    state.activePointerIds.delete(e.pointerId);
                    const bsd = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    if (bsd.confirmed && state.zoomLevel > state.timeViewZoom + 0.1) {
                        const currentZoom = state.zoomLevel;
                        const zoomRange = state.defaultZoom - state.timeViewZoom;
                        const thresholdZoom = state.timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION);
                        }
                    } else {
                        state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION);
                    }
                    document.body.style.cursor = 'default';
                }
            }

            const onPointerCancel = (e) => {
                state.activePointerIds.delete(e.pointerId);
                if (state.isInTimeView && state.bottomSwipeData && state.bottomSwipeData.pointerId === e.pointerId) {
                    const bsd = state.bottomSwipeData;
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    if (bsd.confirmed && state.zoomLevel > state.timeViewZoom + 0.1) {
                        const currentZoom = state.zoomLevel;
                        const zoomRange = state.defaultZoom - state.timeViewZoom;
                        const thresholdZoom = state.timeViewZoom + zoomRange * exitThresholdRatio;
                        if (currentZoom >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION);
                        }
                    } else {
                        state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION);
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
            const onWheel = (e) => {
                if (state.isInTimeView) return;
                if (e.cancelable) e.preventDefault();
                state.zoomLevel += e.deltaY * 0.01;
                state.zoomLevel = Math.max(state.MIN_ZOOM, state.zoomLevel);
                state.applyZoom();
            }

let pinchStartDist = 0, pinchStartZoom = state.zoomLevel, wasPinching = false;
            state.wasPinching = wasPinching;

            const getTouchDist = (touches) => {
let dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }

            const onTouchStart = (e) => {
                if (e.touches.length === 2) {
                    pinchStartDist = getTouchDist(e.touches);
                    pinchStartZoom = state.zoomLevel;
                    state.isDragging = false;
                    state.hasMoved = false;
                    clearLongPressTimer();
                    clearHover();
                    state.wasPinching = true;
                    cancelZoomAnimation();
                    state.bottomSwipeData = null;
                state.topSwipeData = null;
                    state.activePointerIds.clear();
                }
            }

            const onTouchMove = (e) => {
                if (e.touches.length === 2) {
                    if (e.cancelable) e.preventDefault();
                    const dist = getTouchDist(e.touches);
                    if (pinchStartDist > 0) {
                        const ratio = pinchStartDist / dist;
                        state.zoomLevel = pinchStartZoom * ratio;
                        state.zoomLevel = Math.max(state.MIN_ZOOM, state.zoomLevel);
                        if (state.isInTimeView) {
                            state.zoomLevel = Math.max(state.timeViewZoom, state.zoomLevel);
                        }
                        state.applyZoom();
                    }
                }
            }

            const onTouchEnd = (e) => {
                if (e.touches.length < 2) {
                    if (state.wasPinching && state.isInTimeView && state.zoomLevel > state.timeViewZoom + 0.15) {
                        const zoomRange = state.defaultZoom - state.timeViewZoom;
                        const thresholdZoom = state.timeViewZoom + zoomRange * exitThresholdRatio;
                        if (state.zoomLevel >= thresholdZoom) {
                            exitTimeView(true);
                        } else {
                            state.startZoomAnimation(state.timeViewZoom, ANIM_DURATION);
                        }
                    }
                    pinchStartDist = 0;
                    if (wasPinching) setTimeout(async function() { state.wasPinching = false; }, 400);
                }
            }

            