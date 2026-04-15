// playwright-manager.js - Playwright 浏览器管理器
const { chromium } = require("playwright");

class PlaywrightManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRunning = false;
  }

  // 启动 Playwright 浏览器
  async launch(options = {}) {
    if (this.isRunning) {
      throw new Error("Playwright 浏览器已在运行");
    }

    try {
      // 检查是否要连接到已有实例
      if (options.connectToCDP) {
        console.log(
          "连接到已有 Chrome 实例:",
          options.cdpUrl || "http://localhost:9222"
        );
        await this.connectToExisting(options.cdpUrl);
        return { success: true, mode: "connected" };
      }

      const launchOptions = {
        headless: options.headless || false,
        channel: options.channel || "chrome", // 使用已安装的 Chrome
        args: options.args || [],
        ...options,
      };

      console.log("启动 Playwright 浏览器:", launchOptions);

      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      });
      this.page = await this.context.newPage();
      this.isRunning = true;

      console.log("Playwright 浏览器启动成功");
      return { success: true, mode: "launched" };
    } catch (error) {
      console.error("Playwright 启动失败:", error);
      this.isRunning = false;
      throw error;
    }
  }

  // 连接到已有的 Chrome 实例（通过 CDP）
  async connectToExisting(cdpUrl = "http://localhost:9222") {
    try {
      console.log("正在连接到 CDP 端点:", cdpUrl);

      // 连接到 CDP
      this.browser = await chromium.connectOverCDP(cdpUrl);

      // 获取所有上下文
      const contexts = this.browser.contexts();

      if (contexts.length > 0) {
        // 使用第一个上下文
        this.context = contexts[0];
      } else {
        // 如果没有上下文，创建一个新的
        this.context = await this.browser.newContext({
          viewport: { width: 1280, height: 720 },
        });
      }

      // 获取页面
      const pages = this.context.pages();
      if (pages.length > 0) {
        // 使用第一个页面
        this.page = pages[0];
      } else {
        // 创建新页面
        this.page = await this.context.newPage();
      }

      this.isRunning = true;
      console.log("成功连接到已有 Chrome 实例");
      console.log(`当前页面: ${this.page.url()}`);

      return { success: true };
    } catch (error) {
      console.error("连接到 Chrome 实例失败:", error);
      throw new Error(`无法连接到 CDP: ${error.message}`);
    }
  }

  // 停止浏览器
  async stop() {
    if (!this.isRunning) {
      return { success: false, error: "Playwright 未运行" };
    }

    try {
      if (this.browser) {
        await this.browser.close();
      }
      this.browser = null;
      this.context = null;
      this.page = null;
      this.isRunning = false;
      return { success: true };
    } catch (error) {
      console.error("停止 Playwright 失败:", error);
      return { success: false, error: error.message };
    }
  }

  // 检查是否运行中
  isPlaywrightRunning() {
    return this.isRunning && this.browser && this.page;
  }

  // 导航到 URL
  async navigate(url, timeout = 30000) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.goto(url, { timeout, waitUntil: "domcontentloaded" });
      return { success: true, url };
    } catch (error) {
      throw new Error(`导航失败: ${error.message}`);
    }
  }

  // 点击元素
  async click(selector, options = {}) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.click(selector, options);
      return { success: true };
    } catch (error) {
      throw new Error(`点击失败: ${error.message}`);
    }
  }

  // 填写输入框
  async fill(selector, value) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.fill(selector, value);
      return { success: true };
    } catch (error) {
      throw new Error(`填写失败: ${error.message}`);
    }
  }

  // 获取文本内容
  async getText(selector) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const text = await this.page.textContent(selector);
      return { success: true, text };
    } catch (error) {
      throw new Error(`获取文本失败: ${error.message}`);
    }
  }

  // 截图
  async screenshot(options = {}) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const screenshot = await this.page.screenshot({
        type: options.type || "png",
        fullPage: options.fullPage || false,
        ...options,
      });
      return { success: true, screenshot };
    } catch (error) {
      throw new Error(`截图失败: ${error.message}`);
    }
  }

  // 等待元素
  async waitForSelector(selector, options = {}) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.waitForSelector(selector, {
        timeout: options.timeout || 30000,
        ...options,
      });
      return { success: true };
    } catch (error) {
      throw new Error(`等待元素失败: ${error.message}`);
    }
  }

  // 执行 JavaScript
  async evaluate(script) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const result = await this.page.evaluate(script);
      return { success: true, result };
    } catch (error) {
      throw new Error(`执行脚本失败: ${error.message}`);
    }
  }

  // 获取页面标题
  async getTitle() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const title = await this.page.title();
      return { success: true, title };
    } catch (error) {
      throw new Error(`获取标题失败: ${error.message}`);
    }
  }

  // 获取当前 URL
  async getUrl() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const url = this.page.url();
      return { success: true, url };
    } catch (error) {
      throw new Error(`获取URL失败: ${error.message}`);
    }
  }

  // 后退
  async goBack() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.goBack();
      return { success: true };
    } catch (error) {
      throw new Error(`后退失败: ${error.message}`);
    }
  }

  // 前进
  async goForward() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.goForward();
      return { success: true };
    } catch (error) {
      throw new Error(`前进失败: ${error.message}`);
    }
  }

  // 刷新页面
  async reload() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      await this.page.reload();
      return { success: true };
    } catch (error) {
      throw new Error(`刷新失败: ${error.message}`);
    }
  }

  // 批量填写表单
  async fillForm(fields) {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      for (const field of fields) {
        await this.page.fill(field.selector, field.value);
      }
      return { success: true, count: fields.length };
    } catch (error) {
      throw new Error(`批量填写失败: ${error.message}`);
    }
  }

  // 获取页面内容
  async getContent() {
    if (!this.isPlaywrightRunning()) {
      throw new Error("Playwright 未运行");
    }

    try {
      const content = await this.page.content();
      return { success: true, content };
    } catch (error) {
      throw new Error(`获取内容失败: ${error.message}`);
    }
  }
}

module.exports = PlaywrightManager;
