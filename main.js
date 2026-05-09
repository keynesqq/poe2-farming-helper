const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let floatWindow = null;
let mapMonitorInterval = null;
let currentLogPath = ""; // 当前监控的日志文件路径
let logPaths = []; // 存储的日志路径列表

// 日志路径存储文件
const LOG_PATHS_FILE = path.join(app.getPath("userData"), "log-paths.json");

// ===================== 日志路径管理 =====================
function loadLogPaths() {
  try {
    if (fs.existsSync(LOG_PATHS_FILE)) {
      const data = fs.readFileSync(LOG_PATHS_FILE, "utf8");
      logPaths = JSON.parse(data);
    }
  } catch (err) {
    console.error("[日志路径] 加载失败:", err.message);
    logPaths = [];
  }
}

function saveLogPaths() {
  try {
    fs.writeFileSync(LOG_PATHS_FILE, JSON.stringify(logPaths, null, 2), "utf8");
  } catch (err) {
    console.error("[日志路径] 保存失败:", err.message);
  }
}

const DEFAULT_LOG_PATHS = [
  "G:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt",
  "C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt",
  "D:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt",
  "E:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt",
];

function initDefaultLogPaths() {
  if (logPaths.length === 0) {
    logPaths = DEFAULT_LOG_PATHS.map((p) => ({ path: p, active: false }));
    // 标记第一个存在的路径为活跃
    const existingPath = logPaths.find((p) => fs.existsSync(p.path));
    if (existingPath) {
      existingPath.active = true;
      currentLogPath = existingPath.path;
    }
    saveLogPaths();
  } else {
    // 初始化时找到活跃路径作为当前路径
    const activePath = logPaths.find((p) => p.active);
    if (activePath && fs.existsSync(activePath.path)) {
      currentLogPath = activePath.path;
    }
  }
}

// ===================== 窗口创建 =====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "assets", "icon.ico"),
    titleBarStyle: "default",
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    // 页面加载完成后启动地图监控
    startMapMonitor();
  });

  mainWindow.on("closed", () => {
    stopMapMonitor();
    mainWindow = null;
    if (floatWindow) {
      floatWindow.close();
      floatWindow = null;
    }
  });
}

function createFloatWindow() {
  if (floatWindow) {
    floatWindow.show();
    return;
  }

  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const screenWidth = primaryDisplay.workAreaSize.width;
  const windowWidth = 600;
  const centerX = Math.round((screenWidth - windowWidth) / 2);

  floatWindow = new BrowserWindow({
    width: 600,
    minWidth: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "assets", "icon.ico"),
    titleBarStyle: "hidden",
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    x: centerX,
    y: 0,
    fullscreenable: false,
    backgroundColor: "#1b1915",
    frame: false,
    focusable: false,
  });

  floatWindow.loadFile("float.html");

  floatWindow.once("ready-to-show", () => {
    floatWindow.show();
  });

  floatWindow.on("closed", () => {
    floatWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("float-window-closed");
    }
  });

  floatWindow.on("moved", () => {
    const bounds = floatWindow.getBounds();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("float-window-moved", bounds);
    }
  });

  floatWindow.setMaximizable(false);
  floatWindow.on("maximize", () => {
    floatWindow.unmaximize();
  });
}

// ===================== 地图监控（主进程内实现） =====================
function startMapMonitor() {
  stopMapMonitor(); // 确保只有一个定时器在运行

  // 如果尚未设置日志路径，尝试自动查找
  if (!currentLogPath) {
    currentLogPath = DEFAULT_LOG_PATHS.find((p) => fs.existsSync(p)) || "";
  }

  if (!currentLogPath || !fs.existsSync(currentLogPath)) {
    console.log("[地图监控] 未找到日志文件，可通过“选择日志路径”按钮手动设置");
    mainWindow?.webContents?.send("log-path-not-found");
    return;
  }

  console.log(`[地图监控] 开始监控: ${currentLogPath}`);

  let lastSize = 0;
  try {
    lastSize = fs.statSync(currentLogPath).size;
  } catch (err) {
    console.error("[地图监控] 读取文件大小失败:", err.message);
    return;
  }

  let currentArea = "";
  const CHECK_INTERVAL = 3000;

  mapMonitorInterval = setInterval(() => {
    try {
      if (!fs.existsSync(currentLogPath)) {
        console.log("[地图监控] 日志文件不存在，停止监控");
        stopMapMonitor();
        return;
      }

      const stats = fs.statSync(currentLogPath);
      if (stats.size < lastSize) {
        // 日志被清空或重置
        lastSize = stats.size;
        currentArea = "";
        return;
      }
      if (stats.size === lastSize) return;

      const newBytes = stats.size - lastSize;
      const fd = fs.openSync(currentLogPath, "r");
      const buffer = Buffer.alloc(newBytes);
      fs.readSync(fd, buffer, 0, newBytes, lastSize);
      fs.closeSync(fd);
      lastSize = stats.size;

      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      let newArea = null;
      for (const line of lines) {
        const match = line.match(/\[SCENE\] Set Source \[([^\]]+)\]/);
        if (match) {
          const area = match[1];
          if (area !== "(null)" && area !== "(unknown)") {
            newArea = area;
          }
        }
      }

      if (newArea && newArea !== currentArea) {
        currentArea = newArea;
        console.log(`地图更新：${currentArea}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("map-detected", currentArea, true);
        }
      }
    } catch (err) {
      console.error("[地图监控] 读取错误:", err.message);
    }
  }, CHECK_INTERVAL);
}

function stopMapMonitor() {
  if (mapMonitorInterval) {
    clearInterval(mapMonitorInterval);
    mapMonitorInterval = null;
  }
}

// ===================== IPC 处理 =====================
// 获取应用版本
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// 浮窗控制
ipcMain.on("toggle-float-window", () => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.close();
    floatWindow = null;
  } else {
    createFloatWindow();
  }
});

ipcMain.on("update-float-data", (event, data) => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("float-data-update", data);
  }
});

ipcMain.on("float-nav", (event, direction) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("float-nav", direction);
  }
});

ipcMain.on("close-float-window", () => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.close();
    floatWindow = null;
  }
});

ipcMain.on("set-float-always-on-top", (event, flag) => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.setAlwaysOnTop(flag, "floating");
  }
});

ipcMain.handle("get-float-always-on-top", () => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    return floatWindow.isAlwaysOnTop();
  }
  return false;
});

ipcMain.on("set-float-height", (event, height) => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    const bounds = floatWindow.getBounds();
    floatWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: height,
    });
  }
});

// 任务状态同步（浮窗 -> 主窗口）
ipcMain.on("sync-task-check", (event, { taskId, checked }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-task-check", { taskId, checked });
  }
});

// 任务状态同步（主窗口 -> 浮窗）
ipcMain.on("sync-task-check-to-float", (event, { taskId, checked }) => {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("sync-task-check", { taskId, checked });
  }
});

// 地图检测同步（备用）
ipcMain.on("map-detected-sync", (event, mapName) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("map-detected-sync", mapName);
  }
});

// 用户手动选择日志文件
ipcMain.handle("select-log-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "选择 POE2 日志文件",
    defaultPath: currentLogPath || "",
    filters: [{ name: "日志文件", extensions: ["txt"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) return null;
  currentLogPath = filePaths[0];
  startMapMonitor(); // 重置监控
  return currentLogPath;
});

// ===================== 日志路径 IPC 处理 =====================
// 获取日志路径列表
ipcMain.handle("get-log-paths", () => {
  return logPaths;
});

// 添加日志路径
ipcMain.handle("add-log-path", (event, newPath) => {
  if (!newPath || typeof newPath !== "string") {
    return { success: false, error: "无效路径" };
  }
  // 检查是否已存在
  if (logPaths.some((p) => p.path === newPath)) {
    return { success: false, error: "路径已存在" };
  }
  // 如果这是第一个路径，设为活跃
  const isActive = logPaths.length === 0;
  logPaths.push({ path: newPath, active: isActive });
  if (isActive) {
    currentLogPath = newPath;
    startMapMonitor();
  }
  saveLogPaths();
  return { success: true };
});

// 删除日志路径
ipcMain.handle("remove-log-path", (event, targetPath) => {
  const idx = logPaths.findIndex((p) => p.path === targetPath);
  if (idx === -1) {
    return { success: false, error: "路径不存在" };
  }
  const wasActive = logPaths[idx].active;
  logPaths.splice(idx, 1);
  // 如果删除的是活跃路径，重新设置活跃路径
  if (wasActive && logPaths.length > 0) {
    logPaths[0].active = true;
    currentLogPath = logPaths[0].path;
    startMapMonitor();
  } else if (logPaths.length === 0) {
    currentLogPath = "";
    stopMapMonitor();
  }
  saveLogPaths();
  return { success: true };
});

// 更新日志路径
ipcMain.handle("update-log-path", (event, oldPath, newPath) => {
  if (!newPath || typeof newPath !== "string") {
    return { success: false, error: "无效路径" };
  }
  const idx = logPaths.findIndex((p) => p.path === oldPath);
  if (idx === -1) {
    return { success: false, error: "原路径不存在" };
  }
  // 检查新路径是否已存在
  if (logPaths.some((p, i) => p.path === newPath && i !== idx)) {
    return { success: false, error: "新路径已存在" };
  }
  const wasActive = logPaths[idx].active;
  logPaths[idx].path = newPath;
  if (wasActive) {
    currentLogPath = newPath;
    startMapMonitor();
  }
  saveLogPaths();
  return { success: true };
});

// 设置活跃日志路径
ipcMain.handle("set-active-log-path", (event, targetPath) => {
  const target = logPaths.find((p) => p.path === targetPath);
  if (!target) {
    return { success: false, error: "路径不存在" };
  }
  // 重置所有活跃状态
  logPaths.forEach((p) => (p.active = false));
  target.active = true;
  currentLogPath = targetPath;
  startMapMonitor();
  saveLogPaths();
  return { success: true };
});

// ===================== 缓存数据导入导出 IPC 处理 =====================
// 导出缓存数据
ipcMain.handle("export-cache", async (event, data) => {
  try {
    console.log("[主进程] 收到导出请求，数据:", JSON.stringify(data, null, 2));
    console.log("[主进程] checkedState:", data?.checkedState);
    console.log(
      "[主进程] checkedState 键数:",
      data?.checkedState ? Object.keys(data.checkedState).length : 0,
    );

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "导出缓存数据",
      defaultPath: "poe2-cache.json",
      filters: [{ name: "JSON 文件", extensions: ["json"] }],
      properties: ["showOverwriteConfirmation"],
    });

    if (canceled || !filePath) {
      return { success: false, error: "用户取消" };
    }

    console.log("[主进程] 写入文件:", filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log("[主进程] 文件写入成功");
    return { success: true };
  } catch (err) {
    console.error("[缓存导出] 失败:", err.message);
    return { success: false, error: err.message };
  }
});

// 选择图片文件
ipcMain.handle("select-image-file", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "选择图片文件",
      filters: [
        {
          name: "图片文件",
          extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, error: "用户取消" };
    }

    return { success: true, filePath: filePaths[0] };
  } catch (err) {
    console.error("[选择图片] 失败:", err.message);
    return { success: false, error: err.message };
  }
});

// 导入缓存数据
ipcMain.handle("import-cache", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "导入缓存数据",
      filters: [{ name: "JSON 文件", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, error: "用户取消" };
    }

    const filePath = filePaths[0];
    const data = fs.readFileSync(filePath, "utf8");
    const cacheData = JSON.parse(data);

    return { success: true, data: cacheData };
  } catch (err) {
    console.error("[缓存导入] 失败:", err.message);
    return { success: false, error: err.message };
  }
});

// ===================== 自定义协议 =====================
// 注册 app-image 协议用于安全加载本地图片文件
app.whenReady().then(() => {
  protocol.handle("app-image", async (request) => {
    try {
      const filePath = decodeURIComponent(
        request.url.replace("app-image://", ""),
      );
      // 验证文件存在
      if (!fs.existsSync(filePath)) {
        return new Response(null, { status: 404 });
      }
      const data = fs.readFileSync(filePath);
      // 根据扩展名推断 MIME 类型
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
      };
      const mimeType = mimeTypes[ext] || "application/octet-stream";
      return new Response(data, { headers: { "Content-Type": mimeType } });
    } catch (err) {
      console.error("[app-image] 加载图片失败:", err.message);
      return new Response(null, { status: 500 });
    }
  });
});

// ===================== 应用生命周期 =====================
app.whenReady().then(() => {
  loadLogPaths();
  initDefaultLogPaths();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopMapMonitor();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
