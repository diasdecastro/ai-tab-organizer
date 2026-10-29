<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Icon from "@/components/Icon.svelte";
  import Spinner from "@/components/Spinner.svelte";
  import SettingsView from "@/components/SettingsView.svelte";
  import MethodPicker from "@/components/MethodPicker.svelte";
  import ConfirmDialog from "@/components/ConfirmDialog.svelte";
  import LooseBadge from "@/components/LooseBadge.svelte";
  import { ORGANIZATION_METHODS } from "@/lib/methods";
  import { PROVIDERS } from "@/lib/settings";
  import {
    errorMessage,
    getActiveWindowId,
    openDashboardTab,
    sendRequest,
  } from "@/lib/messaging";
  import {
    getTheme,
    onThemeStorageChange,
    toggleTheme,
    type Theme,
  } from "@/lib/theme";
  import { TAB_GROUP_COLOR_HEX } from "@/lib/types";
  import type {
    AppSettings,
    JobState,
    OrganizationMethod,
    PopupState,
    ProviderId,
    TestConnectionResult,
  } from "@/lib/types";

  const IDLE_JOB: JobState = { status: "idle" };

  let windowId = $state<number | null>(null);
  let popup = $state<PopupState | null>(null);
  let view = $state<"tabs" | "settings">("tabs");
  let initialLoading = $state(true);
  let initialError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let busy = $state(false);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmMode = $state<"merge" | "ungroup" | null>(null);
  let theme = $state<Theme>(getTheme());

  const job = $derived.by(() => {
    const current = popup?.job ?? IDLE_JOB;
    if (
      current.status === "applied" &&
      windowId !== null &&
      current.proposal.windowId !== windowId
    ) {
      return IDLE_JOB;
    }
    return current;
  });
  const activeProviderDef = $derived(
    popup ? PROVIDERS[popup.settings.activeProvider] : PROVIDERS.openrouter,
  );
  const activeCredentials = $derived(
    popup ? popup.settings.providers[popup.settings.activeProvider] : null,
  );
  const hasKey = $derived(Boolean(activeCredentials?.apiKey.trim()));
  const method = $derived(popup?.settings.defaultMethod ?? "category");
  const methodDef = $derived(ORGANIZATION_METHODS[method]);
  const methodNeedsKey = $derived(methodDef.requiresAi && !hasKey);
  const canOrganize = $derived(
    Boolean(popup && popup.snapshot.stats.eligible >= 2),
  );
  const looseTabs = $derived(
    popup
      ? popup.snapshot.tabs.filter((tab) => !tab.pinned && tab.groupId === -1)
          .length
      : 0,
  );
  const undoForWindow = $derived(
    popup?.undo && windowId !== null && popup.undo.windowId === windowId
      ? popup.undo
      : null,
  );
  const confirmTitle = $derived(
    confirmMode === "merge"
      ? "Merge windows?"
      : confirmMode === "ungroup"
        ? "Ungroup every group?"
        : "",
  );
  const confirmDescription = $derived(
    confirmMode === "merge"
      ? "Move ungrouped, unpinned web tabs from every other window into this window. Existing groups and pinned tabs stay where they are."
      : "Remove every tab in this window from its native group. Pinned tabs are skipped. The groups will disappear.",
  );
  const confirmDetails = $derived(
    confirmMode === "merge"
      ? "Empty windows created by the merge are closed. AI is not called."
      : "This action cannot be undone by the extension.",
  );
  type PopupTool = {
    id: string;
    label: string;
    icon: "trash" | "fold" | "search" | "bookmarks" | "merge";
    disabled: boolean;
    action: () => void;
  };
  const tools = $derived<PopupTool[]>([
    {
      id: "ungroup",
      label: "Ungroup all",
      icon: "trash",
      disabled: busy || popup?.snapshot.stats.grouped === 0,
      action: () => {
        confirmMode = "ungroup";
      },
    },
    {
      id: "toggle",
      label: "Toggle groups",
      icon: "fold",
      disabled: busy || popup?.snapshot.stats.grouped === 0,
      action: () => {
        void toggleGroupsCollapsed();
      },
    },
    {
      id: "search",
      label: "Search tabs",
      icon: "search",
      disabled: false,
      action: () => {
        void openDashboard("#search");
      },
    },
    {
      id: "saved",
      label: "Saved groups",
      icon: "bookmarks",
      disabled: false,
      action: () => {
        void openDashboard("#saved");
      },
    },
    {
      id: "merge",
      label: "Merge windows",
      icon: "merge",
      disabled: busy,
      action: () => {
        confirmMode = "merge";
      },
    },
  ]);

  onMount(() => {
    void init();
    const stopThemeSync = onThemeStorageChange((next) => {
      theme = next;
    });

    const interval = setInterval(() => {
      const status = popup?.job.status;
      if (
        windowId !== null &&
        (status === "organizing" || status === "applying")
      ) {
        void refresh({ silent: true });
      }
    }, 1200);

    return () => {
      clearInterval(interval);
      stopThemeSync();
    };
  });

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  async function init(): Promise<void> {
    initialLoading = true;
    initialError = null;
    try {
      windowId = await getActiveWindowId();
      popup = await sendRequest({ type: "GET_STATE", windowId });
    } catch (error) {
      initialError = errorMessage(error);
    } finally {
      initialLoading = false;
    }
  }

  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (windowId === null) return;
    try {
      popup = await sendRequest({ type: "GET_STATE", windowId });
      if (!options.silent) actionError = null;
    } catch (error) {
      if (!options.silent) actionError = errorMessage(error);
    }
  }

  async function setMethod(next: OrganizationMethod): Promise<void> {
    if (!popup || popup.settings.defaultMethod === next) return;
    const previous = popup.settings.defaultMethod;
    popup.settings.defaultMethod = next;
    actionError = null;
    try {
      popup.settings = await sendRequest({ type: "SET_METHOD", method: next });
    } catch (error) {
      if (popup) popup.settings.defaultMethod = previous;
      actionError = errorMessage(error);
    }
  }

  async function organize(): Promise<void> {
    if (busy || windowId === null || !popup) return;
    if (methodNeedsKey) {
      openSettings();
      return;
    }
    busy = true;
    actionError = null;
    view = "tabs";
    popup.job = { status: "organizing", startedAt: Date.now() };

    try {
      const next = await sendRequest({ type: "ORGANIZE", windowId, method });
      popup = next;
      if (next.job.status === "applied") {
        showToast(
          `Grouped ${next.job.result.groupedTabCount} tabs into ${next.job.result.groups.length} ${
            next.job.result.groups.length === 1 ? "group" : "groups"
          }.`,
        );
      }
    } catch (error) {
      actionError = errorMessage(error);
      await refresh({ silent: true });
    } finally {
      busy = false;
    }
  }

  async function dismissJob(): Promise<void> {
    if (busy || windowId === null) return;
    busy = true;
    actionError = null;
    try {
      popup = await sendRequest({ type: "DISMISS", windowId });
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      busy = false;
    }
  }

  async function undoLast(): Promise<void> {
    if (busy || windowId === null) return;
    busy = true;
    actionError = null;
    try {
      const response = await sendRequest({ type: "UNDO", windowId });
      popup = response.state;
      showToast(
        response.result.ungroupedTabCount === 0
          ? "Nothing to undo — those tabs were closed or moved."
          : `Ungrouped ${response.result.ungroupedTabCount} tabs.`,
      );
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      busy = false;
    }
  }

  async function runConfirmed(): Promise<void> {
    if (busy || windowId === null || confirmMode === null) return;
    busy = true;
    actionError = null;
    const mode = confirmMode;
    try {
      if (mode === "merge") {
        const result = await sendRequest({
          type: "MERGE_WINDOWS",
          targetWindowId: windowId,
        });
        showToast(result.message);
      } else {
        const result = await sendRequest({ type: "UNGROUP_ALL", windowId });
        showToast(result.message);
      }
      confirmMode = null;
      await refresh({ silent: true });
    } catch (error) {
      confirmMode = null;
      actionError = errorMessage(error);
    } finally {
      busy = false;
    }
  }

  async function toggleGroupsCollapsed(): Promise<void> {
    if (busy || windowId === null) return;
    busy = true;
    actionError = null;
    try {
      const result = await sendRequest({
        type: "TOGGLE_GROUPS_COLLAPSED",
        windowId,
      });
      showToast(result.message);
      await refresh({ silent: true });
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      busy = false;
    }
  }

  async function saveSettings(next: AppSettings): Promise<AppSettings> {
    const saved = await sendRequest({ type: "SAVE_SETTINGS", settings: next });
    if (popup) popup.settings = saved;
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

  async function openDashboard(section = ""): Promise<void> {
    try {
      await openDashboardTab(section);
      window.close();
    } catch (error) {
      actionError = errorMessage(error);
    }
  }

  function showToast(message: string): void {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 3500);
  }

  function openSettings(): void {
    view = "settings";
    actionError = null;
  }

  function switchTheme(): void {
    theme = toggleTheme(theme);
  }
</script>

<div
  class="bg-app-glow relative flex h-[500px] w-[460px] flex-col overflow-hidden text-app-text"
>
  <header
    class="relative z-10 flex items-center gap-3 border-b border-app-border px-4 py-3"
  >
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg ring-1 shadow-blue-950/50 ring-app-border"
    >
      <Icon name="sparkles" size={17} />
    </div>
    <div class="min-w-0 flex-1">
      <h1 class="text-[15px] leading-tight font-semibold tracking-tight">
        AI Tab Organizer
      </h1>
      {#if popup}
        <button
          type="button"
          onclick={openSettings}
          class="mt-0.5 flex max-w-full items-center gap-1 text-[12px] text-app-muted transition hover:text-app-text-secondary"
          title={`${activeProviderDef.label} · ${activeCredentials?.model ?? "No model"} — change provider and model`}
        >
          <span class="truncate">
            {activeProviderDef.label}
            <span class="text-app-subtle">·</span>
            {activeCredentials?.model ?? "No model"}
          </span>
        </button>
      {:else}
        <p class="mt-0.5 text-[12px] text-app-muted">
          Local-first tab grouping
        </p>
      {/if}
    </div>
    {#if popup}
      <LooseBadge loose={looseTabs} />
    {/if}
    <button
      type="button"
      onclick={switchTheme}
      class="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-hover hover:text-app-text"
      aria-label={theme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
    </button>
    <button
      type="button"
      onclick={() => openDashboard()}
      class="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-hover hover:text-app-text"
      aria-label="Open dashboard"
      title="Open pinned dashboard"
    >
      <Icon name="grid" size={16} />
    </button>
    {#if view === "settings"}
      <button
        type="button"
        onclick={() => (view = "tabs")}
        class="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-hover hover:text-app-text"
        aria-label="Back to organizer"
        title="Back"
      >
        <Icon name="arrow-left" size={16} />
      </button>
    {:else}
      <button
        type="button"
        onclick={openSettings}
        class="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-hover hover:text-app-text"
        aria-label="Settings"
        title="Settings"
      >
        <Icon name="settings" size={16} />
      </button>
    {/if}
  </header>

  <main class="relative z-10 flex min-h-0 flex-1 flex-col">
    {#if actionError && view === "tabs"}
      <div
        class="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] leading-relaxed text-red-200/90"
      >
        <Icon name="alert" size={12} class="mt-0.5 shrink-0" />
        <span class="flex-1">{actionError}</span>
        <button
          type="button"
          onclick={() => (actionError = null)}
          class="shrink-0 text-red-300/60 transition hover:text-red-200"
          aria-label="Dismiss error"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
    {/if}

    {#if initialLoading}
      <div class="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner size={22} />
        <p class="text-[13px] text-app-muted">Reading your tabs…</p>
      </div>
    {:else if initialError}
      <div
        class="flex flex-1 flex-col items-center justify-center px-8 text-center"
      >
        <div
          class="flex h-11 w-11 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-300"
        >
          <Icon name="alert" size={20} />
        </div>
        <h2 class="mt-4 text-[16px] font-semibold">Popup could not connect</h2>
        <p class="mt-2 text-[13px] leading-relaxed text-app-muted">
          {initialError}
        </p>
        <button
          type="button"
          onclick={init}
          class="mt-5 inline-flex items-center gap-2 rounded-lg bg-app-hover px-4 py-2 text-[13px] font-medium text-app-text transition hover:bg-app-hover"
        >
          <Icon name="refresh" size={13} />
          Try again
        </button>
      </div>
    {:else if view === "settings" && popup}
      <SettingsView
        settings={popup.settings}
        onSave={saveSettings}
        onTest={testConnection}
      />
    {:else if !popup}
      <div class="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    {:else if job.status === "organizing" || job.status === "applying"}
      <div
        class="flex flex-1 flex-col items-center justify-center px-8 text-center"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-300"
        >
          <Spinner size={22} />
        </div>
        <h2 class="mt-4 text-[16px] font-semibold">
          {job.status === "organizing"
            ? methodDef.requiresAi
              ? "Organizing with AI"
              : "Building groups"
            : "Applying groups"}
        </h2>
        <p class="mt-1.5 text-[13px] text-app-muted">
          {#if job.status === "organizing" && methodDef.requiresAi}
            Sending {popup.snapshot.stats.eligible} titles and hostnames to
            {activeProviderDef.label}. Groups will be applied automatically.
          {:else if job.status === "organizing"}
            Sorting {popup.snapshot.stats.eligible} tabs by
            {methodDef.label.toLowerCase()}. No AI request.
          {:else}
            Creating native groups. They start collapsed.
          {/if}
        </p>
        <div
          class="mt-5 flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-[11px] text-app-muted"
        >
          <Icon
            name={methodDef.requiresAi ? "shield" : "bolt"}
            size={11}
            class="text-emerald-400/50"
          />
          {methodDef.requiresAi
            ? "No URLs, page content, cookies, or history."
            : "Nothing leaves this device."}
        </div>
      </div>
    {:else if job.status === "applied"}
      <section class="flex min-h-0 flex-1 flex-col">
        <div class="px-4 pt-5 pb-3">
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
            >
              <Icon name="check" size={16} />
            </span>
            <div>
              <h2 class="text-[16px] font-semibold">Groups created</h2>
              <p class="text-[12px] text-app-muted">
                {ORGANIZATION_METHODS[job.proposal.method].label} · {job.result
                  .groupedTabCount} tabs in {job.result.groups.length}
                {job.result.groups.length === 1 ? "group" : "groups"} · start collapsed
              </p>
            </div>
          </div>

          {#if job.result.skippedTabCount > 0}
            <p
              class="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[12px] leading-relaxed text-amber-200/80"
            >
              {job.result.skippedTabCount} tabs were skipped because they closed or
              changed while applying.
            </p>
          {/if}
        </div>

        <div
          class="scroll-area min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-3"
        >
          {#each job.result.groups as group (group.groupId)}
            <div
              class="flex items-center gap-2.5 rounded-lg border border-app-border bg-app-surface px-3 py-2"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
              ></span>
              <span
                class="min-w-0 flex-1 truncate text-[13px] text-app-text-secondary"
              >
                {group.name}
              </span>
              <span class="text-[11px] text-app-muted tabular-nums">
                {group.tabIds.length}
              </span>
            </div>
          {/each}
        </div>

        <div class="border-t border-app-border bg-app-bg px-4 pt-3 pb-4">
          <div class="flex gap-2">
            <button
              type="button"
              onclick={undoLast}
              disabled={busy || !undoForWindow}
              class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-app-border-strong bg-app-surface px-3 py-2.5 text-[13px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-30"
              aria-label={undoForWindow
                ? "Undo last grouping"
                : "Nothing to undo"}
              title={undoForWindow ? "Undo last grouping" : "Nothing to undo"}
            >
              <Icon name="undo" size={13} />
              Undo
            </button>
            <button
              type="button"
              onclick={dismissJob}
              disabled={busy}
              class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:from-sky-300 hover:to-blue-500 disabled:opacity-60"
            >
              <Icon name="check" size={13} />
              Done
            </button>
          </div>
          {#if undoForWindow}
            <p class="mt-2 text-center text-[11px] text-app-subtle">
              Undo stays available until the browser restarts or a new grouping
              is applied.
            </p>
          {/if}
        </div>
      </section>
    {:else if job.status === "error"}
      <div
        class="flex flex-1 flex-col items-center justify-center px-7 text-center"
      >
        <div
          class="flex h-11 w-11 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-300"
        >
          <Icon name="alert" size={20} />
        </div>
        <h2 class="mt-4 text-[16px] font-semibold">
          {job.phase === "apply" ? "Grouping failed" : "Could not organize"}
        </h2>
        <p
          class="mt-2 max-w-[300px] text-[13px] leading-relaxed text-app-muted"
        >
          {job.message}
        </p>
        <div class="mt-5 flex w-full max-w-[300px] gap-2">
          <button
            type="button"
            onclick={dismissJob}
            disabled={busy}
            class="rounded-lg border border-app-border-strong bg-app-surface px-3 py-2.5 text-[13px] font-medium text-app-text-secondary transition hover:bg-app-hover disabled:opacity-50"
          >
            Dismiss
          </button>
          {#if methodNeedsKey}
            <button
              type="button"
              onclick={openSettings}
              class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:from-sky-300 hover:to-blue-500"
            >
              <Icon name="key" size={13} />
              Open settings
            </button>
          {:else}
            <button
              type="button"
              onclick={organize}
              disabled={busy}
              class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:from-sky-300 hover:to-blue-500 disabled:opacity-60"
            >
              <Icon name="refresh" size={13} />
              Try again
            </button>
          {/if}
        </div>
        <button
          type="button"
          onclick={openSettings}
          class="mt-3 text-[12px] text-app-muted transition hover:text-app-text-secondary"
        >
          Check provider settings
        </button>
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <section
          class="rounded-2xl border border-app-border bg-app-surface px-4 py-5"
        >
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon name="layers" size={15} class="text-sky-300" />
              <h2
                class="text-[13px] font-semibold tracking-[0.12em] text-app-muted uppercase"
              >
                Organization Method
              </h2>
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
          <MethodPicker value={method} onSelect={setMethod} compact />
        </section>

        <section
          class="rounded-2xl border border-app-border bg-app-surface px-4 py-5"
        >
          <div class="flex gap-2">
            {#if methodNeedsKey}
              <button
                type="button"
                onclick={openSettings}
                class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-3 text-[15px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-300 hover:to-blue-500"
              >
                <Icon name="key" size={15} />
                Add {activeProviderDef.label} API key
              </button>
            {:else if !canOrganize}
              <div
                class="flex flex-1 items-center justify-center rounded-xl border border-app-border bg-app-surface px-3 py-3 text-center text-[13px] text-app-muted"
              >
                {popup.snapshot.stats.total === 0
                  ? "No tabs in this window."
                  : "No ungrouped tabs left to organize."}
              </div>
            {:else}
              <button
                type="button"
                onclick={organize}
                disabled={busy}
                title={`Organize tabs by ${methodDef.label}`}
                class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-3 text-[15px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-300 hover:to-blue-500 disabled:opacity-60"
              >
                <Icon name={methodDef.icon} size={16} />
                Organize by {methodDef.label}
              </button>
            {/if}
            <button
              type="button"
              onclick={undoLast}
              disabled={busy || !undoForWindow}
              class="flex w-[46px] shrink-0 items-center justify-center rounded-xl border border-app-border-strong bg-app-hover text-app-muted transition hover:bg-app-hover hover:text-app-text disabled:opacity-30"
              aria-label={undoForWindow
                ? "Undo last grouping"
                : "Nothing to undo"}
              title={undoForWindow ? "Undo last grouping" : "Nothing to undo"}
            >
              <Icon name="undo" size={17} />
            </button>
          </div>
        </section>

        <section
          class="rounded-2xl border border-app-border bg-app-surface px-4 py-5"
        >
          <h2
            class="text-center text-[14px] font-semibold text-app-text-secondary"
          >
            Tab Management Tools
          </h2>
          <div class="mt-2.5 flex justify-evenly gap-2">
            {#each tools as tool (tool.id)}
              <div class="group relative">
                <button
                  type="button"
                  onclick={tool.action}
                  disabled={tool.disabled}
                  aria-label={tool.label}
                  class="flex h-12 w-12 items-center justify-center rounded-xl border border-app-border bg-app-surface text-app-muted transition hover:bg-app-hover hover:text-app-text disabled:opacity-35"
                >
                  <Icon name={tool.icon} size={19} />
                </button>
                <div
                  class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 rounded-lg border border-app-border bg-app-surface-strong px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-app-text shadow-xl group-hover:block group-focus-visible:block"
                  role="tooltip"
                >
                  {tool.label}
                </div>
              </div>
            {/each}
          </div>
        </section>
      </div>
    {/if}
  </main>

  {#if toast}
    <div
      class="pointer-events-none absolute top-20 left-1/2 z-30 flex max-w-[360px] -translate-x-1/2 animate-rise items-center gap-1.5 rounded-full border border-app-border-strong bg-app-elevated px-3.5 py-2 text-[12px] text-app-text shadow-xl backdrop-blur"
    >
      <Icon name="check" size={11} class="text-emerald-400" />
      {toast}
    </div>
  {/if}

  <ConfirmDialog
    open={confirmMode !== null}
    title={confirmTitle}
    description={confirmDescription}
    details={confirmDetails}
    confirmLabel={confirmMode === "ungroup" ? "Ungroup all" : "Merge tabs"}
    tone={confirmMode === "ungroup" ? "danger" : "default"}
    {busy}
    onConfirm={runConfirmed}
    onCancel={() => (confirmMode = null)}
  />
</div>
