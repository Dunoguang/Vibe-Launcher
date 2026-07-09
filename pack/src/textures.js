import * as THREE from 'three/webgpu';
import { state } from './state.js';

            export const createGearTexture = () => {
                console.log('createGearTexture size:', state.ICON_RES);
                const s = Math.max(16, state.ICON_RES), ca = document.createElement('canvas');
                ca.width = s; ca.height = s;
                const ctx = ca.getContext('2d'), cx = s/2, cy = s/2, rr = s * 0.44;
                ctx.fillStyle = '#000000';
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = s * 0.012;
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = 'bold ' + (s * 0.45) + 'px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('⚙', cx, cy);
                const tex = new THREE.CanvasTexture(ca);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }

            // ========== 时间纹理 ==========
            // 壁纸缓存
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

            export const drawCircleFrame = function(ctx, cx, cy, r, s) {
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = s * 0.012;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            };

            export const drawCircleBackground = function(ctx, cx, cy, r, s) {
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

            export const drawTimeCircleBackground = function(ctx, cx, cy, r, s) {
                var bg = _timeBgImg || _wallpaperImg;
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

            export const createPlaceholderTexture = (appName, colorHex) => {
                console.log('createPlaceholderTexture', appName, 'size:', state.ICON_RES);
                const s = Math.max(16, state.ICON_RES),
                    c = document.createElement('canvas');
                c.width = s;
                c.height = s;
                const ctx = c.getContext('2d'),
                    cx = s / 2,
                    cy = s / 2,
                    r = s * 0.44;
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = colorHex + 'aa';
                ctx.lineWidth = s * 0.03;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                const initial = (appName || '?').charAt(0).toUpperCase();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold ' + (s * 0.5) + 'px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = colorHex;
                ctx.shadowBlur = s * 0.1;
                ctx.fillText(initial, cx, cy);
                ctx.shadowBlur = 0;
                const tex = new THREE.CanvasTexture(c);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }

            export const createIconTextureFromImage = (img) => {
                const s = 512,
                    cx = s / 2,
                    cy = s / 2,
                    r = s * 0.44,
                    margin = s * 0.04;
                const c2 = document.createElement('canvas');
                c2.width = s;
                c2.height = s;
                const ctx2 = c2.getContext('2d');
                ctx2.beginPath();
                ctx2.arc(cx, cy, r, 0, Math.PI * 2);
                ctx2.clip();
                const imgSize = Math.min(img.width, img.height);
                const sx = (img.width - imgSize) / 2,
                    sy = (img.height - imgSize) / 2;
                ctx2.drawImage(img, sx, sy, imgSize, imgSize, margin, margin, s - margin * 2, s - margin * 2);
                ctx2.beginPath();
                ctx2.arc(cx, cy, r, 0, Math.PI * 2);
                ctx2.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx2.lineWidth = s * 0.025;
                ctx2.stroke();
                const tex = new THREE.CanvasTexture(c2);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            }

            // ========== 精灵管理 ==========
// apps/sprites managed via state

