# AI 智能选择 MCP 工具指南

## 🎯 目标

让 AI 根据具体业务场景，智能选择使用 **Chrome MCP** 还是 **Playwright**，实现最优的自动化效果。

## 🚀 统一工作流程

### 步骤 1: 启动浏览器（MCP 模式）

```javascript
// 在 Electron 应用中点击"启动 MCP 模式"
// 或通过代码启动
await window.electronAPI.launchChrome("mcp", false, "chrome-mcp");
```

现在 Chrome 已启动，**同时支持**：

- ✅ Chrome MCP 通过管道连接
- ✅ Playwright 通过端口 9222 连接

### 步骤 2: Playwright 连接到同一浏览器

```javascript
// Playwright 连接到 MCP 启动的 Chrome
await window.electronAPI.playwrightConnectCDP("http://localhost:9222");
```

### 步骤 3: AI 根据任务选择工具

现在 AI 可以在**同一个浏览器实例**中自由切换使用两个工具！

## 🤖 AI 决策矩阵

### Chrome MCP 适用场景

| 任务类型     | 示例                 | 原因                   |
| ------------ | -------------------- | ---------------------- |
| **简单导航** | 打开网页、前进后退   | API 简单，性能好       |
| **页面快照** | 获取可访问性树       | MCP 的核心功能         |
| **元素定位** | 通过 uid 精确定位    | 基于可访问性树，更准确 |
| **调试信息** | 查看控制台、网络请求 | DevTools 原生支持      |

**示例代码**：

```javascript
// 1. 打开页面
await window.electronAPI.mcpNavigate("https://example.com");

// 2. 获取页面快照（获取所有元素的 uid）
const snapshot = await fetch("http://localhost:9224/api/mcp/take_snapshot", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});

const data = await snapshot.json();
// 从快照中找到目标元素的 uid

// 3. 使用 uid 进行操作
await fetch("http://localhost:9224/api/mcp/click", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ uid: "e47" }),
});
```

### Playwright 适用场景

| 任务类型            | 示例                   | 原因                 |
| ------------------- | ---------------------- | -------------------- |
| **复杂表单填写**    | 多字段表单、动态表单   | 选择器灵活，自动等待 |
| **高级交互**        | 拖拽、hover、键盘操作  | API 功能丰富         |
| **条件判断**        | 元素是否存在、文本匹配 | 内置断言和等待       |
| **JavaScript 执行** | 复杂的页面脚本         | evaluate 功能强大    |
| **文件上传**        | 选择文件上传           | 原生支持             |

**示例代码**：

```javascript
// 1. 复杂表单填写
await window.electronAPI.playwrightFill('input[name="username"]', "晁阳");
await window.electronAPI.playwrightFill(
  'input[name="email"]',
  "cy@example.com"
);

// 2. 处理下拉框
await window.electronAPI.playwrightClick(".ant-select-selector");
await window.electronAPI.playwrightClick('.ant-select-item-option[title="男"]');

// 3. 执行复杂逻辑
const result = await window.electronAPI.playwrightEvaluate(`
  // 获取表单数据
  const form = document.querySelector('form');
  const formData = new FormData(form);
  return Object.fromEntries(formData);
`);

// 4. 条件等待
await window.electronAPI.playwrightWaitForSelector(".success-message");
```

## 🧠 AI 智能决策流程

```javascript
async function aiSmartAutomation(task) {
  // AI 分析任务
  const taskAnalysis = analyzeTask(task);

  if (taskAnalysis.type === "simple_navigation") {
    // 简单任务 → 使用 Chrome MCP
    console.log("AI 选择: Chrome MCP (简单快速)");
    await window.electronAPI.mcpNavigate(task.url);
  } else if (taskAnalysis.type === "complex_form") {
    // 复杂表单 → 使用 Playwright
    console.log("AI 选择: Playwright (灵活强大)");

    for (const field of task.formFields) {
      if (field.type === "select") {
        await window.electronAPI.playwrightClick(field.selector);
        await window.electronAPI.playwrightClick(`[title="${field.value}"]`);
      } else {
        await window.electronAPI.playwrightFill(field.selector, field.value);
      }
    }
  } else if (taskAnalysis.type === "hybrid") {
    // 混合任务 → 组合使用
    console.log("AI 选择: 混合模式 (发挥各自优势)");

    // 用 MCP 导航
    await window.electronAPI.mcpNavigate(task.url);

    // 用 MCP 获取页面结构
    const snapshot = await getMCPSnapshot();

    // 用 Playwright 填写复杂表单
    await window.electronAPI.playwrightFill("input#name", task.name);

    // 用 MCP 的精确定位点击提交按钮
    await mcpClickByUid(snapshot.submitButtonUid);
  }
}
```

## 📋 完整使用示例

### 场景：自动填写表单并提交

```javascript
async function autoFillForm() {
  // ============ 第一步：启动和连接 ============
  console.log("1️⃣ 启动 Chrome MCP...");
  await window.electronAPI.launchChrome("mcp", false, "chrome-mcp");

  // 等待浏览器启动
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("2️⃣ Playwright 连接到同一浏览器...");
  const connectResult = await window.electronAPI.playwrightConnectCDP(
    "http://localhost:9222"
  );

  if (!connectResult.success) {
    console.error("连接失败:", connectResult.error);
    return;
  }

  console.log("✅ 两个工具已准备就绪！");

  // ============ 第二步：AI 执行任务 ============

  // 用 MCP 导航（简单快速）
  console.log("3️⃣ MCP: 打开表单页面...");
  await window.electronAPI.mcpNavigate("http://10.1.110.242:8000/test");

  // 等待页面加载
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 用 Playwright 填写表单（灵活强大）
  console.log("4️⃣ Playwright: 填写表单...");

  // 姓名
  await window.electronAPI.playwrightFill('input[id*="name"]', "晁阳");
  console.log("  ✓ 姓名已填写");

  // 简介
  await window.electronAPI.playwrightFill("textarea", "喜欢看书，热爱编程");
  console.log("  ✓ 简介已填写");

  // 性别（复杂下拉框）
  await window.electronAPI.playwrightClick(".ant-select-selector");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.electronAPI.playwrightClick(
    '.ant-select-item-option[title="男"]'
  );
  console.log("  ✓ 性别已选择");

  // 日期（Ant Design DatePicker - 复杂组件）
  await window.electronAPI.playwrightClick(".ant-picker-input input");
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 选择年份
  await window.electronAPI.playwrightClick(".ant-picker-year-btn");
  await window.electronAPI.playwrightClick(
    '.ant-picker-cell-inner:has-text("1993")'
  );

  // 选择月份
  await window.electronAPI.playwrightClick(".ant-picker-month-btn");
  await window.electronAPI.playwrightClick(
    '.ant-picker-cell-inner:has-text("2月")'
  );

  // 选择日期
  await window.electronAPI.playwrightClick(
    '.ant-picker-cell-inner:has-text("18")'
  );
  console.log("  ✓ 日期已选择");

  // ============ 第三步：用 MCP 获取精确的提交按钮 ============
  console.log("5️⃣ MCP: 获取页面快照...");
  const snapshotResp = await fetch(
    "http://localhost:9224/api/mcp/take_snapshot",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );

  const snapshot = await snapshotResp.json();
  console.log("  ✓ 快照已获取");

  // 从快照中找到提交按钮的 uid（这里假设是 e83）
  // 实际应该解析 snapshot 数据
  const submitButtonUid = "e83";

  // 用 MCP 精确点击
  console.log("6️⃣ MCP: 点击提交按钮...");
  await fetch("http://localhost:9224/api/mcp/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: submitButtonUid }),
  });

  console.log("✅ 表单提交成功！");

  // 用 Playwright 验证结果
  const title = await window.electronAPI.playwrightGetTitle();
  console.log("7️⃣ 当前页面:", title.title);
}

// 执行
autoFillForm().catch(console.error);
```

## 🎨 AI 决策规则总结

### 使用 Chrome MCP 当：

- ✅ 需要获取页面结构（可访问性树）
- ✅ 简单的导航和点击
- ✅ 需要精确的元素定位（uid）
- ✅ 查看 DevTools 信息（控制台、网络）

### 使用 Playwright 当：

- ✅ 填写复杂表单
- ✅ 处理动态内容和等待
- ✅ 执行复杂的 JavaScript
- ✅ 需要灵活的选择器（CSS、Text、XPath）
- ✅ 文件上传、拖拽等高级交互

### 混合使用当：

- ✅ 任务既需要精确定位又需要复杂交互
- ✅ 需要 MCP 的页面结构 + Playwright 的灵活性
- ✅ 复杂的多步骤自动化流程

## 🚦 快速开始

### 1. 启动应用

```bash
cd /Users/cy/cy/other/electorn
npm start
```

### 2. 在应用中点击"启动 MCP 模式"

### 3. 在控制台测试连接

```javascript
// 测试 MCP
await window.electronAPI.mcpNavigate("https://www.baidu.com");

// 连接 Playwright
await window.electronAPI.playwrightConnectCDP("http://localhost:9222");

// 测试 Playwright
await window.electronAPI.playwrightFill("input#kw", "测试");

// 两者可以交替使用！
await window.electronAPI.mcpNavigate("http://10.1.110.242:8000/test");
await window.electronAPI.playwrightFill('input[id*="name"]', "晁阳");
```

## 🎯 最佳实践

1. **启动顺序**：先启动 MCP，再连接 Playwright
2. **任务分析**：让 AI 先分析任务复杂度
3. **工具选择**：简单用 MCP，复杂用 Playwright
4. **混合使用**：发挥各自优势
5. **错误处理**：两个工具都要有异常捕获

现在您的应用完美支持 AI 智能决策了！🎉
