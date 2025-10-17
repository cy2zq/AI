// HTTP 服务器 - 接收后端服务的 MCP 调用
const http = require("http");
const url = require("url");

class HTTPServer {
  constructor(port = 9224) {
    this.port = port;
    this.server = null;
    this.mcpHandlers = null;
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
          this.sendJSON(res, 404, {
            success: false,
            error: `工具不存在: ${toolName}`,
          });
          return;
        }

        const result = await this.mcpHandlers[toolName](body);
        this.sendJSON(res, 200, result);
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
}

module.exports = HTTPServer;
