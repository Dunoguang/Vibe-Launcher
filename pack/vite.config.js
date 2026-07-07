import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      'three/webgpu': 'three/src/Three.WebGPU.js'
    }
  },
  build: {
    minify: 'terser',
    target:'es2015'
  }
});