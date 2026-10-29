import type { ClassificationInput } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ClassificationContext {
  method?: "category" | "relevance";
  activeTab?: {
    title: string;
    hostname: string;
  };
}

const CATEGORY_GUIDANCE = `Use a small set of specific, useful categories. Infer the user's intent from the title and hostname; do not merely group by website brand.

Useful category patterns (adapt to the actual tabs, do not force all of them):
- Development: GitHub, GitLab, Stack Overflow, local dev servers, framework docs
- Work & Productivity: Notion, Linear, Asana, Google Docs, calendars, project tools
- Communication: Gmail, Outlook, Slack, Discord, chat and messaging
- Research & Learning: documentation, Wikipedia, arXiv, tutorials, courses
- News & Reading: news sites, blogs, Medium, Substack, long-form reading
- Shopping & Deals: Amazon, marketplaces, product research
- Entertainment: YouTube, Netflix, Spotify, games, streaming
- Social: X, Reddit, LinkedIn, Instagram, Facebook
- Finance: banking, invoices, budgeting, crypto
- Travel & Local: maps, flights, hotels, restaurants
- Design & Creative: Figma, Dribbble, Canva, design inspiration
- AI & Tools: ChatGPT, Claude, Gemini, AI utilities

Prefer a specific category over a generic one. Use "Research & Learning" for docs, "News & Reading" for articles, and "Work & Productivity" for project/task tools.`;

const RELEVANCE_GUIDANCE = `The user is focused on the active tab. Use it as context, but do not simply put everything near it.

Start with the most relevant, task-oriented groups, then use broader topic groups for the rest. For example, if the active tab is a coding task, "Current project" may contain its repo, issue tracker, and docs; other tabs should still be grouped into their own specific topics. Never create a group called "Other", "Misc", "General", or "Unrelated".`;

const COMMON_RULES = `Rules:
- Return one JSON object only. No markdown, no prose.
- Create 2-8 groups when there are enough tabs; each group must contain at least 2 tabs.
- Prefer 3-6 broad groups for a normal window. Merge small related groups instead of fragmenting.
- Group by purpose, theme, project, or workflow, not by individual website.
- Every group name must be specific and useful. NEVER use: Other, Misc, Miscellaneous, General, Uncategorized, Random, Various, Assorted, Everything Else.
- Names: Title Case, 1-3 words, maximum 28 characters.
- Use only the supplied tab ids. Never invent, modify, or reuse an id.
- Assign each tab to at most one group.
- Assign every tab that has a sensible home. Omit only tabs that are genuinely unrelated. Never create a junk-drawer group.
- "color" must be exactly one of: grey, blue, red, yellow, green, pink, purple, cyan, orange.

Required response shape:
{"groups":[{"name":"Example","color":"blue","tabIds":["T1","T2"]}]}`;

export function buildClassificationMessages(
  input: ClassificationInput,
  context: ClassificationContext = {},
): ChatMessage[] {
  const guidance =
    context.method === "relevance" ? RELEVANCE_GUIDANCE : CATEGORY_GUIDANCE;
  const system = `You are an expert browser tab organizer. ${guidance}

${COMMON_RULES}`;

  const focus =
    context.method === "relevance" && context.activeTab
      ? `\nActive tab (for relevance): ${JSON.stringify(context.activeTab)}`
      : "";

  const user = `Organize these ${input.tabs.length} tabs:${focus}\n${JSON.stringify(
    {
      tabs: input.tabs,
    },
  )}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
