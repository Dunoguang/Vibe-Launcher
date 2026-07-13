import * as THREE from 'three/webgpu';
import { state } from './state.js';

// ========== Atlas 尺寸常量 ==========
const SLOT_SIZE = 512;
const PADDING = 4;
const STEP = SLOT_SIZE + PADDING;  // 516

// ========== 应用列表哈希（持久化用） ==========
export function computeAppHash(appList) {
    const pkgs = appList.map(a => a.packageName).sort().join(',');
    let hash = 0;
    for (let i = 0; i < pkgs.length; i++) {
        const c = pkgs.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & hash;
    }
    return hash.toString(16) + '_' + appList.length;
}

export function shouldRebuildAtlas(appList) {
    const saved = localStorage.getItem('vibe-atlas-hash');
    return saved !== computeAppHash(appList);
}

export function saveAtlasState(appList, slots) {
    localStorage.setItem('vibe-atlas-hash', computeAppHash(appList));
    // 轻量存储: 只存 pkg → {c:col, r:row}
    const light = {};
    for (const [pkg, slot] of Object.entries(slots)) {
        light[pkg] = { c: slot.col, r: slot.row };
    }
    localStorage.setItem('vibe-atlas-slotmap', JSON.stringify(light));
}

export function loadAtlasSlotMap() {
    try {
        const raw = localStorage.getItem('vibe-atlas-slotmap');
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

// ========== 判断是否只新增了应用 ==========
export function isAppendOnly(appList, existingSlots) {
    if (!existingSlots || Object.keys(existingSlots).length === 0) return false;
    const existingPkgs = new Set(Object.keys(existingSlots));
    for (const app of appList) {
        if (!existingPkgs.has(app.packageName)) {
            // 找到第一个不在现有槽位里的 → 后面所有都必须是新加的
            // 即: 现有 pkg 应全部出现在 appList 中
            // 检查所有现有 pkg 是否都还在
            const newPkgSet = new Set(appList.map(a => a.packageName));
            for (const ep of existingPkgs) {
                if (!newPkgSet.has(ep)) return false; // 有缺失 → 重建
            }
            return true; // 只有新增，无缺失
        }
    }
    // 完全一样
    return false;
}

// ========== 计算 Atlas Canvas 尺寸 ==========
function computeAtlasSize(numSlots) {
    const cols = Math.ceil(Math.sqrt(numSlots));
    const rows = Math.ceil(numSlots / cols);
    const w = cols * STEP + PADDING;
    const h = rows * STEP + PADDING;
    return { cols, rows, w, h };
}

// ========== 分配槽位 ==========
export function allocateSlot(atlas, packageName) {
    const idx = atlas.usedCount;
    const row = Math.floor(idx / atlas.cols);
    const col = idx % atlas.cols;
    const x = PADDING + col * STEP;
    const y = PADDING + row * STEP;
    const tw = atlas.canvas.width;
    const th = atlas.canvas.height;

    const slot = {
        col, row,
        x, y,
        w: SLOT_SIZE, h: SLOT_SIZE,
        u: x / tw,
        v: y / th,
        u2: (x + SLOT_SIZE) / tw,
        v2: (y + SLOT_SIZE) / th,
    };
    atlas.slots[packageName] = slot;
    atlas.usedCount++;
    return slot;
}

// ========== 从持久化恢复槽位（补全派生字段） ==========
function restoreSlot(atlas, packageName, lightSlot) {
    const { c: col, r: row } = lightSlot;
    const x = PADDING + col * STEP;
    const y = PADDING + row * STEP;
    const tw = atlas.canvas.width;
    const th = atlas.canvas.height;
    const slot = {
        col, row,
        x, y,
        w: SLOT_SIZE, h: SLOT_SIZE,
        u: x / tw,
        v: y / th,
        u2: (x + SLOT_SIZE) / tw,
        v2: (y + SLOT_SIZE) / th,
    };
    atlas.slots[packageName] = slot;
    atlas.usedCount++;
    return slot;
}

// ========== 绘制占位符到 Atlas ==========
export function drawPlaceholderToAtlas(atlas, slot, appName, colorHex) {
    const ctx = atlas.ctx;
    const s = SLOT_SIZE;
    const { x, y } = slot;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.44;

    // 清除区域
    ctx.clearRect(x, y, s, s);

    // 圆形背景
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 描边
    ctx.strokeStyle = (colorHex || '#888888') + 'aa';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 首字母
    const initial = (appName || '?').charAt(0).toUpperCase();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + (s * 0.5) + 'px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (colorHex) {
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = s * 0.1;
    }
    ctx.fillText(initial, cx, cy);
    ctx.shadowBlur = 0;

    atlas.dirty = true;
}

// ========== 绘制真实图标到 Atlas ==========
export function drawIconToAtlas(atlas, slot, img) {
    const ctx = atlas.ctx;
    const s = SLOT_SIZE;
    const { x, y } = slot;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.44;
    const margin = s * 0.04;

    // 清除区域
    ctx.clearRect(x, y, s, s);

    // 圆形裁剪 + 绘制图标
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const imgSize = Math.min(img.width, img.height);
    const sx = (img.width - imgSize) / 2;
    const sy = (img.height - imgSize) / 2;
    ctx.drawImage(img, sx, sy, imgSize, imgSize,
        x + margin, y + margin, s - margin * 2, s - margin * 2);
    ctx.restore();

    // 描边
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    atlas.dirty = true;
}

// ========== 为精灵创建纹理引用 (克隆 + UV偏移) ==========
export function createSpriteTextureRef(atlas, slot) {
    const tex = atlas.baseTexture.clone();
    tex.offset.set(slot.u, slot.v);
    tex.repeat.set(slot.u2 - slot.u, slot.v2 - slot.v);
    return tex;
}

// ========== 提交纹理更新 ==========
export function commitAtlas(atlas) {
    if (atlas.dirty) {
        atlas.baseTexture.needsUpdate = true;
        atlas.dirty = false;
    }
}

// ========== 创建新 Atlas ==========
export function createAtlas(numSlots) {
    const safeNum = Math.max(1, numSlots);
    const { cols, rows, w, h } = computeAtlasSize(safeNum);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 填充纯黑背景（透明也行，但黑色可以兜底）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const baseTexture = new THREE.CanvasTexture(canvas);
    baseTexture.minFilter = THREE.LinearFilter;
    baseTexture.magFilter = THREE.LinearFilter;
    if (baseTexture.colorSpace !== undefined) {
        baseTexture.colorSpace = THREE.SRGBColorSpace;
    }

    return {
        canvas,
        ctx,
        baseTexture,
        cols,
        rows,
        slots: {},       // { packageName → slot }
        usedCount: 0,
        maxSlots: safeNum,
        dirty: false,
    };
}

// ========== 从持久化恢复 Atlas ==========
export function restoreAtlasFromCache(appList) {
    const slotMap = loadAtlasSlotMap();
    if (!slotMap) return null;

    const count = appList.length;
    const atlas = createAtlas(count);
    let restored = 0;

    for (const app of appList) {
        const light = slotMap[app.packageName];
        if (light && light.c !== undefined && light.r !== undefined) {
            restoreSlot(atlas, app.packageName, light);
            restored++;
        }
    }

    // 如果恢复的槽位数不匹配，返回 null 触发重建
    if (restored !== count) {
        disposeAtlas(atlas);
        return null;
    }

    return atlas;
}

// ========== 重置 Atlas（重绘所有占位符） ==========
export function redrawAllPlaceholders(atlas, appList, placeholderColors) {
    // 清除整个 canvas
    const ctx = atlas.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, atlas.canvas.width, atlas.canvas.height);

    atlas.dirty = true;

    for (let i = 0; i < appList.length; i++) {
        const app = appList[i];
        const slot = atlas.slots[app.packageName];
        if (slot) {
            const color = placeholderColors[i % placeholderColors.length];
            drawPlaceholderToAtlas(atlas, slot, app.appName, color);
        }
    }

    commitAtlas(atlas);
}

// ========== 为新增应用分配槽位并绘制占位符 ==========
export function appendNewApps(atlas, appList, placeholderColors) {
    const existingPkgs = new Set(Object.keys(atlas.slots));
    const added = [];

    for (let i = 0; i < appList.length; i++) {
        const app = appList[i];
        if (!existingPkgs.has(app.packageName)) {
            const slot = allocateSlot(atlas, app.packageName);
            const color = placeholderColors[i % placeholderColors.length];
            drawPlaceholderToAtlas(atlas, slot, app.appName, color);
            added.push(app);
        }
    }

    if (added.length > 0) {
        commitAtlas(atlas);
    }

    return added;
}

// ========== 释放 Atlas ==========
export function disposeAtlas(atlas) {
    if (atlas) {
        if (atlas.baseTexture) atlas.baseTexture.dispose();
        atlas.canvas = null;
        atlas.ctx = null;
        atlas.baseTexture = null;
        atlas.slots = {};
    }
}

// ========== 清理持久化状态 ==========
export function clearAtlasCache() {
    localStorage.removeItem('vibe-atlas-hash');
    localStorage.removeItem('vibe-atlas-slotmap');
}
