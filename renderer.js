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
const logPathDiv = document.getElementById("log-path");
const logPathShort = document.getElementById("log-path-short");

// 加载并显示日志文件路径
window.electronAPI
  .getLogPath()
  .then((logPath) => {
    logPathDiv.textContent = logPath;
    logPathShort.textContent = logPath;
    console.log("日志文件路径:", logPath);
  })
  .catch((err) => {
    logPathDiv.textContent = "无法获取日志路径";
    console.error("获取日志路径失败:", err);
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
  updateStatus("🚀 正在启动 MCP 模式...");

  // 从隐藏的 input 获取控制模式和配置
  const controlMode = document.getElementById("control-mode").value;
  const profileMode = document.getElementById("profile-mode").value;
  const useExistingProfile = profileMode === "existing";

  console.log("启动配置:", { controlMode, profileMode, useExistingProfile });

  try {
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
function addMessage(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = content;

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  // 滚动到底部
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageDiv; // 返回元素以便后续操作
}

// 发送消息到 AI
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

  // 显示"思考中"
  const thinkingMsg = addMessage("system", "🤔 AI 正在思考并执行指令...");

  try {
    console.log("发送消息到后端:", message);

    const response = await fetch("http://10.1.110.242:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "electron-app",
        message: message,
      }),
    });

    console.log("后端响应状态:", response.status);
    const data = await response.json();
    console.log("后端响应数据:", data);

    // 移除"思考中"消息
    if (chatMessages.lastChild === thinkingMsg) {
      chatMessages.removeChild(thinkingMsg);
    }

    if (data.success) {
      // 添加 AI 响应
      addMessage("assistant", data.message);

      // 如果使用了工具，显示详细信息
      if (data.toolsUsed && data.toolsUsed.length > 0) {
        const toolInfo = data.loops
          ? `✨ 执行了 ${data.loops} 轮，使用了 ${
              data.toolsUsed.length
            } 个工具: ${data.toolsUsed.join(" → ")}`
          : `✨ 已使用工具: ${data.toolsUsed.join(", ")}`;
        addMessage("system", toolInfo);
      }

      // 如果有警告
      if (data.warning) {
        addMessage("system", `⚠️ ${data.warning}`);
      }
    } else {
      addMessage("error", "❌ 错误: " + data.error);
    }
  } catch (error) {
    console.error("AI 通信错误:", error);
    // 移除"思考中"消息
    if (chatMessages.contains(thinkingMsg)) {
      chatMessages.removeChild(thinkingMsg);
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
