const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// specific ipc channels
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  selectLogFile: () => ipcRenderer.invoke("select-log-file"),

  // 日志路径管理
  getLogPaths: () => ipcRenderer.invoke("get-log-paths"),
  addLogPath: (path) => ipcRenderer.invoke("add-log-path", path),
  removeLogPath: (path) => ipcRenderer.invoke("remove-log-path", path),
  updateLogPath: (oldPath, newPath) =>
    ipcRenderer.invoke("update-log-path", oldPath, newPath),
  setActiveLogPath: (path) => ipcRenderer.invoke("set-active-log-path", path),

  // 缓存数据导入导出
  exportCache: (data) => ipcRenderer.invoke("export-cache", data),
  importCache: () => ipcRenderer.invoke("import-cache"),

  // 图片文件选择
  selectImageFile: () => ipcRenderer.invoke("select-image-file"),

  // 浮窗控制
  toggleFloatWindow: () => ipcRenderer.send("toggle-float-window"),
  updateFloatData: (data) => ipcRenderer.send("update-float-data", data),
  closeFloatWindow: () => ipcRenderer.send("close-float-window"),

  // 浮窗导航（供浮窗页面使用）
  floatPrev: () => ipcRenderer.send("float-nav", "prev"),
  floatNext: () => ipcRenderer.send("float-nav", "next"),

  // 浮窗置顶控制
  setFloatAlwaysOnTop: (flag) =>
    ipcRenderer.send("set-float-always-on-top", flag),
  getFloatAlwaysOnTop: () => ipcRenderer.invoke("get-float-always-on-top"),

  // 浮窗高度调整
  setFloatHeight: (height) => ipcRenderer.send("set-float-height", height),

  // 主窗口焦点强制获取（解决录屏时输入框无法使用）
  focusMainWindow: () => ipcRenderer.send("focus-main-window"),

  // 任务状态同步（浮窗 -> 主窗口）
  syncTaskCheck: (taskId, checked) =>
    ipcRenderer.send("sync-task-check", { taskId, checked }),
  // 任务状态同步（主窗口 -> 浮窗）
  syncTaskCheckToFloat: (taskId, checked) =>
    ipcRenderer.send("sync-task-check-to-float", { taskId, checked }),

  // 监听浮窗数据更新
  onFloatDataUpdate: (callback) =>
    ipcRenderer.on("float-data-update", (e, data) => callback(data)),

  onSyncTaskCheck: (callback) =>
    ipcRenderer.on("sync-task-check", (e, data) => callback(data)),
  onFloatWindowClosed: (callback) =>
    ipcRenderer.on("float-window-closed", callback),
  onFloatWindowMoved: (callback) =>
    ipcRenderer.on("float-window-moved", (e, bounds) => callback(bounds)),
  onFloatNav: (callback) =>
    ipcRenderer.on("float-nav", (e, direction) => callback(direction)),

  // 监听地图检测事件
  onMapDetected: (callback) =>
    ipcRenderer.on("map-detected", (e, mapName, isAutoDetected) =>
      callback(mapName, isAutoDetected),
    ),

  // 浮窗检测到的地图变化同步给主窗口
  syncMapDetectedToMain: (mapName) =>
    ipcRenderer.send("map-detected-sync", mapName),

  // 主窗口监听浮窗地图检测同步
  onMapDetectedSync: (callback) =>
    ipcRenderer.on("map-detected-sync", (e, mapName) => callback(mapName)),
});
