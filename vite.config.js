import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// HTML 处理插件
function htmlPlugin() {
  return {
    name: 'html-plugin',
    generateBundle() {
      // devtools.html
      const devtoolsHtmlPath = resolve(__dirname, 'public/devtools.html');
      let devtoolsHtml = readFileSync(devtoolsHtmlPath, 'utf-8');

      devtoolsHtml = devtoolsHtml.replace(
        'src="/src/devtools/main.ts"',
        'src="./devtools.js"'
      );

      this.emitFile({
        type: 'asset',
        fileName: 'devtools.html',
        source: devtoolsHtml,
      });

      // panel.html
      const panelHtmlPath = resolve(__dirname, 'public/panel.html');
      let panelHtml = readFileSync(panelHtmlPath, 'utf-8');

      panelHtml = panelHtml.replace(
        'href="./devtools.css"',
        'href="./panel.css"'
      );

      this.emitFile({
        type: 'asset',
        fileName: 'panel.html',
        source: panelHtml,
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), htmlPlugin()],
  build: {
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, 'src/devtools/main.ts'),
        panel: resolve(__dirname, 'src/panel/main.ts'),
        background: resolve(__dirname, 'src/background/background.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: assetInfo => {
          // 将字体文件放到 fonts 目录
          if (
            assetInfo.name &&
            /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.name)
          ) {
            return 'fonts/[name].[ext]';
          }
          // 图片文件放到 icons 目录
          if (
            assetInfo.name &&
            /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name)
          ) {
            return 'icons/[name].[ext]';
          }
          // 其他资源保持原名
          return '[name].[ext]';
        },
      },
      external: [], // 确保所有依赖都内联打包
      treeshake: 'smallest',
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020', // 设置目标环境
  },
});
