            const sphereCoulomb = (N, opts = {}) => {
                const { radius = 1, iter = 400, damp = 0.985, dt = 0.03, tol = 1e-6, soft = 0.01 } = opts;
                if (N <= 0) return [];
                if (N === 1) return [[0, 0, radius]];

                const p = Array.from({ length: N }, () => {
                    const u = Math.random() * 2 - 1,
                        th = Math.random() * Math.PI * 2;
                    const r = Math.sqrt(1 - u * u) * radius;
                    return [r * Math.cos(th), u * radius, r * Math.sin(th)];
                });
                const v = Array.from({ length: N }, () => [0, 0, 0]);
                const f = Array.from({ length: N }, () => [0, 0, 0]);

                for (let t = 0; t < iter; t++) {
                    for (let i = 0; i < N; i++) f[i][0] = f[i][1] = f[i][2] = 0;

                    for (let i = 0; i < N; i++) {
                        for (let j = i + 1; j < N; j++) {
                            const dx = p[i][0] - p[j][0],
                                dy = p[i][1] - p[j][1],
                                dz = p[i][2] - p[j][2];
                            const d2 = dx * dx + dy * dy + dz * dz + soft * soft;
                            const k = 1 / (d2 * Math.sqrt(d2));
                            const fx = k * dx,
                                fy = k * dy,
                                fz = k * dz;
                            f[i][0] += fx;
                            f[i][1] += fy;
                            f[i][2] += fz;
                            f[j][0] -= fx;
                            f[j][1] -= fy;
                            f[j][2] -= fz;
                        }
                    }

                    let maxV = 0;
                    for (let i = 0; i < N; i++) {
                        const x = p[i][0],
                            y = p[i][1],
                            z = p[i][2];
                        const len = Math.sqrt(x * x + y * y + z * z);
                        const nx = x / len,
                            ny = y / len,
                            nz = z / len;
                        const dot = f[i][0] * nx + f[i][1] * ny + f[i][2] * nz;
                        const ftx = f[i][0] - dot * nx,
                            fty = f[i][1] - dot * ny,
                            ftz = f[i][2] - dot * nz;

                        v[i][0] = (v[i][0] + ftx * dt) * damp;
                        v[i][1] = (v[i][1] + fty * dt) * damp;
                        v[i][2] = (v[i][2] + ftz * dt) * damp;

                        const spd = Math.sqrt(v[i][0] ** 2 + v[i][1] ** 2 + v[i][2] ** 2);
                        if (spd > maxV) maxV = spd;

                        let px = x + v[i][0] * dt,
                            py = y + v[i][1] * dt,
                            pz = z + v[i][2] * dt;
                        const plen = Math.sqrt(px * px + py * py + pz * pz);
                        p[i][0] = px * radius / plen;
                        p[i][1] = py * radius / plen;
                        p[i][2] = pz * radius / plen;
                    }
                    if (maxV < tol) break;
                }
                return p;
            }
