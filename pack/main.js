// === Entry Point ===
import './src/setup.js';
import { initControlCenter } from './src/control-center.js';

// 控制中心在 NativeBridge 就绪后初始化
if (window.NativeBridge) {
    initControlCenter();
} else {
    const checkBridge = setInterval(() => {
        if (window.NativeBridge) {
            clearInterval(checkBridge);
            initControlCenter();
        }
    }, 100);
}
