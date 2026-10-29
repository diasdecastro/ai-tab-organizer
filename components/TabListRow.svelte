<script lang="ts">
  import Favicon from "./Favicon.svelte";
  import Icon from "./Icon.svelte";
  import { relativeTime } from "@/lib/dashboard";
  import { TAB_GROUP_COLOR_HEX, type DashboardTab } from "@/lib/types";

  let {
    tab,
    selected,
    windowLabel,
    busy,
    onToggle,
    onClose,
  }: {
    tab: DashboardTab;
    selected: boolean;
    windowLabel: string;
    busy: boolean;
    onToggle: () => void;
    onClose: () => void;
  } = $props();

  const selectable = $derived(!tab.pinned);
</script>

<div
  class={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
    selected
      ? "border-sky-400/25 bg-blue-500/[0.07]"
      : "border-transparent hover:border-app-border hover:bg-app-surface"
  }`}
>
  <input
    type="checkbox"
    checked={selected}
    disabled={!selectable}
    onchange={onToggle}
    class="h-3.5 w-3.5 shrink-0 accent-blue-500 disabled:opacity-30"
    aria-label={`Select ${tab.title}`}
  />

  <Favicon url={tab.faviconUrl} hostname={tab.hostname} size={17} />

  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <p class="truncate text-[13px] font-medium text-app-text">{tab.title}</p>
      {#if tab.pinned}
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/90"
        >
          <Icon name="pin" size={8} />
          Pinned
        </span>
      {/if}
    </div>
    <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-app-subtle">
      <span class="truncate"
        >{tab.hostname.replace(/^www\./, "") || "Browser page"}</span
      >
      <span class="text-app-subtle">·</span>
      <span class="shrink-0">{windowLabel}</span>
      <span class="text-app-subtle">·</span>
      <span class="shrink-0">{relativeTime(tab.lastAccessed)}</span>
    </div>
  </div>

  {#if tab.groupId !== -1}
    <span
      class="hidden max-w-[160px] items-center gap-1.5 rounded-full bg-app-hover px-2 py-0.5 text-[11px] font-medium text-app-muted sm:flex"
    >
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full"
        style={`background:${TAB_GROUP_COLOR_HEX[tab.groupColor ?? "grey"]}`}
      ></span>
      <span class="truncate">{tab.groupName ?? "Group"}</span>
    </span>
  {/if}

  <button
    type="button"
    onclick={onClose}
    disabled={busy || tab.pinned}
    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-app-subtle transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
    aria-label={`Close ${tab.title}`}
    title={tab.pinned ? "Pinned tabs are never closed here" : "Close tab"}
  >
    <Icon name="x" size={13} />
  </button>
</div>
