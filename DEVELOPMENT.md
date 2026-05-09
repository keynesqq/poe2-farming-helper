# POE2 Map Guide · 开发文档

> 基于 Electron 的《流放之路2》开荒辅助工具 — 任务追踪 · 地图指南 · 浮窗跟随

| 项目     | 信息                       |
| -------- | -------------------------- |
| 项目名   | `poe2-map-guide`           |
| 版本     | `1.0.0`                    |
| 技术栈   | Electron + 原生 JavaScript |
| 目标平台 | Windows (x64, ia32)        |

---

## 📁 目录结构

```
poe2-map-guide/
├── package.json            # 项目配置与依赖
├── package-lock.json
├── main.js                 # 主进程入口（窗口管理、文件监控、IPC）
├── preload.js              # 预加载脚本（IPC 桥接层）
├── index.html              # 主窗口页面
├── float.html              # 浮窗窗口页面
├── app.js                  # 渲染进程逻辑（主应用 + 浮窗共用）
├── styles.css              # 全局样式表
├── data.json               # 地图任务数据源
├── DEVELOPMENT.md          # 开发文档
├── README.md               # 使用手册
├── assets/
│   └── icon.ico            # 应用图标
├── node_modules/           # 依赖包
└── dist/                   # 构建输出
    ├── POE2 Map Guide Setup 1.0.0.exe   # 安装程序 (NSIS)
    ├── POE2 Map Guide 1.0.0.exe         # 便携版
    └── win-unpacked/                    # 解包版本
```

---

## 🏗️ 系统架构

### 多进程架构

```
┌──────────────────────────────────────────────────────────────┐
│                        主进程 (main.js)                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ • 窗口管理（主窗口 + 浮窗创建/销毁）                      │  │
│  │ • 地图监控（按间隔轮询 Client.txt）                       │  │
│  │ • 日志路径管理（多路径增删改查）                          │  │
│  │ • 数据导入/导出（文件对话框 + JSON 读写）                  │  │
│  │ • IPC 通信枢纽（handle/send 协调双窗口）                   │  │
│  │ • 自定义协议（app-image:// 安全加载本地图片）              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   渲染进程 1     │   │   渲染进程 2     │   │    系统文件      │
│  (index.html)   │   │  (float.html)   │   │  Client.txt     │
│                 │   │                 │   │                 │
│ • 完整UI展示     │◄─►│ • 精简浮窗展示   │   │ • POE2 游戏日志  │
│ • 任务CRUD      │   │ • 任务勾选      │   │ • 场景切换记录   │
│ • 数据编辑/排序  │   │ • 导航切换      │   │                 │
│ • 图片管理       │   │                 │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
        │                     │
        └──────────┬──────────┘
                   ▼
          ┌─────────────────┐
          │   preload.js    │
          │   IPC 桥接层    │
          │   contextBridge │
          └─────────────────┘
```

### 核心文件职责

| 文件         | 进程     | 职责                                                  |
| ------------ | -------- | ----------------------------------------------------- |
| `main.js`    | 主进程   | 应用生命周期、窗口管理、文件系统监控                  |
| `preload.js` | 预加载   | 通过 `contextBridge` 安全暴露主进程 API               |
| `index.html` | 渲染进程 | 主窗口 DOM 结构                                       |
| `float.html` | 渲染进程 | 浮窗 DOM 结构                                         |
| `app.js`     | 渲染进程 | 主应用 + 浮窗共用逻辑（`(function(){ ... })()` 隔离） |
| `styles.css` | 渲染进程 | 全局样式，含亮色/暗色主题变量                         |

---

## 🧩 功能模块详解

### 1. 主窗口 — 任务清单管理

```
renderAct()     → 渲染单个章节（标题、攻略、Boss、图片）
renderMap()     → 渲染单个地图（名称、等级、进度、图片、攻略）
renderTask()    → 渲染单个任务（复选框、描述、标签、奖励）
renderAll()     → 全量重渲染入口
```

**关键状态：**

| 变量            | 类型      | 说明                                     |
| --------------- | --------- | ---------------------------------------- |
| `questData`     | `Array`   | 内存中的完整任务数据                     |
| `checkedState`  | `Object`  | 任务勾选状态 `{ id: true }`              |
| `editMode`      | `boolean` | 全局编辑模式                             |
| `localEditActs` | `Set`     | 局部编辑的章节索引集合                   |
| `localEditMaps` | `Set`     | 局部编辑的地图键集合 (`"actIdx_mapIdx"`) |
| `collapsedActs` | `Set`     | 已折叠的章节索引                         |
| `collapsedMaps` | `Set`     | 已折叠的地图键                           |

### 2. 编辑模式

支持 **全局编辑** 和 **局部编辑** 两种模式：

- **全局编辑** (`editMode`): 在设置中开启，所有章节和地图均可编辑
- **局部编辑** (`localEditActs` / `localEditMaps`): 通过"开始编辑"按钮独立开启单个章节/地图的编辑状态

编辑状态下可执行：添加/删除地图和任务、修改文本、拖拽排序、图片管理。

### 3. 图片管理

```
handleImageUpload(map, actIdx, mapIdx)      → 上传地图图片
handleImageDelete(map, imgIdx)              → 删除地图图片
handleActImageUpload(act, actIdx)           → 上传章节图片
handleActImageDelete(act, imgIdx)           → 删除章节图片
showImageViewer(imageUrl, title)            → 打开图片查看器
hideImageViewer()                           → 关闭图片查看器
```

- 图片路径存储在 `map.images[]` / `act.images[]` 数组中
- 通过 `app-image://` 自定义协议安全加载本地文件
- 支持格式：jpg, jpeg, png, gif, webp, bmp

### 4. 浮窗窗口

```javascript
// 浮窗配置
{
  width: 600,
  alwaysOnTop: true,       // 始终置顶
  skipTaskbar: true,       // 不显示在任务栏
  frame: false,            // 无边框
  focusable: false,        // 不获取焦点
  titleBarStyle: "hidden"
}
```

浮窗和主窗口通过 IPC 双向同步任务状态和地图切换。`app.js` 通过 `isFloatMode` 变量区分主窗口/浮窗上下文。

### 5. 地图监控

```javascript
// 监控间隔: 3 秒
// 日志解析正则
const sceneRegex = /\[SCENE\] Set Source \[([^\]]+)\]/;
// 示例日志: [SCENE] Set Source [The Riverbank]
```

**监控流程：**

```
应用启动 → 扫描配置的日志路径 → 找到 Client.txt
    → 定时读取 (3s) → 正则匹配场景行
    → 解析地图名 → IPC 发送给渲染进程
    → 主窗口 / 浮窗自动切换到对应地图
```

### 6. 主题系统

使用 CSS 变量实现亮/暗双主题，变量定义在 `:root` 和 `body.light-theme` 中。通过切换 `light-theme` class 实现主题切换，所有组件颜色均通过 CSS 变量引用。

### 7. 数据流

```
data.json (静态数据源)
    ↓ transformData()
questData[] (运行态数据)
    ↓ localStorage('poe2_final_data')  持久化
    ↓ renderAll()                      渲染 UI
        ↓ renderAct() → renderMap() → renderTask()
```

---

## 🔄 IPC 通信协议

### 渲染进程 → 主进程 (send)

| 通道                      | 参数                | 说明         |
| ------------------------- | ------------------- | ------------ |
| `toggle-float-window`     | -                   | 切换浮窗显示 |
| `update-float-data`       | `Object`            | 更新浮窗数据 |
| `close-float-window`      | -                   | 关闭浮窗     |
| `float-nav`               | `"prev"\|"next"`    | 浮窗导航     |
| `set-float-always-on-top` | `boolean`           | 设置浮窗置顶 |
| `set-float-height`        | `number`            | 设置浮窗高度 |
| `sync-task-check`         | `{taskId, checked}` | 任务状态同步 |

### 主进程 → 渲染进程 (on)

| 通道                  | 参数                        | 说明           |
| --------------------- | --------------------------- | -------------- |
| `float-data-update`   | `Object`                    | 浮窗数据更新   |
| `float-window-closed` | -                           | 浮窗已关闭     |
| `float-nav`           | `"prev"\|"next"`            | 导航指令       |
| `sync-task-check`     | `{taskId, checked}`         | 任务状态同步   |
| `map-detected`        | `{mapName, isAutoDetected}` | 地图检测事件   |
| `log-path-not-found`  | -                           | 日志路径不可用 |

### 双向调用 (invoke/handle)

| 通道                      | 返回值                     | 说明             |
| ------------------------- | -------------------------- | ---------------- |
| `get-app-version`         | `string`                   | 获取应用版本     |
| `select-log-file`         | `{success, filePath?}`     | 选择日志文件     |
| `get-log-paths`           | `Array`                    | 获取日志路径列表 |
| `add-log-path`            | `void`                     | 添加日志路径     |
| `remove-log-path`         | `void`                     | 删除日志路径     |
| `update-log-path`         | `void`                     | 更新日志路径     |
| `set-active-log-path`     | `void`                     | 设置活跃路径     |
| `export-cache`            | `{success, error?}`        | 导出缓存         |
| `import-cache`            | `{success, data?, error?}` | 导入缓存         |
| `select-image-file`       | `{success, filePath?}`     | 选择图片文件     |
| `get-float-always-on-top` | `boolean`                  | 获取置顶状态     |

---

## 💾 存储机制

### LocalStorage

| 键名                 | 数据类型          | 说明                   |
| -------------------- | ----------------- | ---------------------- |
| `poe2_final_data`    | `JSON.string`     | 任务数据（含图片路径） |
| `poe2_final_checked` | `JSON.string`     | 任务勾选状态           |
| `poe2_theme`         | `"dark"\|"light"` | 主题设置               |
| `poe2_edit_mode`     | `"true"\|"false"` | 编辑模式状态           |

### 文件存储

```javascript
// 日志路径配置文件
path.join(app.getPath("userData"), "log-paths.json");
// → C:\Users\<用户名>\AppData\Roaming\poe2-map-guide\log-paths.json
```

### 缓存导出结构

```javascript
{
  version: "1.0",
  exportDate: "ISO 时间戳",
  questData: [/* 完整任务数据 */],
  checkedState: { /* 勾选状态 */ },
  collapsedActs: [/* 折叠状态 */],
  collapsedMaps: [/* 折叠状态 */],
  theme: "dark" | "light",
  editMode: false
}
```

---

## 🔒 安全机制

1. **contextIsolation: true** — 渲染进程与 Node.js 隔离
2. **nodeIntegration: false** — 禁止渲染进程直接访问 Node API
3. **contextBridge** — 通过 `preload.js` 白名单式暴露 API
4. **自定义协议 `app-image://`** — 安全加载本地图片文件，主进程校验 MIME 类型
5. **无 `shell.openExternal` 等危险 API** — 避免命令注入风险

---

## 🚀 开发指南

### 环境要求

| 工具     | 版本          |
| -------- | ------------- |
| Node.js  | >= 18.x       |
| npm      | >= 9.x        |
| 操作系统 | Windows 10/11 |

### 常用命令

```powershell
# 安装依赖
npm install

# 开发模式运行
npm start

# 构建安装包 + 便携版
npm run build:win

# 完整构建流程
npm run build

# 仅创建分发包（不上传）
npm run dist
```

### 构建配置

```json
{
  "appId": "com.parkerwt.poe2mapguide",
  "productName": "POE2 Map Guide",
  "directories": { "output": "dist" },
  "files": [
    "main.js",
    "index.html",
    "float.html",
    "app.js",
    "styles.css",
    "data.json",
    "preload.js"
  ],
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64", "ia32"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  }
}
```

---

## 📊 数据格式

### data.json（输入源）

```json
[
  {
    "chapter": "第一章：皆伐之影",
    "chapter_strategy": "章节攻略...",
    "chapter_boss": "Boss战攻略...",
    "areas": [
      {
        "name_cn": "污流河畔",
        "name_tw": "河岸",
        "name_en": "The Riverbank",
        "level": 1,
        "entries": [{ "name": "任务名", "priority": "主线", "rewards": [] }],
        "exploration_notes": "探索说明..."
      }
    ]
  }
]
```

### 内存数据结构

```javascript
questData = [
  {
    act: "第一章：皆伐之影",
    bossStrategy: "章节攻略...",
    chapterBoss: "Boss攻略...",
    images: ["本地图片路径..."], // 章节图片
    maps: [
      {
        mapName: "河岸 / 污流河畔",
        level: 1,
        mapStrategy: "探索说明...",
        images: ["本地图片路径..."], // 地图图片
        id: "c1m1",
        tasks: [
          {
            id: "c1m1t1",
            description: "任务描述",
            tags: ["主线"],
            rewardTags: ["经验"],
          },
        ],
      },
    ],
  },
];
```

---

## ❗ 常见开发问题

### 浮窗无法显示

确认 `package.json` 的 `files` 数组包含 `float.html`。

### 地图检测不工作

1. 确认 `Client.txt` 路径正确且存在
2. 验证 POE2 正在运行并有日志写入
3. 检查正则表达式是否匹配当前客户端日志格式

### 打包后图片加载失败

确认 `app-image://` 协议处理程序在打包后仍能访问本地文件系统。

---

## 📝 编码规范

- 变量命名使用驼峰式（`camelCase`）
- 函数名体现操作意图（`handleImageUpload`、`renderAll`）
- 编辑操作后调用 `saveData()` 持久化，再调用 `renderAll()` 刷新 UI
- 所有用户输入使用 `escapeHtml()` 转义，防止 XSS

---

## 扩展开发

### 添加新的 IPC 通信

1. **preload.js** 暴露 API:

```javascript
contextBridge.exposeInMainWorld("electronAPI", {
  newFeature: (data) => ipcRenderer.invoke("new-feature", data),
});
```

2. **main.js** 处理调用:

```javascript
ipcMain.handle("new-feature", async (event, data) => {
  // 实现逻辑
  return { success: true, result: ... };
});
```

3. **渲染进程** 使用:

```javascript
const result = await window.electronAPI.newFeature(data);
```

### 添加新地图章节

编辑 `data.json`，按照现有格式添加新的 chapter 和 areas。

---

## 发布流程

1. 更新 `package.json` 中的版本号
2. 确保所有文件在 `files` 数组中
3. 运行 `npm run build:win` 生成安装包
4. 测试安装程序和便携版
5. 上传发布

---

## 贡献指南

- 遵循现有代码风格
- 保持中文注释和界面
- 测试 Windows 兼容性
- 更新开发文档

---

## 许可证

MIT License - 详见 `package.json`
