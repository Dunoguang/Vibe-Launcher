import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { INERTIA_MIN, INERTIA_DECAY, INERTIA_FAST_DECAY, SPEED_SAMPLES, BASE_SCALE, FOV_RAD, HOVER_SCALE, DRAG_THRESHOLD, TOP_ZONE_RATIO, BOTTOM_ZONE_RATIO, LONG_PRESS_MS, MIN_ZOOM } from './config.js';
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
            window.addEventListener('resize', function() {
                const w = window.innerWidth,
                    h = window.innerHeight;
                if (state.renderer && state.camera) {
                    state.renderer.setSize(w, h);
                    state.camera.aspect = w / h;
                    state.camera.updateProjectionMatrix();
                    state.defaultZoom = state.computeInitDistance();
                    state.timeViewZoom = state.computeTimeViewZoom();
                }
                if (!state.isInTimeView && state.zoomTarget === null) {
                    state.zoomLevel = state.defaultZoom;
                    state.applyZoom();
                }
            });
            // ========== 动画循环 ==========
            let animFrameId = null;
            state.animFrameId = animFrameId;
            export const isBusy = () => {
                return !!state.zoomAnimStart || !!state.rotationAnimData || state.inertiaStrength > INERTIA_MIN || state.isDragging || state._backProgress >= 0;
            };
            export const wakeUp = () => {
                if (!state.animFrameId) {
                    state.animFrameId = requestAnimationFrame(state.animate);
                }
            };
            state.wakeUp = wakeUp;
state.updateMouse = updateMouse;
state.getAppBySprite = getAppBySprite;
state.screenToSphere = screenToSphere;
