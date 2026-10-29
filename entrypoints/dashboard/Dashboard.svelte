<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { browser } from "wxt/browser";
  import Icon from "@/components/Icon.svelte";
  import Favicon from "@/components/Favicon.svelte";
  import Spinner from "@/components/Spinner.svelte";
  import MethodPicker from "@/components/MethodPicker.svelte";
  import ConfirmDialog from "@/components/ConfirmDialog.svelte";
  import DashboardSidebar from "@/components/DashboardSidebar.svelte";
  import SavedGroupCard from "@/components/SavedGroupCard.svelte";
  import TabListRow from "@/components/TabListRow.svelte";
  import SettingsView from "@/components/SettingsView.svelte";
  import {
    errorMessage,
    getActiveWindowId,
    sendRequest,
  } from "@/lib/messaging";
  import {
    leastAccessedTabs,
    mostAccessedTabs,
    relativeTime,
  } from "@/lib/dashboard";
  import { ORGANIZATION_METHODS } from "@/lib/methods";
  import { overloadInfo, overloadZone } from "@/lib/overload";
  import OverloadGauge from "@/components/OverloadGauge.svelte";
  import {
    getTheme,
    onThemeStorageChange,
    toggleTheme,
    type Theme,
  } from "@/lib/theme";
  import {
    TAB_GROUP_COLOR_HEX,
    type AppSettings,
    type DashboardGroup,
    type DashboardState,
    type DashboardStats,
    type DashboardTab,
    type OrganizationMethod,
    type ProviderId,
    type SavedGroup,
    type TestConnectionResult,
  } from "@/lib/types";

  type View = "home" | "tabs" | "saved" | "settings";
  type Filter = "all" | "loose" | "grouped" | "pinned";
  type Sort = "manual" | "title" | "site" | "recent" | "oldest";
  type Menu = "window" | "groups" | "sort" | null;
  type Toast = { message: string; tone: "success" | "error" };

  interface ConfirmState {
    title: string;
    description: string;
    details?: string;
    confirmLabel: string;
    tone: "default" | "danger";
    action: () => Promise<string>;
  }

  const EMPTY_STATS: DashboardStats = {
    totalTabs: 0,
    totalWindows: 0,
    totalGroups: 0,
    loose: 0,
    organizedPercent: 0,
    pinned: 0,
  };

  let view = $state<View>("home");
  let filter = $state<Filter>("all");
  let sort = $state<Sort>("manual");
  let windowFilter = $state<number | "all">("all");
  let groupFilterIds = $state<number[]>([]);
  let openMenu = $state<Menu>(null);
  let search = $state("");
  let windowId = $state<number | null>(null);
  let data = $state<DashboardState | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let toast = $state<Toast | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedIds = $state<number[]>([]);
  let confirmState = $state<ConfirmState | null>(null);
  let editingGroupId = $state<number | null>(null);
  let editingName = $state("");
  let selectedSavedGroupId = $state<string | null>(null);
  let theme = $state<Theme>(getTheme());
  let searchInput = $state<HTMLInputElement | null>(null);
  let hashApplied = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const stats = $derived(data?.stats ?? EMPTY_STATS);
  const tabs = $derived(data?.tabs ?? []);
  const groups = $derived(data?.groups ?? []);
  const savedGroups = $derived(data?.savedGroups ?? []);
  const selectedSavedGroup = $derived(
    savedGroups.find((group) => group.id === selectedSavedGroupId) ?? null,
  );
  const settings = $derived(data?.settings ?? null);
  const method = $derived(data?.settings.defaultMethod ?? "category");
  const methodDef = $derived(ORGANIZATION_METHODS[method]);
  const currentWindowGroups = $derived(
    groups.filter((group) => group.windowId === windowId),
  );
  const mostAccessed = $derived(mostAccessedTabs(tabs, 4));
  const leastAccessed = $derived(leastAccessedTabs(tabs, 4));
  const looseInfo = $derived(overloadInfo(stats.loose));
  const statCards = $derived([
    { label: "Open tabs", value: String(stats.totalTabs), tone: "green" },
    { label: "Windows", value: String(stats.totalWindows), tone: "green" },
    { label: "Tab groups", value: String(stats.totalGroups), tone: "white" },
    {
      label: "Loose tabs",
      value: String(stats.loose),
      tone: overloadZone(stats.loose),
    },
    {
      label: "Organized",
      value: `${stats.organizedPercent}%`,
      tone: "green",
    },
  ]);

  const windowFilterLabel = $derived(
    windowFilter === "all" ? "All windows" : windowLabel(windowFilter),
  );
  const sortOptions: Array<{ value: Sort; label: string }> = [
    { value: "manual", label: "Browser order" },
    { value: "title", label: "Title A–Z" },
    { value: "site", label: "Site A–Z" },
    { value: "recent", label: "Recently accessed" },
    { value: "oldest", label: "Least recently accessed" },
  ];
  const sortLabel = $derived(
    sortOptions.find((option) => option.value === sort)?.label ??
      "Browser order",
  );
  const baseTabs = $derived(
    tabs.filter((tab) => {
      if (windowFilter !== "all" && tab.windowId !== windowFilter) return false;
      if (groupFilterIds.length > 0 && !groupFilterIds.includes(tab.groupId)) {
        return false;
      }
      return true;
    }),
  );
  const filters = $derived([
    { id: "all" as const, label: "All", count: baseTabs.length },
    {
      id: "loose" as const,
      label: "Loose",
      count: baseTabs.filter((tab) => !tab.pinned && tab.groupId === -1).length,
    },
    {
      id: "grouped" as const,
      label: "Grouped",
      count: baseTabs.filter((tab) => tab.groupId !== -1).length,
    },
    {
      id: "pinned" as const,
      label: "Pinned",
      count: baseTabs.filter((tab) => tab.pinned).length,
    },
  ]);

  const filteredTabs = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = baseTabs.filter((tab) => {
      if (filter === "loose" && (tab.pinned || tab.groupId !== -1))
        return false;
      if (filter === "grouped" && tab.groupId === -1) return false;
      if (filter === "pinned" && !tab.pinned) return false;
      if (!query) return true;
      return (
        tab.title.toLocaleLowerCase().includes(query) ||
        tab.hostname.toLocaleLowerCase().includes(query) ||
        (tab.groupName ?? "").toLocaleLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "site") {
        return (
          (a.hostname || a.title).localeCompare(b.hostname || b.title) ||
          a.title.localeCompare(b.title)
        );
      }
      if (sort === "recent") return b.lastAccessed - a.lastAccessed;
      if (sort === "oldest") return a.lastAccessed - b.lastAccessed;
      return a.windowId - b.windowId || a.index - b.index;
    });
  });

  onMount(() => {
    void load();
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (busy) {
          scheduleRefresh();
          return;
        }
        void load({ silent: true });
      }, 300);
    };
    const onTabsChanged = () => scheduleRefresh();

    browser.tabs.onCreated.addListener(onTabsChanged);
    browser.tabs.onRemoved.addListener(onTabsChanged);
    browser.tabs.onMoved.addListener(onTabsChanged);
    browser.tabs.onAttached.addListener(onTabsChanged);
    browser.tabs.onDetached.addListener(onTabsChanged);
    browser.tabs.onUpdated.addListener(onTabsChanged);
    browser.tabs.onActivated.addListener(onTabsChanged);
    browser.tabGroups.onCreated.addListener(onTabsChanged);
    browser.tabGroups.onUpdated.addListener(onTabsChanged);
    browser.tabGroups.onRemoved.addListener(onTabsChanged);
    browser.windows.onCreated.addListener(onTabsChanged);
    browser.windows.onRemoved.addListener(onTabsChanged);
    browser.windows.onFocusChanged.addListener(onTabsChanged);

    const handleHashChange = () => {
      void applyHash();
    };
    window.addEventListener("hashchange", handleHashChange);
    const stopThemeSync = onThemeStorageChange((next) => {
      theme = next;
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      browser.tabs.onCreated.removeListener(onTabsChanged);
      browser.tabs.onRemoved.removeListener(onTabsChanged);
      browser.tabs.onMoved.removeListener(onTabsChanged);
      browser.tabs.onAttached.removeListener(onTabsChanged);
      browser.tabs.onDetached.removeListener(onTabsChanged);
      browser.tabs.onUpdated.removeListener(onTabsChanged);
      browser.tabs.onActivated.removeListener(onTabsChanged);
      browser.tabGroups.onCreated.removeListener(onTabsChanged);
      browser.tabGroups.onUpdated.removeListener(onTabsChanged);
      browser.tabGroups.onRemoved.removeListener(onTabsChanged);
      browser.windows.onCreated.removeListener(onTabsChanged);
      browser.windows.onRemoved.removeListener(onTabsChanged);
      browser.windows.onFocusChanged.removeListener(onTabsChanged);
      window.removeEventListener("hashchange", handleHashChange);
      stopThemeSync();
    };
  });

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    if (refreshTimer) clearTimeout(refreshTimer);
  });

  async function load(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      loading = data === null;
      error = null;
    }
    try {
      if (windowId === null) windowId = await getActiveWindowId();
      data = await sendRequest({ type: "GET_DASHBOARD", windowId });
      if (!hashApplied) {
        await applyHash();
        hashApplied = true;
      }
    } catch (caught) {
      if (data === null) error = errorMessage(caught);
      else showToast(errorMessage(caught), "error");
    } finally {
      loading = false;
    }
  }

  async function applyHash(): Promise<void> {
    if (!data) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "saved") view = "saved";
    else if (hash === "settings") view = "settings";
    else if (hash === "tabs") view = "tabs";
    else if (hash === "search") {
      view = "tabs";
      filter = "all";
      await tick();
      searchInput?.focus();
    }
  }

  function navigate(next: View): void {
    view = next;
    selectedIds = [];
    search = "";
    filter = "all";
    sort = "manual";
    windowFilter = "all";
    groupFilterIds = [];
    openMenu = null;
    editingGroupId = null;
    window.history.replaceState(null, "", `#${next === "home" ? "" : next}`);
  }

  function showToast(
    message: string,
    tone: "success" | "error" = "success",
  ): void {
    toast = { message, tone };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 4000);
  }

  async function runAction(
    action: () => Promise<string>,
    options: { clearSelection?: boolean } = {},
  ): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const message = await action();
      if (options.clearSelection) selectedIds = [];
      showToast(message);
    } catch (caught) {
      showToast(errorMessage(caught), "error");
    } finally {
      busy = false;
    }
  }

  async function runConfirm(): Promise<void> {
    if (!confirmState || busy) return;
    busy = true;
    try {
      const message = await confirmState.action();
      confirmState = null;
      selectedIds = selectedIds.filter((id) =>
        data?.tabs.some((tab) => tab.id === id),
      );
      showToast(message);
    } catch (caught) {
      confirmState = null;
      showToast(errorMessage(caught), "error");
    } finally {
      busy = false;
    }
  }

  function confirmMergeWindows(): void {
    if (!windowId) return;
    confirmState = {
      title: "Merge windows?",
      description:
        "Move ungrouped, unpinned web tabs from every other window into this window.",
      details:
        "Existing groups and pinned tabs stay in their windows. Empty windows are closed. This cannot be undone by the extension.",
      confirmLabel: "Merge tabs",
      tone: "default",
      action: async () => {
        if (!windowId) throw new Error("No browser window.");
        const result = await sendRequest({
          type: "MERGE_WINDOWS",
          targetWindowId: windowId,
        });
        data = result.state;
        selectedIds = [];
        return result.message;
      },
    };
  }

  function confirmCloseSelected(): void {
    const targetWindowId = windowId;
    if (!targetWindowId || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    confirmState = {
      title: `Close ${ids.length} selected tab${ids.length === 1 ? "" : "s"}?`,
      description: "Close the selected tabs. Pinned tabs are skipped.",
      details: "This cannot be undone by the extension.",
      confirmLabel: "Close tabs",
      tone: "danger",
      action: async () => {
        const result = await sendRequest({
          type: "CLOSE_TABS",
          tabIds: ids,
          windowId: targetWindowId,
        });
        data = result.state;
        selectedIds = [];
        return result.message;
      },
    };
  }

  function confirmCloseTab(tab: DashboardTab): void {
    const targetWindowId = windowId;
    if (!targetWindowId) return;
    confirmState = {
      title: "Close this tab?",
      description: `Close “${tab.title}”?`,
      confirmLabel: "Close tab",
      tone: "danger",
      action: async () => {
        const result = await sendRequest({
          type: "CLOSE_TABS",
          tabIds: [tab.id],
          windowId: targetWindowId,
        });
        data = result.state;
        return result.message;
      },
    };
  }

  function confirmMoveSelected(): void {
    const targetWindowId = windowId;
    if (!targetWindowId || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    confirmState = {
      title: `Move ${ids.length} tab${ids.length === 1 ? "" : "s"} to a new window?`,
      description:
        "Create a new browser window containing the selected web tabs.",
      details: "Pinned tabs are not moved.",
      confirmLabel: "Move tabs",
      tone: "default",
      action: async () => {
        const result = await sendRequest({
          type: "MOVE_TABS_NEW_WINDOW",
          tabIds: ids,
          windowId: targetWindowId,
        });
        data = result.state;
        selectedIds = [];
        return result.message;
      },
    };
  }

  function confirmDeleteSavedGroup(group: SavedGroup): void {
    const targetWindowId = windowId;
    if (!targetWindowId) return;
    confirmState = {
      title: "Delete saved group?",
      description: `Remove “${group.name}” from your saved groups?`,
      details: "Open tabs are not affected.",
      confirmLabel: "Delete",
      tone: "danger",
      action: async () => {
        const result = await sendRequest({
          type: "DELETE_SAVED_GROUP",
          savedGroupId: group.id,
          windowId: targetWindowId,
        });
        data = result.state;
        if (selectedSavedGroupId === group.id) selectedSavedGroupId = null;
        return result.message;
      },
    };
  }

  function confirmUngroupAll(): void {
    const targetWindowId = windowId;
    if (!targetWindowId) return;
    confirmState = {
      title: "Ungroup every group?",
      description:
        "Remove every tab in this window from its native group. Pinned tabs are skipped.",
      details:
        "The groups will disappear. This action cannot be undone by the extension.",
      confirmLabel: "Ungroup all",
      tone: "danger",
      action: async () => {
        const result = await sendRequest({
          type: "UNGROUP_ALL",
          windowId: targetWindowId,
        });
        data = result.state;
        return result.message;
      },
    };
  }

  function toggleGroups(): void {
    void runAction(async () => {
      if (!windowId) throw new Error("No browser window.");
      const result = await sendRequest({
        type: "TOGGLE_GROUPS_COLLAPSED",
        windowId,
      });
      data = result.state;
      return result.message;
    });
  }

  function restoreGroup(group: SavedGroup): void {
    void runAction(async () => {
      if (!windowId) throw new Error("No browser window.");
      const result = await sendRequest({
        type: "RESTORE_GROUP",
        savedGroupId: group.id,
        windowId,
      });
      data = result.state;
      view = "tabs";
      return result.message;
    });
  }

  function saveGroup(group: DashboardGroup): void {
    void runAction(async () => {
      if (!windowId) throw new Error("No browser window.");
      const result = await sendRequest({
        type: "SAVE_GROUP",
        groupId: group.id,
        windowId,
      });
      data = result.state;
      return result.message;
    });
  }

  function startRename(group: DashboardGroup): void {
    editingGroupId = group.id;
    editingName = group.name;
  }

  function cancelRename(): void {
    editingGroupId = null;
    editingName = "";
  }

  function saveRename(group: DashboardGroup): void {
    const title = editingName;
    const targetWindowId = windowId;
    if (!targetWindowId) return;
    editingGroupId = null;
    void runAction(async () => {
      const result = await sendRequest({
        type: "RENAME_GROUP",
        groupId: group.id,
        title,
        windowId: targetWindowId,
      });
      data = result.state;
      return result.message;
    });
  }

  function toggleMenu(menu: Exclude<Menu, null>): void {
    openMenu = openMenu === menu ? null : menu;
  }

  function setWindowFilter(value: number | "all"): void {
    windowFilter = value;
    openMenu = null;
  }

  function setSort(value: Sort): void {
    sort = value;
    openMenu = null;
  }

  function toggleGroupFilter(groupId: number): void {
    groupFilterIds = groupFilterIds.includes(groupId)
      ? groupFilterIds.filter((id) => id !== groupId)
      : [...groupFilterIds, groupId];
  }

  function clearGroupFilters(): void {
    groupFilterIds = [];
  }

  function toggleSelected(id: number): void {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
  }

  function selectAllVisible(): void {
    const ids = filteredTabs.filter((tab) => !tab.pinned).map((tab) => tab.id);
    selectedIds = [...new Set([...selectedIds, ...ids])];
  }

  function windowLabel(id: number): string {
    if (id === windowId) return "This window";
    const index = data?.windows.findIndex((window) => window.id === id) ?? -1;
    return index >= 0 ? `Window ${index + 1}` : "Window";
  }

  async function setMethod(next: OrganizationMethod): Promise<void> {
    if (!data || data.settings.defaultMethod === next) return;
    const previous = data.settings.defaultMethod;
    data.settings.defaultMethod = next;
    try {
      const saved = await sendRequest({ type: "SET_METHOD", method: next });
      if (data) data.settings = saved;
    } catch (caught) {
      if (data) data.settings.defaultMethod = previous;
      showToast(errorMessage(caught), "error");
    }
  }

  async function saveSettings(next: AppSettings): Promise<AppSettings> {
    const saved = await sendRequest({ type: "SAVE_SETTINGS", settings: next });
    if (data) data.settings = saved;
    showToast("Settings saved.");
    return saved;
  }

  function testConnection(options: {
    provider: ProviderId;
    apiKey: string;
    model: string;
  }): Promise<TestConnectionResult> {
    return sendRequest({ type: "TEST_CONNECTION", ...options });
  }

  async function openOrganizer(): Promise<void> {
    try {
      const action = browser.action as typeof browser.action & {
        openPopup?: () => Promise<void>;
      };
      if (!action.openPopup) {
        showToast(
          "Click the AI Tab Organizer icon in the toolbar to open the organizer.",
          "error",
        );
        return;
      }
      await action.openPopup();
    } catch {
      showToast(
        "Click the AI Tab Organizer icon in the toolbar to open the organizer.",
        "error",
      );
    }
  }

  function switchTheme(): void {
    theme = toggleTheme(theme);
  }

  function statTone(tone: string): string {
    if (tone === "green") return "text-emerald-600 dark:text-emerald-400";
    if (tone === "amber") return "text-amber-600 dark:text-amber-300";
    if (tone === "red") return "text-red-600 dark:text-red-400";
    return "text-app-text";
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") openMenu = null;
  }}
/>

{#if loading && !data}
  <div
    class="flex min-h-screen items-center justify-center bg-app-bg text-app-text"
  >
    <div class="flex flex-col items-center gap-3">
      <Spinner size={24} />
      <p class="text-[14px] text-app-muted">Reading your browser…</p>
    </div>
  </div>
{:else if error && !data}
  <div
    class="flex min-h-screen items-center justify-center bg-app-bg px-6 text-app-text"
  >
    <div class="max-w-md text-center">
      <div
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-300"
      >
        <Icon name="alert" size={22} />
      </div>
      <h1 class="mt-4 text-lg font-semibold">Dashboard could not connect</h1>
      <p class="mt-2 text-[14px] leading-relaxed text-app-muted">{error}</p>
      <button
        type="button"
        onclick={() => load()}
        class="mt-5 inline-flex items-center gap-2 rounded-lg bg-app-hover px-4 py-2 text-[14px] font-medium text-app-text transition hover:bg-app-hover"
      >
        <Icon name="refresh" size={14} />
        Try again
      </button>
    </div>
  </div>
{:else if data}
  <div class="bg-app-glow min-h-screen text-app-text">
    <DashboardSidebar
      {view}
      tabCount={stats.totalTabs}
      savedCount={savedGroups.length}
      onNavigate={navigate}
      onOpenOrganizer={openOrganizer}
    />

    <div class="ml-[250px] min-h-screen">
      <div class="mx-auto max-w-[1420px] px-8 py-8">
        <header class="flex items-start justify-between gap-6">
          <div>
            <div class="flex items-center gap-2">
              <h1
                class="text-[28px] font-semibold tracking-tight text-app-text"
              >
                {view === "home"
                  ? "Tab Dashboard"
                  : view === "tabs"
                    ? "Tab Observer"
                    : view === "saved"
                      ? "Saved Groups"
                      : "Settings"}
              </h1>
              <span
                class="rounded-full border border-sky-400/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium tracking-[0.12em] text-sky-300 uppercase"
              >
                {windowLabel(data.windowId)}
              </span>
            </div>
            <p class="mt-1 text-[14px] text-app-muted">
              {view === "home"
                ? "Here’s what’s happening in your browser."
                : view === "tabs"
                  ? "Search, select, move, and clean up tabs across every window."
                  : view === "saved"
                    ? "Reopen groups you saved earlier, in the current window."
                    : "Bring your own provider key. Nothing leaves this browser until you organize."}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <p
              class="mr-2 hidden text-right text-[12px] leading-relaxed text-app-subtle lg:block"
            >
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <button
              type="button"
              onclick={switchTheme}
              class="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-app-border-strong bg-app-surface text-app-muted transition hover:bg-app-hover hover:text-app-text"
              aria-label={theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"}
              title={theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
            </button>
            <button
              type="button"
              onclick={openOrganizer}
              class="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-300 hover:to-blue-500"
            >
              <Icon name="sparkles" size={13} />
              Open organizer
            </button>
          </div>
        </header>

        {#if view === "home"}
          <div class="mt-6 space-y-4">
            <div class="grid grid-cols-5 gap-3">
              {#each statCards as card (card.label)}
                <div
                  class="rounded-2xl border border-app-border bg-app-surface px-4 py-3"
                >
                  <p
                    class="text-[11px] font-semibold tracking-[0.15em] text-app-muted uppercase"
                  >
                    {card.label}
                  </p>
                  <p
                    class={`mt-1.5 text-[28px] leading-tight font-semibold ${statTone(card.tone)}`}
                  >
                    {card.value}
                  </p>
                </div>
              {/each}
            </div>

            <div class="grid grid-cols-12 gap-4">
              <section
                class="col-span-4 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div
                  class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                >
                  <Icon name="clock" size={13} class="text-app-muted" />
                  Tab usage
                </div>
                <div class="mt-4 flex items-center justify-center">
                  <div class="relative h-[180px] w-[180px]">
                    <svg viewBox="0 0 200 200" class="h-full w-full -rotate-90">
                      <defs>
                        <linearGradient
                          id="usage-arc-gradient"
                          gradientUnits="userSpaceOnUse"
                          x1="28"
                          y1="16"
                          x2="176"
                          y2="184"
                        >
                          <stop offset="0%" stop-color="#16c964" />
                          <stop offset="55%" stop-color="#34c759" />
                          <stop offset="100%" stop-color="#7bf1a8" />
                        </linearGradient>
                        <filter
                          id="usage-neon-glow"
                          x="-30%"
                          y="-30%"
                          width="160%"
                          height="160%"
                          color-interpolation-filters="sRGB"
                        >
                          <feGaussianBlur
                            stdDeviation="4"
                            result="usage-blur"
                          />
                          <feMerge>
                            <feMergeNode in="usage-blur" />
                            <feMergeNode in="usage-blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <circle
                        cx="100"
                        cy="100"
                        r="82"
                        fill="none"
                        stroke="var(--app-border-strong)"
                        stroke-width="13"
                      />
                      {#if stats.organizedPercent >= 100}
                        <circle
                          cx="100"
                          cy="100"
                          r="82"
                          fill="none"
                          stroke="url(#usage-arc-gradient)"
                          stroke-width="13"
                          filter="url(#usage-neon-glow)"
                        />
                      {:else}
                        <circle
                          cx="100"
                          cy="100"
                          r="82"
                          fill="none"
                          stroke="url(#usage-arc-gradient)"
                          stroke-width="13"
                          stroke-linecap="round"
                          pathLength="100"
                          stroke-dasharray={`${stats.organizedPercent} 100`}
                          filter="url(#usage-neon-glow)"
                        />
                      {/if}
                    </svg>
                    <div
                      class="absolute inset-0 flex flex-col items-center justify-center"
                    >
                      <p
                        class="text-[40px] leading-none font-semibold text-app-text"
                      >
                        {stats.totalTabs}
                      </p>
                      <p
                        class="mt-1 text-[11px] tracking-[0.18em] text-app-muted uppercase"
                      >
                        Open tabs
                      </p>
                      <p class="mt-2 text-[12px] text-emerald-400">
                        {stats.organizedPercent}% organized
                      </p>
                    </div>
                  </div>
                </div>
                <p class="mt-3 text-center text-[12px] text-app-subtle">
                  {stats.loose} loose · {stats.pinned} pinned
                </p>
              </section>

              <section
                class="col-span-8 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div class="flex items-center justify-between gap-3">
                  <div
                    class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                  >
                    <Icon name="target" size={13} class="text-app-muted" />
                    Tab overload index
                  </div>
                  <span
                    class={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      looseInfo.zone === "green"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                        : looseInfo.zone === "amber"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                          : "bg-red-500/10 text-red-600 dark:text-red-300"
                    }`}
                  >
                    {stats.loose} loose
                  </span>
                </div>
                <div class="mt-2">
                  <OverloadGauge loose={stats.loose} />
                </div>
                <div class="mt-1 flex justify-center">
                  <button
                    type="button"
                    onclick={() => {
                      view = "tabs";
                      filter = "loose";
                      sort = "manual";
                    }}
                    class="rounded-lg border border-app-border-strong bg-app-surface px-2.5 py-1.5 text-[12px] text-app-text-secondary transition hover:bg-app-hover"
                  >
                    Review loose tabs
                  </button>
                </div>
              </section>
            </div>

            <div class="grid grid-cols-12 gap-4">
              <section
                class="col-span-7 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div class="flex items-center justify-between">
                  <div
                    class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                  >
                    <Icon name="clock" size={13} class="text-app-muted" />
                    Access activity
                  </div>
                  <span class="text-[11px] text-app-subtle"
                    >Based on last access</span
                  >
                </div>
                <div class="mt-4 grid grid-cols-2 gap-5">
                  <div>
                    <p
                      class="mb-2 text-[11px] font-semibold tracking-[0.14em] text-emerald-400/80 uppercase"
                    >
                      Recently accessed
                    </p>
                    <div class="space-y-0.5">
                      {#each mostAccessed as tab (tab.id)}
                        <div
                          class="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
                        >
                          <Favicon
                            url={tab.faviconUrl}
                            hostname={tab.hostname}
                            size={14}
                          />
                          <span
                            class="min-w-0 flex-1 truncate text-[12px] text-app-text-secondary"
                          >
                            {tab.title}
                          </span>
                          <span class="shrink-0 text-[11px] text-app-subtle">
                            {relativeTime(tab.lastAccessed)}
                          </span>
                        </div>
                      {:else}
                        <p class="px-1.5 py-2 text-[12px] text-app-subtle">
                          No data yet.
                        </p>
                      {/each}
                    </div>
                  </div>
                  <div>
                    <p
                      class="mb-2 text-[11px] font-semibold tracking-[0.14em] text-amber-300/70 uppercase"
                    >
                      Least recently accessed
                    </p>
                    <div class="space-y-0.5">
                      {#each leastAccessed as tab (tab.id)}
                        <div
                          class="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
                        >
                          <Favicon
                            url={tab.faviconUrl}
                            hostname={tab.hostname}
                            size={14}
                          />
                          <span
                            class="min-w-0 flex-1 truncate text-[12px] text-app-text-secondary"
                          >
                            {tab.title}
                          </span>
                          <span class="shrink-0 text-[11px] text-app-subtle">
                            {relativeTime(tab.lastAccessed)}
                          </span>
                        </div>
                      {:else}
                        <p class="px-1.5 py-2 text-[12px] text-app-subtle">
                          No data yet.
                        </p>
                      {/each}
                    </div>
                  </div>
                </div>
              </section>

              <section
                class="col-span-5 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div class="flex items-center justify-between">
                  <div
                    class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                  >
                    <Icon name="bookmarks" size={13} class="text-app-muted" />
                    Saved groups
                  </div>
                  <button
                    type="button"
                    onclick={() => navigate("saved")}
                    class="text-[11px] text-sky-300/80 transition hover:text-sky-200"
                  >
                    View all
                  </button>
                </div>
                <div class="mt-3 space-y-2">
                  {#if savedGroups.length === 0}
                    <div
                      class="rounded-xl border border-dashed border-app-border px-3 py-5 text-center"
                    >
                      <p class="text-[12px] text-app-muted">
                        No saved groups yet.
                      </p>
                      <button
                        type="button"
                        onclick={() => navigate("tabs")}
                        class="mt-2 text-[12px] font-medium text-sky-300 transition hover:text-sky-200"
                      >
                        Save a group from Tab Observer
                      </button>
                    </div>
                  {:else}
                    {#each savedGroups.slice(0, 3) as group (group.id)}
                      <SavedGroupCard
                        {group}
                        {busy}
                        compact
                        onOpen={() => restoreGroup(group)}
                        onDelete={() => confirmDeleteSavedGroup(group)}
                      />
                    {/each}
                  {/if}
                </div>
              </section>
            </div>

            <div class="grid grid-cols-12 gap-4">
              <section
                class="col-span-7 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div class="flex items-center justify-between">
                  <div
                    class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                  >
                    <Icon name="sparkles" size={13} class="text-app-muted" />
                    Organization method
                  </div>
                  <span
                    class={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.1em] uppercase ${
                      methodDef.requiresAi
                        ? "bg-blue-500/10 text-sky-300/80"
                        : "bg-emerald-500/10 text-emerald-300/80"
                    }`}
                  >
                    {methodDef.requiresAi ? "AI" : "Local"}
                  </span>
                </div>
                <div class="mt-3">
                  <MethodPicker
                    value={method}
                    onSelect={(next) => {
                      void setMethod(next);
                    }}
                  />
                </div>
                <p class="mt-2 text-[12px] leading-relaxed text-app-muted">
                  {methodDef.description}
                </p>
                <button
                  type="button"
                  onclick={openOrganizer}
                  class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-app-hover px-3 py-2 text-[12px] font-medium text-app-text transition hover:bg-app-hover"
                >
                  <Icon name="sparkles" size={12} />
                  Open organizer
                </button>
              </section>

              <section
                class="col-span-5 rounded-2xl border border-app-border bg-app-surface p-5"
              >
                <div
                  class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                >
                  <Icon name="trash" size={13} class="text-app-muted" />
                  Tab cleanup
                </div>
                <div class="mt-3 space-y-2">
                  <div
                    class="flex items-center justify-between rounded-xl border border-app-border bg-app-surface px-3 py-2.5"
                  >
                    <div>
                      <p
                        class="text-[12px] font-medium text-app-text-secondary"
                      >
                        Merge windows
                      </p>
                      <p class="mt-0.5 text-[11px] text-app-subtle">
                        Bring ungrouped tabs into this window
                      </p>
                    </div>
                    <button
                      type="button"
                      onclick={confirmMergeWindows}
                      disabled={busy}
                      class="rounded-lg bg-app-hover px-2.5 py-1.5 text-[11px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-40"
                    >
                      Merge
                    </button>
                  </div>
                  <div
                    class="flex items-center justify-between rounded-xl border border-app-border bg-app-surface px-3 py-2.5"
                  >
                    <div>
                      <p
                        class="text-[12px] font-medium text-app-text-secondary"
                      >
                        Saved groups
                      </p>
                      <p class="mt-0.5 text-[11px] text-app-subtle">
                        {savedGroups.length} saved · open or delete
                      </p>
                    </div>
                    <button
                      type="button"
                      onclick={() => navigate("saved")}
                      class="rounded-lg bg-app-hover px-2.5 py-1.5 text-[11px] font-medium text-app-text-secondary transition hover:bg-app-hover"
                    >
                      Open
                    </button>
                  </div>
                  <div
                    class="flex items-center justify-between rounded-xl border border-app-border bg-app-surface px-3 py-2.5"
                  >
                    <div>
                      <p
                        class="text-[12px] font-medium text-app-text-secondary"
                      >
                        Collapse / expand all
                      </p>
                      <p class="mt-0.5 text-[11px] text-app-subtle">
                        Toggle every group in this window
                      </p>
                    </div>
                    <button
                      type="button"
                      onclick={toggleGroups}
                      disabled={busy || currentWindowGroups.length === 0}
                      class="rounded-lg bg-app-hover px-2.5 py-1.5 text-[11px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-40"
                    >
                      Toggle
                    </button>
                  </div>
                  <div
                    class="flex items-center justify-between rounded-xl border border-red-400/10 bg-red-500/[0.025] px-3 py-2.5"
                  >
                    <div>
                      <p
                        class="text-[12px] font-medium text-app-text-secondary"
                      >
                        Ungroup all
                      </p>
                      <p class="mt-0.5 text-[11px] text-app-subtle">
                        Remove every tab from its group
                      </p>
                    </div>
                    <button
                      type="button"
                      onclick={confirmUngroupAll}
                      disabled={busy || currentWindowGroups.length === 0}
                      class="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Ungroup
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        {:else if view === "tabs"}
          <div class="mt-6 space-y-4">
            <section
              class="rounded-2xl border border-app-border bg-app-surface p-5"
            >
              <div class="flex items-center justify-between">
                <div
                  class="flex items-center gap-2 text-[13px] font-medium text-app-text-secondary"
                >
                  <Icon name="folder" size={13} class="text-app-muted" />
                  Groups in this window
                </div>
                <span class="text-[11px] text-app-subtle">
                  {currentWindowGroups.length} groups
                </span>
              </div>
              {#if currentWindowGroups.length === 0}
                <p class="mt-3 text-[12px] text-app-subtle">
                  No groups in this window yet. Organize tabs to create some.
                </p>
              {:else}
                <div class="mt-3 grid grid-cols-3 gap-2">
                  {#each currentWindowGroups as group (group.id)}
                    <div
                      class="rounded-xl border border-app-border bg-app-surface p-3"
                    >
                      <div class="flex items-center gap-2">
                        <span
                          class="h-2 w-2 shrink-0 rounded-full"
                          style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
                        ></span>
                        {#if editingGroupId === group.id}
                          <input
                            type="text"
                            bind:value={editingName}
                            onkeydown={(event: KeyboardEvent) => {
                              if (event.key === "Enter") saveRename(group);
                              if (event.key === "Escape") cancelRename();
                            }}
                            class="min-w-0 flex-1 rounded-md border border-sky-400/40 bg-app-input px-2 py-1 text-[12px] text-app-text outline-none"
                            aria-label="Group name"
                          />
                          <button
                            type="button"
                            onclick={() => saveRename(group)}
                            class="flex h-5 w-5 items-center justify-center rounded text-emerald-300 hover:bg-emerald-500/10"
                            aria-label="Save group name"
                          >
                            <Icon name="check" size={11} />
                          </button>
                          <button
                            type="button"
                            onclick={cancelRename}
                            class="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:bg-app-hover"
                            aria-label="Cancel rename"
                          >
                            <Icon name="x" size={11} />
                          </button>
                        {:else}
                          <p
                            class="min-w-0 flex-1 truncate text-[12px] font-medium text-app-text-secondary"
                          >
                            {group.name}
                          </p>
                          <button
                            type="button"
                            onclick={() => startRename(group)}
                            class="flex h-5 w-5 items-center justify-center rounded text-app-subtle hover:bg-app-hover hover:text-app-text-secondary"
                            aria-label={`Rename ${group.name}`}
                            title="Rename group"
                          >
                            <Icon name="pencil" size={10} />
                          </button>
                        {/if}
                      </div>
                      <div class="mt-2 flex items-center justify-between">
                        <span class="text-[11px] text-app-subtle">
                          {group.tabIds.length} tabs
                        </span>
                        <button
                          type="button"
                          onclick={() => saveGroup(group)}
                          disabled={busy}
                          class="inline-flex items-center gap-1 rounded-md bg-app-hover px-2 py-1 text-[11px] text-app-muted transition hover:bg-app-hover hover:text-app-text disabled:opacity-40"
                        >
                          <Icon name="bookmarks" size={9} />
                          Save
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>

            <section
              class="rounded-2xl border border-app-border bg-app-surface p-5"
            >
              <div class="flex flex-wrap items-center gap-2">
                <div class="relative min-w-[240px] flex-1">
                  <Icon
                    name="search"
                    size={13}
                    class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-subtle"
                  />
                  <input
                    type="search"
                    bind:value={search}
                    bind:this={searchInput}
                    placeholder="Search open tabs, sites, or groups…"
                    class="w-full rounded-lg border border-app-border-strong bg-app-input py-2 pr-3 pl-9 text-[13px] text-app-text transition outline-none placeholder:text-app-subtle focus:border-sky-400/50 focus:ring-2 focus:ring-sky-500/10"
                    aria-label="Search tabs"
                  />
                </div>

                <button
                  type="button"
                  onclick={selectAllVisible}
                  class="flex h-9 w-9 items-center justify-center rounded-lg border border-app-border-strong bg-app-surface text-app-muted transition hover:bg-app-hover hover:text-app-text"
                  aria-label="Select all visible tabs"
                  title="Select all visible tabs"
                >
                  <Icon name="check-square" size={15} />
                </button>

                <div class="relative">
                  <button
                    type="button"
                    onclick={() => toggleMenu("window")}
                    class={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      windowFilter === "all"
                        ? "border-app-border-strong bg-app-surface text-app-muted hover:bg-app-hover hover:text-app-text"
                        : "border-sky-400/30 bg-blue-500/10 text-sky-600 dark:text-sky-300"
                    }`}
                    aria-label={`Filter by window: ${windowFilterLabel}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "window"}
                    title={`Window: ${windowFilterLabel}`}
                  >
                    <Icon name="monitor" size={15} />
                    {#if windowFilter !== "all"}
                      <span
                        class="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-sky-500"
                      ></span>
                    {/if}
                  </button>
                  {#if openMenu === "window"}
                    <div
                      class="absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-app-border bg-app-surface-strong p-1.5 shadow-2xl"
                      role="menu"
                    >
                      <button
                        type="button"
                        onclick={() => setWindowFilter("all")}
                        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-app-text-secondary transition hover:bg-app-hover"
                      >
                        <span class="flex-1">All windows</span>
                        {#if windowFilter === "all"}
                          <Icon
                            name="check"
                            size={13}
                            class="text-sky-500 dark:text-sky-300"
                          />
                        {/if}
                      </button>
                      {#each data.windows as window (window.id)}
                        <button
                          type="button"
                          onclick={() => setWindowFilter(window.id)}
                          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-app-text-secondary transition hover:bg-app-hover"
                        >
                          <span class="flex-1">{windowLabel(window.id)}</span>
                          <span
                            class="text-[10px] text-app-subtle tabular-nums"
                          >
                            {window.tabCount}
                          </span>
                          {#if windowFilter === window.id}
                            <Icon
                              name="check"
                              size={13}
                              class="text-sky-500 dark:text-sky-300"
                            />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="relative">
                  <button
                    type="button"
                    onclick={() => toggleMenu("groups")}
                    class={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      groupFilterIds.length > 0
                        ? "border-sky-400/30 bg-blue-500/10 text-sky-600 dark:text-sky-300"
                        : "border-app-border-strong bg-app-surface text-app-muted hover:bg-app-hover hover:text-app-text"
                    }`}
                    aria-label="Filter by group"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "groups"}
                    title={`Filter groups${groupFilterIds.length > 0 ? ` (${groupFilterIds.length})` : ""}`}
                  >
                    <Icon name="folder" size={15} />
                    {#if groupFilterIds.length > 0}
                      <span
                        class="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-semibold text-white"
                      >
                        {groupFilterIds.length}
                      </span>
                    {/if}
                  </button>
                  {#if openMenu === "groups"}
                    <div
                      class="absolute top-full right-0 z-50 mt-2 w-72 rounded-xl border border-app-border bg-app-surface-strong p-1.5 shadow-2xl"
                      role="menu"
                    >
                      <div class="flex items-center justify-between px-2 py-1">
                        <span
                          class="text-[10px] font-semibold tracking-[0.12em] text-app-muted uppercase"
                        >
                          Filter groups
                        </span>
                        {#if groupFilterIds.length > 0}
                          <button
                            type="button"
                            onclick={clearGroupFilters}
                            class="text-[10px] text-sky-600 transition hover:text-sky-500 dark:text-sky-300"
                          >
                            Clear
                          </button>
                        {/if}
                      </div>
                      <div class="scroll-area max-h-64 overflow-y-auto">
                        {#if groups.length === 0}
                          <p class="px-2 py-3 text-[11px] text-app-subtle">
                            No tab groups in any window.
                          </p>
                        {:else}
                          {#each groups as group (group.id)}
                            <label
                              class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-app-hover"
                            >
                              <input
                                type="checkbox"
                                checked={groupFilterIds.includes(group.id)}
                                onchange={() => toggleGroupFilter(group.id)}
                                class="h-3.5 w-3.5 shrink-0 accent-blue-500"
                              />
                              <span
                                class="h-2 w-2 shrink-0 rounded-full"
                                style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
                              ></span>
                              <span class="min-w-0 flex-1">
                                <span
                                  class="block truncate text-[12px] text-app-text-secondary"
                                >
                                  {group.name}
                                </span>
                                <span class="block text-[10px] text-app-subtle">
                                  {group.tabIds.length} tabs · {windowLabel(
                                    group.windowId,
                                  )}
                                </span>
                              </span>
                            </label>
                          {/each}
                        {/if}
                      </div>
                      <p
                        class="border-t border-app-border px-2 pt-2 pb-1 text-[10px] leading-relaxed text-app-subtle"
                      >
                        Select one or more groups to narrow the tab list.
                      </p>
                    </div>
                  {/if}
                </div>

                <div class="relative">
                  <button
                    type="button"
                    onclick={() => toggleMenu("sort")}
                    class={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      sort === "manual"
                        ? "border-app-border-strong bg-app-surface text-app-muted hover:bg-app-hover hover:text-app-text"
                        : "border-sky-400/30 bg-blue-500/10 text-sky-600 dark:text-sky-300"
                    }`}
                    aria-label={`Sort tabs: ${sortLabel}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "sort"}
                    title={`Sort: ${sortLabel}`}
                  >
                    <Icon name="arrow-up-down" size={15} />
                  </button>
                  {#if openMenu === "sort"}
                    <div
                      class="absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-app-border bg-app-surface-strong p-1.5 shadow-2xl"
                      role="menu"
                    >
                      {#each sortOptions as option (option.value)}
                        <button
                          type="button"
                          onclick={() => setSort(option.value)}
                          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-app-text-secondary transition hover:bg-app-hover"
                        >
                          <span class="flex-1">{option.label}</span>
                          {#if sort === option.value}
                            <Icon
                              name="check"
                              size={13}
                              class="text-sky-500 dark:text-sky-300"
                            />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if openMenu !== null}
                  <button
                    type="button"
                    tabindex="-1"
                    aria-hidden="true"
                    onclick={() => (openMenu = null)}
                    class="fixed inset-0 z-40 cursor-default bg-transparent"
                  ></button>
                {/if}
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-1.5">
                {#each filters as item (item.id)}
                  <button
                    type="button"
                    onclick={() => (filter = item.id)}
                    class={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      filter === item.id
                        ? "bg-blue-500/15 text-sky-200 ring-1 ring-sky-400/20 ring-inset"
                        : "text-app-muted hover:bg-app-hover hover:text-app-text-secondary"
                    }`}
                  >
                    {item.label}
                    <span class="ml-1 text-app-subtle tabular-nums"
                      >{item.count}</span
                    >
                  </button>
                {/each}
                <span class="ml-auto text-[11px] text-app-subtle">
                  {filteredTabs.length} shown
                </span>
              </div>

              {#if selectedIds.length > 0}
                <div
                  class="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/20 bg-blue-500/[0.07] px-3 py-2"
                >
                  <span class="text-[12px] font-medium text-sky-200">
                    {selectedIds.length} selected
                  </span>
                  <button
                    type="button"
                    onclick={confirmMoveSelected}
                    disabled={busy}
                    class="inline-flex items-center gap-1 rounded-md bg-app-hover px-2 py-1 text-[11px] text-app-text-secondary transition hover:bg-app-hover disabled:opacity-50"
                  >
                    <Icon name="move" size={10} />
                    Move to new window
                  </button>
                  <button
                    type="button"
                    onclick={confirmCloseSelected}
                    disabled={busy}
                    class="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <Icon name="trash" size={10} />
                    Close selected
                  </button>
                  <button
                    type="button"
                    onclick={() => (selectedIds = [])}
                    class="ml-auto text-[11px] text-app-muted transition hover:text-app-text-secondary"
                  >
                    Clear
                  </button>
                </div>
              {/if}

              <div class="mt-3 space-y-0.5">
                {#each filteredTabs as tab (tab.id)}
                  <TabListRow
                    {tab}
                    selected={selectedIds.includes(tab.id)}
                    windowLabel={windowLabel(tab.windowId)}
                    {busy}
                    onToggle={() => toggleSelected(tab.id)}
                    onClose={() => confirmCloseTab(tab)}
                  />
                {:else}
                  <div
                    class="rounded-xl border border-dashed border-app-border px-4 py-8 text-center"
                  >
                    <p class="text-[13px] text-app-muted">
                      {search || filter !== "all" || windowFilter !== "all"
                        ? "No tabs match this view."
                        : "No tabs found."}
                    </p>
                  </div>
                {/each}
              </div>
            </section>
          </div>
        {:else if view === "saved"}
          <div
            class="mt-6 grid grid-cols-[360px_minmax(0,1fr)] items-start gap-4"
          >
            <div
              class="flex min-h-[calc(100vh-190px)] flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface"
            >
              <div
                class="flex items-center justify-between border-b border-app-border px-4 py-3.5"
              >
                <div class="flex items-center gap-2">
                  <Icon name="bookmarks" size={14} class="text-app-muted" />
                  <h2 class="text-[15px] font-semibold text-app-text">
                    My Groups
                  </h2>
                </div>
                <span class="text-[13px] text-app-subtle">
                  {savedGroups.length} saved
                </span>
              </div>

              <div class="scroll-area min-h-0 flex-1 overflow-y-auto p-2">
                {#if savedGroups.length === 0}
                  <div class="px-3 py-8 text-center">
                    <p class="text-[14px] leading-relaxed text-app-muted">
                      No saved groups yet — save one of your open browser groups
                      below.
                    </p>
                  </div>
                {:else}
                  <div class="space-y-1">
                    {#each savedGroups as group (group.id)}
                      <button
                        type="button"
                        onclick={() => (selectedSavedGroupId = group.id)}
                        class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                          selectedSavedGroupId === group.id
                            ? "bg-blue-500/15 ring-1 ring-sky-400/20 ring-inset"
                            : "hover:bg-app-hover"
                        }`}
                      >
                        <span
                          class="h-2 w-2 shrink-0 rounded-full"
                          style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
                        ></span>
                        <span class="min-w-0 flex-1">
                          <span
                            class="block truncate text-[14px] text-app-text"
                          >
                            {group.name}
                          </span>
                          <span
                            class="mt-0.5 block text-[12px] text-app-subtle"
                          >
                            {group.tabs.length} tabs
                          </span>
                        </span>
                        <Icon
                          name="chevron-right"
                          size={12}
                          class="text-app-subtle"
                        />
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="border-t border-app-border">
                <div class="flex items-center justify-between px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    ></span>
                    <h3
                      class="text-[12px] font-semibold tracking-[0.14em] text-app-muted uppercase"
                    >
                      Open in browser
                    </h3>
                  </div>
                  <span class="text-[12px] text-app-subtle"
                    >{groups.length}</span
                  >
                </div>
                <div
                  class="scroll-area max-h-[250px] overflow-y-auto px-2 pb-3"
                >
                  {#if groups.length === 0}
                    <p
                      class="px-2 pb-2 text-[13px] leading-relaxed text-app-subtle"
                    >
                      No open tab groups in any window.
                    </p>
                  {:else}
                    <div class="space-y-1">
                      {#each groups as group (group.id)}
                        <div
                          class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-app-hover"
                        >
                          <span
                            class="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
                          ></span>
                          <div class="min-w-0 flex-1">
                            <p
                              class="truncate text-[13px] text-app-text-secondary"
                            >
                              {group.name}
                            </p>
                            <p class="text-[11px] text-app-subtle">
                              {group.tabIds.length} tabs · {windowLabel(
                                group.windowId,
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onclick={() => saveGroup(group)}
                            disabled={busy}
                            class="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[12px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <div
              class="flex min-h-[calc(100vh-190px)] flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface"
            >
              {#if selectedSavedGroup}
                <div
                  class="flex items-start gap-3 border-b border-app-border px-5 py-4"
                >
                  <span
                    class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={`background:${TAB_GROUP_COLOR_HEX[selectedSavedGroup.color]}`}
                  ></span>
                  <div class="min-w-0 flex-1">
                    <h2
                      class="truncate text-[18px] font-semibold text-app-text"
                    >
                      {selectedSavedGroup.name}
                    </h2>
                    <p class="mt-0.5 text-[13px] text-app-subtle">
                      {selectedSavedGroup.tabs.length} tabs · saved
                      {new Date(
                        selectedSavedGroup.createdAt,
                      ).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onclick={() => restoreGroup(selectedSavedGroup)}
                    disabled={busy}
                    class="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-2 text-[13px] font-medium text-sky-200 transition hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    <Icon name="arrow-right" size={12} />
                    Open group
                  </button>
                  <button
                    type="button"
                    onclick={() => confirmDeleteSavedGroup(selectedSavedGroup)}
                    disabled={busy}
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-app-subtle transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    aria-label={`Delete saved group ${selectedSavedGroup.name}`}
                    title="Delete saved group"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div class="scroll-area min-h-0 flex-1 overflow-y-auto p-3">
                  {#each selectedSavedGroup.tabs as tab, index (index)}
                    <div
                      class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-app-surface"
                    >
                      <Favicon
                        url={tab.faviconUrl}
                        hostname={new URL(tab.url).hostname}
                        size={16}
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[14px] text-app-text-secondary">
                          {tab.title}
                        </p>
                        <p class="truncate text-[12px] text-app-subtle">
                          {new URL(tab.url).hostname.replace(/^www\./, "")}
                        </p>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div
                  class="flex flex-1 flex-col items-center justify-center px-8 text-center"
                >
                  <div
                    class="flex h-14 w-14 items-center justify-center rounded-2xl border border-app-border bg-app-surface text-app-subtle"
                  >
                    <Icon name="bookmarks" size={24} />
                  </div>
                  <h2
                    class="mt-4 text-[17px] font-semibold text-app-text-secondary"
                  >
                    {savedGroups.length === 0
                      ? "Save your first group"
                      : "Select a saved group"}
                  </h2>
                  <p
                    class="mt-2 max-w-md text-[14px] leading-relaxed text-app-muted"
                  >
                    {savedGroups.length === 0
                      ? "Pick an open browser group from the “Open in browser” list on the left and click Save."
                      : "Choose a group on the left to view its tabs, reopen it, or delete it."}
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {:else if view === "settings" && settings}
          <div class="mt-6 max-w-3xl">
            <div
              class="overflow-hidden rounded-2xl border border-app-border bg-app-surface"
            >
              <div class="flex h-[calc(100vh-190px)] min-h-[560px] flex-col">
                <SettingsView
                  {settings}
                  onSave={saveSettings}
                  onTest={testConnection}
                />
              </div>
            </div>
            <p class="mt-3 text-[12px] leading-relaxed text-app-subtle">
              Organization methods and auto-apply live in the toolbar popup. The
              dashboard only reads and manages tabs locally.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if toast}
    <div
      class={`fixed right-6 bottom-5 z-50 flex max-w-md items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] shadow-2xl backdrop-blur ${
        toast.tone === "error"
          ? "border-red-400/20 bg-red-950/90 text-red-100"
          : "border-emerald-400/20 bg-emerald-950/90 text-emerald-100"
      }`}
    >
      <Icon name={toast.tone === "error" ? "alert" : "check"} size={12} />
      {toast.message}
    </div>
  {/if}

  <ConfirmDialog
    open={confirmState !== null}
    title={confirmState?.title ?? ""}
    description={confirmState?.description ?? ""}
    details={confirmState?.details}
    confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
    tone={confirmState?.tone ?? "default"}
    {busy}
    onConfirm={runConfirm}
    onCancel={() => {
      if (!busy) confirmState = null;
    }}
  />
{/if}
