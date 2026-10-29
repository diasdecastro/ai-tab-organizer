<script lang="ts">
  import Favicon from "./Favicon.svelte";
  import Icon from "./Icon.svelte";
  import { TAB_GROUP_COLOR_HEX, type SavedGroup } from "@/lib/types";

  let {
    group,
    busy,
    compact = false,
    onOpen,
    onDelete,
  }: {
    group: SavedGroup;
    busy: boolean;
    compact?: boolean;
    onOpen: () => void;
    onDelete: () => void;
  } = $props();

  const visibleTabs = $derived(
    compact ? group.tabs.slice(0, 3) : group.tabs.slice(0, 6),
  );
</script>

<div class="rounded-xl border border-app-border bg-app-surface p-3">
  <div class="flex items-start gap-2.5">
    <span
      class="mt-1 h-2 w-2 shrink-0 rounded-full"
      style={`background:${TAB_GROUP_COLOR_HEX[group.color]}`}
    ></span>
    <div class="min-w-0 flex-1">
      <p class="truncate text-[13px] font-medium text-app-text">{group.name}</p>
      <p class="mt-0.5 text-[11px] text-app-subtle">
        {group.tabs.length} tabs · saved
        {new Date(group.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
      </p>
    </div>
    <button
      type="button"
      onclick={onOpen}
      disabled={busy}
      class="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-1 text-[11px] font-medium text-sky-200 transition hover:bg-blue-500/25 disabled:opacity-50"
      title="Open this saved group in the current window"
    >
      <Icon name="arrow-right" size={10} />
      Open
    </button>
    <button
      type="button"
      onclick={onDelete}
      disabled={busy}
      class="flex h-6 w-6 items-center justify-center rounded-md text-app-subtle transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      aria-label={`Delete saved group ${group.name}`}
      title="Delete saved group"
    >
      <Icon name="trash" size={12} />
    </button>
  </div>

  <div class="mt-2 space-y-0.5">
    {#each visibleTabs as tab, index (index)}
      <div class="flex items-center gap-2 rounded-md px-1 py-1">
        <Favicon
          url={tab.faviconUrl}
          hostname={new URL(tab.url).hostname}
          size={13}
        />
        <span class="min-w-0 flex-1 truncate text-[12px] text-app-muted"
          >{tab.title}</span
        >
      </div>
    {/each}
    {#if group.tabs.length > visibleTabs.length}
      <p class="px-1 pt-1 text-[11px] text-app-subtle">
        +{group.tabs.length - visibleTabs.length} more
      </p>
    {/if}
  </div>
</div>
