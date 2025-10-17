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
  // Chrome 调试模式控制
  launchChrome: (mode, useExistingProfile) =>
    ipcRenderer.invoke("launch-chrome", mode, useExistingProfile),
  stopChrome: () => ipcRenderer.invoke("stop-chrome"),

  // 浏览器操作（直接控制模式）
  navigateToUrl: (url) => ipcRenderer.invoke("navigate-to-url", url),
  baiduSearch: (query) => ipcRenderer.invoke("baidu-search", query),

  // MCP 专用操作
  mcpNavigate: (url) => ipcRenderer.invoke("mcp-navigate", url),
  mcpSearchTaobao: (keyword) =>
    ipcRenderer.invoke("mcp-search-taobao", keyword),
  mcpSearchBaidu: (keyword) => ipcRenderer.invoke("mcp-search-baidu", keyword),

  // 监听 Chrome 状态变化
  onChromeStatus: (callback) => {
    ipcRenderer.on("chrome-status", (event, status) => callback(status));
  },

  // 获取日志文件路径
  getLogPath: () => ipcRenderer.invoke("get-log-path"),
});
