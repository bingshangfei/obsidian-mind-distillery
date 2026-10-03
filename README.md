# Mind Distillery

> [!tip] 一句话
> **让 Obsidian 自动把收件箱碎片酿成互链知识卡，并每周替你复盘知识库。** 装插件、填 API Key，零 CLI 依赖。

Mind Distillery 把「PARA + AI 蒸馏」的完整闭环做成了 Obsidian 插件：收件箱里的碎片会被自动归类、标准化摘要、提炼成互相链接的原子卡片；每周自动生成带回顾队列与自测题的复盘草稿；复盘中心视图随时给你知识库体检与随机漫步。

## 网络披露（Developer policies 要求）

- 本插件把**你主动蒸馏/复盘的笔记内容**发送到你在设置里配置的 LLM 端点（默认 DeepSeek，可改任何 OpenAI 兼容端点或本地 Ollama）。
- 转写功能把**你主动选择的音频文件**发送到配置的转写端点（DeepSeek 无音频端点，需 OpenAI / Groq / 本地服务）。
- URL 捕获会按你输入的链接抓取网页正文。
- 除此之外无任何网络请求；**无遥测**；API 密钥保存在 Obsidian 密钥库（SecretStorage），绝不写入 data.json 或 vault 文件。

## 功能

| 功能 | 说明 |
| --- | --- |
| 蒸馏收件箱 | 两档制（深蒸馏建卡/浅蒸馏仅摘要，存疑从浅）、frontmatter 规范化、PARA 归序、标准化摘要+溯源块 |
| 建卡先检索 | 先把既有卡片清单喂给模型判断合并 or 新建；命中即合并补链，绝不新建重复卡；新卡自动选工程/认知/通用模板并带自测问句 |
| 周复盘 | 停滞任务统计、回顾队列三态处置（keep/elevate/cull，cull 只标记待人确认）、3-5 道自测题；同日重跑追加不覆盖 |
| Review Hub | 内置视图：库体检（孤儿卡/遗忘卡）、cull 归档确认（人工点击）、随机漫步 |
| 捕获 | 随手记 + URL 正文提取，一键进收件箱等蒸馏 |
| 转写 | 音频 → OpenAI 兼容 /audio/transcriptions → 收件箱笔记（24 MB 上限，DeepSeek 不支持请配 OpenAI/Groq） |
| 成本透明 | 按调用点统计 token 用量，随时重置 |

安全边界贯穿全程：**插件永不删除文件**；批量操作与归档一律需要人工确认（三档审批模式：全自动/半自动/全确认）；每次运行留痕到日志。

## 安装

- **BRAT（beta 推荐）**：安装 obsidian42-brat → Add Beta Plugin → `bingshangfei/obsidian-mind-distillery`
- **手动**：从 [Releases](https://github.com/bingshangfei/obsidian-mind-distillery/releases) 下载 `main.js`、`manifest.json`、`styles.css` 放入 `.obsidian/plugins/mind-distillery/`

启用后：设置 → Mind Distillery → 选择服务商并粘贴 API Key → 命令面板执行 **Test LLM connection**。

## 上手循环

1. 随手把想法/剪藏丢进 `00 Inbox`（或用 Capture 命令）
2. 执行 **Distill inbox**（半自动模式下超过 5 篇会先询问）
3. 打开 **Review Hub** 看体检、处理 cull、随机漫步
4. 每周执行 **Run weekly review**（或等手动触发），拿到复盘草稿与自测题——**结论区永远留给你**

## 开发

```bash
npm install
npm run build   # tsc + esbuild production
npm run lint    # eslint-plugin-obsidianmd，必须零 Error
npm test        # vitest：规则单测 + 内存库 e2e（mock LLM）
```

架构原则：**LLM 只提议，代码落笔**——五类 JSON 结构化调用点（classify/summarize/card/reviewCard/quiz），其余全是确定性代码，Vault 操作走 Obsidian API 且从不删除。

## License

MIT
