import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import pluginPrettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', '.git/**', '*.log', '*.json'],
  },
  prettierConfig,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      indent: 'off',
      'no-console': 'off',
      'no-debugger': 'error',
      'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
    },
  },
  // TypeScript 配置
  ...tseslint.configs.recommended,
  {
    // TypeScript 特定规则覆盖
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      // 放宽 TypeScript 规则
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  // Vue 配置
  pluginVue.configs['flat/essential'],
  {
    // Vue 特定配置
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/script-indent': 'off',
      'vue/html-indent': 'off',
    },
  },
  {
    // 配置文件特殊处理
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // Prettier 配置
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    plugins: { prettier: pluginPrettier },
    rules: {
      'prettier/prettier': 'error',
    },
  },
]);
