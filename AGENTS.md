# AGENTS.md

Guidance for future coding agents working on **AI Tab Organizer**.

## Project purpose

A personal-use Manifest V3 extension (Brave/Chrome) that organizes tabs with a user-supplied AI provider and provides a local tab-management dashboard. Intentional constraints: no backend, accounts, sync, analytics, telemetry, or remote code. Do not add them.

## Architecture

### Runtime split

- **Popup (`entrypoints/popup`, `components/`)** — macOS-blue, button-driven organizer. Method picker, automatic apply, undo, result summary, icon-only group tools with title tooltips, settings. It intentionally has no open-tab list.
- **Dashboard (`entrypoints/dashboard`)** — full-page local dashboard opened as a pinned tab: auto-refreshing stats, loose-tab overload gauge, recent access, filtered/sorted Tab Observer, saved groups, merging, group rename, settings.
- **Background service worker (`entrypoints/background.ts`)** — the only place that reads tab data, calls AI, mutates tabs/groups/windows, and persists job/undo/saved state. Requests use `return true` + `sendResponse` for compatibility with Chrome versions before native Promise listeners.
- **Domain logic (`lib/`)** — small explicit-import modules. Pure planning/validation is separated from browser APIs.

### Organize flow (auto-apply)

1. Popup resolves its window ID and sends `ORGANIZE {windowId, method}`.
2. Background persists the method, stores `{status:'organizing'}` in `storage.session`, and calls `organizeWindow(windowId, method)`.
3. `readTabSnapshot` (`lib/browser/tabs.ts`) reads tabs + groups. Full URLs are discarded; only hostname survives for AI.
4. Method dispatch:
   - `lastAccess` / `alphabetical`: `buildLocalProposal` (`lib/grouping/methods.ts`) creates a proposal entirely on-device. No key or network.
   - `category` / `relevance`: `buildClassificationInput` assigns temporary IDs and `requestClassification` calls the active provider.
5. AI response validation (`lib/ai/validate.ts`):
   - Zod validates shape.
   - Temp IDs map back to real tabs; invented/duplicate IDs are dropped.
   - Duplicate group names merge.
   - Generic names (Other/Misc/Uncategorized/…) are never emitted; their tabs are keyword-reassigned to specific groups or left ungrouped.
   - Singleton groups merge only into keyword-related groups.
   - Maximum 8 groups; overflow tabs may remain ungrouped.
6. Background immediately sets `{status:'applying'}`, calls `createNativeGroups`, saves undo, then stores `{status:'applied'}`. New groups use `collapsed: true`.
7. Apply re-reads the window and runs `resolveApplyPlan` (`lib/grouping/apply.ts`) before creating native groups. Groups with fewer than 2 still-valid tabs are dropped. Apply rolls back created groups on failure.
8. Undo record is stored in `storage.session`. Undo only ungroups recorded tabs still inside the extension-created groups and not pinned.

There is no preview/review state. `APPLY` was removed. `DISMISS` clears an applied/error job back to idle while keeping the created groups and undo record.

Job states: `idle | organizing | applying | applied | error` in `storage.session`.

### Key files

| File                              | Responsibility                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `entrypoints/background.ts`       | Message router, operation lock, auto-apply, job transitions, dashboard actions, startup recovery |
| `entrypoints/popup/App.svelte`    | Button-driven popup, tools, auto-apply, results                                                  |
| `lib/organizer.ts`                | Settings → snapshot → method dispatch → AI/local proposal                                        |
| `lib/grouping/methods.ts`         | Pure Last access and A–Z proposal builders                                                       |
| `lib/ai/client.ts`                | OpenAI-compatible requests, timeout, errors, key redaction, JSON fallback                        |
| `lib/ai/prompt.ts`                | Category/relevance prompts, taxonomy, anti-junk-drawer rules                                     |
| `lib/ai/validate.ts`              | Zod shape validation + grouping post-processing                                                  |
| `lib/tabs.ts`                     | Eligibility, hostname extraction, AI payload builder, stats                                      |
| `lib/browser/tabs.ts`             | Browser tab/group snapshot                                                                       |
| `lib/browser/groups.ts`           | Native group creation, collapsed default, rollback, undo                                         |
| `lib/grouping/apply.ts`           | Pure apply/undo revalidation                                                                     |
| `lib/browser/dashboard.ts`        | All-window dashboard snapshot                                                                    |
| `lib/browser/tab-actions.ts`      | Close/move/merge, ungroup all, toggle collapse, saved groups, rename                             |
| `lib/dashboard.ts`                | Pure dashboard stats, access ordering, time formatting                                           |
| `lib/overload.ts`                 | Loose-tab thresholds and overload display metadata                                               |
| `lib/browser/action-icon.ts`      | Toolbar status-dot icon updates based on loose tabs                                              |
| `lib/saved-groups.ts`             | Local saved-group library and validation                                                         |
| `lib/settings.ts`                 | Local settings, methods, defaults, normalization, storage hardening                              |
| `lib/theme.ts`                    | Light/dark theme resolution, persistence, and HTML class application                             |
| `components/OverloadGauge.svelte` | ATO-style loose-tab overload gauge                                                               |
| `components/LooseBadge.svelte`    | Compact loose-tab gauge in the popup header                                                      |
| `lib/state.ts`                    | Session job/undo persistence + structural validation                                             |
| `lib/popup-state.ts`              | State aggregation, stale-operation recovery                                                      |
| `lib/messaging.ts`                | Typed popup/dashboard→background requests, pinned dashboard opening                              |
| `lib/types.ts`                    | Shared types + message/response map                                                              |

## Invariants and conventions

### Privacy

- **Never send full URLs** (or paths/query/hash) to AI. `TabInfo` intentionally has no URL field; `DashboardTab` adds a URL for local dashboard use only.
- AI requests contain `{id, title, hostname}` for eligible tabs only. Relevance also sends the active tab's title/hostname **only when that tab is eligible**.
- Last access and A–Z make zero network requests.
- Never log API keys, prompts, or tab metadata. Avoid `console.log` in extension code.
- Provider error details are redacted if they echo the key.
- API keys are always rendered with `type="password"`; never add a show/hide control.
- API keys belong in `storage.local`, never `storage.sync`.
- Keep `host_permissions` limited to provider origins. Do not add `<all_urls>`.
- Do not add content scripts, remote code, analytics, or a backend.
- Keep `setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})` on local storage.

### Eligibility

A tab is eligible for AI organization only when all are true:

- not pinned
- not incognito
- `groupId === -1` (ungrouped)
- HTTP or HTTPS URL

Existing groups and pinned tabs are never modified by organize/apply. Undo also skips pinned tabs.

### AI trust boundary

- AI-generated real tab IDs are never trusted. Only temporary IDs from `idMap` are accepted.
- Unknown IDs are ignored; duplicate assignments are dropped.
- Names are sanitized, control/bidi characters stripped, and capped at 32 characters.
- Colors are validated against Chrome's nine colors; invalid colors use a deterministic palette.
- Never create generic junk-drawer groups. `Other`, `Misc`, `General`, `Uncategorized`, etc. must be dissolved. Tabs left over should become ungrouped, not a new “Other” group.
- At apply time, revalidate: tab exists, same window, still eligible, same hostname (navigation guard), and not already claimed.
- If no group is applicable, fail without modifying tabs.

### Browser mutations

- All tab/group/window mutations go through the background worker.
- Organization never closes, moves, pins, or reorders existing tabs (normal grouping behavior aside).
- New native groups and restored saved groups are created **collapsed**.
- Undo is session-scoped and intentionally conservative.
- Dashboard actions are explicit and confirmed in the UI:
  - Close/move selected skips pinned tabs; empty new/internal tabs may be closed or moved explicitly.
  - Merge only moves ungrouped, unpinned web tabs; grouped/pinned tabs stay in their windows.
  - Merge closes windows that become empty.
  - Ungroup all skips pinned tabs and is not undoable.
  - Toggle groups collapses all if any are expanded, otherwise expands all.
- The dashboard auto-refreshes on tab/window/group events; do not add a refresh button.
- Loose tabs are all non-pinned, non-extension tabs with `groupId === -1`, including empty new tabs and internal pages. The overload gauge and toolbar dot use the same count.
- Overload thresholds: green `< 8`, amber `8–11`, red `>= 12` loose tabs.
- The overload gauge uses a **non-linear** piecewise scale (`overloadArcRatio` in `lib/overload.ts`): 8 tabs sits at the top of the semicircle (50% of the arc) and 12 tabs at 75%. Keep the needle, breakpoint markers, and gradient stops derived from that helper rather than from raw ratios.
- The gauge arc and the Tab usage ring use gradient strokes with a neon glow filter. The usage ring drops its round dash caps at 100% so the circle closes seamlessly.
- Icons are generated by `pnpm icons` (`scripts/generate-icons.mjs`, Resvg + the same Lucide `sparkles` path as the UI). `public/icon/{16,32,48,128}.png` are the dot-free static icons; `status-{green,amber,red}-*.png` add the runtime status dot. Never bake a status dot into the static icon.
- Saved groups store URLs locally in `storage.local`; never send them to AI.
- The dashboard opens as a single pinned tab, focuses/reuses an existing dashboard tab, and excludes itself from dashboard stats.
- `createNativeGroups` records a group ID before updating metadata so failures can roll back.
- Group colors are Chrome's string enum values in `TAB_GROUP_COLORS`.

### Svelte 5

- Do not name a variable `state`; it conflicts with the `$state` rune. Popup uses `popup`.
- Do not pass Svelte reactive proxies to `structuredClone`. Use an explicit clone helper or `$state.snapshot`.
- Components use runes (`$state`, `$derived`, `$props`) and callback props. Keep browser messaging in page components/`lib`, not in small presentational components.
- Popup is fixed at 460×500 via `body.popup-body`; dashboard is a normal full-page document. Shared `assets/app.css` must not force popup dimensions globally.
- Light/dark mode is class-based (`.dark` on `<html>`). Use the semantic `app-*` color utilities (`text-app-text`, `bg-app-surface`, `border-app-border`, etc.) and `app.css` variables. Do not hardcode dark-only zinc/white/ink surfaces in new UI.
- `lib/theme.ts` persists the theme in `localStorage` and applies it before Svelte mounts. Theme toggles live in the popup and dashboard headers.
- The visual language is macOS-inspired blue, system font stack, larger type. Avoid reintroducing purple/fuchsia accent classes.
- The popup has no tab list; keep it action-focused. Tab lists belong in the dashboard.
- Tooltip conventions:
  - Organization method cards use rich tooltips with title, “What it does”, and description.
  - Icon-only tab tools use custom title-only tooltips; their visible labels are intentionally removed.
  - Do not add explanatory copy for straightforward buttons (dashboard, settings, organize, undo, theme); native `title`/aria labels are enough.
  - Keep tooltips keyboard-accessible via `group-focus-visible`.
  - The popup header includes a compact loose-tab gauge with native title only.
  - The dashboard overload gauge has keyboard-focusable breakpoint markers at 8 and 12 loose tabs with hover/focus tooltips.
- Tab Observer toolbar controls (select all, window filter, group filter, sort) are icon-only with `title`/`aria-label`; filter chips keep text. Filter/sort menus close on backdrop click and Escape.
- The group filter is a multiselect (`groupFilterIds: number[]`); an empty array means no group restriction.
- Scrollable popup regions need `min-h-0` flex children and `.scroll-area`.

## Adding a provider

1. Add its ID to `ProviderId` in `lib/types.ts`.
2. Add an entry to `PROVIDERS` in `lib/settings.ts`.
3. Add the provider origin to `host_permissions` in `wxt.config.ts`.
4. Ensure defaults are added in `createDefaultSettings` and normalization.
5. Add request/endpoint tests in `tests/ai-client.test.ts`.
6. Update README/AGENTS provider documentation.

Do not build a provider plugin framework without a concrete need.

## Development and testing

```bash
pnpm install
pnpm dev            # watch: .output/chrome-mv3-dev
pnpm dev:brave      # watch: .output/brave-mv3-dev
pnpm check          # tsc + svelte-check + vitest + prettier --check + production build
pnpm test
pnpm compile
pnpm check:svelte
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
pnpm build:brave
```

Formatting is configured in `.prettierrc.json`, which registers `prettier-plugin-svelte` and `prettier-plugin-tailwindcss` (Tailwind stylesheet: `assets/app.css`). `LICENSE` is parsed as Markdown. Do not remove the plugin entries or Svelte files will fail to parse in editors that shell out to Prettier.

Tests use `WxtVitest`, aliasing `wxt/browser` to `@webext-core/fake-browser` and stubbing global `chrome`/`browser`.

Test coverage:

- `tests/tabs.test.ts` — eligibility, hostname-only payload, stats.
- `tests/ai-validate.test.ts` — parsing, IDs, generic-group dissolution, singleton merging, fragmentation.
- `tests/grouping-apply.test.ts` — apply revalidation and undo planning.
- `tests/methods.test.ts` — Last access buckets and A–Z ranges.
- `tests/dashboard.test.ts` — loose-tab stats and access ordering.
- `tests/overload.test.ts` — 8/12 loose-tab thresholds (red at 12) and gauge metadata.
- `tests/action-icon.test.ts` — toolbar dot zones and extension-tab exclusion.
- `tests/saved-groups.test.ts` — local persistence, validation, dedupe.
- `tests/ai-client.test.ts` — endpoints, headers, errors, key redaction, JSON fallback, prompt context.
- `tests/settings-state.test.ts` — settings normalization and local/session persistence.
- `tests/background-integration.test.ts` — auto-apply, collapsed groups, undo, local organization, ungroup/toggle, dashboard state.

For background integration tests, the WXT entrypoint exports `{ main }`; tests call `background.default.main?.()` after `fakeBrowser.reset()` to register listeners.

Do not hit real AI APIs in automated tests. Stub `fetch` and assert URLs/body/headers. Keep a manual real-provider verification step.

## Manual verification

Run a production Brave build, load `.output/brave-mv3` at `brave://extensions`, and verify:

1. Toggle light/dark mode in popup and dashboard; the choice persists.
2. Hover method cards and tab tool icons; verify rich vs title-only tooltips.
3. Pinned tab and existing groups are untouched.
4. Category works with a real key; Last access and A–Z work with no key.
5. Organization applies immediately with no preview.
6. New groups appear collapsed.
7. Undo removes only extension-created groups; existing group and pinned tab remain.
8. No generic Other/Misc group appears.
9. Popup has no open-tab list, equal-height methods, no Local labels/caption, and five compact tools.
10. Ungroup all and toggle collapse/expand work.
11. Dashboard auto-refreshes after tab/window/group changes; filtered/sorted Tab Observer works.
12. Loose tabs include empty new tabs; gauge is green/amber/red at the expected thresholds.
13. Toolbar icon status dot and new blue sparkle base icon are present.
14. API key remains masked and there is no show/hide control.
15. Merge, rename, close selected, and move selected work with confirmation.

## Known limitations

- Undo is limited to the most recent apply and lives in `storage.session` (cleared on browser restart).
- Organization and undo are scoped to one window. The dashboard observes all windows.
- Apply revalidates per-tab; groups dropping below 2 tabs are skipped.
- If the service worker is terminated mid-operation, startup recovery marks the job interrupted.
- No explicit cancellation of an in-flight AI request.
- There is no manual review step by design; organize applies immediately.
- Generic AI groups are dropped rather than repaired with a second model call.
- Merge intentionally leaves grouped/pinned tabs in their original windows.
- Duplicate detection uses normalized full URLs (hash removed); query variations count as distinct.
- No visit counts or history permission; “access activity” uses `lastAccessed`.
- AI output quality depends on the chosen model; no server-side model fallback.
- Personal use only; not packaged for store publication.

## Security review checklist

- No real credentials in source, tests, fixtures, or docs (dummy `sk-test` values only).
- No key/tab data logging.
- API key inputs are always password fields; never add reveal controls.
- No new permissions without a concrete requirement.
- AI response always passes through `buildProposalFromResponse`.
- Apply always passes through `resolveApplyPlan`.
- Undo always passes through `planUndo`.
- Dashboard data (including URLs) stays in trusted extension contexts and local storage.
- No content script can reach settings, saved groups, or background messages.
- Keep privacy copy accurate: AI methods send titles and hostnames to the chosen provider. Do not describe the extension as fully local-only; use “local-first”.
- Keep [LICENSE](./LICENSE), [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), and [SECURITY.md](./SECURITY.md) current. Icons are Lucide-derived (ISC/MIT), so their notices must ship with the project.
- Never commit `.output/`, signing keys, packaged `.crx`/`.zip` files, browser profiles, or `.env` files; `.gitignore` covers them.
