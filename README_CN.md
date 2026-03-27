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

项目包含一个自动化发布脚本，一站式完成版本更新、Git提交打标签、跨平台构建安装包整个发布流程：

### 基础用法
```bash
# 运行交互式版本选择向导（推荐）
npm run release

# 或直接指定版本号
node scripts/release.js [选项] 1.0.0
```

### 命令选项
| 选项 | 作用 |
|------|------|
| `--help, -h` | 显示完整帮助信息 |
| `--skip-build` | 跳过构建步骤，只更新版本和执行Git操作 |
| `--skip-git` | 跳过Git提交和打标签步骤 |
| `--dry-run` | **试运行模式**，只显示要执行的操作，不实际修改任何文件或执行命令 |

### 版本号格式
支持标准 [SemVer](https://semver.org/) 格式：
- 正式版：`X.Y.Z` （如 `1.0.0`、`2.1.3`）
- 预发布版：`X.Y.Z-<标记>` （如 `1.0.0-alpha`、`1.0.0-beta.1`）

### 交互式用法
如果运行时不直接指定版本号，脚本会进入**交互式版本选择界面**，自动为你推荐升级选项：
```
Current version:
  0.0.7

Suggested versions:
  1. 0.0.8            (Patch bump - 小版本修复)
  2. 0.1.0            (Minor bump - 新功能版本)
  3. 1.0.0            (Major bump - 重大更新版本)
  4. 0.0.8-alpha      (Alpha prerelease - 内部测试版)
  5. 0.0.8-beta       (Beta prerelease - 公开测试版)
  0. Enter custom version

Select option (0-5) or enter version:
```
可以直接输入数字选择推荐版本，或输入0自定义版本号。

### 执行流程
脚本默认分4步完成发布：
1. **🔄 更新版本**：自动修改 `package.json` 中的version字段
2. **📝 Git操作**：提交版本变更，创建Git标签 `vX.X.X`
3. **🏗️ 构建安装包**：自动识别当前操作系统，执行对应构建命令：
   - Windows：执行 `npm run build:win` 生成 `.exe` 安装包
   - macOS：执行 `npm run build:mac` 生成 `.dmg` 安装包
   - Linux：执行 `npm run build:linux` 生成Linux平台安装包
4. **✅ 发布完成**：输出发布摘要，包含新版本号、安装包路径和Git推送提示。

### 常用示例
```bash
# 交互式选择版本发布
npm run release

# 直接发布正式版
node scripts/release.js 1.0.0

# 发布beta测试版
node scripts/release.js 1.0.0-beta.1

# 试运行（仅显示操作，不实际修改）
node scripts/release.js --dry-run 1.0.0

# 跳过构建，只更新版本和Git标签
node scripts/release.js --skip-build 1.0.0

# 跳过Git提交，只做版本更新和构建
node scripts/release.js --skip-git 1.0.0
```

### 注意事项
1. 运行脚本前请确保工作区干净，没有未提交的修改
2. 构建产物默认输出在 `dist/` 目录下
3. 如果开启了Git操作，发布完成后需要手动执行 `git push && git push --tags` 推送到远程仓库
4. 脚本支持Windows/macOS/Linux跨平台自动适配构建命令

## 路线图

- [ ] 拖拽任务重新排序
- [ ] 日历视图，包含截止日期概览
- [ ] 上下文过滤（点击 @Context 进行过滤）
- [ ] 项目完成工作流
- [ ] 数据导出（JSON / CSV）
- [ ] 主题（暗色模式）
- [ ] 全局快捷键快速捕获
- [ ] 逾期项目的提醒通知