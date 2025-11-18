# AI Agent Extension - Web 前端智能开发者助手

一个基于 Vue 3 和 Chrome Extension API 的智能开发者助手，帮助 Web 开发者分析页面结构、CSS 样式和网络请求，提供实时的 AI 辅助开发体验。

## 功能特性

### 核心功能

- **智能对话界面** - 美观的聊天式 UI，支持实时问答交互
- **页面分析** - 自动分析当前页面的 DOM 结构、CSS 样式和网络请求
- **AI 助手** - 基于豆包 AI 技术的开发建议和问题解答
- **实时通信** - DevTools Panel、Background Script 和 Content Script 之间的无缝通信
- **本地存储** - API 密钥安全存储在浏览器本地

## 项目架构

### 技术栈

- **前端框架**: Vue 3 + TypeScript + Composition API
- **构建工具**: Vite 7.x
- **Chrome Extension**: Manifest V3
- **状态管理**: Pinia 3.x
- **路由**: Vue Router 4.x
- **开发工具**: ESLint + TypeScript + Vue TSC
- **AI 服务**: 豆包 AI (火山引擎)

## 环境要求

### 系统要求

- **Node.js**: ^20.19.0 或 >= 22.12.0
- **浏览器**: Chrome 88+, Edge 88+, Firefox 109+ (部分功能)
- **操作系统**: Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)

## 安装和使用

### 1. 克隆项目

```bash
git clone https://github.com/seacblue/ai-agent-extension.git
cd ai-agent-extension
```

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式

```bash
npm run dev
npm run type-check
```

### 4. 构建扩展

```bash
npm run build
npm run build:extension
```

### 5. 安装到浏览器

#### Chrome / Edge 安装步骤

1. 运行 `npm run build:extension` 构建扩展
2. 打开浏览器，进入扩展管理页面 (`chrome://extensions/`)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 文件夹

#### 使用方法

1. 打开任意网页
2. 按 F12 打开开发者工具
3. 点击"AI 助手"标签页
4. 首次使用需要配置 API 密钥
5. 开始与 AI 助手对话，询问页面相关问题
