import * as THREE from 'three/webgpu';
export async function initScene(loadingEl) {
    const scene = new THREE.Scene();
    const FAR_PLANE = 1e8;
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, FAR_PLANE);
    let renderer = null;
    let rendererType = 'unknown';
    if (typeof THREE.WebGPURenderer !== 'undefined') {
        try {
            renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
            await renderer.init();
            rendererType = 'WebGPU';
        } catch(e) {
            renderer = null;
        }
    }
    if (!renderer) {
        loadingEl.textContent = '不支持3D渲染，请使用支持的设备';
        loadingEl.style.display = 'flex';
        return null;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (renderer.outputColorSpace !== undefined) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    document.body.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    const sphereGroup = new THREE.Group();
    scene.add(sphereGroup);
    return { scene, camera, renderer, rendererType, canvas, sphereGroup };
}
