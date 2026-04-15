# Playwright 与 Chrome DevTools MCP 集成指南

## 概述

本应用现在同时支持两种浏览器自动化引擎：

1. **Chrome DevTools MCP** - 基于 Chrome DevTools Protocol 的 MCP 服务器
2. **Playwright** - Microsoft 开发的跨浏览器自动化工具

## 安装依赖

```bash
cd /Users/cy/cy/other/electorn
npm install
```

这将自动安装：

- `chrome-devtools-mcp` - Chrome MCP 服务器
- `playwright` - Playwright 核心库
- 其他必要依赖

首次使用 Playwright 时，还需要安装浏览器驱动：

```bash
npx playwright install chromium
# 或者使用系统已安装的 Chrome
```

## 使用方法

### 方式一：通过 Electron 界面（开发中）

在界面上选择使用的引擎：

- **Chrome MCP** - 适合需要精确控制 DevTools 功能的场景
- **Playwright** - 适合复杂的自动化测试和表单填写

### 方式二：通过 IPC 调用

#### 启动浏览器

```javascript
// 启动 Chrome MCP
await window.electronAPI.launchChrome("mcp", false, "chrome-mcp");

// 启动 Playwright
await window.electronAPI.launchChrome("mcp", false, "playwright");
```

#### Playwright API 调用

```javascript
// 导航到 URL
await window.electronAPI.playwrightNavigate("https://www.baidu.com");

// 点击元素
await window.electronAPI.playwrightClick("button#submit");

// 填写输入框
await window.electronAPI.playwrightFill("input#username", "张三");

// 执行 JavaScript
const result = await window.electronAPI.playwrightEvaluate(`
  document.title
`);

// 截图
const screenshot = await window.electronAPI.playwrightScreenshot({
  type: "png",
  fullPage: true,
});

// 获取页面标题
const titleResult = await window.electronAPI.playwrightGetTitle();
```

### 方式三：通过 HTTP API（端口 9224）

应用启动后会在 9224 端口提供 HTTP API 服务。

#### 导航示例

```bash
curl -X POST http://localhost:9224/api/playwright/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.baidu.com"}'
```

#### 填写表单示例

```bash
curl -X POST http://localhost:9224/api/playwright/fill \
  -H "Content-Type: application/json" \
  -d '{"selector": "input#kw", "value": "playwright"}'
```

## 两种引擎对比

| 特性       | Chrome DevTools MCP     | Playwright            |
| ---------- | ----------------------- | --------------------- |
| 浏览器支持 | Chrome/Chromium         | Chrome/Firefox/Safari |
| API 复杂度 | 较低（基于可访问性树）  | 中等（基于选择器）    |
| 性能       | 优秀                    | 优秀                  |
| 调试能力   | 强（直接使用 DevTools） | 强（内置调试工具）    |
| 跨浏览器   | 否                      | 是                    |
| 适用场景   | DevTools 相关功能       | 通用自动化测试        |

## 示例：完整的表单填写流程

### 使用 Playwright

```javascript
// 1. 启动浏览器
await window.electronAPI.launchChrome("mcp", false, "playwright");

// 2. 导航到表单页面
await window.electronAPI.playwrightNavigate("http://10.1.110.242:8000/test");

// 3. 填写表单
await window.electronAPI.playwrightFill('input[id*="name"]', "晁阳");
await window.electronAPI.playwrightFill("textarea", "喜欢看书");

// 4. 选择下拉框（需要先点击）
await window.electronAPI.playwrightClick(".ant-select");
await window.electronAPI.playwrightClick('.ant-select-item-option[title="男"]');

// 5. 选择日期
await window.electronAPI.playwrightClick(".ant-picker-input input");
// 注意：日期选择器可能需要多步操作，根据实际情况调整

// 6. 提交表单
await window.electronAPI.playwrightClick('button[type="submit"]');

// 7. 验证结果
const title = await window.electronAPI.playwrightGetTitle();
console.log("页面标题:", title);
```

### 使用 Chrome DevTools MCP

```javascript
// 1. 启动浏览器
await window.electronAPI.launchChrome("mcp", false, "chrome-mcp");

// 2. 通过 HTTP API 调用 MCP 工具
const response = await fetch("http://localhost:9224/api/mcp/take_snapshot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});

const snapshot = await response.json();
console.log("页面快照:", snapshot);

// 3. 使用 uid 进行交互（从快照中获取）
await fetch("http://localhost:9224/api/mcp/fill", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    uid: "e47", // 从快照中获取的元素 uid
    value: "晁阳",
  }),
});
```

## 最佳实践

### 1. 选择合适的引擎

- **简单任务**：两者都可以
- **需要 DevTools 功能**：使用 Chrome MCP
- **复杂表单操作**：推荐 Playwright
- **需要跨浏览器**：必须使用 Playwright

### 2. 错误处理

```javascript
try {
  await window.electronAPI.playwrightNavigate(url);
} catch (error) {
  console.error("导航失败:", error);
  // 可以尝试重试或使用备用方案
}
```

### 3. 选择器策略

Playwright 支持多种选择器：

- CSS: `'button#submit'`
- Text: `'text=提交'`
- XPath: `'//button[@id="submit"]'`
- 组合: `'div.form >> input[name="username"]'`

推荐使用语义化的选择器，提高稳定性。

### 4. 等待策略

Playwright 会自动等待元素可操作，但对于特殊情况可能需要显式等待：

```javascript
// 在 Playwright Manager 中添加
await this.page.waitForSelector("button#submit", {
  state: "visible",
  timeout: 5000,
});
```

## 开发和调试

### 启动开发模式

```bash
npm run dev
```

### 查看日志

日志文件位置会在应用界面显示，通常在：

```
~/Library/Application Support/chrome-mcp-controller/mcp-debug.log
```

### 调试 Playwright

Playwright 支持 Inspector 调试：

```javascript
// 在 playwright-manager.js 中修改启动选项
this.browser = await chromium.launch({
  headless: false,
  slowMo: 1000, // 每个操作延迟 1 秒，便于观察
});
```

## 常见问题

### Q: Playwright 启动失败？

A: 确保已安装浏览器驱动：

```bash
npx playwright install chromium
```

### Q: 如何在两个引擎之间切换？

A: 需要先停止当前引擎，再启动另一个：

```javascript
await window.electronAPI.stopChrome();
await window.electronAPI.launchChrome("mcp", false, "playwright");
```

### Q: 可以同时运行两个引擎吗？

A: 目前不支持，需要选择其中一个使用。

### Q: Playwright 和 Chrome MCP 性能如何？

A: 两者性能都很好，主要差异在于：

- Chrome MCP：更轻量，适合简单操作
- Playwright：功能更强大，适合复杂场景

## 扩展功能

### 添加新的 Playwright 操作

1. 在 `playwright-manager.js` 中添加方法：

```javascript
async selectOption(selector, value) {
  if (!this.isPlaywrightRunning()) {
    throw new Error('Playwright 未运行');
  }
  await this.page.selectOption(selector, value);
  return { success: true };
}
```

2. 在 `main.js` 中添加 IPC 处理器：

```javascript
ipcMain.handle("playwright-select-option", async (event, selector, value) => {
  try {
    return await playwrightManager.selectOption(selector, value);
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

3. 在 `preload.js` 中暴露 API：

```javascript
playwrightSelectOption: (selector, value) =>
  ipcRenderer.invoke("playwright-select-option", selector, value),
```

## 技术支持

- Chrome DevTools MCP: https://github.com/chrishayuk/chrome-devtools-mcp
- Playwright: https://playwright.dev/
- 项目地址: /Users/cy/cy/other/electorn

## 更新日志

### v1.1.0 (2025-10-21)

- ✅ 集成 Playwright 支持
- ✅ 支持 Chrome MCP 和 Playwright 双引擎
- ✅ 添加 Playwright API 封装
- ✅ 完善错误处理和日志记录
