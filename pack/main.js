// === Entry Point ===
import './src/setup.js';
import { initControlCenter } from './src/control-center.js';

console.log("[CC] main.js loaded, NativeBridge:", !!window.NativeBridge);
if (window.NativeBridge) {
    console.log("[CC] calling initControlCenter");
    initControlCenter();
} else {
    const checkBridge = setInterval(() => {
        if (window.NativeBridge) {
            clearInterval(checkBridge);
            console.log("[CC] NativeBridge detected, calling initControlCenter");
            initControlCenter();
        }
    }, 100);
}
