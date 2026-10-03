export interface ProviderPreset {
	id: string;
	label: string;
	baseUrl: string;
	defaultModel: string;
	hint?: string;
}

/** OpenAI-compatible chat presets. Base URLs never include /chat/completions. */
export const CHAT_PRESETS: ProviderPreset[] = [
	{
		id: "deepseek",
		label: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		defaultModel: "deepseek-chat",
	},
	{
		id: "openai",
		label: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini",
	},
	{
		id: "ollama",
		label: "Ollama (local)",
		baseUrl: "http://localhost:11434/v1",
		defaultModel: "llama3.1",
		hint: "Local models keep your notes on this machine.",
	},
	{
		id: "groq",
		label: "Groq",
		baseUrl: "https://api.groq.com/openai/v1",
		defaultModel: "llama-3.3-70b-versatile",
	},
	{
		id: "custom",
		label: "Custom (OpenAI-compatible)",
		baseUrl: "",
		defaultModel: "",
	},
];

/** Audio transcription needs an endpoint exposing OpenAI /audio/transcriptions. DeepSeek does not. */
export const TRANSCRIBE_PRESETS: ProviderPreset[] = [
	{
		id: "openai",
		label: "OpenAI (whisper-1)",
		baseUrl: "https://api.openai.com/v1",
		defaultModel: "whisper-1",
	},
	{
		id: "groq",
		label: "Groq (whisper-large-v3)",
		baseUrl: "https://api.groq.com/openai/v1",
		defaultModel: "whisper-large-v3",
	},
	{
		id: "custom",
		label: "Custom (OpenAI-compatible)",
		baseUrl: "",
		defaultModel: "",
	},
];

export const getPreset = (presets: ProviderPreset[], id: string): ProviderPreset =>
	presets.find((p) => p.id === id) ?? presets[presets.length - 1];
