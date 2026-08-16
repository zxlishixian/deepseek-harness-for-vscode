# DeepSeek Harness for VS Code

[English](README.md) | **简体中文**

在 VS Code 里运行 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 编码智能体。扩展内置 Harness 运行时并自动管理其启停，在侧边栏提供原生工作台——安装 VSIX、填入 API Key 即可开始，无需单独安装 Harness、无需 Node/npm 环境、也不嵌入官方 WebUI。

## 快速开始

1. 从 [Releases](https://github.com/zxlishixian/deepseek-harness-for-vscode/releases) 下载与你的平台匹配的 VSIX。
2. 安装：扩展面板（`Cmd/Ctrl+Shift+X`）→ `...` → **从 VSIX 安装...**。
3. 在用户 `settings.json` 中填入 DeepSeek API Key：

   ```json
   {
     "deepseekHarness.apiKey": "sk-..."
   }
   ```

   （执行命令 `DeepSeek Harness: 设置 API Key` 会写入同一个设置。）
4. 打开项目，点击 Activity Bar 中的 **DeepSeek Harness** 图标，描述任务并发送。

macOS 按 `Cmd+Alt+H`、Windows/Linux 按 `Ctrl+Alt+H` 可随时打开工作台。

## 功能

- **原生工作台**：全部交互都在侧边栏完成，不嵌入官方 WebUI。
- **会话管理**：持久化历史，支持搜索、新建、切换、重命名、分支、归档和返回父智能体。
- **Markdown 流式回复**：标题、列表、表格、代码块、一键复制和经校验的外链。
- **稳定增量渲染**：流式更新保留展开状态和用户滚动位置。
- **实时推理**：推理分片到达时自动展开并跟随最新内容，完成后自动收起。
- **Harness 原生能力**：推理、工具调用、审批、结构化问题、Todo、Skills、Goal、Plan 模式和后台任务。
- **模型与 Agent 设置**：DeepSeek V4 Flash / Pro、三档推理等级和四种 Agent Preset。
- **逐轮计时与 Token 统计**：首字延迟、耗时以及实时输入/输出 Token 数。
- **中英文双语**：跟随 VS Code 显示语言切换。
- **内置运行时**：官方 `dsh`、pnpm 和独立 Node 22.22.3 按平台随包分发。

## 工作台一览

工作台为三个可拖拽调宽的窗格，配色跟随 VS Code 主题。

- **左侧 —— 会话**：浏览与切换对话，支持搜索和归档列表。
- **中间 —— 对话**：流式回复、实时推理，以及递归的工具调用树。
- **右侧 —— 检查器**：展示所选工具调用的参数（格式化 JSON）与结果。

底部的输入框是完整的编辑区：

- 输入 `/` 插入斜杠命令或已注册的 Skill。
- 输入 `@` 引用子智能体。
- 行内切换 Plan 模式与权限级别。
- 切换模型（V4 Flash / Pro）与推理等级（`off` / `high` / `max`）。
- 上下文圆环显示上下文窗口占用，旁边是输入/输出 Token 统计。

输入框上方，**计划条**展示当前 Todo 列表和 Goal；**会话头部**展示活跃的子智能体与后台任务。

## 命令

| 命令 | 说明 |
|---|---|
| `DeepSeek Harness: 打开工作台` | 打开侧边栏工作台 |
| `DeepSeek Harness: 重新加载工作台` | 重启运行时并重新连接 |
| `DeepSeek Harness: 设置 API Key` | 保存 API Key |
| `DeepSeek Harness: 清除 API Key` | 清除 API Key |
| `DeepSeek Harness: 显示日志` | 打开诊断日志 |

## 配置

| 设置 | 默认值 | 说明 |
|---|---|---|
| `deepseekHarness.apiKey` | 空 | DeepSeek API Key，以 `machine` 作用域存于用户 `settings.json` |
| `deepseekHarness.model` | `deepseek-v4-flash` | 新会话默认模型 |
| `deepseekHarness.reasoningEffort` | `high` | `off` / `high` / `max` |
| `deepseekHarness.agentPreset` | `standard` | 新会话默认 Agent Preset |
| `deepseekHarness.provider` | `deepseek-official` | Harness 模型提供方路由 |
| `deepseekHarness.baseUrl` | 空 | 可选 API Base URL |
| `deepseekHarness.permissionMode` | `workspace-write` | `read-only` / `workspace-write` / `danger-full-access` |

API Key 不会写入项目级 `.vscode/settings.json`，但会以明文保存在本机用户设置中，请勿提交或分享包含密钥的设置文件。

## 语言

扩展默认语言为英文，并提供简体中文语言包。命令、设置、宿主提示、错误信息和工作台都会跟随 VS Code 的显示语言。切换语言后执行 **Developer: Reload Window** 即可生效。

## 安全与隐私

- Harness Gateway 只监听 `127.0.0.1` 随机端口。
- Webview 使用严格 CSP，不加载远程脚本或 iframe。
- Markdown 原始 HTML 默认禁用，渲染结果经 DOMPurify 白名单净化。
- Markdown 远程图片默认禁用；http(s) 外链会先经扩展宿主校验。
- 文件与命令访问由 `permissionMode` 与 Harness 审批策略控制。
- API Key 不发送给 Webview，也不会写入扩展日志。

## 平台支持

扩展 ID 与 Marketplace 产品始终只有一个，但由于内置 Node、PTY 和 sandbox 包含原生二进制，需要分别构建平台 VSIX：

- macOS —— `darwin-arm64`、`darwin-x64`
- Linux —— `linux-arm64`、`linux-x64`
- Windows —— `win32-arm64`、`win32-x64`

当前 GitHub Actions 托管矩阵覆盖 `darwin-arm64`、`linux-arm64`、`linux-x64` 和 `win32-x64`；其他架构需要自托管 runner 或本机打包。

## 开发

```sh
npm install
npm run check-types
npm run lint
npm test
npm run compile
npm run package
```

`npm run package` 会根据当前操作系统和 CPU 架构生成对应 VSIX。`npm ci` 会执行原生依赖所需的生命周期脚本，因此请只在可信提交和锁文件上构建。

提交信息统一使用英文。架构与安全边界详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 许可证

扩展代码采用 [MIT License](LICENSE)。DeepSeek Harness、Node.js 和其他依赖的许可信息见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 及各依赖附带的许可证文件。
