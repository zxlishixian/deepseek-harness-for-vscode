# Changelog

## 0.5.0

- 原生三栏工作台：左侧会话列表、中间对话区、右侧工具调用检查器，栏宽可拖拽并随视口自适应。
- 重写输入框：两层 textarea 结构（透明文字层 + 隐藏镜像层精确对齐），支持 `/` 斜杠命令、`@` 子智能体提及、行内 Plan 开关与权限切换、模型/推理等级选择，以及上下文占用圆环。
- 输入框上方新增计划条（Todo 列表 + Goal 卡片）与会话头部（子智能体 + 后台任务），替代原底部详情抽屉。
- 工具调用以递归树展示，点选即可在右侧检查器查看参数（格式化 JSON）与结果。
- 推理分片到达时自动展开并跟随最新内容，完成块自动收起；正文与推理流式更新保持展开状态与滚动位置。
- 逐轮显示首字延迟与耗时，输入区实时显示输入/输出 Token 数。
- 会话支持搜索、新建、切换、重命名、分支、归档与返回父智能体。

## 0.4.3

- 输入框模型配置组件：模型、Agent Preset 与推理等级在发送下一条消息时统一生效。
- 推理等级改为三档胶囊滑杆，支持拖动、滚轮与点击，各档独立配色。
- 模型与模式浮层改为紧凑右对齐布局，同时放大输入区文字并统一工作台圆角风格。
- 每轮对话在最后一个可见结果底部显示工作时长，运行中按秒更新，完成后以 Harness 的 `turn/start` 与 `turn/end` 事件固定真实耗时。
- 移除图片输入和附件传输。
- Token 统计旁新增上下文占用圆环，基于 Harness `contextPressure` 投影显示压缩后的实时占用率。
- 在已有对话中切换 Agent Preset 时自动新建会话，遵守 Harness 对已启动会话锁定 Preset 的协议约束。
- 权限下拉框完整显示三种官方预设，真实切换当前会话的沙箱与审批策略，并保存为新会话默认值。
- GitHub tag 工作流构建四个平台 VSIX 并附加到 GitHub Release，不自动发布到 Marketplace。
- 图标改为透明背景的官方 DeepSeek 标志。

## 0.4.2

- 新增英文与简体中文本地化，命令、设置、宿主提示和原生对话工作台跟随 VS Code 显示语言。
- 对话正文与推理过程支持 Markdown：标题、列表、引用、代码、表格、删除线和链接。
- 代码块一键复制，http(s) 链接经扩展宿主校验后再交给系统浏览器打开。
- 流式分片继续更新原消息块，Markdown 重排不替换整条消息，保留展开状态与滚动位置。
- 原始 HTML 默认禁用，渲染结果经 DOMPurify 白名单净化；远程 Markdown 图片默认禁用。
- Token 用量显示与 `Ctrl/Cmd+Alt+H` 工作台快捷键。
- 修复 Windows VSIX 打包与运行时进程树清理，新增 macOS、Linux、Windows 多平台 CI。

## 0.4.1

- 修复冷会话恢复时 `skills.list` 抢先执行导致的 `session not found (not attached)` 启动异常；可选目录失败不再拖垮整个工作台。
- 对话消息改为按 ID 增量更新，流式文本在原节点内追加；展开状态与滚动位置不因新分片丢失。
- 修复斜杠命令传输协议：官方命令改走 `commands/execute`，不再被误发给模型，并在对话中显示持久命令回执。
- 权限选择真实写入 `permission/preset`、`sandbox/mode` 与 `approval/policy`，同时保存为本机新会话默认值。

## 0.4.0

- 输入框支持 `/` 斜杠命令菜单：输入 `/` 弹出官方命令列表（`/compact`、`/feedback`、`/goal`、`/permission`、`/plan`），支持过滤、键盘导航与一键插入。
- 命令列表从运行时 `commands/list` 动态获取，随会话切换刷新。

## 0.3.0

- 移除官方 WebUI iframe，改为原生 VS Code 对话工作台。
- 接入 Harness Gateway RPC、Mux/Host WebSocket 与自动重连。
- 增加会话历史、流式消息、推理、工具、审批、问题、Todo 与 Skills 视图。
- 模型、推理与 Agent Preset 改为会话级 Gateway 操作。

## 0.2.0

- 内置 `@deepseek-ai/dsh` 和平台独立 Node，不再要求本地部署、Node 或 npm。
- 增加 Flash/Pro、推理等级和四种官方 Agent Preset 选择器。
- API Key 改为本机 VS Code 用户 `settings.json` 配置，并迁移旧 SecretStorage 值。
- 使用随机回环端口、严格 Webview CSP 和平台目标 VSIX。

## 0.1.0

- 首个 VS Code 扩展版本，通过官方 stdio JSON-RPC SDK 协议连接 DeepSeek Harness。
- 支持侧边栏聊天、流式输出、思考过程、工具活动和多轮会话。
- 支持安全 API Key 存储、托管运行时安装和自定义运行时。
- 支持文件权限策略、停止任务和新建会话。
