import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时 vite 跑在 5173；Claudio 中枢（聊天/TTS/曲库）仍在 3000。
// 把同源 API 路径代理过去，view-radio 的 location.origin 写法两边都成立。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/tts': 'http://localhost:3000',
      '/media': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    // 单页小应用，先不做手动分包；后续体积大了再按 view 拆。
    chunkSizeWarningLimit: 1500,
  },
});
