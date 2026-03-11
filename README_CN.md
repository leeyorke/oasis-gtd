# Oasis GTD — Alpha

使用 Electron + React + TypeScript 构建的高级桌面 GTD 系统。

## 技术栈

- **Electron 29** + **electron-vite** — 桌面应用框架和构建工具
- **React 18** + **TypeScript** — UI 框架
- **Tailwind CSS** — 实用样式库
- **Zustand** — 状态管理
- **better-sqlite3** — 本地 SQLite 数据库
- **electron-builder** — Windows/macOS/Linux 打包工具

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 应用入口，窗口创建
│   ├── db/            # SQLite 数据库 (better-sqlite3)
│   └── ipc/           # IPC 处理程序（所有操作）
├── preload/           # 上下文桥接（安全 API 暴露）
└── renderer/          # React 前端
    └── src/
        ├── App.tsx
        ├── views/     # 下一步行动、项目、等待中、某天/也许、每周回顾、AI 聊天
        ├── components/ # 布局、侧边栏、快速捕获、模态框
        ├── store/     # Zustand 存储（所有应用状态）
        ├── hooks/     # useParallax
        └── types/     # TypeScript 接口
```

## 快速开始

### 先决条件

- Node.js 18+
- npm 9+

### 设置

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev
```

### 为 Windows 构建（Alpha）

```bash
npm run build:win
```

输出：`dist/Oasis-GTD-Setup-0.1.0-alpha.exe`

### 为其他平台构建

```bash
npm run build:mac    # macOS
npm run build:linux  # Linux AppImage
```

## Windows 应用图标

将图标文件放在 `resources/` 目录：
- `resources/icon.ico` — Windows 图标（构建必需）
- `resources/icon.icns` — macOS 图标
- `resources/icon.png` — Linux 图标（256×256）

你可以使用 [electron-icon-maker](https://www.npmjs.com/package/electron-icon-maker) 或在线工具从任何 PNG 生成这些图标。

## AI 提供商设置

Oasis 支持多种 AI 提供商用于 AI 助手视图：

| 提供商 | 基础 URL | 说明 |
|--------|----------|------|
| **OpenAI** | `https://api.openai.com` | 需要 API 密钥 |
| **Anthropic** | `https://api.anthropic.com` | 需要 API 密钥 |
| **Ollama** | `http://localhost:11434` | 免费，在本地运行 |
| **LM Studio** | `http://localhost:1234` | OpenAI 兼容 |
| **自定义** | 任何 OpenAI 兼容的 URL | 例如 vLLM, Groq |

在 AI 助手视图中配置提供者 → **配置 →**

## 数据存储

所有数据都存储在本地 SQLite 中：
- **Windows:** `%APPDATA%\oasis-gtd\oasis-gtd.db`
- **macOS:** `~/Library/Application Support/oasis-gtd/oasis-gtd.db`
- **Linux:** `~/.config/oasis-gtd/oasis-gtd.db`

## GTD 视图

| 视图 | 描述 |
|------|------|
| **下一步行动** | 所有带 `@Context` 标签的下一步行动，包含截止日期 |
| **项目** | 多行动成果，以项目卡片形式展示 |
| **等待中** | 委托项，带有老化可视化 |
| **某天/也许** | 按时间范围组织的想法 |
| **每周回顾** | 引导式检查清单：收集 → 处理 → 回顾 → 反思 → 创建 |
| **AI 助手** | 使用可配置提供者的 LLM 聊天 |

## 添加新的应用模块

AI 提供者接口设计为可扩展。要添加新应用（例如，不同的 AI 工具或笔记模块）：

1. 在 `src/renderer/src/types/index.ts` 中添加新的 `ViewType`
2. 创建 `src/renderer/src/views/YourView.tsx`
3. 在 `src/renderer/src/App.tsx` 中注册
4. 在 `src/renderer/src/components/Sidebar.tsx` 中添加导航项
5. 如果需要后端，在 `src/main/ipc/handlers.ts` 中添加 IPC 处理程序

## 发布脚本

项目包含一个发布脚本，可以自动处理版本更新、构建和打包：

```bash
# 运行交互式发布向导
npm run release

# 或直接指定版本
node scripts/release.js 1.0.0

# 模拟运行（不实际更改文件）
node scripts/release.js --dry-run 1.0.0
```

该脚本会：
1. 更新 package.json 版本号
2. 创建 git 提交和标签
3. 自动检测平台并构建相应安装包
4. 输出构建摘要

## 路线图

- [ ] 拖拽任务重新排序
- [ ] 日历视图，包含截止日期概览
- [ ] 上下文过滤（点击 @Context 进行过滤）
- [ ] 项目完成工作流
- [ ] 数据导出（JSON / CSV）
- [ ] 主题（暗色模式）
- [ ] 全局快捷键快速捕获
- [ ] 逾期项目的提醒通知