import type { OrganizationMethod } from "./types";

export const ORGANIZATION_METHOD_IDS = [
  "category",
  "lastAccess",
  "relevance",
  "alphabetical",
] as const satisfies readonly OrganizationMethod[];

export interface MethodDefinition {
  id: OrganizationMethod;
  label: string;
  shortLabel: string;
  description: string;
  requiresAi: boolean;
  icon: "layers" | "clock" | "target" | "sort";
}

export const ORGANIZATION_METHODS: Record<
  OrganizationMethod,
  MethodDefinition
> = {
  category: {
    id: "category",
    label: "Category",
    shortLabel: "Category",
    description:
      "AI groups tabs by topic, intent, and workflow — not by individual website.",
    requiresAi: true,
    icon: "layers",
  },
  lastAccess: {
    id: "lastAccess",
    label: "Last access",
    shortLabel: "Last access",
    description:
      "Groups tabs by when you last opened them: today, this week, this month, or earlier.",
    requiresAi: false,
    icon: "clock",
  },
  relevance: {
    id: "relevance",
    label: "Relevance",
    shortLabel: "Relevance",
    description:
      "AI prioritizes tabs related to your active tab while keeping other tabs in context.",
    requiresAi: true,
    icon: "target",
  },
  alphabetical: {
    id: "alphabetical",
    label: "A–Z",
    shortLabel: "A–Z",
    description:
      "Groups tabs into alphabetical ranges by site or title. No AI request.",
    requiresAi: false,
    icon: "sort",
  },
};

export function isOrganizationMethod(
  value: unknown,
): value is OrganizationMethod {
  return (
    value === "category" ||
    value === "lastAccess" ||
    value === "relevance" ||
    value === "alphabetical"
  );
}
