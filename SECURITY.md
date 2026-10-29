# Security policy

## Supported versions

AI Tab Organizer is a personal-use, unpacked Manifest V3 extension. Only the
latest commit on `main` is supported; there are no maintained release branches
or backports.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting for this repository
(**Security** tab → **Report a vulnerability**). If that option is not
enabled, open a minimal issue asking for a private channel without including
exploit details. Include:

- the affected commit or version,
- browser and version,
- reproduction steps or a minimal proof of concept,
- expected vs. actual impact,
- any suggested fix.

Never include real API keys, full browsing URLs, saved groups, or personal tab
data in a report. Use synthetic fixtures and redact titles/hostnames.

Reports are handled on a best-effort basis, typically with an initial
acknowledgement within 7 days. There is no bug bounty.

## In scope

- Exposure of API keys through logs, errors, UI, storage, or messaging.
- Sending data to AI beyond temporary IDs, titles, and hostnames.
- Bypassing eligibility or apply/undo revalidation (pinned tabs, incognito
  tabs, existing groups, hostname changes).
- Unauthorized tab, group, or window mutation triggered by AI output or a
  forged message.
- Script execution or HTML injection in the popup or dashboard.
- Bypassing `storage.local` access restrictions.
- Remote code loading or unexpected network destinations.
- Supply-chain or build-output issues in this repository.

## Out of scope

- AI classification quality, group naming, or prompt-injection attempts whose
  only effect is a poor grouping choice.
- A compromised operating system, browser profile, or another extension with
  broad permissions.
- Provider-side retention, logging, or model routing by OpenRouter/DeepSeek;
  those are governed by the provider's own policies.
- Denial of service or surprise cost from opening an extreme number of tabs.
- Users committing their own API keys or browser data to a fork.

## Security model

See the **Security model** section in [README.md](./README.md), plus
[AGENTS.md](./AGENTS.md) for the implementation invariants this policy relies
on. The short version:

- No backend, accounts, sync, analytics, telemetry, content scripts, or remote
  code.
- API keys live only in `chrome.storage.local`, are masked in the UI, never
  logged, and are redacted from provider errors.
- AI output is treated as untrusted input and revalidated before any native
  group is created.
- AI requests contain only temporary IDs, tab titles, and hostnames. Full URLs
  and page content never leave the browser.
