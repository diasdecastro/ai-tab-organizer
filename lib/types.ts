export type ProviderId = "openrouter" | "deepseek";

export type OrganizationMethod =
  "category" | "lastAccess" | "relevance" | "alphabetical";

export type ProposalSource = "ai" | "local";

export interface ProviderSettings {
  apiKey: string;
  model: string;
}

export interface AppSettings {
  version: 1;
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  defaultMethod: OrganizationMethod;
}

export const TAB_GROUP_NONE = -1;

export const TAB_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export const TAB_GROUP_COLOR_HEX: Record<TabGroupColor, string> = {
  grey: "#9ca3af",
  blue: "#60a5fa",
  red: "#f87171",
  yellow: "#facc15",
  green: "#4ade80",
  pink: "#f472b6",
  purple: "#a78bfa",
  cyan: "#22d3ee",
  orange: "#fb923c",
};

export type ExclusionReason =
  "pinned" | "grouped" | "incognito" | "unsupported";

export interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  title: string;
  hostname: string;
  faviconUrl?: string;
  pinned: boolean;
  groupId: number;
  groupName?: string;
  groupColor?: TabGroupColor;
  incognito: boolean;
  active: boolean;
  eligible: boolean;
  exclusionReason?: ExclusionReason;
  lastAccessed?: number;
  audible?: boolean;
}

export interface TabStats {
  total: number;
  eligible: number;
  grouped: number;
  pinned: number;
  excluded: number;
}

export interface TabSnapshot {
  windowId: number;
  tabs: TabInfo[];
  stats: TabStats;
  capturedAt: number;
}

/** The only tab data ever sent to an AI provider. */
export interface AiTab {
  id: string;
  title: string;
  hostname: string;
}

export interface ClassificationInput {
  tabs: AiTab[];
  /** Temporary AI id -> real browser tab id. */
  idMap: Record<string, number>;
}

export interface ProposedTab {
  tabId: number;
  title: string;
  hostname: string;
  faviconUrl?: string;
}

export interface ProposedGroup {
  key: string;
  name: string;
  color: TabGroupColor;
  tabs: ProposedTab[];
}

export interface Proposal {
  id: string;
  createdAt: number;
  windowId: number;
  provider: ProviderId | "local";
  model: string;
  method: OrganizationMethod;
  source: ProposalSource;
  groups: ProposedGroup[];
  ungrouped: ProposedTab[];
}

export interface AppliedGroup {
  groupId: number;
  name: string;
  color: TabGroupColor;
  tabIds: number[];
}

export interface ApplyResult {
  appliedAt: number;
  windowId: number;
  groups: AppliedGroup[];
  groupedTabCount: number;
  skippedTabCount: number;
  skippedGroupCount: number;
}

export interface UndoRecord {
  id: string;
  createdAt: number;
  windowId: number;
  groups: AppliedGroup[];
  tabCount: number;
}

export interface UndoResult {
  ungroupedTabCount: number;
  groupsAffected: number;
}

export type JobState =
  | { status: "idle" }
  | { status: "organizing"; startedAt: number }
  | { status: "applying"; startedAt: number }
  | { status: "applied"; proposal: Proposal; result: ApplyResult }
  | { status: "error"; phase: "organize" | "apply"; message: string };

export interface PopupState {
  snapshot: TabSnapshot;
  settings: AppSettings;
  job: JobState;
  undo: UndoRecord | null;
}

export interface TestConnectionResult {
  latencyMs: number;
  reply: string;
}

export interface UndoResponse {
  state: PopupState;
  result: UndoResult;
}

export interface DashboardTab extends TabInfo {
  url: string;
  lastAccessed: number;
  audible: boolean;
}

export interface DashboardWindowInfo {
  id: number;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
}

export interface DashboardGroup {
  id: number;
  windowId: number;
  name: string;
  color: TabGroupColor;
  tabIds: number[];
}

export interface SavedGroupTab {
  title: string;
  url: string;
  faviconUrl?: string;
}

export interface SavedGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  createdAt: number;
  tabs: SavedGroupTab[];
}

export interface DashboardStats {
  totalTabs: number;
  totalWindows: number;
  totalGroups: number;
  loose: number;
  organizedPercent: number;
  pinned: number;
}

export interface DashboardState {
  windowId: number;
  tabs: DashboardTab[];
  windows: DashboardWindowInfo[];
  groups: DashboardGroup[];
  stats: DashboardStats;
  savedGroups: SavedGroup[];
  settings: AppSettings;
  capturedAt: number;
}

export interface DashboardActionResult {
  message: string;
  state: DashboardState;
}

export type RuntimeRequest =
  | { type: "GET_STATE"; windowId: number }
  | { type: "ORGANIZE"; windowId: number; method: OrganizationMethod }
  | { type: "SET_METHOD"; method: OrganizationMethod }
  | { type: "DISMISS"; windowId: number }
  | { type: "UNDO"; windowId: number }
  | { type: "UNGROUP_ALL"; windowId: number }
  | { type: "TOGGLE_GROUPS_COLLAPSED"; windowId: number }
  | { type: "SAVE_SETTINGS"; settings: AppSettings }
  | {
      type: "TEST_CONNECTION";
      provider: ProviderId;
      apiKey: string;
      model: string;
    }
  | { type: "GET_DASHBOARD"; windowId: number }
  | { type: "MERGE_WINDOWS"; targetWindowId: number }
  | { type: "CLOSE_TABS"; tabIds: number[]; windowId: number }
  | { type: "MOVE_TABS_NEW_WINDOW"; tabIds: number[]; windowId: number }
  | { type: "SAVE_GROUP"; groupId: number; windowId: number }
  | { type: "RESTORE_GROUP"; savedGroupId: string; windowId: number }
  | { type: "DELETE_SAVED_GROUP"; savedGroupId: string; windowId: number }
  | {
      type: "RENAME_GROUP";
      groupId: number;
      title: string;
      color?: TabGroupColor;
      windowId: number;
    };

export type ResponseMap = {
  GET_STATE: PopupState;
  ORGANIZE: PopupState;
  SET_METHOD: AppSettings;
  DISMISS: PopupState;
  UNDO: UndoResponse;
  UNGROUP_ALL: DashboardActionResult;
  TOGGLE_GROUPS_COLLAPSED: DashboardActionResult;
  SAVE_SETTINGS: AppSettings;
  TEST_CONNECTION: TestConnectionResult;
  GET_DASHBOARD: DashboardState;
  MERGE_WINDOWS: DashboardActionResult;
  CLOSE_TABS: DashboardActionResult;
  MOVE_TABS_NEW_WINDOW: DashboardActionResult;
  SAVE_GROUP: DashboardActionResult;
  RESTORE_GROUP: DashboardActionResult;
  DELETE_SAVED_GROUP: DashboardActionResult;
  RENAME_GROUP: DashboardActionResult;
};

export type ApiResponse<T> =
  { ok: true; data: T } | { ok: false; error: string };
