# DeepSeek Harness for VS Code

**English** | [简体中文](README.zh-CN.md)

Run the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) coding agent inside VS Code. The extension bundles the Harness runtime, starts and stops it for you, and puts a native workbench in the sidebar — install the VSIX, add your API key, and go. No separate Harness install, no Node/npm setup, no embedded web UI.

## Quick start

1. Download the VSIX for your platform from [Releases](https://github.com/zxlishixian/deepseek-harness-for-vscode/releases).
2. Install it: Extensions view (`Cmd/Ctrl+Shift+X`) → `...` → **Install from VSIX...**.
3. Add your DeepSeek API Key to your user `settings.json`:

   ```json
   {
     "deepseekHarness.apiKey": "sk-..."
   }
   ```

   (Running `DeepSeek Harness: Set API Key` writes the same setting.)
4. Open a project, click the **DeepSeek Harness** icon in the Activity Bar, describe your task, and send.

Open the workbench at any time with `Cmd+Alt+H` on macOS or `Ctrl+Alt+H` on Windows/Linux.

## Features

- **Native workbench** — everything happens in the sidebar; the official web UI is never embedded.
- **Session workflow** — persistent history with search, create, switch, rename, fork, archive, and back-to-parent navigation.
- **Streaming Markdown** — headings, lists, tables, code blocks, copy controls, and validated external links.
- **Stable incremental rendering** — disclosure state and scroll position survive streamed updates.
- **Live reasoning** — the reasoning block opens as deltas arrive, follows the newest text, and collapses when it completes.
- **Harness-native capabilities** — reasoning, tool calls, approvals, structured questions, Todos, Skills, Goals, Plan mode, and background jobs.
- **Model and agent controls** — DeepSeek V4 Flash / Pro, three reasoning levels, and four Agent Presets.
- **Per-turn timing and token counts** — time-to-first-token, elapsed duration, and live input/output tokens.
- **English and Simplified Chinese** — follows the VS Code display language.
- **Bundled runtime** — the official `dsh` CLI, pnpm, and a standalone Node 22.22.3 ship per platform.

## Inside the workbench

The workbench is three resizable panes that follow the VS Code theme.

- **Left — sessions.** Browsing and switching between conversations, with search and an archived list.
- **Center — conversation.** The streaming reply, live reasoning, and a recursive tree of tool calls.
- **Right — inspector.** The selected tool call's arguments (pretty-printed JSON) and result.

The composer at the bottom is the drafting surface:

- Type `/` to insert a slash command or a registered skill.
- Type `@` to reference a subagent.
- Toggle Plan mode and pick a permission level inline.
- Switch model (V4 Flash / Pro) and reasoning effort (`off` / `high` / `max`).
- A context ring shows how full the context window is, alongside input/output token counts.

Above the composer, a **plan strip** shows the current Todo list and goal; the **session header** shows active subagents and background jobs.

## Commands

| Command | Description |
|---|---|
| `DeepSeek Harness: Open Workbench` | Open the sidebar workbench |
| `DeepSeek Harness: Reload Workbench` | Restart the runtime and reconnect |
| `DeepSeek Harness: Set API Key` | Save the API Key |
| `DeepSeek Harness: Clear API Key` | Clear the API Key |
| `DeepSeek Harness: Show Logs` | Open diagnostic logs |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `deepseekHarness.apiKey` | empty | DeepSeek API Key, stored in user `settings.json` with `machine` scope |
| `deepseekHarness.model` | `deepseek-v4-flash` | Default model for new sessions |
| `deepseekHarness.reasoningEffort` | `high` | `off` / `high` / `max` |
| `deepseekHarness.agentPreset` | `standard` | Default Agent Preset for new sessions |
| `deepseekHarness.provider` | `deepseek-official` | Harness model-provider route |
| `deepseekHarness.baseUrl` | empty | Optional API base URL |
| `deepseekHarness.permissionMode` | `workspace-write` | `read-only` / `workspace-write` / `danger-full-access` |

The API Key is never written to a project-level `.vscode/settings.json`, but it is stored in plain text in your user settings — do not commit or share a settings file that contains it.

## Localization

English is the default, with a Simplified Chinese language pack included. Commands, settings, host prompts, errors, and the workbench all follow the VS Code display language. After switching, run **Developer: Reload Window**.

## Security and privacy

- The Harness Gateway listens only on a random `127.0.0.1` port.
- The Webview uses a strict CSP — no remote scripts or iframes.
- Raw Markdown HTML is disabled; rendered markup is sanitized through a DOMPurify allowlist.
- Remote Markdown images are disabled; http(s) links are re-validated by the extension host.
- File and command access is governed by `permissionMode` and Harness approval policies.
- The API Key is never sent to the Webview or written to extension logs.

## Platform support

One extension, one Marketplace product. Platform-specific VSIX files are needed because the bundled Node, PTY, and sandbox packages contain native binaries:

- macOS — `darwin-arm64`, `darwin-x64`
- Linux — `linux-arm64`, `linux-x64`
- Windows — `win32-arm64`, `win32-x64`

The hosted GitHub Actions matrix builds `darwin-arm64`, `linux-arm64`, `linux-x64`, and `win32-x64`; other targets need a self-hosted runner or local packaging.

## Development

```sh
npm install
npm run check-types
npm run lint
npm test
npm run compile
npm run package
```

`npm run package` produces a VSIX for the current OS and architecture. `npm ci` runs lifecycle scripts required by native dependencies, so build only trusted commits and lockfiles.

Commit messages are written in English. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for architecture and security boundaries.

## License

Extension code is under the [MIT License](LICENSE). DeepSeek Harness, Node.js, and other dependencies are covered by [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and the license files shipped with each dependency.
