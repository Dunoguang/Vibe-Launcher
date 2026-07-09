import * as THREE from 'three/webgpu';
import { state } from './state.js';

            export const screenToSphere = (sx, sy) => {
                const rect = state.canvas.getBoundingClientRect();
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

            export const updateMouse = (cx, cy) => {
                const rect = state.canvas.getBoundingClientRect();
                state.mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
                state.mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
            }

            export function getAppBySprite(s) { return s && s.userData ? s.userData.app : null; }

// ========== 事件绑定 ==========
            state.canvas.addEventListener('pointerdown', onPointerDown);
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
            state.canvas.addEventListener('pointerleave', onPointerLeave);
            window.addEventListener('pointercancel', onPointerCancel);
            state.canvas.addEventListener('wheel', onWheel, { passive: false });
            state.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            state.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            state.canvas.addEventListener('touchend', onTouchEnd);
            state.canvas.addEventListener('touchcancel', function(e) {
                onTouchEnd(e);
                resetAllPointers();
            });

            window.addEventListener('touchend', function(e) {
                if (state.isInTimeView) return;
                if (state.wasPinching || e.touches.length > 0) return;
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
                state.camera.aspect = w / h;
                state.camera.updateProjectionMatrix();
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
            export const isBusy = () => {
                return !!state.zoomAnimStart || !!rotationAnimData || inertiaStrength > INERTIA_MIN || isDragging || state._backProgress >= 0;
            };
            export const wakeUp = () => {
                if (!animFrameId) {
                    animFrameId = requestAnimationFrame(animate);
                }
            };
            state.wakeUp = wakeUp;