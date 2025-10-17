#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// 模拟打包后的环境
const testPath = path.join(
  __dirname,
  "out",
  "Chrome MCP 控制器-darwin-arm64",
  "Chrome MCP 控制器.app",
  "Contents",
  "Resources",
  "app.asar.unpacked",
  "node_modules",
  "chrome-devtools-mcp",
  "build",
  "src",
  "index.js"
);

console.log("测试 MCP 路径:", testPath);
console.log("文件是否存在:", fs.existsSync(testPath));

if (fs.existsSync(testPath)) {
  console.log("文件权限:", fs.statSync(testPath).mode.toString(8));

  // 尝试执行
  console.log("\n尝试启动 MCP...");
  const mcpProcess = spawn(
    testPath,
    ["--channel=stable", "--headless=false", "--isolated=true"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  mcpProcess.stdout.on("data", (data) => {
    console.log("MCP 输出:", data.toString());
  });

  mcpProcess.stderr.on("data", (data) => {
    console.error("MCP 错误:", data.toString());
  });

  mcpProcess.on("error", (error) => {
    console.error("启动失败:", error);
  });

  mcpProcess.on("exit", (code) => {
    console.log("MCP 退出，代码:", code);
    process.exit(code);
  });

  setTimeout(() => {
    console.log("5秒后关闭测试...");
    mcpProcess.kill();
  }, 5000);
} else {
  // 检查其他可能的路径
  const basePath = path.join(
    __dirname,
    "out",
    "Chrome MCP 控制器-darwin-arm64"
  );

  if (fs.existsSync(basePath)) {
    console.log("\n查找所有 MCP 相关文件:");
    const { execSync } = require("child_process");
    try {
      const result = execSync(
        `find "${basePath}" -name "index.js" | grep chrome-devtools-mcp`,
        {
          encoding: "utf-8",
        }
      );
      console.log(result);
    } catch (e) {
      console.log("未找到 MCP 文件");
    }
  }
}
