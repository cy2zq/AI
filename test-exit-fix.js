#!/usr/bin/env node

/**
 * 测试退出修复功能
 *
 * 用于验证手动关闭Chrome浏览器后退出APP是否还会报错
 *
 * 使用方法：
 * 1. 先启动 Electron APP: npm start
 * 2. 点击启动MCP模式
 * 3. 运行此脚本: node test-exit-fix.js
 * 4. 手动关闭Chrome浏览器窗口
 * 5. 关闭Electron APP，观察是否还有错误
 */

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

function testInstructions() {
  log("blue", "\n=== 退出修复功能测试 ===\n");

  log("yellow", "📋 测试步骤：");
  log("green", "1. 确保 Electron APP 已启动 (npm start)");
  log("green", '2. 在APP中点击"🚀 启动 MCP 模式"');
  log("green", "3. 等待Chrome浏览器启动完成");
  log("green", "4. ❗️ 手动关闭Chrome浏览器窗口（不要点APP的停止按钮）");
  log("green", "5. 关闭 Electron APP");
  log("green", '6. 观察是否还有 "Object has been destroyed" 错误');

  log("blue", "\n💡 预期结果：");
  log("green", "✅ 应该能正常退出，不会弹出错误对话框");
  log("green", "✅ 控制台可能有清理日志，但不会有异常");

  log("blue", "\n🔧 修复内容：");
  log("green", "- 在stopChrome()中增加进程状态检查");
  log("green", "- 在stopMCP()中增加进程状态检查");
  log("green", "- 改进应用退出时的资源清理流程");
  log("green", "- 增加超时保护，避免无限等待");
  log("green", "- 增加窗口销毁检查，避免访问已销毁的窗口");

  log("blue", "\n🐛 如果仍然有问题：");
  log("yellow", "1. 检查控制台日志输出");
  log("yellow", "2. 查看是否有其他错误信息");
  log("yellow", "3. 确认Chrome进程是否完全退出");
  log("yellow", "4. 尝试重启APP进行再次测试");

  log("red", "\n⚠️  注意：");
  log("yellow", "- 此修复确保即使进程异常退出也能安全清理");
  log("yellow", '- 推荐仍然使用"停止"按钮正常关闭');
  log("yellow", "- 手动关闭浏览器可能会丢失某些状态信息");

  log("blue", "\n🎯 测试完成后：");
  log("green", "如果没有报错，说明修复成功！");
  log("green", "可以继续正常使用应用程序。");

  console.log("\n");
}

// 检查相关文件是否存在
const fs = require("fs");
const path = require("path");

const files = ["main.js", "package.json", "index.html"];

log("blue", "📁 检查项目文件...");
let allFilesExist = true;

files.forEach((file) => {
  if (fs.existsSync(file)) {
    log("green", `  ✅ ${file}`);
  } else {
    log("red", `  ❌ ${file} 不存在`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  log("red", "\n❌ 部分文件不存在，请确保在正确的目录中运行此脚本");
  process.exit(1);
}

// 显示测试说明
testInstructions();

log("green", "🚀 现在可以开始测试了！");
