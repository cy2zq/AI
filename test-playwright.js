#!/usr/bin/env node

/**
 * Playwright 集成测试脚本
 *
 * 用途：测试 Playwright 是否正确集成到 Electron 应用中
 *
 * 运行方式：
 * node test-playwright.js
 */

const { chromium } = require("playwright");

async function testPlaywright() {
  console.log("🚀 开始测试 Playwright...\n");

  let browser = null;
  try {
    // 1. 启动浏览器
    console.log("1️⃣ 启动 Chrome 浏览器...");
    browser = await chromium.launch({
      headless: false,
      channel: "chrome", // 使用系统安装的 Chrome
    });
    console.log("✅ 浏览器启动成功\n");

    // 2. 创建上下文和页面
    console.log("2️⃣ 创建浏览器上下文...");
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    console.log("✅ 上下文创建成功\n");

    // 3. 测试导航
    console.log("3️⃣ 测试导航功能...");
    await page.goto("https://www.baidu.com", { waitUntil: "domcontentloaded" });
    const title = await page.title();
    console.log(`✅ 导航成功，页面标题: ${title}\n`);

    // 4. 测试搜索功能
    console.log("4️⃣ 测试搜索功能...");
    await page.fill("input#kw", "Playwright 自动化测试");
    await page.click("input#su");
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ 搜索执行成功\n");

    // 5. 等待几秒观察结果
    console.log("⏳ 等待 3 秒观察结果...");
    await page.waitForTimeout(3000);

    // 6. 测试表单填写（使用您的测试页面）
    console.log("5️⃣ 测试表单填写...");
    await page.goto("http://10.1.110.242:8000/test");
    await page.waitForLoadState("domcontentloaded");

    // 填写姓名
    await page.fill('input[id*="name"]', "测试用户");
    console.log("✅ 填写姓名成功");

    // 填写简介
    const textareaSelector = "textarea";
    await page.fill(textareaSelector, "这是 Playwright 自动填写的内容");
    console.log("✅ 填写简介成功");

    // 选择性别（Ant Design Select 组件）
    await page.click(".ant-select-selector");
    await page.waitForTimeout(500);
    await page.click('.ant-select-item-option[title="男"]');
    console.log("✅ 选择性别成功");

    // 等待观察
    console.log("⏳ 等待 5 秒观察表单填写结果...");
    await page.waitForTimeout(5000);

    console.log("\n✅ 所有测试通过！Playwright 集成成功！\n");
  } catch (error) {
    console.error("\n❌ 测试失败:", error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      console.log("🔄 关闭浏览器...");
      await browser.close();
      console.log("✅ 浏览器已关闭");
    }
  }
}

// 运行测试
testPlaywright()
  .then(() => {
    console.log("\n📊 测试完成！");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 测试异常:", error);
    process.exit(1);
  });
