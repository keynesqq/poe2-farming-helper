# POE2 开荒任务清单 - 开发文档

## 目录

1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [文件说明](#文件说明)
5. [数据流与架构](#数据流与架构)
6. [核心模块详解](#核心模块详解)
7. [IPC 通信协议](#ipc-通信协议)
8. [地图监控系统](#地图监控系统)
9. [数据持久化](#数据持久化)
10. [样式系统](#样式系统)
11. [构建与打包](#构建与打包)
12. [开发指南](#开发指南)

---

## 项目概述

本项目是一款基于 Electron 的桌面应用，用于辅助《流放之路2》游戏的开荒过程。应用采用主进程（Node.js）+ 渲染进程（Chromium）的经典 Electron 架构，通过 IPC 通信实现进程间数据交换。

### 核心特性

- **纯前端架构**：无后端服务，所有数据存储在本地
- **实时日志监控**：主进程监控游戏日志文件实现地图自动检测
- **双窗口设计**：主窗口 + 浮窗窗口独立运行
- **数据持久化**：localStorage + 文件系统混合存储
- **响应式设计**：适配从手机到大屏显示器的多种分辨率

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Electron | ^28.3.3 | 跨平台桌面应用框架 |
| 构建工具 | electron-builder | ^24.13.3 | 应用打包工具 |
| 编码转换 | iconv-lite | ^0.7.2 | 日志文件编码转换 |
| 前端 | Vanilla HTML/CSS/JS | - | 无框架原生实现 |
| 存储 | localStorage | - | 浏览器本地存储 |
| 文件系统 | Node.js fs | - | 图片和日志文件读写 |

---

## 项目结构

```
POE2助手V1/
├── main.js              # Electron 主进程入口
├── preload.js           # 预加载脚本（安全桥接）
├── index.html           # 主窗口页面
├── app.js               # 主窗口渲染逻辑
├── float.html           # 浮窗窗口页面
├── styles.css           # 全局样式表
├── data.json            # 游戏数据（章节/地图/任务）
├── package.json         # 项目配置
├── icon.png             # 应用图标
├── image/               # 图片资源目录
│   └── POE2map/
│       └── actMap/      # 预设地图图片
├── dist/                # 打包输出目录（构建时生成）
├── USER_MANUAL.md       # 使用手册
└── DEVELOPMENT.md       # 本开发文档
```

---

## 文件说明

### main.js（主进程）

Electron 主进程入口文件，负责：

- 创建和管理主窗口（`BrowserWindow`）
- 创建和管理浮窗窗口
- 注册 IPC 处理器和监听器
- 实现地图监控系统（日志文件读取解析）
- 管理日志路径配置
- 处理文件系统操作（图片选择、缓存导入导出）

### preload.js（预加载脚本）

使用 `contextBridge` 将安全的 IPC 接口暴露给渲染进程：

- 所有主进程通信都通过此桥接层
- 渲染进程无法直接访问 Node.js API
- 定义了完整的 IPC 通道列表（见 [IPC 通信协议](#ipc-通信协议)）

### index.html / app.js（主窗口）

主应用界面，包含：

- **index.html**：页面结构，定义模态框、图片查看器、设置面板等 DOM
- **app.js**：完整的渲染逻辑，包括：
  - 数据加载与转换（`transformData`）
  - 任务状态管理（`checkedState`）
  - DOM 渲染（`renderAll`、`renderAct`、`renderMap`）
  - 编辑功能（增删改查、拖拽排序）
  - 图片管理（上传、删除、查看）
  - 一键清查功能
  - 浮窗数据同步

### float.html（浮窗窗口）

独立的浮窗页面：

- 独立的 HTML/CSS/JS，与主窗口通过 IPC 通信
- 支持折叠/展开两种状态
- 独立的透明度、字体大小、字体颜色控制
- 任务勾选状态与主窗口双向同步

### styles.css（样式表）

全局样式文件，使用 CSS 变量实现主题切换：

- `:root` 定义深色主题变量
- `body.light-theme` 定义浅色主题变量
- 响应式布局适配移动端
- 浮窗专用样式

### data.json（数据源）

游戏核心数据，结构如下：

```json
{
  "poe2BD": [],
  "act": [
    {
      "chapter": "第一章：皆伐之影",
      "chapter_strategy": "章节攻略文本...",
      "chapter_boss": "Boss打法攻略...",
      "areas": [
        {
          "name_cn": "简体中文名称",
          "name_tw": "繁体中文名称",
          "name_en": "英文名称",
          "level": 1,
          "entries": [
            {
              "name": "任务名称",
              "priority": "主线/可选/事件",
              "rewards": ["奖励1", "奖励2"]
            }
          ],
          "exploration_notes": "跑图攻略...",
          "mapUrl": []
        }
      ],
      "mapUrl": ["TW-1.png", "CN-1.png", "EN-1.png"]
    }
  ]
}
```

---

## 数据流与架构

### 运行时数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  main.js     │───▶│  IPC 通道    │◀───│ 日志监控线程  │  │
│  │  窗口管理     │    │  通信中枢    │    │ (文件系统)   │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
┌─────────────▼──────────────┐  ┌─────────────▼──────────────┐
│      主窗口渲染进程         │  │      浮窗渲染进程          │
│  ┌──────────────────────┐  │  │  ┌──────────────────────┐  │
│  │  index.html          │  │  │  │  float.html          │  │
│  │  + app.js            │  │  │  │  + 内联 JS           │  │
│  │                      │  │  │  │                      │  │
│  │  • 任务状态管理       │  │  │  │  • 浮窗数据渲染       │  │
│  │  • DOM 渲染          │  │  │  │  • 独立样式控制      │  │
│  │  • 编辑功能          │  │  │  │  • 任务同步          │  │
│  │  • localStorage      │  │  │  │                      │  │
│  └──────────────────────┘  │  │  └──────────────────────┘  │
└────────────────────────────┘  └────────────────────────────┘
```

### 数据存储架构

```
┌─────────────────────────────────────────────────────────────┐
│                        数据源层                               │
├─────────────────────────────────────────────────────────────┤
│  data.json (静态资源)                                        │
│  └── 默认游戏数据，随应用打包                                  │
├─────────────────────────────────────────────────────────────┤
│  localStorage (浏览器存储)                                   │
│  ├── poe2_final_data     → 用户修改后的完整数据               │
│  ├── poe2_final_checked  → 任务勾选状态                       │
│  ├── poe2_theme          → 主题偏好                          │
│  ├── poe2_edit_mode      → 编辑模式状态                      │
│  ├── poe2_float_open     → 浮窗开关状态                      │
│  └── poe2_float_map_index → 浮窗当前地图索引                  │
├─────────────────────────────────────────────────────────────┤
│  文件系统 (Node.js fs)                                       │
│  ├── 用户数据目录                                           │
│  │   ├── log-paths.json      → 日志路径配置                  │
│  │   └── images/            → 用户上传的图片缓存             │
│  └── 游戏日志文件 (Client.txt)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心模块详解

### 1. 数据转换模块（app.js）

```javascript
function transformData(rawData)
```

将 `data.json` 的原始结构转换为应用内部使用的统一结构：

| 原始字段 | 内部字段 | 说明 |
|----------|----------|------|
| `chapter` | `act` | 章节名称 |
| `chapter_strategy` | `bossStrategy` | 章节攻略 |
| `chapter_boss` | `chapterBoss` | Boss攻略 |
| `areas[].name_cn` + `name_tw` | `mapName` | 地图双语名称 |
| `areas[].level` | `level` | 推荐等级 |
| `areas[].exploration_notes` | `mapStrategy` | 探索笔记 |
| `areas[].entries[].name` | `tasks[].description` | 任务描述 |
| `areas[].entries[].priority` | `tasks[].tags` | 优先级标签 |
| `areas[].entries[].rewards` | `tasks[].rewardTags` | 奖励标签 |
| `areas[].mapUrl` | `maps[].mapUrl` | 地图预设图片 |
| `mapUrl` | `mapUrl` | 章节预设图片 |

### 2. 渲染引擎（app.js）

```javascript
function renderAll()          // 全量渲染所有章节
function renderAct(act, actIdx)   // 渲染单个章节
function renderMap(map, actIdx, mapIdx, mapKey)  // 渲染单个地图
function renderAddActButton()    // 渲染添加章节按钮
```

渲染流程：

1. `renderAll()` 遍历所有章节调用 `renderAct()`
2. `renderAct()` 构建章节 DOM，包含图片容器、地图列表
3. 每个地图调用 `renderMap()` 构建任务列表
4. 任务包含复选框、标签、奖励标签等元素
5. 编辑模式下额外添加编辑按钮和拖拽事件

### 3. 任务状态管理（app.js）

```javascript
// 任务勾选状态（内存 + localStorage）
let checkedState = {};

// 勾选/取消勾选
function toggleTask(taskId) {
  if (checkedState[taskId]) {
    delete checkedState[taskId];
  } else {
    checkedState[taskId] = true;
  }
  saveChecks();
  renderAll();
}
```

### 4. 编辑系统（app.js）

编辑模式使用 `localEditActs` Set 记录处于编辑状态的章节索引：

```javascript
let editMode = false;
let localEditActs = new Set();
```

编辑功能包括：
- **showModal()**：通用模态框，支持文本输入、下拉选择、文本域
- **拖拽排序**：HTML5 Drag and Drop API
- **增删改查**：直接操作 `questData` 数组后调用 `saveData()`

### 5. 图片管理模块（app.js）

```javascript
function getImageUrl(imgSrc)   // 转换本地路径为 app-image:// 协议
function handleImageUpload()   // 通过 IPC 选择文件并保存
function handleImageDelete()   // 从数组移除并保存
function showImageViewer()     // 图片查看器（支持缩放拖拽）
```

图片查看器交互：
- 滚轮缩放（`handleImageWheel`）
- 鼠标拖拽移动（`handleImageMouseDown/Move/Up`）
- 变换矩阵更新（`updateImageTransform`）

### 6. 浮窗数据模块（app.js）

```javascript
function flattenMapsForFloat()    // 将所有章节地图扁平化为数组
function getCurrentFloatData()    // 获取当前浮窗显示的数据
function findMapIndexByName()     // 通过地图名查找索引
function matchMapByName()         // 模糊匹配地图名称
```

---

## IPC 通信协议

### 渲染进程 → 主进程（Invoke）

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `get-app-version` | - | string | 获取应用版本 |
| `select-log-file` | - | string | 选择日志文件对话框 |
| `get-log-paths` | - | array | 获取所有日志路径 |
| `add-log-path` | path | boolean | 添加日志路径 |
| `remove-log-path` | path | boolean | 移除日志路径 |
| `update-log-path` | oldPath, newPath | boolean | 更新日志路径 |
| `set-active-log-path` | path | boolean | 设置活跃日志路径 |
| `export-cache` | data | boolean | 导出缓存到文件 |
| `import-cache` | - | object | 从文件导入缓存 |
| `select-image-file` | - | string | 选择图片文件 |
| `get-float-always-on-top` | - | boolean | 获取浮窗置顶状态 |

### 渲染进程 → 主进程（Send）

| 通道 | 参数 | 说明 |
|------|------|------|
| `toggle-float-window` | - | 切换浮窗显示/隐藏 |
| `update-float-data` | data | 更新浮窗显示数据 |
| `close-float-window` | - | 关闭浮窗 |
| `float-nav` | direction | 浮窗上一页/下一页 |
| `set-float-always-on-top` | flag | 设置浮窗置顶 |
| `set-float-height` | height | 设置浮窗高度 |
| `sync-task-check` | {taskId, checked} | 浮窗→主窗口任务同步 |
| `sync-task-check-to-float` | {taskId, checked} | 主窗口→浮窗任务同步 |
| `map-detected-sync` | mapName | 浮窗地图检测同步 |

### 主进程 → 渲染进程（Send）

| 通道 | 参数 | 说明 |
|------|------|------|
| `float-data-update` | data | 浮窗数据更新 |
| `sync-task-check` | {taskId, checked} | 任务状态同步 |
| `float-window-closed` | - | 浮窗关闭通知 |
| `float-window-moved` | bounds | 浮窗移动通知 |
| `float-nav` | direction | 浮窗导航指令 |
| `map-detected` | mapName, isAutoDetected | 地图检测事件 |
| `map-detected-sync` | mapName | 地图检测同步 |

---

## 地图监控系统

### 工作原理

主进程通过定时读取 POE2 客户端日志文件（`Client.txt`）来检测玩家当前所在地图。

### 日志格式解析

POE2 客户端在玩家进入新地图时会输出如下日志：

```
... You have entered The Riverbank.
... You have entered Clearfell.
```

监控程序通过正则表达式匹配 `"You have entered (.*)\\."` 来提取地图名。

### 实现代码（main.js）

```javascript
function startMapMonitor() {
  // 1. 检查日志文件是否存在
  // 2. 读取文件末尾新内容
  // 3. 解析 "You have entered XXX." 模式
  // 4. 匹配成功后发送 map-detected 事件
  // 5. 定时轮询（通常 1-2 秒间隔）
}
```

### 地图名称匹配

检测到的英文地图名需要映射到应用内部的双语地图名：

```javascript
function matchMapByName(mapNameStr, searchStr) {
  // 1. 大小写不敏感比较
  // 2. 支持 "繁体中文 / 简体中文" 格式的拆分匹配
  // 3. 模糊匹配（包含关系）
}
```

---

## 数据持久化

### localStorage 存储项

| Key | 类型 | 说明 |
|-----|------|------|
| `poe2_final_data` | JSON string | 完整的任务数据（含用户编辑） |
| `poe2_final_checked` | JSON string | 任务勾选状态映射表 |
| `poe2_theme` | string | "dark" / "light" |
| `poe2_edit_mode` | string | 编辑模式序列化状态 |
| `poe2_float_open` | string | "1" / "0" |
| `poe2_float_map_index` | string | 浮窗当前地图索引 |

### 文件系统存储

| 路径 | 说明 |
|------|------|
| `app.getPath("userData")/log-paths.json` | 日志路径配置 |
| `app.getPath("userData")/images/` | 用户上传的图片 |

### 数据加载优先级

```
启动时：
  1. 尝试从 localStorage 读取 poe2_final_data
  2. 如果存在 → 使用缓存数据
  3. 如果不存在 → 从 data.json 加载并 transform
  4. 加载 poe2_final_checked 恢复勾选状态
```

---

## 样式系统

### CSS 变量主题

```css
:root {
  --bg-body: #08090b;
  --bg-container: rgba(14, 13, 10, 0.97);
  --text-primary: #f2e2be;
  --text-secondary: #cdb889;
  /* ... 等 30+ 个变量 */
}

body.light-theme {
  --bg-body: #f0f4f4;
  --bg-container: rgba(248, 250, 251, 0.98);
  /* ... 浅色主题覆盖 */
}
```

### 响应式断点

| 断点 | 目标设备 | 主要调整 |
|------|----------|----------|
| `max-width: 430px` | iPhone 15 Pro | 字体缩小、内边距减少、布局堆叠 |
| `max-width: 480px` | iPhone 15 Pro Max | 中等移动端调整 |
| `max-width: 640px` | 小屏手机 | 顶部控制栏隐藏、底部按钮调整 |
| `max-width: 768px` | 平板 | 容器内边距调整 |
| `max-width: 1200px` | 小窗口 | 侧边栏收缩为 8px 露出 |

### 浮窗样式

浮窗使用独立内联样式，支持：
- 透明度渐变背景（`linear-gradient` + `rgba`）
- 圆角边框（`border-radius: 12px`）
- 折叠状态透明化（`background: transparent`）
- 标题栏拖拽区域（`-webkit-app-region: drag`）

---

## 构建与打包

### 开发运行

```bash
npm install     # 安装依赖
npm start       # 启动应用（开发模式）
```

### 打包配置（package.json）

```json
{
  "build": {
    "appId": "com.parkerwt.poe2mapguide",
    "productName": "POE2 Map Guide",
    "directories": { "output": "dist" },
    "files": [
      "main.js", "index.html", "float.html",
      "app.js", "styles.css", "data.json",
      "preload.js", "icon.png"
    ],
    "win": {
      "target": [{ "target": "portable", "arch": ["x64"] }],
      "icon": "icon.png"
    }
  }
}
```

### 打包命令

```bash
npm run build   # 打包为便携版（dist/POE2 Map Guide.exe）
npm run dist    # 同上（CI 环境使用）
```

### 打包输出

打包后的便携版是一个独立的 `.exe` 文件，无需安装即可运行，包含：
- Electron 运行时
- 所有静态资源文件
- Node.js 依赖（主进程所需）

---

## 开发指南

### 开发环境搭建

1. 安装 Node.js 18+ 和 npm
2. 克隆项目到本地
3. 执行 `npm install`
4. 执行 `npm start` 启动应用

### 调试方法

#### 主进程调试

```javascript
// 在 main.js 中输出日志
console.log("[日志标签] 消息内容", variable);
```

主进程日志在终端中直接显示。

#### 渲染进程调试

```javascript
// 在 app.js 中输出日志
console.log("[renderAct] 章节数据:", act);
```

渲染进程日志在应用内的 DevTools 控制台查看（按 `Ctrl+Shift+I`）。

### 添加新功能建议

#### 添加新的 IPC 通道

1. 在 `preload.js` 中定义暴露方法
2. 在 `main.js` 中注册 `ipcMain.handle` 或 `ipcMain.on` 处理器
3. 在渲染进程中通过 `window.electronAPI` 调用

#### 修改数据结构

1. 更新 `data.json` 格式
2. 修改 `transformData()` 函数适配新结构
3. 更新所有引用新字段的渲染逻辑
4. 考虑版本兼容性（旧缓存数据迁移）

#### 添加新的 UI 组件

1. 在 `index.html` 中添加 DOM 结构
2. 在 `app.js` 中添加交互逻辑
3. 在 `styles.css` 中添加样式（使用 CSS 变量）
4. 测试深色/浅色主题兼容性

### 代码规范

- **变量命名**：驼峰命名法，`checkedState`、`questData`
- **函数命名**：动词开头，`renderAll`、`saveData`
- **注释**：中文注释描述业务逻辑
- **IPC 通道**：使用 kebab-case，`sync-task-check`
- **CSS 类名**：使用 kebab-case，`act-section`、`task-item`

### 测试清单

修改代码后需验证以下功能：

- [ ] 应用正常启动，数据正确加载
- [ ] 章节和地图正确渲染
- [ ] 任务勾选状态保存和恢复
- [ ] 编辑模式增删改查正常
- [ ] 拖拽排序正常
- [ ] 图片上传/删除/查看正常
- [ ] 浮窗模式开启/关闭正常
- [ ] 浮窗任务勾选同步正常
- [ ] 地图自动检测正常工作
- [ ] 一键清查功能正常
- [ ] 主题切换正常
- [ ] 深色/浅色主题下样式正确
- [ ] 移动端布局正常
- [ ] 打包后的应用正常运行

---

*本文档对应项目版本：v1.0.0*
