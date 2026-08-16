export const ENGLISH_WEBVIEW_MESSAGES = {
  history: 'Chat history',
  newConversation: 'New conversation',
  extensionSettings: 'Extension settings',
  backToParentAgent: 'Back to parent agent',
  renameConversation: 'Rename conversation',
  forkConversation: 'Fork from the current progress',
  rename: 'Rename',
  fork: 'Fork',
  archive: 'Archive',
  unarchive: 'Unarchive',
  archived: 'Archived',
  recentConversations: 'Recent',
  sessionActions: 'Session actions',
  emptyArchived: 'No archived conversations',
  sessionSettings: 'Session settings',
  configurationTitle: 'Model and Agent Preset',
  configurationModels: 'Models',
  configurationModes: 'Agent Presets',
  configurationEffort: 'Effort',
  configurationClose: 'Close model and mode settings',
  configurationOpen: 'Choose model, Agent Preset, and reasoning effort',
  configurationAppliesNextMessage: 'Changes apply when you send the next message.',
  modeStartsNewConversation: 'Changing the Agent Preset starts a new conversation when you send.',
  configurationSummary: '{model} · {mode} · Effort {effort}',
  contextUsageSummary: 'Context {used} / {limit} · {percent}% used',
  model: 'Model',
  reasoning: 'Reasoning',
  agent: 'Agent',
  apiKeyRequired: 'Configure your DeepSeek API Key in the local settings.json first.',
  configure: 'Configure',
  searchConversations: 'Search conversations…',
  startingHarness: 'Starting Harness',
  startingHarnessDescription: 'The extension is starting its bundled runtime. No separate deployment is required.',
  connectionFailed: 'Connection failed',
  retry: 'Retry',
  logs: 'Logs',
  loadOlder: 'Load older messages',
  emptyTitle: 'What can I help you build?',
  emptyDescription: 'Read code, edit files, run commands, make plans, or delegate complex work to Harness agents.',
  plan: 'Plan',
  skills: 'Skills',
  jobs: 'Jobs',
  agents: 'Agents',
  slashCommands: 'Slash commands',
  mention: 'Mention',
  promptPlaceholder: 'Ask DeepSeek Harness… Type / for commands, @ for agents',
  message: 'Message',
  context: 'Context',
  contextDescription: 'Plans, Skills, and background jobs',
  permissionDescription: 'Harness file and command permissions',
  send: 'Send',
  sendTitle: 'Send (Enter)',
  stopGenerating: 'Stop generating',
  composerHint: 'Enter to send · Shift+Enter for a new line · @ to mention agents',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  connectionError: 'Error',
  starting: 'Starting',
  unknownError: 'Unknown error',
  noMatchingConversations: 'No matching conversations',
  status: 'Status',
  you: 'You',
  reasoningProcess: 'Reasoning process',
  thinking: 'Thinking…',
  workedFor: 'Worked for {duration}',
  tool: 'Tool',
  approvalRequired: 'Approval required: {tool}',
  reject: 'Reject',
  allowOnce: 'Allow once',
  questionRequired: 'Harness needs your input',
  otherAnswer: 'Other answer (optional)',
  submitAnswer: 'Submit answer',
  planChanging: 'Changing Plan mode',
  planEnabled: 'Plan mode enabled',
  planDisabled: 'Plan mode disabled',
  todoProgressDone: '{count} done',
  todoProgressActive: '{count} active',
  todoProgressPending: '{count} pending',
  enable: 'Enable',
  disable: 'Disable',
  createGoal: 'Create persistent goal',
  goalPhaseActive: 'active',
  goalPhasePaused: 'paused',
  goalPhaseBlocked: 'blocked',
  goalPhaseComplete: 'complete',
  goalRounds: '{phase} · {current}/{max} rounds',
  pause: 'Pause',
  resume: 'Resume',
  markComplete: 'Mark complete',
  clear: 'Clear',
  continuableConversation: 'Continuable',
  oneShot: 'One-shot',
  hasChildAgents: ' · has child agents',
  noContent: 'Nothing here yet',
  oneShotReadOnly: 'One-shot sub-agent · read-only',
  runningQueue: 'Running · Enter to queue',
  continuableSubagent: 'Continuable sub-agent',
  justNow: 'Just now',
  minutesAgo: '{count} min ago',
  hoursAgo: '{count} hr ago',
  code: 'Code',
  copy: 'Copy',
  copyCode: 'Copy {language} code',
  toolResult: 'Tool result',
  slashCommand: 'Slash command',
  imageAttachment: '[Image attachment]',
  turnFailed: 'Turn failed',
  outputLimitReached: 'Output limit reached',
  contextCompacted: 'Context compacted',
  compactedItems: '{count} items · {tokens} tokens',
  firstToken: 'first token in {duration}',
  tokensPerSecond: '{rate} tok/s',
  retrying: 'Retrying…',
  close: 'Close',
  running: 'Running…',
  toolInspector: 'Tool inspector',
  inspectorInput: 'Input',
  inspectorOutput: 'Output',
  inspect: 'Inspect',
} as const

export type WebviewMessageKey = keyof typeof ENGLISH_WEBVIEW_MESSAGES
export type WebviewMessages = Record<WebviewMessageKey, string>
export type MessageArguments = Record<string, string | number>

export interface WebviewLocalizationBootstrap {
  readonly language: string
  readonly messages: WebviewMessages
}

declare global {
  // Set by the nonce-protected bootstrap script before the Webview bundle.
  var __DEEPSEEK_HARNESS_LOCALIZATION__: WebviewLocalizationBootstrap | undefined
}

export function localizeWebviewMessages(localize: (message: string) => string): WebviewMessages {
  return Object.fromEntries(
    Object.entries(ENGLISH_WEBVIEW_MESSAGES).map(([key, message]) => [key, localize(message)]),
  ) as WebviewMessages
}

export function createWebviewTranslator(
  bootstrap = globalThis.__DEEPSEEK_HARNESS_LOCALIZATION__,
): (key: WebviewMessageKey, args?: MessageArguments) => string {
  const messages = bootstrap?.messages ?? ENGLISH_WEBVIEW_MESSAGES
  return (key, args = {}) => formatMessage(messages[key] ?? ENGLISH_WEBVIEW_MESSAGES[key], args)
}

function formatMessage(message: string, args: MessageArguments): string {
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (placeholder, key: string) => {
    const value = args[key]
    return value === undefined ? placeholder : String(value)
  })
}
