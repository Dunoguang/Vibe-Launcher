import * as THREE from 'three/webgpu';
import { state } from './state.js';

// ==================== 鱼眼缩放效果 ====================
// 越靠近中心越大，边缘缩小并隐藏

let fisheyeActive = false;
let lastFisheyeTime = 0;
const FISHEYE_INTERVAL = 16; // ~60fps

export function initFisheye() {
    fisheyeActive = true;
    updateFisheye();
}

export function updateFisheye() {
    if (!fisheyeActive || !state.sprites || state.sprites.length === 0) return;
    if (state.isInTimeView) return;

    const now = performance.now();
    if (now - lastFisheyeTime < FISHEYE_INTERVAL) return;
    lastFisheyeTime = now;

    // 获取相机方向和屏幕中心
    const camera = state.camera;
    if (!camera) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const screenCenter = new THREE.Vector2(0, 0); // NDC center

    state.sprites.forEach(function(sprite) {
        if (!sprite || !sprite.userData) return;
        if (sprite.userData.isDecor) return;

        const baseScale = sprite.userData.baseScale || state.BASE_SCALE;

        // 获取精灵的世界坐标
        const worldPos = new THREE.Vector3();
        sprite.getWorldPosition(worldPos);

        // 投影到屏幕坐标
        const projected = worldPos.clone().project(camera);

        // 计算到屏幕中心的距离 (NDC空间, 0-1)
        const dx = projected.x;
        const dy = projected.y * (w / h); // 修正纵横比
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 鱼眼缩放曲线：中心=1.3倍，边缘=0.3倍
        // 使用高斯衰减
        const sigma = 0.8; // 控制衰减速度
        const gaussian = Math.exp(-(dist * dist) / (2 * sigma * sigma));

        // 缩放范围：0.3 ~ 1.3
        const minScale = 0.25;
        const maxScale = 1.4;
        const scale = minScale + (maxScale - minScale) * gaussian;

        // 应用缩放
        const finalScale = baseScale * scale;
        sprite.scale.set(finalScale, finalScale, 1);

        // 边缘透明度衰减
        if (dist > 1.2) {
            sprite.material.opacity = Math.max(0, 1 - (dist - 1.2) * 2);
        } else {
            sprite.material.opacity = 1;
        }
    });
}

export function stopFisheye() {
    fisheyeActive = false;
    // 恢复所有精灵的原始缩放
    if (state.sprites) {
        state.sprites.forEach(function(sprite) {
            if (!sprite || !sprite.userData) return;
            const baseScale = sprite.userData.baseScale || state.BASE_SCALE;
            sprite.scale.set(baseScale, baseScale, 1);
            sprite.material.opacity = 1;
        });
    }
}

// 在动画循环中调用
export function fisheyeTick() {
    if (fisheyeActive && !state.isInTimeView && state.layoutMode === 'waterfall') {
        updateFisheye();
    }
}
