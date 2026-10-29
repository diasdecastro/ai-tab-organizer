# AI Tab Organizer

A local-first Manifest V3 extension for Brave and Chrome that organizes tabs into native browser tab groups using your own AI provider — plus a full tab dashboard for cleanup and saved-group management.

Inspired by [atobase](https://www.atobase.app/), with deliberate differences: no account, no backend, no sync, no analytics, and no lock-in to one AI provider.

## Features

### Organization methods

- **Category** — AI groups related tabs by topic, intent, and workflow.
- **Last access** — on-device grouping into Today / This week / This month / Earlier.
- **Relevance** — AI treats the active tab as context and prioritizes related work.
- **A–Z** — on-device alphabetical ranges by site or title.

AI methods use only tab titles, hostnames, and temporary IDs. Last access and A–Z make no AI request at all.

### Automatic apply

- Clicking **Organize by …** classifies and applies immediately. There is no separate review step.
- New native groups are created **collapsed**.
- The popup shows a result summary with Undo.
- Clicking **Done** returns to the tool screen while leaving the groups in place.

### Smarter categories

- The prompt includes concrete category patterns (Development, Work & Productivity, Communication, Research & Learning, News & Reading, Shopping, Entertainment, and more) and explicitly forbids generic junk-drawer names.
- AI responses that use **Other / Misc / General / Uncategorized** are never turned into native groups. Their tabs are reassigned by keyword similarity where possible, otherwise left ungrouped for review.
- Singleton groups are merged only into keyword-related groups; the extension never creates a new “misc” bucket.
- Fragmentation is capped at 8 groups. Unrelated tabs may remain ungrouped rather than being forced into a low-quality category.
- Every response is validated and revalidated against live tabs before any browser mutation.

### macOS-style popup

- macOS-inspired **light and dark themes** with the system font stack, blue accent, and larger type. The theme toggle is in the popup and dashboard headers.
- Organization method cards show rich hover/focus tooltips with a title, “What it does”, and a short explanation.
- Four method cards with a primary organize action and undo.
- **Tab Management Tools** arranged as an icon-only button grid. Each icon shows its title in a hover tooltip:
  - Ungroup all
  - Toggle collapse/expand all groups
  - Search tabs
  - Saved groups
  - Merge windows
- Straightforward buttons (dashboard, settings, organize, undo, theme) use only their title/accessible label; no explanatory tooltip.
- No open-tab list in the popup; tab browsing and management live in the pinned dashboard.
- API keys are always masked and there is no “show key” control.

### Dashboard

Open it from the popup. The dashboard opens as a **pinned tab** and is reused/focused if it already exists. It includes:

- Open-tab, window, group, **loose-tab**, and organized-percentage stats.
- Tab usage ring and tab overload index.
- Recently / least recently accessed tabs (based on browser `lastAccessed`; no history permission).
- Organization method picker.
- **Tab Observer**: icon-only controls for select all, window filter, group multiselect, and sort (browser order / title / site / last access), plus search and all / loose / grouped / pinned filters. Select, close, and move tabs.
- Group management: save a group to the local library and rename native groups.
- **Saved Groups** split view:
  - **My Groups** saved locally.
  - **Open in browser** list of current native groups with one-click **Save** buttons.
  - Selected saved group details with Open and Delete.
- **Merge windows** for ungrouped, unpinned web tabs from other windows.
- **Auto-refreshing dashboard** — tab creation, closing, moving, grouping, ungrouping, and window changes update the dashboard immediately; there is no refresh button.
- **Loose tabs + Tab Overload Index** — ungrouped tabs (including empty new tabs) are counted as loose tabs. The gauge is green under 8 loose tabs, amber from 8–11, and red starting at 12. Its scale is non-linear so the 8-tab breakpoint sits at the top of the semicircle.
- **Extension action status dot** — the toolbar icon shows a green, amber, or red dot for the current window's loose-tab range.
- **New blue sparkle extension icon**; the static icon is dot-free and the runtime toolbar variant adds the status dot.
- Ungroup all and collapse/expand all group tools.
- Provider settings.

### Safety

- Native tab groups only; no custom tab-management layer.
- Never closes tabs automatically. Close/move/merge/ungroup actions require an explicit confirmation.
- Pinned tabs and existing groups are preserved by organization, apply, and undo.
- Undo removes only groups this extension created and only tabs still inside them.
- API keys stay in `chrome.storage.local`; no key ever appears in a log or UI error.

## Stack

- [WXT](https://wxt.dev/) + Manifest V3
- Svelte 5 + TypeScript
- Tailwind CSS 4
- Vitest
- pnpm

## Getting started

Requirements: **Node.js 22+**, **pnpm** (the lockfile is included), and a Chromium-based browser at version **121+** (current Brave/Chrome).

```bash
pnpm install
pnpm dev
```

`pnpm dev` watches the project and writes a development build to `.output/chrome-mv3-dev`.

For Brave development:

```bash
pnpm dev:brave
```

This writes `.output/brave-mv3-dev`.

### Production build

```bash
pnpm build          # .output/chrome-mv3
pnpm build:brave    # .output/brave-mv3
```

### Packaging and releases

`.output/`, packaged `*.zip` files, signing keys (`*.pem`), `.crx` files, and browser profiles are git-ignored and must not be committed. To publish a release, build, run `pnpm zip`, and attach the generated archive to the GitHub release instead of checking it in.

### Load the extension into Brave

1. Run `pnpm build:brave`.
2. Open `brave://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select:
   ```
   /path/to/ai-tab-organizer/.output/brave-mv3
   ```
6. Pin **AI Tab Organizer** to the toolbar.

For Chrome, use `pnpm build` and load `.output/chrome-mv3` from `chrome://extensions`.

After changing code in watch mode, reload the unpacked extension from the extensions page.

## Configure an AI provider

1. Open the extension and click the settings icon.
2. Select **OpenRouter** or **DeepSeek**.
3. Enter an API key for that provider.
4. Enter the model ID.
5. Click **Test connection** (one tiny completion request).
6. Click **Save settings**.

Both providers use OpenAI-compatible chat-completion APIs:

| Provider   | API endpoint                                    | Default model             | Get a key                              |
| ---------- | ----------------------------------------------- | ------------------------- | -------------------------------------- |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `google/gemini-2.5-flash` | https://openrouter.ai/keys             |
| DeepSeek   | `https://api.deepseek.com/chat/completions`     | `deepseek-chat`           | https://platform.deepseek.com/api_keys |

Category and Relevance require a key. Last access and A–Z work without one. Stronger models generally produce better categories; if a model returns generic categories, the extension asks you to try again rather than creating a junk group.

OpenRouter models that do not support `response_format` are retried once without it; the prompt still requires JSON.

Keys are stored in `chrome.storage.local`, separate from browser sync. They are not committed to Git and are never written to logs.

## Using it

1. Click the toolbar icon.
2. Pick a method: Category, Last access, Relevance, or A–Z.
3. Click **Organize by …**. The result is applied automatically.
4. Review the created groups (collapsed) and use **Undo** if needed.
5. Use **Done** to return to the tools.
6. Click **Dashboard** to open the pinned tab dashboard.

### Tab management tools

- **Ungroup all** — removes every tab in the current window from its group (pinned tabs skipped). Confirmation required; not undoable by the extension.
- **Toggle groups** — collapses all groups if any are expanded, or expands all if all are collapsed.
- **Search tabs** — opens the dashboard Tab Observer with search focused.
- **Saved groups** — opens the Saved Groups view.
- **Merge windows** — moves ungrouped, unpinned web tabs from other windows into the current window. Existing groups and pinned tabs stay put. Empty windows are closed. Confirmation required.

The tool buttons are compact icon-only buttons; hover shows a title tooltip. Simple buttons use native titles only. Organization method cards use richer tooltips with title, “What it does”, and description.

### Undo scope

- The Undo control is always present and is disabled when there is no last grouping to undo.
- Available until the browser restarts or a newer grouping is applied.
- Only ungroups tabs that are still inside groups this extension created.
- Tabs moved elsewhere or pinned after applying are left alone.
- Existing groups and unrelated tabs are never touched.
- Tab order is not restored.

## Privacy and permissions

Permissions requested:

- `tabs` — read titles, hostnames, pinned/group state, last-access times, and manage/group tabs.
- `tabGroups` — read group metadata and set names/colors/collapse state.
- `storage` — provider settings, job/undo state, and saved groups.
- Host permissions for `https://openrouter.ai/*` and `https://api.deepseek.com/*` only.

Data sent to AI for Category/Relevance, per eligible tab:

- Temporary ID (`T1`, `T2`, …)
- Tab title (truncated)
- Hostname only (`github.com`, not the full URL)

For Relevance, the active tab's title and hostname are also sent as context — only when that tab is eligible for organization.

Never sent to AI: full URLs, paths, query parameters, page content, cookies, history, favicons, or tab IDs.

Data that stays local (never sent to AI):

- Full tab URLs in the dashboard, used for local tab management and saved groups.
- Saved group titles/URLs/favicons in `chrome.storage.local`.
- Last-access timestamps used by the Last access method.

There are no content scripts, remote scripts, analytics, or backend services. API keys are extension-local, set to be readable only by trusted extension contexts, and always masked in the UI.

## Security model

This extension is intentionally small and auditable: no backend, no remote code, no content scripts, and no external messaging. The full source is in this repository.

**Trust boundaries**

- **AI output is untrusted.** Only temporary IDs returned by the model are accepted, unknown/duplicate IDs are dropped, names are sanitized and capped, colors are validated, and every group is revalidated at apply time (tab exists, same window, still eligible, unchanged hostname).
- **Tab titles and hostnames are untrusted model input.** Any page can put prompt-injection text in its title. The impact is bounded to grouping choices: the extension never closes, moves, pins, navigates, or executes page content based on AI output.
- **Messages are extension-internal.** The background worker accepts requests only from the extension's own popup and dashboard; the manifest declares no `externally_connectable`, no content scripts, and no web-accessible extension resources.

**Data handling**

- **Last access** and **A–Z** run entirely on-device and make no network request.
- **Category** and **Relevance** send only temporary IDs, truncated titles, and hostnames for eligible tabs, plus the active tab's title/hostname as relevance context when eligible. Full URLs, paths, queries, page content, cookies, history, favicons, and real tab IDs never reach the provider.
- **Full URLs** appear only in the local dashboard and in saved groups stored in `chrome.storage.local`.
- **Provider retention and routing** are outside the extension's control. OpenRouter may forward requests to upstream model hosts; review your provider's policy before organizing sensitive windows.

**Credentials**

- Keys stay in `chrome.storage.local` (never `storage.sync`), with access level `TRUSTED_CONTEXTS`.
- Keys are masked in the UI with no reveal control, never logged, and redacted if a provider error echoes them.
- Provider endpoints are hardcoded, so the free-text model field cannot redirect a key to another host.
- Storage is not encrypted at rest: anyone with access to your browser profile can read the key. Prefer a dedicated key with a spending limit.

**Permissions**

- `tabs` is broad and triggers Chrome's “read your browsing history” warning; it is required to read titles/state and to group tabs in every window.
- `tabGroups` manages native group titles, colors, and collapse state.
- `storage` holds settings, job/undo state, and saved groups.
- Host permissions are limited to the two provider origins. The extension requests no `history`, `cookies`, `webRequest`, `scripting`, `downloads`, or clipboard access.

**Threat model exclusions**

A compromised operating system or browser profile, a malicious extension with broad permissions, and provider-side data handling are out of scope. So is AI classification quality; prompt-injection resistance is best-effort, with damage limited to grouping. Very large windows are also not rate-limited, so an AI run can produce a correspondingly large (and billable) request.

To report a vulnerability, follow [SECURITY.md](./SECURITY.md).

## Development commands

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Chrome watch build in `.output/chrome-mv3-dev`      |
| `pnpm dev:brave`    | Brave watch build in `.output/brave-mv3-dev`        |
| `pnpm build`        | Production Chrome build                             |
| `pnpm build:brave`  | Production Brave build                              |
| `pnpm compile`      | TypeScript check                                    |
| `pnpm check:svelte` | Svelte type check                                   |
| `pnpm test`         | Vitest suite                                        |
| `pnpm check`        | Type checks + tests + formatting + production build |
| `pnpm format`       | Format the repository with Prettier                 |
| `pnpm format:check` | Verify formatting without writing                   |
| `pnpm zip`          | Build and package the extension                     |
| `pnpm icons`        | Regenerate PNG icons in `public/icon`               |

## Verification

The automated suite covers:

- Tab eligibility and hostname-only AI payloads
- AI response parsing, validation, temporary-ID mapping, generic-group removal, keyword reassignment, fragmentation limits, and color/name normalization
- Organization methods: time buckets and alphabetical ranges
- Apply-time revalidation and undo planning
- Loose-tab dashboard stats, overload thresholds, and access ordering
- Saved-group normalization, persistence, and identical-group refresh behavior
- Provider request construction, error mapping, key redaction, and JSON-mode fallback
- Settings normalization and local/session storage
- Background flows: auto-apply, collapsed groups, undo, local organization, ungroup all, toggle collapse, and dashboard state

Current suite: **108 tests across 11 files**.

Real Brave verification via Chrome DevTools Protocol covered:

- Compact, macOS-blue popup with all five tools visible
- Light and dark themes toggling and persisting across reloads
- Rich organization-method tooltips and title-only tool tooltips
- No open-tab list in the popup
- Auto-apply A–Z organization; no review step
- New groups created collapsed
- Undo preserving pinned tab and existing group
- Ungroup all and toggle collapse/expand all groups
- Pinned dashboard tab
- Saved Groups split view with Save buttons for open browser groups
- Overload gauge green/red ranges and loose-tab counting including empty new tabs
- Dashboard auto-refresh after opening tabs
- Tab Observer filtering, window filter, and sorting
- Search shortcut focusing the dashboard search field
- API key field always `type="password"` with no show/hide control
- No popup or dashboard runtime errors

A real provider classification still requires your own API key and is the main manual verification step.

## Manual verification checklist

1. Load the production build in Brave.
2. Toggle light/dark mode in the popup and dashboard.
3. Hover a method card and a tab tool icon to verify the two tooltip styles.
4. Open several ungrouped tabs, pin one tab, and create one manual group.
5. Open an empty new tab and confirm it counts as a loose tab.
6. Configure a provider and run **Test connection**.
7. Try each method:
   - Category with a real key.
   - Last access and A–Z without a key.
8. Confirm organization applies immediately and groups appear collapsed.
9. Confirm the pinned tab and existing group are untouched.
10. Click **Undo** and confirm only extension-created groups disappear.
11. Use **Ungroup all**, **Toggle groups**, **Search tabs**, **Saved groups**, and **Merge windows**.
12. Open the dashboard, confirm auto-refresh after opening/closing tabs, use filters/sorting, save a group from **Open in browser**, reopen it, and delete it.
13. Confirm no generic “Other” or “Misc” groups are created.

## Project layout

```
entrypoints/background.ts   MV3 service worker: messages, job state, orchestration
entrypoints/popup/          Svelte popup entrypoint
entrypoints/dashboard/      Full-page Svelte dashboard
components/                 Shared popup/dashboard UI
lib/ai/                     Provider HTTP client, prompt, response validation
lib/browser/                Tab snapshots, native groups, dashboard/tab actions
lib/grouping/apply.ts       Pure apply/undo revalidation
lib/grouping/methods.ts     On-device Last access / A–Z grouping
lib/dashboard.ts            Pure stats/access helpers
lib/overload.ts             Loose-tab zones and overload thresholds
lib/browser/action-icon.ts  Toolbar icon status-dot updates
lib/saved-groups.ts         Local saved-group library
lib/settings.ts             Provider settings + secure local storage
lib/theme.ts                Light/dark theme persistence
lib/state.ts                Session-scoped job and undo state
tests/                      Vitest unit and background integration tests
```

See [AGENTS.md](./AGENTS.md) for architecture details and guidance for future changes.

## License

Released under the [MIT License](./LICENSE).

The interface and extension icons are derived from [Lucide](https://lucide.dev), which is ISC-licensed (with MIT for Feather-derived icons). The required notices are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Security reports: see [SECURITY.md](./SECURITY.md).
