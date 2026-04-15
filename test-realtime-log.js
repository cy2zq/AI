#!/usr/bin/env node

/**
 * 测试实时日志功能
 *
 * 这个脚本模拟 AI 后端调用 MCP 工具，验证日志记录是否正常工作
 */

const http = require("http");

// 测试工具列表
const testCases = [
  {
    name: "百度搜索",
    tool: "search-baidu",
    params: { keyword: "人工智能" },
  },
  {
    name: "导航到网页",
    tool: "navigate_page",
    params: { url: "https://www.example.com", timeout: 10000 },
  },
  {
    name: "填写表单",
    tool: "fill",
    params: { uid: "test-123", value: "测试值" },
  },
  {
    name: "点击元素",
    tool: "click",
    params: { uid: "btn-456" },
  },
  {
    name: "获取页面快照",
    tool: "take_snapshot",
    params: {},
  },
];

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 调用 MCP 工具
function callTool(tool, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);

    const options = {
      hostname: "localhost",
      port: 9224,
      path: `/mcp/${tool}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 延迟函数
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 主测试函数
async function runTests() {
  log("blue", "\n=================================");
  log("blue", "  实时日志功能测试");
  log("blue", "=================================\n");

  // 先检查服务是否可用
  log("yellow", "检查 MCP 服务状态...");

  try {
    const healthCheck = await new Promise((resolve, reject) => {
      http
        .get("http://localhost:9224/health", (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    });

    log("green", `✓ MCP 服务运行正常: ${healthCheck.service}`);
  } catch (error) {
    log("red", "✗ MCP 服务未启动");
    log("yellow", "\n请先启动 Electron 应用并开启 MCP 模式！");
    log("yellow", "运行命令: npm start\n");
    process.exit(1);
  }

  log("blue", "\n开始测试工具调用...\n");

  // 运行测试用例
  for (const testCase of testCases) {
    log("blue", `测试: ${testCase.name}`);
    log("yellow", `  工具: ${testCase.tool}`);
    log("yellow", `  参数: ${JSON.stringify(testCase.params)}`);

    try {
      const result = await callTool(testCase.tool, testCase.params);

      if (result.success) {
        log("green", `  ✓ 调用成功`);
      } else {
        log("yellow", `  ⚠ 调用返回警告: ${result.error || result.message}`);
      }

      if (result.message) {
        log("green", `  响应: ${result.message}`);
      }
    } catch (error) {
      log("red", `  ✗ 调用失败: ${error.message}`);
    }

    console.log("");

    // 间隔一段时间，让日志更容易观察
    await delay(1000);
  }

  log("green", "\n=================================");
  log("green", "  测试完成！");
  log("green", "=================================");
  log("yellow", '\n请查看 Electron 应用界面的"AI 操作日志"面板');
  log("yellow", "确认所有操作都已被记录\n");
}

// 运行测试
runTests().catch((error) => {
  log("red", `\n测试出错: ${error.message}\n`);
  process.exit(1);
});
