import { defineConfig } from 'vite';

export default defineConfig({
    base: '/tools/diagram-workbench/',
    build: {
        outDir: '../../tools/diagram-workbench',
        emptyOutDir: true,
        sourcemap: false,
        target: 'es2022',
    },
});
