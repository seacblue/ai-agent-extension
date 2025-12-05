# AI-Agent-Extension

## 项目简介

AI-Agent-Extension 是一款基于 Chrome 浏览器的智能开发者助手，集成了 AI 能力，帮助开发者高效分析和理解网页结构、CSS 样式，提供智能代码建议和问题解答。

### 项目背景
随着 Web 技术的快速发展，前端页面结构日益复杂，开发者需要花费大量时间分析页面 DOM 结构、CSS 样式和交互逻辑。AI-Agent-Extension 旨在通过 AI 技术简化这一过程，提供智能化的网页分析和开发辅助功能，提高开发者的工作效率。

### 基本信息
- **项目类型**：Chrome 浏览器扩展
- **技术栈**：Vue 3 + TypeScript + Vite
- **AI 集成**：豆包 AI API
- **授权协议**：ISC

## 主要功能列表

- **智能问题分析**：自动分析用户问题，判断是否需要使用 DOM 或 CSS 分析工具
- **DOM 结构分析**：获取并分析页面 DOM 结构，支持指定元素分析
- **CSS 样式分析**：分析页面 CSS 样式，包括特定元素的样式规则
- **AI 智能问答**：基于分析结果，通过 AI 生成准确的回答和建议
- **流式响应**：支持 AI 响应的实时流式展示，提升用户体验
- **元素选择器**：支持通过点击页面元素进行精确分析
- **反馈选项生成**：自动生成相关反馈选项，引导用户进一步交互
- **API 密钥管理**：安全管理用户的 AI API 密钥

## 技术架构图与说明

### 整体架构

```
   DevTools 面板  ────▶  Background 服务  ────▶   Content 脚本   
       ▲                       ▲                       ▲
       │                       │                       │
       │                       │                       │
    前端组件                 核心服务               页面分析工具   
  (Vue 3 + TS)
```

### 架构说明

1. **DevTools 面板**：用户交互界面，提供问题输入、结果展示和反馈选项
2. **Background 服务**：扩展的核心服务，负责管理 AI 服务、长连接和消息路由
3. **Content 脚本**：注入到目标页面，执行 DOM 和 CSS 分析，收集页面数据
4. **核心服务层**：包括 AI 服务、消息服务、元素服务等，处理业务逻辑
5. **页面分析工具**：提供 DOM 分析、CSS 分析等功能，支持精确到元素级别的分析

### 数据流

1. 用户在 DevTools 面板输入问题
2. Background 服务接收问题，调用 AI 分析问题需求
3. 根据分析结果，Background 服务通过长连接请求 Content 脚本执行相应的分析工具
4. Content 脚本执行 DOM/CSS 分析，返回结果给 Background 服务
5. Background 服务将分析结果和用户问题发送给 AI 服务
6. AI 服务返回流式响应，通过长连接实时传递给 DevTools 面板
7. DevTools 面板展示 AI 响应，并生成反馈选项

## 核心模块设计与实现描述

### 1. AI 服务模块 (AIService)

#### 设计思路
- 采用单例模式设计，确保全局唯一的 AI 服务实例
- 封装 AI 客户端，提供统一的 API 调用接口
- 支持流式响应和任务中断，提升用户体验
- 集成问题分析功能，自动判断分析需求

#### 核心功能
- `analyzeQuestionRequirements`：分析用户问题，判断是否需要 DOM/CSS 分析
- `sendMessageWithStream`：发送流式 AI 请求，实时获取响应
- `handleQuestion`：处理用户问题，协调各服务组件
- `terminateTasks`：终止当前 AI 任务
- `generateFeedbackOptions`：生成反馈选项，引导用户进一步交互

#### 关键代码
```typescript
// AIService 单例获取
public static getInstance(): AIService {
  if (!AIService.instance) {
    AIService.instance = new AIService();
  }
  return AIService.instance;
}

// 发送流式消息
public async sendMessageWithStream(
  question: string,
  domData?: string,
  cssData?: string,
  options: AIServiceOptions = {}
): Promise<void> {
  // 实现流式消息发送逻辑
}
```

### 2. 长连接管理模块 (LongConnectionManager)

#### 设计思路
- 管理 Background 服务与 Content 脚本之间的长连接
- 支持跨标签页通信，确保消息正确路由
- 实现请求超时处理和错误重试机制

#### 核心功能
- 建立和维护长连接
- 发送和接收长连接消息
- 处理连接断开和重连
- 管理请求队列，确保消息顺序

### 3. 元素服务模块 (ElementService)

#### 设计思路
- 提供元素分析和摘要生成功能
- 支持元素选择器和位置信息获取
- 实现元素数据的安全处理和截断

#### 核心功能
- `generateElementSummary`：生成元素摘要信息
- `getElementInfo`：获取元素详细信息，包括位置、大小和样式
- `truncateElementData`：截断过长的元素数据，确保符合 AI API 限制

### 4. 提示词构建模块 (PromptUtils)

#### 设计思路
- 封装提示词构建逻辑，确保提示词格式统一
- 实现数据截断功能，避免超出 AI API 限制
- 支持动态生成不同类型的提示词

#### 核心功能
- `buildPrompt`：构建完整的 AI 提示词，包含问题、DOM 数据和 CSS 数据
- `truncatePrompt`：截断过长的提示词
- `truncateData`：截断过长的 DOM 或 CSS 数据

### 5. 消息服务模块 (MessageService)

#### 设计思路
- 统一管理扩展内的消息通信
- 实现消息类型的路由和处理
- 支持不同组件间的消息传递

#### 核心功能
- 注册消息监听器
- 发送消息到指定组件
- 处理来自不同组件的消息
- 实现消息的安全验证和格式检查

## 开发与调试指南

### 环境配置

#### 前置要求
- Node.js 18+ 或 20+ 版本
- npm 或 yarn 包管理器
- Chrome 浏览器

#### 安装依赖

```bash
npm install
```

### 项目结构

```
src/
├── background/         # Background 服务脚本
├── content/            # Content 脚本
├── devtools/           # DevTools 入口
├── panel/              # DevTools 面板组件
│   ├── components/     # Vue 组件
│   ├── styles/         # CSS 样式
│   ├── App.vue         # 主应用组件
│   └── main.ts         # 入口文件
└── shared/             # 共享服务和工具
    ├── services/       # 核心服务
    └── types/          # TypeScript 类型定义
```

### 开发流程

#### 1. 启动开发服务器

```bash
npm run dev
```

该命令会启动 Vite 开发服务器，监听文件变化并自动重新构建。

#### 2. 加载扩展到 Chrome 浏览器

1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目根目录下的 `dist` 文件夹
5. 扩展加载成功后，可在浏览器右上角看到扩展图标

#### 3. 打开 DevTools 面板

1. 打开任意网页
2. 右键点击页面，选择「检查」或按 `F12` 打开 DevTools
3. 在 DevTools 顶部标签栏中，点击「AI 助手」标签页
4. 进入 AI 助手面板，开始使用功能

### 构建与发布

#### 构建扩展

```bash
npm run build:extension
```

该命令会构建生产版本的扩展，输出到 `dist` 文件夹。

#### 打包扩展

1. 构建完成后，进入 `chrome://extensions/`
2. 点击「打包扩展程序」
3. 选择 `dist` 文件夹作为「扩展程序根目录」
4. 点击「打包扩展程序」
5. 生成的 `.crx` 文件可用于分发和安装

### 调试技巧

#### 调试 Background 服务

1. 进入 `chrome://extensions/`
2. 找到 AI-Agent-Extension，点击「详情」
3. 点击「服务工作线程」下的「检查视图」
4. 打开开发者工具，可查看 Background 服务的日志和调试信息

#### 调试 Content 脚本

1. 打开任意网页
2. 按 `F12` 打开 DevTools
3. 切换到「控制台」标签页
4. 点击顶部的下拉菜单，选择「<page_url> - 顶层框架」
5. 可查看 Content 脚本的日志和调试信息

#### 调试 DevTools 面板

1. 打开 DevTools 面板
2. 按 `Ctrl+Shift+I` (Windows) 或 `Cmd+Opt+I` (Mac) 打开 DevTools 面板的开发者工具
3. 可查看 Vue 组件的状态、日志和调试信息

### 代码规范

项目使用 ESLint 和 Prettier 进行代码规范检查和格式化：

- 检查代码规范：`npm run lint`
- 格式化代码：`npm run format`
- 类型检查：`npm run type-check`

## 核心模块详细说明

### 1. AI 服务配置

AI 服务使用豆包 AI API，需要配置 API 密钥。在首次使用时，系统会提示输入 API 密钥，密钥将安全存储在浏览器的 `chrome.storage` 中。

### 2. 长连接机制

扩展使用 Chrome Extension 的长连接机制 (`chrome.runtime.connect`) 实现 Background 服务与 Content 脚本、DevTools 面板之间的实时通信，确保数据传输的高效性和可靠性。

### 3. 数据安全

- API 密钥使用 Chrome Extension 的安全存储机制，确保数据安全
- 所有网络请求使用 HTTPS 协议，防止数据泄露
- 实现了请求中断机制，支持用户随时终止 AI 服务请求

## 贡献指南

### 提交代码

1. Fork 项目仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交代码：`git commit -m 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request