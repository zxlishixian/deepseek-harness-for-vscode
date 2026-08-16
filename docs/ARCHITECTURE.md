# 架构说明

扩展采用“原生 VS Code 工作台 + Harness Gateway”的单扩展架构。官方 WebUI 不会被加载、嵌套或 iframe；扩展只把官方 Harness 当作本机 Agent 引擎，通过强类型 RPC 和事件流调用它。

```text
Native Webview（会话、消息、工具、推理、审批、计划）
                    │ 只传递 UI DTO
                    ▼
HarnessGatewayService（会话状态、历史修复、业务命令）
              │ HTTP RPC       │ WebSocket events
              ▼                ▼
        NodeGatewayClient（官方 API 契约的 Node 传输适配）
                    │ 127.0.0.1:随机端口
                    ▼
HarnessHostRuntime（VSIX 内置 Node + 官方 dsh Gateway）
```

插件管理与对话 RPC 使用两条相互隔离的应用链路：

```text
PluginCenterComponent（搜索、分类、安装状态）
       │ 仅传递经过校验的 package spec / UI DTO
       ▼
WorkbenchViewProvider（确认与安全提示）
       ├── DshPluginCatalogService（数据源编排与确定性合并）
       │     ├── GitHubDshPluginTopicSource（真实 Topic 搜索结果）
       │     └── CuratedDshPluginSource（分类、翻译与 npm 元数据）
       └── DshPluginManager（官方 web profile 安装状态与 pnpm 命令）
                         │ 运行时停止期间执行
                         ▼
       bundled dsh plugin --profile web + bundled pnpm
```

编辑器上下文使用第三条受限链路，文件正文不会进入 Webview：

```text
EditorSelectionService ── metadata + opaque id ──► EditorContextComponent
WorkspaceFileService  ── ranked file DTOs ──────► @ FileMentionComponent
        ▲                         │ opaque ids / safe open reference
        └─────────────────────────┘
        │ Extension Host 校验、读取并限制在当前 workspace
        ▼
PromptAttachment[] ──► HarnessGatewayService
```

## 目录职责

```text
src/
  config/       VS Code 用户配置、枚举校验和持久化
  domain/       领域选项、事件日志到原生 UI DTO 的纯投影
  editor/       编辑器选区快照、工作区文件索引、模糊排序和安全跳转
  gateway/      Gateway 传输、重连、会话与交互应用服务
  plugins/      插件目录投影、package spec 校验与官方 profile 管理
  runtime/      内置 Node/dsh 解析、配置覆盖和进程生命周期
  security/     settings.json API Key 与旧 SecretStorage 迁移
  ui/           Webview CSP、原生工作台和白名单消息桥
  webview/      独立 UI 组件、流式消息状态机、Markdown 安全渲染与本地化契约
media/          不依赖框架的 Webview 视图资源
scripts/        平台 VSIX 打包入口
test/           运行时解析、配置覆盖和事件投影单元测试
```

## 状态与协议边界

`HarnessHostRuntime` 启动官方 `dsh web` 命令，但只使用它提供的 Gateway；官方 HTML/JS 资源不进入 Webview。进程固定绑定回环地址，端口由操作系统随机分配。

`NodeGatewayClient` 继承官方 `AbstractApiClient`，因此请求封装、RPC id、响应 schema 与业务错误继续由 Harness 的官方契约校验。扩展只补充 VS Code Extension Host 所需的 `ws` 下行传输。

`HarnessGatewayService` 是唯一有状态应用层：

- `session.list/history/create/prompt/cancel/fork/rename` 管理会话；
- 历史页和实时 `session/event` 以 `seq` 去重，检测到缺口时重新读取尾页；
- Mux/Host WebSocket 断线自动重连，并重新获取会话与历史基线；
- 审批和用户问题使用原始 server-request 的 `rpcId` 回填响应；
- Webview 只接收 `HarnessWorkbenchState` DTO，不接触端口、凭据、文件系统或原始 RPC。

事件投影保持纯函数：用户/助手消息、流式 chunk、推理 block、工具调用/结果、todo 和 turn 结束状态从同一份持久化日志派生。历史回放与实时显示使用同一条代码路径。

## 配置与数据归属

- API Key：本机 VS Code 用户 `settings.json` 的 `deepseekHarness.apiKey`，`machine` 作用域。
- 模型、推理等级和 Agent 默认值：VS Code 用户设置；新进程启动时生成受控 `vscode.patch.yml`。
- Harness 会话与持久状态：扩展 `globalStorageUri/harness-home`。
- 官方运行时与独立 Node：VSIX 安装目录，只读。
- 诊断：DeepSeek Harness OutputChannel；API Key 不写日志，也不发送给 Webview。

## 安全边界

- Webview CSP 只允许扩展自身 CSS/JS，没有 `frame-src` 和远程脚本权限。
- Gateway 只监听 `127.0.0.1` 随机端口；不暴露局域网服务。
- 输入消息按字段类型校验；普通 UI 内容使用 DOM `textContent`，Markdown 禁用原始 HTML，并经过 DOMPurify 白名单净化。
- Markdown 远程图片默认禁用；外链只允许 `http`/`https`，工作区文件引用由扩展宿主再次解析并拒绝越界路径。
- 选中代码正文只保存在 Extension Host 的短期缓存；Webview 只能提交宿主签发的不透明选区/文件 ID，不能指定任意文件作为消息附件。
- `DEEPSEEK_API_KEY` 只注入独立 Harness 子进程环境。
- 扩展设置 `DSH_TELEMETRY_DISABLED=1`。
- 插件目录只接受固定 HTTPS 主机、严格安装命令格式和单一 package spec；Webview 不直接发起网络或进程操作。
- DSH 在 Windows 上使用 shell 转发 pnpm，因此插件 spec 禁止空白和 shell 元字符，避免拆参与命令注入。
- 第三方插件的宿主代码在 Agent 沙箱之外运行；安装前必须显示权限边界并由用户确认。

## 本地化边界

- 扩展清单通过 `package.nls.json` 与 `package.nls.zh-cn.json` 本地化命令、视图和设置。
- Extension Host 使用 VS Code `l10n` API，本机提示、运行时错误和领域投影均以英文为源语言。
- Webview 从 Extension Host 接收已本地化的消息表，不自行判断操作系统语言；显示语言始终与 VS Code 一致。
- 英文是默认语言，简体中文资源位于 `l10n/bundle.l10n.zh-cn.json`。

## 为什么需要平台包

VS Code 扩展的 TypeScript/Webview 本身跨平台，但本扩展为了“安装即用”携带了 Node、PTY 和 sandbox 原生二进制。它们分别针对 Windows/macOS/Linux 与 x64/arm64 编译，不能把一个平台的二进制复制到另一个平台运行。

这不等于多个扩展：Marketplace 中仍是同一个扩展 ID 和同一个产品条目，只是每次发布上传多个 `targetPlatform` 资产，VS Code 自动选择匹配包。站外分发有两种方案：

1. 推荐：在一个 Release 页面放置多个平台 VSIX，用户选择自己的系统；离线、确定性最好。
2. 单一通用 VSIX：只携带 TypeScript 启动器，首次运行从受信 Release 下载并校验对应运行时；文件更小，但首次使用依赖网络和供应链下载服务。

当前仓库采用第一种方案，不要求用户安装或部署 Harness。
