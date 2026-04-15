const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const HTTPServer = require("./http-server");
const fs = require("fs");
const os = require("os");
const { WebSocket } = require("ws");
const crypto = require("crypto");
const PlaywrightManager = require("./playwright-manager");

// 创建日志文件（用于排查双击启动问题）
const logFile = path.join(app.getPath("userData"), "mcp-debug.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message); // 仍然输出到控制台
  logStream.write(logMessage);
}

writeLog("=== APP 启动 ===");
writeLog(`日志文件位置: ${logFile}`);

// 热更新功能由 nodemon 提供，无需额外配置

// Chrome 进程管理
let chromeProcess = null;
let mainWindow = null;
let mcpProcess = null;
let controlMode = "direct";

// Playwright 管理
let playwrightManager = null;
let browserEngine = "chrome-mcp"; // chrome-mcp | playwright

// MCP 通信相关变量
let mcpRequestId = 0;
let mcpPendingRequests = new Map(); // direct 或 mcp

// HTTP 服务器
let httpServer = null;
let wsClient = null;

// 生成/读取持久化的 ClientID（保存在 userData 下）
function getPersistentClientId() {
  try {
    const idFile = path.join(app.getPath("userData"), "client-id.txt");
    if (fs.existsSync(idFile)) {
      const saved = fs.readFileSync(idFile, "utf8").trim();
      if (saved) return saved;
    }
    const id = `${os.hostname()}-${crypto.randomUUID()}`;
    fs.writeFileSync(idFile, id, "utf8");
    return id;
  } catch (e) {
    return `${os.hostname()}-${process.pid}`;
  }
}

// 获取本机局域网 IPv4 地址（优先 en0/Wi-Fi，其次第一张非内网回环）
function getLocalIPv4() {
  try {
    const nets = os.networkInterfaces();
    const pick = (name) =>
      (nets[name] || []).find((x) => x.family === "IPv4" && !x.internal)
        ?.address;
    const preferred =
      pick("en0") || pick("Wi-Fi") || pick("Ethernet") || pick("en1");
    if (preferred) return preferred;
    for (const key of Object.keys(nets)) {
      const found = (nets[key] || []).find(
        (x) => x.family === "IPv4" && !x.internal
      );
      if (found) return found.address;
    }
  } catch {}
  return "";
}

const createWindow = () => {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 加载 index.html（可以通过环境变量切换到测试页面）
  const htmlFile = process.env.TEST_MODE === "1" ? "test-simple.html" : "index.html";
  mainWindow.loadFile(htmlFile);
  writeLog(`加载页面: ${htmlFile}`);

  // 开发环境下自动打开开发者工具
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // 添加快捷键：Cmd+R 刷新页面
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "r" && (input.meta || input.control)) {
      mainWindow.webContents.reload();
    }
  });
};

// 这段程序将会在 Electron 结束初始化
// 和创建浏览器窗口的时候调用
// 部分 API 在 ready 事件触发后才能使用。
app.whenReady().then(() => {
  // 设置 macOS Dock 图标（开发/运行时）
  if (process.platform === "darwin") {
    try {
      const dockIcon = nativeImage.createFromPath(
        path.join(__dirname, "resources", "Ai_File.icns")
      );
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (e) {
      // 忽略设置图标失败
    }
  }

  createWindow();

  // 允许通过环境变量在启动时自动进入 MCP 模式，便于无人值守验证
  if (process.env.AUTO_MCP === "1") {
    writeLog("检测到 AUTO_MCP=1，启动 MCP 模式以便自动验证");
    launchMCP().then((res) => {
      writeLog(`AUTO_MCP 启动结果: ${JSON.stringify(res)}`);
    });
  }

  // 若配置了后端 WS 地址，则注册 WS 客户端
  const wsUrl = process.env.BACKEND_WS_URL || process.env.MCP_WS_URL;
  if (wsUrl) {
    const clientId = process.env.CLIENT_ID || getPersistentClientId();
    try {
      const url = `${wsUrl}?clientId=${encodeURIComponent(clientId)}`;
      writeLog(`连接后端 WS: ${url}`);
      wsClient = new WebSocket(url);

      wsClient.on("open", () => {
        writeLog(`WS 已连接: ${clientId}`);
      });

      wsClient.on("message", async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg && msg.type === "mcp.call" && msg.id) {
            const { tool, args } = msg;
            let response;

            if (tool === "navigate_page") {
              response = await sendMCPRequest("tools/call", {
                name: "navigate_page",
                arguments: args || {},
              });
            } else if (tool === "search" || tool === "search-baidu") {
              // 默认搜索或百度搜索
              const keyword = args?.keyword || "";
              const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
              response = await sendMCPRequest("tools/call", {
                name: "navigate_page",
                arguments: { url, timeout: 10000 },
              });
            } else if (tool === "search-taobao") {
              const keyword = args?.keyword || "";
              const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`;
              response = await sendMCPRequest("tools/call", {
                name: "navigate_page",
                arguments: { url, timeout: 10000 },
              });
            } else if (tool === "search-jd") {
              const keyword = args?.keyword || "";
              const url = `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}`;
              response = await sendMCPRequest("tools/call", {
                name: "navigate_page",
                arguments: { url, timeout: 10000 },
              });
            } else {
              response = { error: `unsupported tool: ${tool}` };
            }

            const ack = {
              type: "mcp.result",
              id: msg.id,
              ok: !response?.error,
              data: response,
            };
            wsClient.send(JSON.stringify(ack));
          }
        } catch (e) {
          writeLog(`WS 消息处理错误: ${e.message}`);
        }
      });

      wsClient.on("close", () => {
        writeLog("WS 已断开");
      });

      wsClient.on("error", (err) => {
        writeLog(`WS 错误: ${err.message}`);
      });
    } catch (e) {
      writeLog(`WS 初始化失败: ${e.message}`);
    }
  }

  // 暴露本机 IP 给渲染进程
  ipcMain.handle("get-local-ip", () => getLocalIPv4());

  app.on("activate", () => {
    // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开的时候，
    // 通常在应用程序中重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 除了 macOS 外，当所有窗口都被关闭的时候退出程序。 因此，通常对程序和它们在
// 任务栏上的图标来说，应当保持活跃状态，直到用户使用 Cmd + Q 退出。
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 在这个文件中，你可以包含应用程序剩余的所有部分的代码，
// 也可以拆分成几个文件，然后用 require 导入。

// Chrome 启动路径检测
function getChromePath() {
  const platform = process.platform;

  // 优先使用环境变量（适配其它Mac自定义安装路径）
  if (process.env.CHROME_PATH && isChromeBinary(process.env.CHROME_PATH)) {
    return [process.env.CHROME_PATH];
  }

  const paths = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ],
  };

  return paths[platform] || [];
}

// 检查 Chrome 是否可用
function isChromeBinary(chromePath) {
  try {
    const fs = require("fs");
    return fs.existsSync(chromePath);
  } catch (error) {
    return false;
  }
}

// 启动 MCP 模式
async function launchMCP() {
  return new Promise((resolve) => {
    if (mcpProcess) {
      resolve({ success: false, error: "MCP 已在运行" });
      return;
    }

    // 获取正确的 Node.js 路径（打包后和开发环境兼容）
    const appPath = app.getAppPath();
    let mcpBinPath;

    // 获取 Chrome 路径（选择第一个可用的二进制）
    const chromeCandidates = getChromePath();
    let chromePath = null;
    for (const candidate of chromeCandidates) {
      if (isChromeBinary(candidate)) {
        chromePath = candidate;
        break;
      }
    }

    // 基础参数；channel 与 executablePath 互斥，后续按情况添加
    let args = ["--headless=false", "--isolated=false"]; // 改为 false 以允许使用持久化的用户数据

    // 透传额外的 Chrome 参数（空格分隔，或多次 --chrome-arg 都可）
    // 例如：CHROME_ARGS="--disable-gpu --use-angle=metal"
    if (process.env.CHROME_ARGS) {
      const extra = process.env.CHROME_ARGS.split(/\s+/)
        .filter(Boolean)
        .map((a) => `--chrome-arg=${a}`);
      if (extra.length) {
        args.push(...extra);
        writeLog(`透传 CHROME_ARGS 到 MCP: ${JSON.stringify(extra)}`);
      }
    }

    // 使用持久化的用户数据目录（保存在 userData 下，而不是临时目录）
    const persistentUserDataDir = path.join(
      app.getPath("userData"),
      "chrome-profile"
    );
    args.push(`--chrome-arg=--user-data-dir=${persistentUserDataDir}`);
    writeLog(`使用持久化用户数据目录: ${persistentUserDataDir}`);

    // 同时开启 TCP 端口，让 Playwright 可以连接到同一个浏览器实例
    // MCP 会使用管道模式，Playwright 使用端口模式，两者可以共存
    args.push(`--chrome-arg=--remote-debugging-port=9222`);
    writeLog(`开启 CDP 端口 9222，允许 Playwright 连接`);

    // 如果找到了 Chrome，显式指定路径
    if (chromePath) {
      // MCP CLI 正确参数为 --executablePath；有路径时禁止再加 --channel
      args.push(`--executablePath=${chromePath}`);
      writeLog(`使用 Chrome 路径: ${chromePath}`);
    } else {
      // 未指定具体可执行文件时，使用稳定版通道
      args.push("--channel=stable");
      writeLog(
        "未检测到已安装的 Chrome/Chromium 内核浏览器，将使用 MCP 默认查找。可通过环境变量 CHROME_PATH 指定路径。"
      );
    }

    if (app.isPackaged) {
      // 打包后：使用打包的 chrome-devtools-mcp
      const platform = process.platform;
      const binExt = platform === "win32" ? ".cmd" : "";

      mcpBinPath = path.join(
        appPath,
        "node_modules",
        ".bin",
        `chrome-devtools-mcp${binExt}`
      );

      writeLog(`打包环境 - MCP 路径: ${mcpBinPath}`);
      writeLog(`MCP 文件是否存在: ${fs.existsSync(mcpBinPath)}`);

      // 如果 .bin 文件不存在，尝试直接使用 JS 入口
      if (!fs.existsSync(mcpBinPath)) {
        const mcpScriptPath = path.join(
          appPath,
          "node_modules",
          "chrome-devtools-mcp",
          "build",
          "src",
          "index.js"
        );

        if (fs.existsSync(mcpScriptPath)) {
          // 在打包环境下，使用内置的 Node 可执行文件运行脚本，避免重新启动 Electron 应用本身
          const nodeCandidates = [
            path.join(process.resourcesPath, "app", "resources", "node"),
            path.join(process.resourcesPath, "node"),
          ];
          let embeddedNode = null;
          for (const candidate of nodeCandidates) {
            if (fs.existsSync(candidate)) {
              embeddedNode = candidate;
              break;
            }
          }

          mcpBinPath = embeddedNode || "node";
          args = [mcpScriptPath, ...args];
          if (embeddedNode) {
            writeLog(`使用内置 Node 运行: ${mcpBinPath} ${mcpScriptPath}`);
          } else {
            writeLog(`回退到系统 Node 运行: node ${mcpScriptPath}`);
          }
        } else {
          writeLog(`错误: MCP 脚本不存在: ${mcpScriptPath}`);
          return resolve({
            success: false,
            error: "MCP 模块缺失，请重新安装 APP",
          });
        }
      }
    } else {
      // 开发环境：直接使用可执行文件
      mcpBinPath = path.join(
        __dirname,
        "node_modules",
        ".bin",
        "chrome-devtools-mcp"
      );
    }

    writeLog(`启动 MCP: ${mcpBinPath}`);
    writeLog(`MCP 参数: ${JSON.stringify(args)}`);
    writeLog(`MCP 文件是否存在: ${require("fs").existsSync(mcpBinPath)}`);
    writeLog(`当前工作目录: ${process.cwd()}`);
    writeLog(`APP 是否已打包: ${app.isPackaged}`);

    try {
      // 设置正确的环境和工作目录
      const spawnOptions = {
        stdio: ["pipe", "pipe", "pipe"], // 使用管道进行通信
        detached: false,
        env: { ...process.env }, // 继承当前进程的环境变量
        cwd: app.isPackaged
          ? path.join(appPath, "node_modules", "chrome-devtools-mcp")
          : __dirname,
      };

      writeLog(`启动选项 cwd: ${spawnOptions.cwd}`);
      writeLog(`启动选项 PATH: ${spawnOptions.env.PATH}`);

      mcpProcess = spawn(mcpBinPath, args, spawnOptions);

      writeLog(`MCP 进程 PID: ${mcpProcess.pid}`);

      let buffer = "";

      // 处理 MCP 输出
      mcpProcess.stdout.on("data", (data) => {
        const output = data.toString();
        writeLog(`MCP stdout: ${output}`);

        buffer += output;
        const lines = buffer.split("\n");
        buffer = lines.pop(); // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              writeLog(`MCP JSON 响应: ${JSON.stringify(response)}`);

              // 处理响应
              if (response.id && mcpPendingRequests.has(response.id)) {
                const { resolve: resolveReq, reject: rejectReq } =
                  mcpPendingRequests.get(response.id);
                mcpPendingRequests.delete(response.id);

                if (response.error) {
                  rejectReq(new Error(response.error.message || "MCP 错误"));
                } else {
                  resolveReq(response.result);
                }
              }
            } catch (e) {
              // 不是 JSON，可能是普通日志
              writeLog(`MCP 非JSON输出: ${line}`);
            }
          }
        }
      });

      mcpProcess.stderr.on("data", (data) => {
        const errorMsg = data.toString();
        writeLog(`MCP stderr: ${errorMsg}`);
        // 如果是启动错误，发送到渲染进程
        if (mainWindow && !mcpProcess) {
          mainWindow.webContents.send("chrome-status", {
            running: false,
            error: `MCP 启动错误: ${errorMsg}`,
          });
        }
      });

      mcpProcess.on("error", (error) => {
        writeLog(`MCP 启动错误: ${error.message}`);
        writeLog(`错误堆栈: ${error.stack}`);
        mcpProcess = null;
        resolve({ success: false, error: error.message });
      });

      mcpProcess.on("exit", (code, signal) => {
        writeLog(`MCP 进程退出: code=${code}, signal=${signal}`);
        mcpProcess = null;
        mcpPendingRequests.clear();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("chrome-status", { running: false });
        }
      });

      // 等待 MCP 启动
      setTimeout(async () => {
        sendOperationLog("success", "MCP", "浏览器进程已启动");

        // 启动 HTTP 服务器
        await startHTTPServer();
        sendOperationLog("success", "系统", "HTTP 工具服务已启动");

        // 自动打开一个可见页面，方便用户确认 Chrome 已经弹出
        const startUrl = process.env.MCP_START_URL || "https://www.baidu.com";
        try {
          sendOperationLog("info", "导航", `正在打开起始页: ${startUrl}`);
          await sendMCPRequest("tools/call", {
            name: "navigate_page",
            arguments: { url: startUrl, timeout: 15000 },
          });
          writeLog(`已自动打开调试页面: ${startUrl}`);
          sendOperationLog("success", "导航", "起始页加载完成");
        } catch (autoErr) {
          writeLog(`自动打开页面失败（忽略）：${autoErr?.message || autoErr}`);
          sendOperationLog(
            "warning",
            "导航",
            `起始页加载失败: ${autoErr?.message}`
          );
        }

        sendOperationLog(
          "success",
          "系统",
          "🎉 MCP 模式已完全就绪，AI 助手可以开始工作了"
        );
        resolve({ success: true, mode: "mcp" });
      }, 3000);
    } catch (error) {
      console.error("MCP 启动异常:", error);
      resolve({ success: false, error: error.message });
    }
  });
}

// 启动 HTTP 服务器
async function startHTTPServer() {
  if (httpServer) {
    return;
  }

  try {
    // 创建 HTTP 服务器并传入日志回调
    httpServer = new HTTPServer(9224, sendOperationLog);
    writeLog("HTTP 服务器已创建，端口: 9224");
  } catch (error) {
    console.error("HTTP 服务器启动失败:", error);
    throw new Error(`端口 9224 可能被占用，请关闭其他实例后重试`);
  }

  // 定义 MCP 工具处理函数（完整版本）
  const mcpHandlers = {
    // ==================== 输入自动化 (Input automation) ====================

    // 点击元素
    click: async ({ uid, dblClick }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "click",
          arguments: { uid, dblClick: dblClick || false },
        });
        return {
          success: true,
          message: `已${dblClick ? "双击" : "点击"}元素: ${uid}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 拖拽元素
    drag: async ({ from_uid, to_uid }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "drag",
          arguments: { from_uid, to_uid },
        });
        return {
          success: true,
          message: `已拖拽元素 ${from_uid} 到 ${to_uid}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 填写输入框或选择下拉选项
    fill: async ({ uid, value }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "fill",
          arguments: { uid, value },
        });
        return { success: true, message: `已填写: ${value}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 批量填写表单
    fill_form: async ({ elements }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "fill_form",
          arguments: { elements },
        });
        return {
          success: true,
          message: `已填写 ${elements.length} 个表单元素`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 处理浏览器对话框
    handle_dialog: async ({ action, promptText }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "handle_dialog",
          arguments: { action, promptText },
        });
        return {
          success: true,
          message: `已${action === "accept" ? "接受" : "取消"}对话框`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 悬停在元素上
    hover: async ({ uid }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "hover",
          arguments: { uid },
        });
        return { success: true, message: `已悬停在元素: ${uid}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 上传文件
    upload_file: async ({ uid, filePath }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "upload_file",
          arguments: { uid, filePath },
        });
        return { success: true, message: `已上传文件: ${filePath}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 导航自动化 (Navigation automation) ====================

    // 关闭页面
    close_page: async ({ pageIdx }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "close_page",
          arguments: { pageIdx },
        });
        return { success: true, message: `已关闭页面 ${pageIdx}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 列出所有打开的页面
    list_pages: async () => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "list_pages",
          arguments: {},
        });
        return { success: true, pages: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 导航到指定URL
    navigate_page: async ({ url, timeout }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url, timeout: timeout || 10000 },
        });
        return { success: true, message: `已打开: ${url}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 别名：navigate（保持向后兼容）
    navigate: async ({ url, timeout }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url, timeout: timeout || 10000 },
        });
        return { success: true, message: `已打开: ${url}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 前进/后退导航
    navigate_page_history: async ({ navigate, timeout }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "navigate_page_history",
          arguments: { navigate, timeout: timeout || 10000 },
        });
        return {
          success: true,
          message: `已${navigate === "back" ? "后退" : "前进"}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 创建新页面
    new_page: async ({ url, timeout }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "new_page",
          arguments: { url, timeout: timeout || 10000 },
        });
        return { success: true, message: `已创建新页面: ${url}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 选择页面
    select_page: async ({ pageIdx }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "select_page",
          arguments: { pageIdx },
        });
        return { success: true, message: `已选择页面 ${pageIdx}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 等待指定文本出现
    wait_for: async ({ text, timeout }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "wait_for",
          arguments: { text, timeout: timeout || 30000 },
        });
        return { success: true, message: `文本已出现: ${text}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 模拟 (Emulation) ====================

    // CPU 节流模拟
    emulate_cpu: async ({ throttlingRate }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "emulate_cpu",
          arguments: { throttlingRate },
        });
        return {
          success: true,
          message: `已设置 CPU 节流率: ${throttlingRate}x`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 网络节流模拟
    emulate_network: async ({ throttlingOption }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "emulate_network",
          arguments: { throttlingOption },
        });
        return {
          success: true,
          message: `已设置网络节流: ${throttlingOption}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 调整页面尺寸
    resize_page: async ({ width, height }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "resize_page",
          arguments: { width, height },
        });
        return { success: true, message: `已调整页面尺寸: ${width}x${height}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 性能 (Performance) ====================

    // 分析性能洞察
    performance_analyze_insight: async ({ insightName }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "performance_analyze_insight",
          arguments: { insightName },
        });
        return { success: true, insight: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 开始性能追踪
    performance_start_trace: async ({ reload, autoStop }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "performance_start_trace",
          arguments: { reload, autoStop },
        });
        return { success: true, message: "已开始性能追踪" };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 停止性能追踪
    performance_stop_trace: async () => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "performance_stop_trace",
          arguments: {},
        });
        return { success: true, trace: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 网络 (Network) ====================

    // 获取网络请求详情
    get_network_request: async ({ reqid }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "get_network_request",
          arguments: { reqid },
        });
        return { success: true, request: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 列出所有网络请求
    list_network_requests: async ({ pageIdx, pageSize, resourceTypes }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "list_network_requests",
          arguments: { pageIdx, pageSize, resourceTypes },
        });
        return { success: true, requests: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 调试 (Debugging) ====================

    // 执行 JavaScript 脚本
    evaluate_script: async ({ function: funcStr, args }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "evaluate_script",
          arguments: { function: funcStr, args },
        });
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 列出控制台消息
    list_console_messages: async ({ pageIdx, pageSize, types }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "list_console_messages",
          arguments: { pageIdx, pageSize, types },
        });
        return { success: true, messages: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 截图
    take_screenshot: async ({ uid, filePath, format, fullPage, quality }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "take_screenshot",
          arguments: { uid, filePath, format, fullPage, quality },
        });
        return { success: true, screenshot: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 获取页面快照（基于可访问性树）
    take_snapshot: async ({ verbose }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "take_snapshot",
          arguments: { verbose: verbose || false },
        });
        return { success: true, snapshot: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 别名：take-snapshot（保持向后兼容）
    "take-snapshot": async ({ verbose }) => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "take_snapshot",
          arguments: { verbose: verbose || false },
        });
        return { success: true, snapshot: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // ==================== 自定义搜索工具 ====================

    // 百度搜索（默认搜索引擎）
    search: async ({ keyword }) => {
      try {
        const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(
          keyword
        )}`;
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url: searchUrl, timeout: 10000 },
        });
        return { success: true, message: `已在百度搜索: ${keyword}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 百度搜索
    "search-baidu": async ({ keyword }) => {
      try {
        const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(
          keyword
        )}`;
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url: searchUrl, timeout: 10000 },
        });
        return { success: true, message: `已在百度搜索: ${keyword}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 淘宝搜索
    "search-taobao": async ({ keyword }) => {
      try {
        const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(
          keyword
        )}`;
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url: searchUrl, timeout: 10000 },
        });
        return { success: true, message: `已在淘宝搜索: ${keyword}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 京东搜索
    "search-jd": async ({ keyword }) => {
      try {
        const searchUrl = `https://search.jd.com/Search?keyword=${encodeURIComponent(
          keyword
        )}`;
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url: searchUrl, timeout: 10000 },
        });
        return { success: true, message: `已在京东搜索: ${keyword}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  };

  // 包装所有处理函数，添加额外的日志记录
  const wrappedHandlers = {};
  for (const [toolName, handler] of Object.entries(mcpHandlers)) {
    wrappedHandlers[toolName] = async (params) => {
      // 工具执行前的额外日志（针对底层 MCP 调用）
      const paramsInfo = formatToolParams(toolName, params);
      if (paramsInfo) {
        sendOperationLog("info", `🛠 ${toolName}`, paramsInfo);
      }

      // 调用原始处理函数
      return await handler(params);
    };
  }

  await httpServer.start(wrappedHandlers);
  console.log("HTTP 服务器已启动，端口: 9224");
  sendOperationLog("success", "系统", "MCP 工具服务已就绪");
}

// 格式化工具参数用于日志显示
function formatToolParams(toolName, params) {
  const parts = [];

  if (params.url) parts.push(`URL: ${params.url}`);
  if (params.keyword) parts.push(`关键词: "${params.keyword}"`);
  if (params.uid) parts.push(`元素ID: ${params.uid}`);
  if (params.value) parts.push(`值: "${params.value}"`);
  if (params.selector) parts.push(`选择器: ${params.selector}`);
  if (params.text) parts.push(`文本: "${params.text}"`);
  if (params.filePath) parts.push(`文件: ${params.filePath}`);

  return parts.length > 0 ? parts.join(", ") : null;
}

// 停止 HTTP 服务器
async function stopHTTPServer() {
  if (httpServer) {
    await httpServer.stop();
    httpServer = null;
  }
}

// 停止 MCP
async function stopMCP() {
  // 停止 HTTP 服务器
  await stopHTTPServer();

  if (!mcpProcess) {
    return { success: true };
  }

  return new Promise((resolve) => {
    try {
      // 检查进程是否已经被销毁
      if (mcpProcess.killed || !mcpProcess.pid) {
        mcpProcess = null;
        mcpPendingRequests.clear();
        resolve({ success: true });
        return;
      }

      mcpProcess.kill();
      mcpProcess = null;
      mcpPendingRequests.clear();
      resolve({ success: true });
    } catch (error) {
      // 即使kill失败，也要清空进程引用，避免重复尝试
      mcpProcess = null;
      mcpPendingRequests.clear();
      resolve({ success: false, error: error.message });
    }
  });
}

// 发送 MCP 请求
async function sendMCPRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      reject(new Error("MCP 未启动"));
      return;
    }

    const id = ++mcpRequestId;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    // 记录 MCP 底层请求（仅在调试时）
    writeLog(`发送 MCP 请求 #${id}: ${method}`);
    console.log("发送 MCP 请求:", request);

    // 保存请求回调
    mcpPendingRequests.set(id, { resolve, reject });

    // 设置超时
    setTimeout(() => {
      if (mcpPendingRequests.has(id)) {
        mcpPendingRequests.delete(id);
        reject(new Error("MCP 请求超时"));
      }
    }, 30000); // 30秒超时

    // 发送请求
    try {
      mcpProcess.stdin.write(JSON.stringify(request) + "\n");
    } catch (error) {
      mcpPendingRequests.delete(id);
      reject(error);
    }
  });
}

// 启动 Chrome 调试模式
async function launchChrome(useExistingProfile = true) {
  return new Promise((resolve) => {
    if (chromeProcess) {
      resolve({ success: false, error: "Chrome 已在运行" });
      return;
    }

    const chromePaths = getChromePath();
    let chromePath = null;

    // 寻找可用的 Chrome 路径
    for (const path of chromePaths) {
      if (isChromeBinary(path)) {
        chromePath = path;
        break;
      }
    }

    if (!chromePath) {
      resolve({
        success: false,
        error: "未找到 Chrome 浏览器，请确保已安装 Google Chrome",
      });
      return;
    }

    const args = [
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
    ];

    // 为调试模式创建专用的用户数据目录
    if (!useExistingProfile) {
      // 独立模式：使用临时目录
      args.push(
        "--user-data-dir=" +
          require("os").tmpdir() +
          "/chrome-debug-" +
          Date.now()
      );
    } else {
      // 现有登录状态模式：使用持久化的专用调试目录（保存在 userData 下）
      // 这样可以避免与现有Chrome实例冲突，同时保留登录状态
      const debugDir = path.join(
        app.getPath("userData"),
        "chrome-debug-profile"
      );
      args.push("--user-data-dir=" + debugDir);
      writeLog(`使用持久化调试目录: ${debugDir}`);

      // 添加参数来尝试保留登录状态
      args.push("--restore-last-session");
    }

    try {
      console.log(args);
      chromeProcess = spawn(chromePath, args, {
        detached: true,
        stdio: "ignore",
      });

      chromeProcess.on("error", (error) => {
        chromeProcess = null;
        resolve({ success: false, error: error.message });
      });

      chromeProcess.on("exit", (code, signal) => {
        console.log(`Chrome进程退出: code=${code}, signal=${signal}`);
        chromeProcess = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("chrome-status", { running: false });
        }
      });

      // 等待Chrome启动并做简单验证
      const waitAndVerify = async () => {
        // 先等待3秒让Chrome启动
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 做一次简单验证，不重试
        try {
          await new Promise((resolveCheck, rejectCheck) => {
            const req = http.get("http://localhost:9222/json", (res) => {
              if (res.statusCode === 200) {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                  try {
                    JSON.parse(data);
                    resolveCheck(true);
                  } catch (e) {
                    rejectCheck(new Error("调试接口响应格式错误"));
                  }
                });
              } else {
                rejectCheck(new Error(`调试端口状态码: ${res.statusCode}`));
              }
            });

            req.on("error", rejectCheck);
            req.setTimeout(3000, () => {
              req.destroy();
              rejectCheck(new Error("连接超时"));
            });
          });

          // 验证成功
          resolve({ success: true });
        } catch (error) {
          // 验证失败，但不关闭Chrome，让用户知道状态
          resolve({
            success: true,
            warning: "Chrome已启动但调试端口可能需要更多时间初始化",
          });
        }
      };

      waitAndVerify();
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// 停止 Chrome
async function stopChrome() {
  return new Promise((resolve) => {
    if (!chromeProcess) {
      resolve({ success: false, error: "Chrome 未运行" });
      return;
    }

    try {
      // 检查进程是否已经被销毁
      if (chromeProcess.killed || !chromeProcess.pid) {
        chromeProcess = null;
        resolve({ success: true });
        return;
      }

      chromeProcess.kill();
      chromeProcess = null;
      resolve({ success: true });
    } catch (error) {
      // 即使kill失败，也要清空进程引用，避免重复尝试
      chromeProcess = null;
      resolve({ success: false, error: error.message });
    }
  });
}

// Chrome DevTools Protocol 请求
async function sendCDPRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    // 首先获取标签页列表
    const req = http.get("http://localhost:9222/json", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const tabs = JSON.parse(data);
          if (tabs.length === 0) {
            reject(new Error("没有找到可用的标签页"));
            return;
          }

          const tab = tabs[0]; // 使用第一个标签页
          const wsUrl = tab.webSocketDebuggerUrl;

          if (!wsUrl) {
            reject(new Error("无法获取 WebSocket 调试地址"));
            return;
          }

          // 这里简化处理，实际应该使用 WebSocket
          resolve({ success: true, tabId: tab.id });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
  });
}

// 导航到指定 URL
async function navigateToUrl(url) {
  try {
    // 首先检查调试端口是否可用
    const testResponse = await new Promise((resolve, reject) => {
      const req = http.get("http://localhost:9222/json", (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`调试端口返回状态码: ${res.statusCode}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const tabs = JSON.parse(data);
            resolve(tabs);
          } catch (parseError) {
            reject(new Error("解析调试信息失败: " + parseError.message));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error("无法连接到Chrome调试端口: " + error.message));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("连接Chrome调试端口超时"));
      });
    });

    // 创建新标签页 - 使用 PUT 方法
    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        "http://localhost:9222/json/new?" + encodeURIComponent(url),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "0",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode === 200) {
              resolve({ success: true, data });
            } else {
              reject(new Error(`创建标签页失败，状态码: ${res.statusCode}`));
            }
          });
        }
      );

      req.on("error", (error) => {
        reject(new Error("请求失败: " + error.message));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("请求超时"));
      });

      req.end();
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 百度搜索
async function baiduSearch(query) {
  const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  return navigateToUrl(searchUrl);
}

// ==================== Playwright 管理函数 ====================

// 启动 Playwright
async function launchPlaywright(options = {}) {
  try {
    if (!playwrightManager) {
      playwrightManager = new PlaywrightManager();
    }

    if (playwrightManager.isRunning) {
      return { success: false, error: "Playwright 已在运行" };
    }

    await playwrightManager.launch(options);

    // 启动 HTTP 服务器（如果还没启动）
    if (!httpServer) {
      await startHTTPServer();
    }

    const mode = options.connectToCDP ? "playwright-connected" : "playwright";
    writeLog(`Playwright 启动成功 (${mode})`);
    return { success: true, mode };
  } catch (error) {
    writeLog(`Playwright 启动失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 连接到已有的 Chrome 实例（Playwright）
async function connectPlaywrightToCDP(cdpUrl = "http://localhost:9222") {
  return launchPlaywright({
    connectToCDP: true,
    cdpUrl: cdpUrl,
  });
}

// 停止 Playwright
async function stopPlaywright() {
  try {
    if (!playwrightManager) {
      return { success: false, error: "Playwright 未初始化" };
    }

    const result = await playwrightManager.stop();
    writeLog("Playwright 已停止");
    return result;
  } catch (error) {
    writeLog(`停止 Playwright 失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// IPC 处理程序

// 暴露日志文件路径给渲染进程
ipcMain.handle("get-log-path", () => {
  return logFile;
});

ipcMain.handle(
  "launch-chrome",
  async (event, mode, useExistingProfile, engine) => {
    writeLog(
      `收到启动请求: mode=${mode}, useExisting=${useExistingProfile}, engine=${engine}`
    );
    controlMode = mode || "direct";
    browserEngine = engine || "chrome-mcp";

    // 如果选择 Playwright
    if (browserEngine === "playwright") {
      return launchPlaywright({ headless: false });
    }
    // 原有的 Chrome MCP 逻辑
    else if (controlMode === "mcp") {
      return launchMCP();
    } else {
      return launchChrome(useExistingProfile);
    }
  }
);

ipcMain.handle("stop-chrome", async () => {
  // 如果使用 Playwright
  if (browserEngine === "playwright") {
    return stopPlaywright();
  }
  // 原有逻辑
  else if (controlMode === "mcp") {
    return stopMCP();
  } else {
    return stopChrome();
  }
});
ipcMain.handle("navigate-to-url", async (event, url) => navigateToUrl(url));
ipcMain.handle("baidu-search", async (event, query) => baiduSearch(query));

// MCP 专用 handlers
ipcMain.handle("mcp-navigate", async (event, url) => {
  try {
    await sendMCPRequest("tools/call", {
      name: "navigate_page",
      arguments: { url, timeout: 10000 },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("mcp-search-taobao", async (event, keyword) => {
  try {
    const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(
      keyword
    )}`;
    await sendMCPRequest("tools/call", {
      name: "navigate_page",
      arguments: { url: searchUrl, timeout: 10000 },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("mcp-search-baidu", async (event, keyword) => {
  try {
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(
      keyword
    )}`;
    await sendMCPRequest("tools/call", {
      name: "navigate_page",
      arguments: { url: searchUrl, timeout: 10000 },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 辅助函数：发送操作日志
function sendOperationLog(type, tool, message, mcpName = "chrome-mcp") {
  if (mainWindow) {
    mainWindow.webContents.send("operation-log", {
      type,
      tool,
      message,
      mcpName, // 添加 MCP 服务名称
    });
  }
}

// Playwright 专用 handlers
ipcMain.handle("playwright-navigate", async (event, url) => {
  try {
    sendOperationLog("info", "Playwright", `导航到: ${url}`);
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      sendOperationLog("error", "Playwright", "未运行");
      return { success: false, error: "Playwright 未运行" };
    }
    const result = await playwrightManager.navigate(url);
    sendOperationLog("success", "Playwright", `✓ 导航成功`);
    return result;
  } catch (error) {
    sendOperationLog("error", "Playwright", `✗ 导航失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-click", async (event, selector) => {
  try {
    sendOperationLog("info", "Playwright", `点击元素: ${selector}`);
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      sendOperationLog("error", "Playwright", "未运行");
      return { success: false, error: "Playwright 未运行" };
    }
    const result = await playwrightManager.click(selector);
    sendOperationLog("success", "Playwright", `✓ 点击成功`);
    return result;
  } catch (error) {
    sendOperationLog("error", "Playwright", `✗ 点击失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-fill", async (event, selector, value) => {
  try {
    sendOperationLog(
      "info",
      "Playwright",
      `填写字段: ${selector} = "${value}"`
    );
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      sendOperationLog("error", "Playwright", "未运行");
      return { success: false, error: "Playwright 未运行" };
    }
    const result = await playwrightManager.fill(selector, value);
    sendOperationLog("success", "Playwright", `✓ 填写成功`);
    return result;
  } catch (error) {
    sendOperationLog("error", "Playwright", `✗ 填写失败: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-screenshot", async (event, options) => {
  try {
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      return { success: false, error: "Playwright 未运行" };
    }
    return await playwrightManager.screenshot(options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-evaluate", async (event, script) => {
  try {
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      return { success: false, error: "Playwright 未运行" };
    }
    return await playwrightManager.evaluate(script);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-get-title", async () => {
  try {
    if (!playwrightManager || !playwrightManager.isPlaywrightRunning()) {
      return { success: false, error: "Playwright 未运行" };
    }
    return await playwrightManager.getTitle();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Playwright 连接到已有 Chrome 实例
ipcMain.handle("playwright-connect-cdp", async (event, cdpUrl) => {
  try {
    return await connectPlaywrightToCDP(cdpUrl);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 应用退出时清理
app.on("before-quit", async (event) => {
  try {
    console.log("应用即将退出，开始清理资源...");

    // 阻止默认退出行为，等待清理完成
    event.preventDefault();

    const cleanup = async () => {
      try {
        if (chromeProcess) {
          console.log("正在停止Chrome进程...");
          await stopChrome();
        }
        if (mcpProcess) {
          console.log("正在停止MCP进程...");
          await stopMCP();
        }
        if (playwrightManager) {
          console.log("正在停止Playwright...");
          await stopPlaywright();
        }
        if (httpServer) {
          console.log("正在停止HTTP服务器...");
          await stopHTTPServer();
        }
        console.log("资源清理完成，退出应用");
      } catch (error) {
        console.error("清理过程中出现错误:", error);
        // 即使清理失败，也要继续退出
      }

      // 清理完成后，真正退出应用
      app.quit();
    };

    // 设置最大清理时间为3秒，避免无限等待
    const timeout = setTimeout(() => {
      console.log("清理超时，强制退出");
      app.quit();
    }, 3000);

    await cleanup();
    clearTimeout(timeout);
  } catch (error) {
    console.error("退出清理异常:", error);
    app.quit();
  }
});
