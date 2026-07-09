import * as THREE from 'three/webgpu';
import { state } from './state.js';
import { BASE_SCALE, FOV_RAD } from './config.js';
import { materialEasing } from './utils.js';

            export const computeInitDistance = () => {
                const w = window.innerWidth;
                let h = window.innerHeight;
                const shortEdgeFactor = Math.min(1, w / h);
                const minVisible = state.SPHERE_DIAMETER / (2 * Math.tan(FOV_RAD / 2) * shortEdgeFactor);
                return minVisible * 1.15;
            }

            export function applyZoom() { state.camera.position.z = state.zoomLevel; }
            state.applyZoom = function() { state.camera.position.z = state.zoomLevel; };


            export const computeTimeViewZoom = () => {
                const R = BASE_SCALE * 0.44;
                const fovHalfRad = THREE.MathUtils.degToRad(state.camera.fov / 2);
                const aspect = window.innerWidth / window.innerHeight;
                const halfDiagonalNDC = Math.sqrt(aspect * aspect + 1);
                const distance = R / (Math.tan(fovHalfRad) * halfDiagonalNDC);
                return state.SPHERE_RADIUS + distance;
            }
            state.computeTimeViewZoom = computeTimeViewZoom;

            export const startCancelableAction = (sprite, rotTarget, zoomTarget, onCommit) => {
                state.cancelSwipeData = null; if (state.cancelableAction) cancelCurrentAction('superseded');
                state.cancelableAction = {
                    sprite: sprite, onCommit: onCommit, phase: 'animating',
                    rotDone: false, zoomDone: false, cancelled: false,
                    zoomTarget: zoomTarget
                };
                state.inertiaQ.identity(); state.inertiaStrength = 0; state.infiniteInertia = false;
                state.startRotationAnimation(rotTarget, state.ANIM_DURATION, function() {
                    if (state.cancelableAction && !state.cancelableAction.cancelled) {
                        state.cancelableAction.rotDone = true; tryCommitCancelable();
                    }
                });
                state.startZoomAnimation(state.zoomTarget, state.ANIM_DURATION, function() {
                    state.zoomLevel = state.zoomTarget; state.applyZoom();
                    if (state.cancelableAction && !state.cancelableAction.cancelled) {
                        state.cancelableAction.zoomDone = true; tryCommitCancelable();
                    }
                });
            }
            state.startCancelableAction = startCancelableAction;

            export function tryCommitCancelable() {
                const a = state.cancelableAction;
                if (!a || a.cancelled || a.phase !== 'animating') return;
                if (a.rotDone && a.zoomDone) {
                    a.phase = 'committed';
                    const cb = a.onCommit; state.cancelableAction = null;
                    if (cb) cb();
                }
            }
            state.tryCommitCancelable = tryCommitCancelable;

            export function cancelCurrentAction(reason) { state.cancelSwipeData = null;
                if (!state.cancelableAction || state.cancelableAction.cancelled) return;
                state.cancelableAction.cancelled = true;
                try { NativeBridge.log('cancel:' + reason); } catch(e) {}
                cancelZoomAnimation();
                state.startZoomAnimation(state.defaultZoom, state.ANIM_DURATION, function() {
                    state.zoomLevel = state.defaultZoom; state.applyZoom();
                });
                state.cancelableAction = null;
            }
            state.cancelCurrentAction = cancelCurrentAction;

            export function startZoomAnimation(targetVal, duration, callback) {
                state.zoomAnimStart = performance.now();
                state.wakeUp();
                state.zoomAnimDuration = duration || 250;
                state.zoomAnimStartVal = state.zoomLevel;
                state.zoomAnimEndVal = targetVal;
                state.zoomAnimElapsed = 0;
                state.zoomTarget = targetVal;
                state.zoomAnimCallback = callback || null;
            }
            state.startZoomAnimation = startZoomAnimation;

            export function cancelZoomAnimation() {
                state.zoomTarget = null;
                state.zoomAnimStart = null;
                state.zoomAnimDuration = 0;
                state.zoomAnimCallback = null;
            }
            state.cancelZoomAnimation = cancelZoomAnimation;

            export const updateZoomAnimation = (now) => {
                if (state.zoomTarget === null) return;
                state.zoomAnimElapsed = now - state.zoomAnimStart;
                let t = Math.min(1, state.zoomAnimElapsed / state.zoomAnimDuration);
                const eased = materialEasing(t);
                state.zoomLevel = state.zoomAnimStartVal + (state.zoomAnimEndVal - state.zoomAnimStartVal) * eased;
                state.applyZoom();
                if (t >= 1) {
                    state.zoomLevel = state.zoomAnimEndVal;
                    state.applyZoom();
                    const cb = state.zoomAnimCallback;
                    cancelZoomAnimation();
                    if (cb) cb();
                }
            }
            state.updateZoomAnimation = updateZoomAnimation;

            export const updateRotationAnimation = (now) => {
                if (!state.rotationAnimData) return;
                const elapsed = now - state.rotationAnimData.startTime;
                let t = Math.min(1, elapsed / state.rotationAnimData.duration);
                const eased = materialEasing(t);
                state.rotationQuat.copy(state.rotationAnimData.from).slerp(state.rotationAnimData.to, eased);
                state.sphereGroup.quaternion.copy(state.rotationQuat);
                if (t >= 1) {
                    state.rotationQuat.copy(state.rotationAnimData.to);
                    state.sphereGroup.quaternion.copy(state.rotationQuat);
                    const cb = state.rotationAnimData.callback;
                    state.rotationAnimData = null;
                    if (cb) cb();
                }
            }
            state.updateRotationAnimation = updateRotationAnimation;

            export function startRotationAnimation(targetQuat, duration, callback) {
                state.rotationAnimData = {
                    from: state.rotationQuat.clone(),
                    to: targetQuat.clone(),
                    startTime: performance.now(),
                    duration: duration || state.ANIM_DURATION,
                    callback: callback || null
                };
                if (callback && duration <= 0) {
                    state.rotationQuat.copy(targetQuat);
                    state.sphereGroup.quaternion.copy(state.rotationQuat);
                    state.rotationAnimData = null;
                    callback();
                }
            }
            state.startRotationAnimation = startRotationAnimation;

