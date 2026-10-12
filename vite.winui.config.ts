import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    root: resolve(__dirname, 'native/web-source'),
    base: './',
    build: { outDir: resolve(__dirname, 'native/WinUI/Web'), emptyOutDir: true },
});
