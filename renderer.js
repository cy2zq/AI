// renderer.js - 渲染进程脚本

let chromeProcess = null;
let isDebugMode = false;
let currentControlMode = "direct"; // 跟踪当前控制模式

// DOM 元素
const launchBtn = document.getElementById("launch-chrome");
const stopBtn = document.getElementById("stop-chrome");
const statusDiv = document.getElementById("status");
const browserActions = document.getElementById("browser-actions");
const urlInput = document.getElementById("url-input");
const navigateBtn = document.getElementById("navigate-btn");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");

// AI 对话元素
const aiChatPanel = document.getElementById("ai-chat-panel");
const chatMessages = document.getElementById("chat-messages");
const aiInput = document.getElementById("ai-input");
const aiSendBtn = document.getElementById("ai-send-btn");

// 日志路径元素
// const logPathDiv = document.getElementById("log-path");
// const logPathShort = document.getElementById("log-path-short");

let localIP = "";

// 加载并显示日志文件路径
// window.electronAPI
//   .getLogPath()
//   .then((logPath) => {
//     logPathDiv.textContent = logPath;
//     logPathShort.textContent = logPath;
//     console.log("日志文件路径:", logPath);
//   })
//   .catch((err) => {
//     logPathDiv.textContent = "无法获取日志路径";
//     console.error("获取日志路径失败:", err);
//   });

// 获取本机 IP 供后端路由使用
window.electronAPI
  .getLocalIP()
  .then((ip) => {
    localIP = ip || "";
    console.log("本机局域网 IP:", localIP);
  })
  .catch(() => {});

// 监听操作日志（只在 AI 对话窗口中显示）
window.electronAPI.onOperationLog((log) => {
  // 在 AI 对话窗口中显示工具调用（如果 AI 面板已显示）
  if (aiChatPanel.style.display !== "none") {
    addToolMessage(
      log.mcpName || "chrome-mcp",
      log.tool,
      log.message,
      log.type
    );
  }
});

// 更新状态显示
function updateStatus(message, isSuccess = false) {
  statusDiv.textContent = message;
  statusDiv.style.color = isSuccess ? "#4CAF50" : "#fff";
}

// 更新按钮状态
function updateButtons(debugMode) {
  isDebugMode = debugMode;
  launchBtn.disabled = debugMode;
  stopBtn.disabled = !debugMode;

  if (debugMode) {
    // 启动模式下，显示 AI 对话面板
    aiChatPanel.style.display = "block";
    browserActions.style.display = "none";
  } else {
    aiChatPanel.style.display = "none";
    browserActions.style.display = "none";
    updateStatus("⭕ MCP 模式未启动");
  }
}

// 启动 MCP 模式
launchBtn.addEventListener("click", async () => {
  console.log("🔵 启动按钮被点击");
  updateStatus("🚀 正在启动 MCP 模式...");

  // 从隐藏的 input 获取控制模式和配置
  const controlMode = document.getElementById("control-mode").value;
  const profileMode = document.getElementById("profile-mode").value;
  const useExistingProfile = profileMode === "existing";

  console.log("启动配置:", { controlMode, profileMode, useExistingProfile });

  // 检查 electronAPI 是否存在
  if (!window.electronAPI) {
    console.error("❌ window.electronAPI 未定义！");
    updateStatus("❌ Electron API 未加载，请重启应用");
    return;
  }

  if (!window.electronAPI.launchChrome) {
    console.error("❌ window.electronAPI.launchChrome 未定义！");
    updateStatus("❌ 启动函数未找到，请检查 preload.js");
    return;
  }

  try {
    console.log("🔵 调用 launchChrome...");
    const result = await window.electronAPI.launchChrome(
      controlMode,
      useExistingProfile
    );

    console.log("启动结果:", result);

    if (result.success) {
      currentControlMode = controlMode;
      updateButtons(true);
      updateStatus("✅ MCP 模式已启动 - AI 助手已就绪", true);
    } else {
      updateStatus("❌ 启动失败: " + result.error);
    }
  } catch (error) {
    console.error("启动错误:", error);
    updateStatus("❌ 启动失败: " + error.message);
  }
});

// 停止 Chrome 调试模式
stopBtn.addEventListener("click", async () => {
  const modeText = currentControlMode === "mcp" ? "MCP" : "Chrome";
  updateStatus(`⏹️ 正在停止 ${modeText}...`);

  try {
    const result = await window.electronAPI.stopChrome();
    if (result.success) {
      updateButtons(false);
      currentControlMode = "direct"; // 重置模式
    } else {
      updateStatus("❌ 停止失败: " + result.error);
    }
  } catch (error) {
    updateStatus("❌ 停止失败: " + error.message);
  }
});

// 导航到指定网址
navigateBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    alert("请输入网址");
    return;
  }

  // 确保网址有协议
  const fullUrl = url.startsWith("http") ? url : "https://" + url;

  try {
    const result = await window.electronAPI.navigateToUrl(fullUrl);
    if (result.success) {
      updateStatus(`✅ 已打开: ${fullUrl}`, true);
      urlInput.value = "";
    } else {
      updateStatus("❌ 打开失败: " + result.error);
    }
  } catch (error) {
    updateStatus("❌ 打开失败: " + error.message);
  }
});

// 百度搜索
searchBtn.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  if (!query) {
    alert("请输入搜索内容");
    return;
  }

  try {
    const result = await window.electronAPI.baiduSearch(query);
    if (result.success) {
      updateStatus(`✅ 已搜索: ${query}`, true);
      searchInput.value = "";
    } else {
      updateStatus("❌ 搜索失败: " + result.error);
    }
  } catch (error) {
    updateStatus("❌ 搜索失败: " + error.message);
  }
});

// 监听回车键
urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    navigateBtn.click();
  }
});

searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    searchBtn.click();
  }
});

// ========== AI 对话功能 ==========

// 添加消息到聊天窗口
function addMessage(role, content, useMarkdown = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // 如果是 assistant 消息且需要 Markdown，使用 marked 渲染
  if (useMarkdown && role === "assistant" && typeof marked !== "undefined") {
    contentDiv.innerHTML = marked.parse(content);
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  // 滚动到底部
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageDiv; // 返回元素以便后续操作
}

// 添加工具调用消息到聊天窗口（Cursor/CherryStudio 风格）
let currentToolMessageId = null;
let toolMessageCache = new Map(); // 缓存工具消息，用于更新状态

function addToolMessage(mcpName, toolName, message, type) {
  // 过滤掉系统启动消息，只显示实际的工具调用
  if (toolName === "系统" || toolName === "MCP") {
    return;
  }

  const messageId = `${mcpName}-${toolName}-${Date.now()}`;

  // 判断是开始还是结束
  const isStart = message.includes("开始执行") || message.includes("准备执行");
  const isSuccess = message.includes("✓") || message.includes("成功");
  const isError =
    message.includes("✗") ||
    message.includes("失败") ||
    message.includes("错误");

  if (isStart) {
    // 创建新的工具消息
    const messageDiv = document.createElement("div");
    messageDiv.className = "chat-message tool";
    messageDiv.dataset.messageId = messageId;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    // 提取参数信息
    const params = message
      .replace("开始执行", "")
      .replace("准备执行", "")
      .replace(/^[:：]\s*/, "")
      .trim();

    contentDiv.innerHTML = `
      <div class="tool-header">
        <span class="tool-mcp-name">${mcpName}</span>
        <span class="tool-name">${toolName}</span>
        <span class="tool-status running">⏳ 执行中...</span>
      </div>
      ${params ? `<div class="tool-params">${escapeHtml(params)}</div>` : ""}
    `;

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // 缓存消息以便后续更新
    toolMessageCache.set(toolName, {
      messageDiv,
      contentDiv,
      startTime: Date.now(),
      params,
    });
    currentToolMessageId = messageId;
  } else if (isSuccess || isError) {
    // 更新现有消息的状态
    const cached = toolMessageCache.get(toolName);
    if (cached) {
      const duration = Date.now() - cached.startTime;
      const statusClass = isSuccess ? "success" : "error";
      const statusIcon = isSuccess ? "✓" : "✗";
      const statusText = isSuccess ? "成功" : "失败";

      // 提取错误信息
      let errorInfo = "";
      if (isError) {
        errorInfo = message.replace("✗", "").replace("执行异常:", "").trim();
      }

      cached.contentDiv.innerHTML = `
        <div class="tool-header">
          <span class="tool-mcp-name">${mcpName}</span>
          <span class="tool-name">${toolName}</span>
          <span class="tool-status ${statusClass}">${statusIcon} ${statusText}</span>
        </div>
        ${cached.params ? `<div class="tool-params">${escapeHtml(cached.params)}</div>` : ""}
        ${errorInfo ? `<div class="tool-params" style="color: #e57373;">${escapeHtml(errorInfo)}</div>` : ""}
        <div class="tool-duration">⏱ ${duration}ms</div>
      `;

      // 从缓存中移除
      toolMessageCache.delete(toolName);
    }
  }

  // 滚动到底部
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 发送消息到 AI（使用 SSE 流式返回）
async function sendToAI(message) {
  if (!message.trim()) {
    alert("请输入消息");
    return;
  }

  // 添加用户消息
  addMessage("user", message);
  aiInput.value = "";
  aiInput.disabled = true;
  aiSendBtn.disabled = true;

  // 创建状态消息（会实时更新）
  let statusMsg = addMessage("system", "🚀 开始处理...");
  let toolsUsed = [];
  let currentLoop = 0;

  try {
    console.log("发送消息到后端（流式）:", message);

    const response = await fetch("http://localhost:3000/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MCP-Host": localIP || "",
        "X-MCP-Port": "9224",
      },
      body: JSON.stringify({
        sessionId: "electron-app",
        message: message,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventType = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEventType = line.substring(7).trim();
          continue;
        }

        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.substring(6));

          // 根据事件类型更新界面
          switch (currentEventType) {
            case "start":
              statusMsg.querySelector(".message-content").textContent =
                "🚀 " + data.message;
              break;

            case "loop":
              currentLoop = data.count;
              statusMsg.querySelector(".message-content").textContent =
                `🔄 ${data.message}`;
              break;

            case "thinking":
              statusMsg.querySelector(".message-content").textContent =
                "🤔 " + data.message;
              break;

            case "tools":
              statusMsg.querySelector(".message-content").textContent =
                `🛠️ 准备执行 ${data.count} 个工具...`;
              break;

            case "tool_start":
              statusMsg.querySelector(".message-content").textContent =
                `⚙️ 执行: ${data.name}...`;
              toolsUsed.push(data.name);
              break;

            case "tool_complete":
              statusMsg.querySelector(".message-content").textContent =
                `✅ ${data.name} - ${data.message}`;
              break;

            case "tool_error":
              addMessage("error", `❌ ${data.name} 失败: ${data.error}`);
              break;

            case "system":
              // 系统消息（如清理历史）
              break;

            case "complete":
              // 任务完成
              chatMessages.removeChild(statusMsg);
              addMessage("assistant", data.message, true); // 使用 Markdown 渲染

              if (data.toolsUsed && data.toolsUsed.length > 0) {
                const toolInfo = data.loops
                  ? `✨ 执行了 ${data.loops} 轮，使用了 ${data.toolsUsed.length} 个工具: ${data.toolsUsed.join(" → ")}`
                  : `✨ 已使用工具: ${data.toolsUsed.join(", ")}`;
                addMessage("system", toolInfo);
              }
              break;

            case "error":
              chatMessages.removeChild(statusMsg);
              addMessage("error", "❌ " + data.message);
              break;
          }
        }
      }
    }
  } catch (error) {
    console.error("AI 通信错误:", error);
    // 移除状态消息
    if (chatMessages.contains(statusMsg)) {
      chatMessages.removeChild(statusMsg);
    }
    addMessage("error", "❌ 无法连接到 AI 服务，请确保后端服务已启动");
  } finally {
    aiInput.disabled = false;
    aiSendBtn.disabled = false;
    aiInput.focus();
  }
}

// AI 发送按钮
aiSendBtn.addEventListener("click", () => {
  sendToAI(aiInput.value);
});

// AI 输入框回车键
aiInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendToAI(aiInput.value);
  }
});

// 监听来自主进程的状态更新
window.electronAPI.onChromeStatus((status) => {
  if (status.running === false) {
    updateButtons(false);
  }
});

// 初始化状态
updateButtons(false);

// 页面加载完成日志
console.log("✅ renderer.js 加载完成");
console.log("✅ electronAPI 状态:", window.electronAPI ? "已加载" : "未加载");
if (window.electronAPI) {
  console.log("✅ launchChrome 方法:", typeof window.electronAPI.launchChrome);
}
console.log("✅ 启动按钮:", launchBtn ? "已找到" : "未找到");
