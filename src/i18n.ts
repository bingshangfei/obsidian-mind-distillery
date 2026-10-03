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
		transcribeDesc:
			"Endpoint exposing OpenAI /audio/transcriptions. DeepSeek does not offer one — use OpenAI, Groq, or a local server.",
		confirmMode: "Change approval",
		confirmModeDesc:
			"How much the plugin may do without asking. Move/archive suggestions always ask in semi-automatic mode.",
		confirmAuto: "Fully automatic",
		confirmSemi: "Semi-automatic (recommended)",
		confirmStrict: "Confirm everything",
		language: "Language",
		languageDesc: "UI and report language.",
		usage: "Token usage",
		usageDesc: "Cumulative LLM usage of this vault, by call site.",
	},
	commands: {
		testConnection: "Test LLM connection",
		distillInbox: "Distill inbox",
		weeklyReview: "Run weekly review",
		openReviewHub: "Open review hub",
		capture: "Capture a note to inbox",
		transcribe: "Transcribe an audio file to inbox",
	},
	notice: {
		noKey: "No API key configured — open Settings → Mind Distillery.",
		alreadyRunning: "A distillation run is already in progress.",
		testing: "Testing connection…",
		distillRunning: "Distilling inbox…",
		confirmBatchTitle: "Distill inbox",
		confirmBatchBody: (n: number) =>
			`Distill ${n} notes now? Cards and links are applied automatically; nothing is deleted.`,
		distillDone: (n: number) => `Distilled ${n} note(s) — report appended to the log.`,
		distillPartial: (done: number, failed: number) =>
			`Distilled ${done}, failed ${failed} (failed notes stay in the inbox).`,
		reviewRunning: "Running weekly review…",
		reviewDone: (path: string) => `Review saved: ${path}`,
		captured: (path: string) => `Captured → ${path}`,
		transcribed: (path: string) => `Transcribed → ${path}`,
		transcribeNoFile: "No audio file found. Drop one into the vault first.",
		transcribeTooLarge: "File exceeds 24 MB — split it first (OpenAI-compatible limit).",
		transcribeFailed: (msg: string) => `Transcription failed: ${msg}`,
		captureEmpty: "Nothing to capture — write something first.",
		testFail: (msg: string) => `Failed: ${msg}`,
		testOk: (model: string, tokens: number) => `Connected to ${model} — ${tokens} tokens used.`,
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
		usage: "Token 用量",
		usageDesc: "本仓库累计 LLM 用量，按调用点分类。",
	},
	commands: {
		testConnection: "测试 LLM 连接",
		distillInbox: "蒸馏收件箱",
		weeklyReview: "执行周复盘",
		openReviewHub: "打开复盘中心",
		capture: "捕获一条笔记到收件箱",
		transcribe: "把音频转写进收件箱",
	},
	notice: {
		noKey: "尚未配置 API 密钥——打开 设置 → Mind Distillery。",
		alreadyRunning: "已有一次蒸馏正在进行。",
		testing: "正在测试连接……",
		distillRunning: "正在蒸馏收件箱……",
		confirmBatchTitle: "蒸馏收件箱",
		confirmBatchBody: (n: number) => `现在蒸馏 ${n} 篇笔记？卡片与链接会自动应用，不会删除任何文件。`,
		distillDone: (n: number) => `已蒸馏 ${n} 篇——报告已追加到日志。`,
		distillPartial: (done: number, failed: number) => `成功 ${done} 篇，失败 ${failed} 篇（失败文件留在收件箱）。`,
		reviewRunning: "正在执行周复盘……",
		reviewDone: (path: string) => `复盘已保存：${path}`,
		captured: (path: string) => `已捕获 → ${path}`,
		transcribed: (path: string) => `已转写 → ${path}`,
		transcribeNoFile: "未找到音频文件——请先把音频放进仓库。",
		transcribeTooLarge: "文件超过 24 MB——请先切段（OpenAI 兼容接口限制）。",
		transcribeFailed: (msg: string) => `转写失败：${msg}`,
		captureEmpty: "没有可捕获的内容——先写点什么。",
		testFail: (msg: string) => `失败：${msg}`,
		testOk: (model: string, tokens: number) => `已连接 ${model} —— 本次消耗 ${tokens} tokens。`,
	},
	statusBar: {
		tokens: (n: number) => ` 已蒸馏 ${n} tok`,
	},
};

const locales = { en, zh } as const;
export type Language = keyof typeof locales;
export type Strings = typeof en;

export const stringsFor = (lang: Language | undefined): Strings => locales[lang ?? "en"] ?? locales.en;
