# Mind Distillery

> [!tip] 一句话
> **让 Obsidian 自动把收件箱碎片酿成互链知识卡，并每周替你复盘知识库。** 装插件、填 API Key，零 CLI 依赖。

面向社区的 Obsidian 插件产品（开发中）。来源：ob_dsh 的「四阶进化 + dsh 蒸馏引擎」产品化。

## 状态

- [x] **M0** 脚手架 + Provider 层（OpenAI 兼容 adapter、JSON 修复链、token 记账、SecretStorage 密钥、声明式设置页）——build/lint/test 全绿
- [ ] **M1** 蒸馏流水线（两档制、检索合并、PARA 归序、溯源块、自测、变体模板、确认模式、幂等账本）
- [ ] **M2** 周复盘 + Review Hub 内置视图（体检/随机漫步/回顾队列）
- [ ] **M3** 捕获入口（Modal/URL 提取）+ 音视频转写（OpenAI 兼容 /audio/transcriptions）
- [ ] **M4** 加固（i18n 完整、设置迁移、成本面板、官方自查清单）
- [ ] **M5** BRAT beta → 社区市场提交

完整方案见任务下达会话的批准稿（里程碑验收口径在其中）。

## 工程约定

- 架构原则：**LLM 只提议，代码落笔**（LLM 调用点仅 classify/summarize/card/reviewCard/quiz 五类，均为 JSON 结构化输出 + 修复兜底）
- 密钥走 Obsidian SecretStorage（≥1.11.4），绝不写入 data.json 或 vault；minAppVersion 1.13.0（声明式设置页）
- 网络统一 `requestUrl`；文件操作走 Vault API（`process`/`processFrontMatter`/`trashFile`），永不删除文件
- 合规：无遥测、无自更新、无远程代码；README 披露网络用途；CI 跑 `eslint-plugin-obsidianmd` 且 Error 清零
- 门禁：`npm run build`（tsc + esbuild production）→ `npm run lint` → `npm test`（单测 + 可选真实端点集成测试，环境变量 `MIND_DISTILLERY_TEST_KEY` 注入）

## 网络披露（Developer policies 要求）

本插件把**你主动蒸馏/复盘的笔记内容**发送到你在设置里配置的 LLM 端点（默认 DeepSeek，可改任何 OpenAI 兼容端点或本地 Ollama）；转写功能把**你主动选择的音频文件**发送到配置的转写端点（DeepSeek 无此端点，需 OpenAI/Groq/本地）。除此之外无任何网络请求，无遥测。
