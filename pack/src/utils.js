            export function cubicBezier(x1, y1, x2, y2) {
              const ZERO = 1e-6;
              function sampleCurveX(t) {
                return ((1 - t) ** 3) * 0 + 3 * ((1 - t) ** 2) * t * x1 + 3 * (1 - t) * (t ** 2) * x2 + (t ** 3) * 1;
              }
              function sampleCurveY(t) {
                return ((1 - t) ** 3) * 0 + 3 * ((1 - t) ** 2) * t * y1 + 3 * (1 - t) * (t ** 2) * y2 + (t ** 3) * 1;
              }
              function sampleDerivX(t) {
                return 3 * ((1 - t) ** 2) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * (t ** 2) * (1 - x2);
              }
              function solveX(x) {
                let t2 = x;
                for (let i = 0; i < 8; i++) {
                  const x2 = sampleCurveX(t2) - x;
                  if (Math.abs(x2) < ZERO) return t2;
                  const d2 = sampleDerivX(t2);
                  if (Math.abs(d2) < ZERO) break;
                  t2 -= x2 / d2;
                }
                let t0 = 0, t1 = 1;
                t2 = x;
                for (let i = 0; i < 8; i++) {
                  const x2 = sampleCurveX(t2) - x;
                  if (Math.abs(x2) < ZERO) return t2;
                  t2 = x2 > 0 ? (t0 = t0, t1 = t2, (t0 + t2) / 2) : (t0 = t2, t1 = t1, (t2 + t1) / 2);
                }
                return t2;
              }
              return function (t) {
                if (t <= 0) return 0;
                if (t >= 1) return 1;
                return sampleCurveY(solveX(t));
              };
            }
            // ★ Material Design 标准曲线
            export const materialEasing = cubicBezier(0.4, 0.0, 0.2, 1);

            export function animateValue({ from, to, duration, easing, onUpdate, onComplete }) {
              const start = performance.now();
              function frame(now) {
                const t = Math.min((now - start) / duration, 1);
                const progress = easing(t);
                const value = from + (to - from) * progress;
                onUpdate(value);
                if (t < 1) requestAnimationFrame(frame);
                else onComplete?.();
              }
              requestAnimationFrame(frame);
            }

            export const easeOutCubic = (t) => { return 1 - Math.pow(1 - t, 3); };
