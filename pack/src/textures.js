import * as THREE from 'three/webgpu';
import { state } from './state.js';
            export let createGearTexture = () => {
                let s = Math.max(16, state.ICON_RES), ca = document.createElement('canvas');
                ca.width = s; ca.height = s;
                let ctx = ca.getContext('2d'), cx = s/2, cy = s/2, rr = s * 0.44;
                ctx.fillStyle = '#000000';
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = s * 0.012;
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = 'bold ' + (s * 0.45) + 'px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('⚙', cx, cy);
                let tex = new THREE.CanvasTexture(ca);
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
                    try { let raw = NativeBridge.getWallpaperPath(); let r = JSON.parse(raw);
                        if (r.success) { document.body.style.backgroundImage = 'url(' + r.path + '?t=' + Date.now() + ')'; let img = new Image(); img.onload = function() { _wallpaperImg = img; state._wallpaperImg = img; state.updateTimeSpriteBgOnly(true); }; img.src = r.path; }
                    } catch(e) {}
                    try { let raw2 = NativeBridge.getTimeBgPath(); let r2 = JSON.parse(raw2);
                        if (r2.success) { let img2 = new Image(); img2.onload = function() { _timeBgImg = img2; state._timeBgImg = img2; state.updateTimeSpriteBgOnly(true); }; img2.src = r2.path; }
                    } catch(e) {}
                    // Update time bg button text after DOM ready
                    setTimeout(function() {
                        let tbb = document.getElementById('s-timebg-pick');
                        if (tbb && _timeBgImg) tbb.textContent = '重新选择';
                    }, 100);
                }
            })();
            export let drawCircleFrame = function(ctx, cx, cy, r, s) {
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = s * 0.012;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            };
            export let drawCircleBackground = function(ctx, cx, cy, r, s) {
                let bg = state._wallpaperImg;
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
            export let drawTimeCircleBackground = function(ctx, cx, cy, r, s) {
                let bg = state._timeBgImg || state._wallpaperImg;
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
