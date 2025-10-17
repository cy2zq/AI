const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const HTTPServer = require("./http-server");
const fs = require("fs");

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

// MCP 通信相关变量
let mcpRequestId = 0;
let mcpPendingRequests = new Map(); // direct 或 mcp

// HTTP 服务器
let httpServer = null;

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

  // 加载 index.html
  mainWindow.loadFile("index.html");

  // 开发环境下自动打开开发者工具
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
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
  const paths = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium-browser"],
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

    // 获取 Chrome 路径
    const chromePath = getChromePath();
    let args = ["--channel=stable", "--headless=false", "--isolated=true"];

    // 如果找到了 Chrome，显式指定路径
    if (chromePath) {
      args.push(`--chrome-path=${chromePath}`);
      console.log("使用 Chrome 路径:", chromePath);
    }

    if (app.isPackaged) {
      // 打包后：使用 APP 内置的 Node.js（无需用户安装）
      const bundledNodePath = path.join(
        process.resourcesPath,
        "resources",
        "node"
      );

      const mcpScriptPath = path.join(
        appPath,
        "node_modules",
        "chrome-devtools-mcp",
        "build",
        "src",
        "index.js"
      );

      // 检查内置的 Node.js 是否存在
      if (!fs.existsSync(bundledNodePath)) {
        writeLog(`错误: 内置 Node.js 不存在: ${bundledNodePath}`);
        return resolve({
          success: false,
          error: "内置 Node.js 缺失，请重新安装 APP",
        });
      }

      mcpBinPath = bundledNodePath;
      args = [mcpScriptPath, ...args];

      writeLog(`使用内置 Node.js: ${mcpBinPath}`);
      writeLog(`Node.js 文件大小: ${fs.statSync(bundledNodePath).size} 字节`);
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
        if (mainWindow) {
          mainWindow.webContents.send("chrome-status", { running: false });
        }
      });

      // 等待 MCP 启动
      setTimeout(async () => {
        // 启动 HTTP 服务器
        await startHTTPServer();
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
    httpServer = new HTTPServer(9224);
  } catch (error) {
    console.error("HTTP 服务器启动失败:", error);
    throw new Error(`端口 9224 可能被占用，请关闭其他实例后重试`);
  }

  // 定义 MCP 工具处理函数
  const mcpHandlers = {
    // 导航到指定URL
    navigate: async ({ url }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "navigate_page",
          arguments: { url, timeout: 10000 },
        });
        return { success: true, message: `已打开: ${url}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 获取页面快照
    "take-snapshot": async () => {
      try {
        const result = await sendMCPRequest("tools/call", {
          name: "take_snapshot",
          arguments: {},
        });
        return { success: true, snapshot: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 点击元素
    click: async ({ uid }) => {
      try {
        await sendMCPRequest("tools/call", {
          name: "click",
          arguments: { uid },
        });
        return { success: true, message: `已点击元素: ${uid}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 填写输入框
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
        return { success: true, message: `已搜索: ${keyword}` };
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
        return { success: true, message: `已搜索: ${keyword}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  };

  await httpServer.start(mcpHandlers);
  console.log("HTTP 服务器已启动，端口: 9224");
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
      mcpProcess.kill();
      mcpProcess = null;
      mcpPendingRequests.clear();
      resolve({ success: true });
    } catch (error) {
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
      // 现有登录状态模式：使用专用的调试目录
      // 这样可以避免与现有Chrome实例冲突，同时保留部分设置
      const debugDir =
        require("os").tmpdir() + "/chrome-debug-with-profile-" + Date.now();
      args.push("--user-data-dir=" + debugDir);

      // 添加参数来尝试保留登录状态
      args.push("--restore-last-session");
    }

    try {
      chromeProcess = spawn(chromePath, args, {
        detached: true,
        stdio: "ignore",
      });

      chromeProcess.on("error", (error) => {
        chromeProcess = null;
        resolve({ success: false, error: error.message });
      });

      chromeProcess.on("exit", () => {
        chromeProcess = null;
        if (mainWindow) {
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
      chromeProcess.kill();
      chromeProcess = null;
      resolve({ success: true });
    } catch (error) {
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

// IPC 处理程序

// 暴露日志文件路径给渲染进程
ipcMain.handle("get-log-path", () => {
  return logFile;
});

ipcMain.handle("launch-chrome", async (event, mode, useExistingProfile) => {
  writeLog(`收到启动请求: mode=${mode}, useExisting=${useExistingProfile}`);
  controlMode = mode || "direct";

  if (controlMode === "mcp") {
    return launchMCP();
  } else {
    return launchChrome(useExistingProfile);
  }
});

ipcMain.handle("stop-chrome", async () => {
  if (controlMode === "mcp") {
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

// 应用退出时清理
app.on("before-quit", async () => {
  if (chromeProcess) {
    await stopChrome();
  }
  if (mcpProcess) {
    await stopMCP();
  }
  if (httpServer) {
    await stopHTTPServer();
  }
});
