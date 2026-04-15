# Chrome MCP 控制器

基于 MCP 协议的 Chrome 浏览器 AI 智能控制工具。

## ✨ 特性

- 🤖 **AI 驱动**：使用自然语言控制 Chrome 浏览器
- 🔒 **完全独立**：内置 Node.js 运行时，无需用户安装任何依赖
- 🌐 **跨平台**：支持 macOS (Apple Silicon)
- 🎯 **开箱即用**：双击即可使用，无需配置
- 📝 **自动化**：支持复杂的浏览器操作自动化
- 📊 **实时日志**：像 Cursor/CherryStudio 一样，在对话窗口中实时展示 AI 使用的每个工具和操作步骤，包括 MCP 服务名称

## 📦 系统要求

- **操作系统**：macOS 12+ (Apple Silicon / M1/M2/M3/M4)
- **浏览器**：Google Chrome（稳定版）
- **网络**：需要连接大模型 API（如 DeepSeek、通义千问等）

**无需安装 Node.js** - APP 已内置所有必要的运行时环境！

## 🚀 使用方法

### 1. 安装

1. 下载 `ChromeMCPController.dmg`
2. 双击打开，将 APP 拖到"应用程序"文件夹
3. 首次运行：右键点击 APP → 打开 → 确认打开

### 2. 配置后端服务

APP 需要配合后端 AI 服务使用：

```bash
cd /Users/cy/cy/other/mcp服务
npm install
npm start
```

后端服务会在 `http://localhost:3000` 启动。

### 3. 启动 APP

1. 双击打开"Chrome MCP 控制器"
2. 点击"🚀 启动 MCP 模式"
3. Chrome 浏览器会自动打开（独立调试窗口）

### 4. 使用 AI 控制

在 APP 的对话框中输入自然语言指令，例如：

- `搜索手机` - 默认使用百度搜索
- `打开百度搜索手机` - 在百度搜索
- `打开淘宝搜索帽子` - 在淘宝搜索
- `打开京东搜索笔记本` - 在京东搜索

**💡 提示**：如果没有指定搜索平台，系统会默认使用百度进行搜索。

AI 会自动控制 Chrome 执行相应操作。

### 5. 📊 查看实时日志

在使用 AI 功能时，界面下方会显示"🤖 AI 操作日志"面板，实时展示：

- 🔵 **信息日志**：工具调用开始、参数信息
- 🟢 **成功日志**：操作成功完成及耗时
- 🟡 **警告日志**：操作部分成功或有问题
- 🔴 **错误日志**：操作失败的详细原因

**示例（对话窗口中的工具显示）**：

```
👤 用户: 打开淘宝搜索帽子

┌────────────────────────────────┐
│ [chrome-mcp] search-taobao     │
│ ✓ 成功                          │
│ 关键词: "帽子"                  │
│ ⏱ 1250ms                       │
└────────────────────────────────┘

┌────────────────────────────────┐
│ [chrome-mcp] navigate_page     │
│ ✓ 成功                          │
│ https://s.taobao.com/search... │
│ ⏱ 2100ms                       │
└────────────────────────────────┘

🤖 助手: 已为您打开淘宝搜索"帽子"的结果页面
```

这让你能清楚地看到 AI 在背后做了什么，完全透明！工具调用显示在对话窗口中，就像 Cursor 和 CherryStudio一样！

## 🔍 支持的搜索平台

| 工具名称        | 描述                 | 示例             |
| --------------- | -------------------- | ---------------- |
| `search`        | **默认搜索（百度）** | `搜索手机`       |
| `search-baidu`  | 百度搜索             | `在百度搜索手机` |
| `search-taobao` | 淘宝搜索             | `在淘宝搜索手机` |
| `search-jd`     | 京东搜索             | `在京东搜索手机` |

## 🔧 技术架构

```
┌──────────────────┐
│  Electron APP    │
│  (用户界面)       │
└────────┬─────────┘
         │
         ├─> 内置 Node.js (85MB)
         │   └─> chrome-devtools-mcp
         │       └─> Chrome CDP
         │
         └─> HTTP API
             └─> 后端服务 (localhost:3000)
                 └─> 大模型 API (DeepSeek/千问等)
```

## 📊 文件大小

- **DMG 安装包**：~177 MB
- **安装后大小**：~200 MB

相比需要用户自行安装 Node.js 的方案，虽然 APP 稍大，但用户体验更好。

## 🐛 调试

如果遇到问题，可以查看调试日志：

```bash
tail -f ~/Library/Application\ Support/Chrome\ MCP\ 控制器/mcp-debug.log
```

### 测试实时日志功能

在开发环境下，可以运行测试脚本验证日志功能：

```bash
# 1. 先启动 APP 并开启 MCP 模式
npm start

# 2. 在新终端运行测试脚本
node test-realtime-log.js
```

测试脚本会模拟 AI 调用各种工具，你可以在 APP 界面看到所有操作被实时记录。

更多详情请参考 [REALTIME-LOG-FEATURE.md](./REALTIME-LOG-FEATURE.md)

## 🔐 隐私说明

- APP 会启动 Chrome 的调试模式，允许控制浏览器内容
- AI 可以读取和修改浏览器中的所有数据
- 请勿在控制过程中输入敏感信息（如密码、银行卡号等）
- 建议使用独立的 Chrome 配置文件

## 📝 开发说明

### 内置 Node.js

APP 内置了 Node.js 20.19.4（Apple Silicon 版本），位于：

```
Chrome MCP 控制器.app/Contents/Resources/resources/node
```

这样用户无需安装 Node.js 即可使用 APP。

### 打包命令

```bash
npm run make
```

生成的安装包位于 `out/make/` 目录。

## 📄 许可证

MIT License

## 👤 作者

cy

---

**注意**：此工具仅供学习和研究使用，请遵守相关网站的服务条款。
