/** Locale strings. English is canonical; zh-CN mirrors it. */
const en = {
	pluginName: "Mind Distillery",
	settings: {
		provider: "Provider",
		providerDesc: "OpenAI-compatible chat endpoint used for distillation and reviews.",
		baseUrl: "Base URL",
		baseUrlDesc: "API root, without /chat/completions. Example: https://api.deepseek.com",
		model: "Model",
		modelDesc: "Chat model name, e.g. deepseek-chat.",
		apiKey: "API key",
		apiKeyDesc: "Stored in Obsidian's secret storage — never written into your vault.",
		transcribe: "Transcription",
		transcribeDesc: "Endpoint exposing OpenAI /audio/transcriptions. DeepSeek does not offer one — use OpenAI, Groq, or a local server.",
		confirmMode: "Change approval",
		confirmModeDesc: "How much the plugin may do without asking. Move/archive suggestions always ask in semi-automatic mode.",
		confirmAuto: "Fully automatic",
		confirmSemi: "Semi-automatic (recommended)",
		confirmStrict: "Confirm everything",
		language: "Language",
		languageDesc: "UI and report language.",
	},
	commands: {
		testConnection: "Test LLM connection",
		openReviewHub: "Open review hub",
		capture: "Capture a note to inbox",
	},
	notice: {
		noKey: "No API key configured — open Settings → Mind Distillery.",
		testing: "Testing connection…",
		testOk: (model: string, tokens: number) => `Connected to ${model} — ${tokens} tokens used.`,
		testFail: (msg: string) => `Connection failed: ${msg}`,
	},
	statusBar: {
		tokens: (n: number) => ` distilled ${n} tok`,
	},
};

const zh: typeof en = {
	pluginName: "Mind Distillery",
	settings: {
		provider: "模型服务商",
		providerDesc: "用于蒸馏与复盘的 OpenAI 兼容对话接口。",
		baseUrl: "接口地址",
		baseUrlDesc: "API 根地址，不含 /chat/completions。示例：https://api.deepseek.com",
		model: "模型",
		modelDesc: "对话模型名，例如 deepseek-chat。",
		apiKey: "API 密钥",
		apiKeyDesc: "保存在 Obsidian 密钥库中——绝不写入你的仓库文件。",
		transcribe: "语音转写",
		transcribeDesc: "需提供 OpenAI /audio/transcriptions 兼容端点。DeepSeek 不提供——可用 OpenAI、Groq 或本地服务。",
		confirmMode: "改动审批",
		confirmModeDesc: "插件未经询问可执行的范围。半自动模式下移动/归档建议总会先询问。",
		confirmAuto: "全自动",
		confirmSemi: "半自动（推荐）",
		confirmStrict: "全部确认",
		language: "语言",
		languageDesc: "界面与报告语言。",
	},
	commands: {
		testConnection: "测试 LLM 连接",
		openReviewHub: "打开复盘中心",
		capture: "捕获一条笔记到收件箱",
	},
	notice: {
		noKey: "尚未配置 API 密钥——打开 设置 → Mind Distillery。",
		testing: "正在测试连接……",
		testOk: (model: string, tokens: number) => `已连接 ${model} —— 本次消耗 ${tokens} tokens。`,
		testFail: (msg: string) => `连接失败：${msg}`,
	},
	statusBar: {
		tokens: (n: number) => ` 已蒸馏 ${n} tok`,
	},
};

const locales = { en, zh } as const;
export type Language = keyof typeof locales;
export type Strings = typeof en;

export const stringsFor = (lang: Language | undefined): Strings =>
	locales[lang ?? "en"] ?? locales.en;
