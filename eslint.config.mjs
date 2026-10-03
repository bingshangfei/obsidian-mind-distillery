import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
			globals: {
				setTimeout: "readonly",
				clearTimeout: "readonly",
			},
		},
	},
	{
		files: ["test/**/*.ts"],
		rules: {
			// Node-side tests exercise the injected HTTP seam with fetch on purpose.
			"no-restricted-globals": "off",
		},
		languageOptions: {
			globals: {
				fetch: "readonly",
				process: "readonly",
			},
		},
	},
]);
