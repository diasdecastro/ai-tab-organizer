# AI Tab Organizer

Manifest V3 extension for Brave and Chrome.

## Requirements

Node.js 22+, pnpm, and Brave or Chrome 121+.

## Install

```bash
pnpm install
pnpm build:brave   # Brave
pnpm build         # Chrome
```

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `.output/brave-mv3` (or `.output/chrome-mv3`).

## First run

1. Open the extension and click the settings icon.
2. Choose **OpenRouter** or **DeepSeek**.
3. Enter an API key from [OpenRouter](https://openrouter.ai/keys) or [DeepSeek](https://platform.deepseek.com/api_keys).
4. Click **Save settings**.

Category and Relevance need a key; Last access and A–Z do not.

## License

[MIT](./LICENSE). Icon notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
