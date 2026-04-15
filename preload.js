// 所有的 Node.js API接口 都可以在 preload 进程中被调用.
// 它拥有与Chrome扩展一样的沙盒。
const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ["chrome", "node", "electron"]) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // Chrome 调试模式控制（支持选择引擎）
  launchChrome: (mode, useExistingProfile, engine) =>
    ipcRenderer.invoke("launch-chrome", mode, useExistingProfile, engine),
  stopChrome: () => ipcRenderer.invoke("stop-chrome"),

  // 浏览器操作（直接控制模式）
  navigateToUrl: (url) => ipcRenderer.invoke("navigate-to-url", url),
  baiduSearch: (query) => ipcRenderer.invoke("baidu-search", query),

  // MCP 专用操作
  mcpNavigate: (url) => ipcRenderer.invoke("mcp-navigate", url),
  mcpSearchTaobao: (keyword) =>
    ipcRenderer.invoke("mcp-search-taobao", keyword),
  mcpSearchBaidu: (keyword) => ipcRenderer.invoke("mcp-search-baidu", keyword),

  // Playwright 专用操作
  playwrightNavigate: (url) => ipcRenderer.invoke("playwright-navigate", url),
  playwrightClick: (selector) =>
    ipcRenderer.invoke("playwright-click", selector),
  playwrightFill: (selector, value) =>
    ipcRenderer.invoke("playwright-fill", selector, value),
  playwrightScreenshot: (options) =>
    ipcRenderer.invoke("playwright-screenshot", options),
  playwrightEvaluate: (script) =>
    ipcRenderer.invoke("playwright-evaluate", script),
  playwrightGetTitle: () => ipcRenderer.invoke("playwright-get-title"),
  playwrightConnectCDP: (cdpUrl) =>
    ipcRenderer.invoke("playwright-connect-cdp", cdpUrl),

  // 监听 Chrome 状态变化
  onChromeStatus: (callback) => {
    ipcRenderer.on("chrome-status", (event, status) => callback(status));
  },

  // 监听操作日志
  onOperationLog: (callback) => {
    ipcRenderer.on("operation-log", (event, log) => callback(log));
  },

  // 获取日志文件路径
  getLogPath: () => ipcRenderer.invoke("get-log-path"),
  // 获取本机局域网 IP
  getLocalIP: () => ipcRenderer.invoke("get-local-ip"),
});
