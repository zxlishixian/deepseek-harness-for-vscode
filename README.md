# DeepSeek Harness for VS Code（dsh-vscode）

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 界面嵌入 VS Code 侧边面板的插件，使用体验类似 Claude Code for VS Code / Codex for VS Code。

> 本插件**不内置** harness 本体，而是调用官方的 `dsh` CLI。因此使用前必须满足下面的前提条件。

---

## 目录

- [一、这是什么](#一这是什么)
- [二、使用前提（必须）](#二使用前提必须)
- [三、快速开始：clone → 打包 → 安装](#三快速开始clone--打包--安装)
- [四、开发模式（改代码调试用）](#四开发模式改代码调试用)
- [五、安装后的使用步骤](#五安装后的使用步骤)
- [六、配置项](#六配置项)
- [七、常见问题 FAQ](#七常见问题-faq)
- [八、发布到 GitHub Release](#八发布到-github-release)

---

## 一、这是什么

- 一个 VS Code 扩展：在编辑器右侧打开一个面板，把 DeepSeek Harness 的 Web 界面嵌进去。
- 插件是"薄壳"：点开面板时，它自动执行官方 CLI：

  ```sh
  npx --yes @deepseek-ai/dsh web
  ```

  然后读取 CLI 打印的本地地址（`http://127.0.0.1:<端口>`），用 iframe 把界面嵌入面板。
- 所有 agent 能力、会话记录、配置都由官方 harness 提供，插件只负责"启动 + 嵌入"。

## 二、使用前提（必须）

| # | 前提 | 怎么检查 / 获取 |
| --- | --- | --- |
| 1 | **VS Code** 1.90+ | 已安装即可 |
| 2 | **Node.js 22.19+ 或 24+** | 终端运行 `node --version`；没有就去 https://nodejs.org 装 LTS |
| 3 | **DeepSeek API Key** | 到 https://platform.deepseek.com 注册并创建 Key（要有额度） |

> 说明：Node 是必须的，因为 `npx @deepseek-ai/dsh web` 需要 Node 来运行。插件启动前会自动检查 Node 版本，版本不对会弹明确提示。

## 三、快速开始：clone → 打包 → 安装

这是**正式使用**的方式：把插件打包成 `.vsix` 文件，安装到 VS Code。

```sh
# 1. 克隆本仓库
git clone https://github.com/zxlishixian/deepseek-harness-for-vscode.git dsh-vscode
cd dsh-vscode

# 2. 安装依赖（会装上 @types/vscode、@vscode/vsce、typescript）
npm install

# 3. 打包（自动编译 TypeScript，产出 dsh-vscode-0.1.0.vsix）
npm run package
# 等价于：npx @vscode/vsce package --no-dependencies

# 4. 安装到 VS Code
code --install-extension dsh-vscode-0.1.0.vsix
```

5. **重启 VS Code**（或命令面板运行 `Developer: Reload Window`）。
6. 打开任意项目文件夹 → 命令面板（`Cmd/Ctrl+Shift+P`）→ 搜索并运行 **DeepSeek Harness: Open DeepSeek Harness**（或点编辑器右上角的 🤖 按钮）。
7. 右侧打开面板，插件自动执行 `npx @deepseek-ai/dsh web`（**首次会从 npm 下载 dsh，需要联网并稍等**；之后秒开）。
8. 在面板里的 **Models** 页填 API Key，即可开始对话。

> 小技巧：如果不想每次通过 npx 下载，可以先全局安装 `npm install -g @deepseek-ai/dsh`，然后在 VS Code 设置里把 `dsh.binary` 填成 `dsh`。

## 四、开发模式（改代码调试用）

适合想改插件代码、看日志、打断点的情况。

```sh
git clone https://github.com/zxlishixian/deepseek-harness-for-vscode.git dsh-vscode
cd dsh-vscode
npm install
```

1. 用 VS Code **打开这个 `dsh-vscode` 文件夹**（不是仓库外的项目）。
2. 按 **F5**，选择 **Run Extension**，会弹出一个"扩展开发宿主"窗口。
3. （可选）如果你本地有构建好的官方 harness，在设置里把 `dsh.binary` 填成它的 `apps/cli/lib/bin.js` 绝对路径；否则留空走 npx。
4. 在那个"扩展开发宿主"窗口里打开项目 → 运行 **DeepSeek Harness: Open DeepSeek Harness**。

## 五、安装后的使用步骤

1. 在 VS Code 里打开你要写代码的**项目文件夹**（harness 会把它当作默认工作目录）。
2. 命令面板 → **DeepSeek Harness: Open DeepSeek Harness**。
3. 右侧面板出现，插件启动 dsh Web 服务并加载界面。
4. 首次在 **Models** 页配置模型与 API Key（或设置环境变量 `DEEPSEEK_API_KEY`）。
5. 开始对话。会话记录保存在 `~/.dsh/sessions/` 下。

## 六、配置项

在 VS Code 设置（`Cmd/Ctrl+,`）里搜 `dsh`：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `dsh.binary` | 空 | dsh 启动器。空 = `npx --yes @deepseek-ai/dsh`；以 `.js` 结尾会用 `node` 执行；否则当作可执行命令 |
| `dsh.home` | 空 | `DSH_HOME` 覆盖，默认 `~/.dsh`（会话、配置都存这里） |
| `dsh.port` | `0` | 监听端口，`0` = 系统自动分配空闲端口 |
| `dsh.args` | `[]` | 透传给 `dsh web` 的额外参数 |
| `dsh.openOnStartup` | `false` | 设为 `true` 时，窗口加载完自动启动 harness |

## 七、常见问题 FAQ

| 现象 | 原因 / 解决 |
| --- | --- |
| 提示 `Node.js was not found` 或版本过低 | 装 Node 22.19+ 或 24+，再重启 VS Code |
| 提示 `npx ... @deepseek-ai/dsh` 下载失败 | 网络问题；可先 `npm install -g @deepseek-ai/dsh`，再设 `dsh.binary = dsh` |
| 面板空白 / 很小 | 旧版 CSP 已修复；仍异常就打开 VS Code 底部 **Output → DeepSeek Harness** 看启动日志 |
| API Key 无效 / 报 401 | 到 Models 页重新填，确认 key 正确且有额度 |
| 想换模型 / 加模型 | 在面板 **Models** 页配置 |
| 端口被占用 | 默认 `dsh.port = 0` 自动挑端口；一般不会冲突 |

## 八、发布到 GitHub Release

1. 按【三、快速开始】打包出 `dsh-vscode-0.1.0.vsix`。
2. 在 GitHub 仓库的 **Releases** 页面创建一个 Release，把这个 `.vsix` 作为附件上传。
3. 别人下载后执行 `code --install-extension dsh-vscode-0.1.0.vsix` 即可。

---

**TL;DR**：装好 Node 22.19+/24 和 DeepSeek Key → `npm install` → `npm run package` → `code --install-extension dsh-vscode-0.1.0.vsix` → 打开项目 → 运行 Open DeepSeek Harness → Models 页填 Key。
