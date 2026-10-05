import { defineConfig } from 'vite';

// base './' so the build works under any GitHub Pages sub-path (https://<user>.github.io/<repo>/)
// two pages: index.html (the game) and editor.html (the editor)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: { input: { game: 'index.html', editor: 'editor.html' } },
  },
});
