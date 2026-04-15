// HTTP 服务器 - 接收后端服务的 MCP 调用
const http = require("http");
const url = require("url");

class HTTPServer {
  constructor(port = 9224, logCallback = null) {
    this.port = port;
    this.server = null;
    this.mcpHandlers = null;
    this.logCallback = logCallback; // 用于发送日志到渲染进程
  }

  /**
   * 启动 HTTP 服务器
   * @param {Object} handlers - MCP 处理函数
   */
  start(handlers) {
    this.mcpHandlers = handlers;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(`HTTP 服务器已启动在端口 ${this.port}`);
    });

    return new Promise((resolve) => {
      this.server.on("listening", resolve);
    });
  }

  /**
   * 停止 HTTP 服务器
   */
  stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log("HTTP 服务器已停止");
          this.server = null;
          resolve();
        });
      });
    }
    return Promise.resolve();
  }

  /**
   * 处理 HTTP 请求
   */
  async handleRequest(req, res) {
    // 设置 CORS 头
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // 处理 OPTIONS 预检请求
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    console.log(`[HTTP] ${req.method} ${pathname}`);

    try {
      // 健康检查
      if (pathname === "/health" && req.method === "GET") {
        this.sendJSON(res, 200, { status: "ok", service: "Electron MCP" });
        return;
      }

      // MCP 工具调用
      if (pathname.startsWith("/mcp/") && req.method === "POST") {
        const toolName = pathname.substring(5); // 去掉 "/mcp/"
        const body = await this.readBody(req);

        if (!this.mcpHandlers || !this.mcpHandlers[toolName]) {
          this.sendLog("error", "HTTP", `工具不存在: ${toolName}`);
          this.sendJSON(res, 404, {
            success: false,
            error: `工具不存在: ${toolName}`,
          });
          return;
        }

        // 记录工具调用开始
        const paramsStr = this.formatParams(body);
        this.sendLog(
          "info",
          toolName,
          `开始执行${paramsStr ? `: ${paramsStr}` : ""}`
        );

        try {
          const startTime = Date.now();
          const result = await this.mcpHandlers[toolName](body);
          const duration = Date.now() - startTime;

          // 记录工具调用成功
          if (result.success) {
            this.sendLog("success", toolName, `✓ 执行成功 (${duration}ms)`);
          } else {
            this.sendLog(
              "warning",
              toolName,
              `⚠ ${result.error || "执行失败"}`
            );
          }

          this.sendJSON(res, 200, result);
        } catch (error) {
          this.sendLog("error", toolName, `✗ 执行异常: ${error.message}`);
          throw error;
        }
        return;
      }

      // 404
      this.sendJSON(res, 404, {
        error: "Not Found",
        path: pathname,
      });
    } catch (error) {
      console.error("[HTTP] 处理请求出错:", error);
      this.sendJSON(res, 500, {
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 读取请求体
   */
  readBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error("Invalid JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * 发送 JSON 响应
   */
  sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  /**
   * 发送日志到渲染进程
   */
  sendLog(type, tool, message, mcpName = "chrome-mcp") {
    if (this.logCallback) {
      this.logCallback(type, tool, message, mcpName);
    }
    console.log(`[${type.toUpperCase()}] [${mcpName}] ${tool}: ${message}`);
  }

  /**
   * 格式化参数以便在日志中显示
   */
  formatParams(params) {
    if (!params || Object.keys(params).length === 0) {
      return "";
    }

    const parts = [];
    if (params.url) parts.push(params.url);
    if (params.keyword) parts.push(`"${params.keyword}"`);
    if (params.uid) parts.push(`元素#${params.uid}`);
    if (params.value) parts.push(`值="${params.value}"`);
    if (params.selector) parts.push(`选择器="${params.selector}"`);

    return parts.join(", ");
  }
}

module.exports = HTTPServer;
