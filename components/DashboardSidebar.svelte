<script lang="ts">
  import Icon from "./Icon.svelte";

  type View = "home" | "tabs" | "saved" | "settings";

  let {
    view,
    tabCount,
    savedCount,
    onNavigate,
    onOpenOrganizer,
  }: {
    view: View;
    tabCount: number;
    savedCount: number;
    onNavigate: (view: View) => void;
    onOpenOrganizer: () => void;
  } = $props();

  const nav = [
    { id: "home" as const, label: "Home", icon: "home" as const },
    { id: "tabs" as const, label: "Tab Observer", icon: "tabs" as const },
    { id: "saved" as const, label: "Saved Groups", icon: "bookmarks" as const },
    { id: "settings" as const, label: "Settings", icon: "settings" as const },
  ];
</script>

<aside
  class="fixed inset-y-0 left-0 z-20 flex w-[250px] flex-col border-r border-app-border bg-app-elevated backdrop-blur"
>
  <div class="flex items-center gap-3 px-5 py-5">
    <div
      class="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg ring-1 shadow-blue-950/50 ring-app-border"
    >
      <Icon name="sparkles" size={18} />
    </div>
    <div class="min-w-0">
      <p class="text-[15px] leading-tight font-semibold tracking-tight">
        AI Tab Organizer
      </p>
      <p class="mt-0.5 text-[11px] tracking-[0.14em] text-app-subtle uppercase">
        Local dashboard
      </p>
    </div>
  </div>

  <nav class="mt-2 space-y-1 px-3" aria-label="Dashboard sections">
    {#each nav as item (item.id)}
      {@const active = view === item.id}
      <button
        type="button"
        onclick={() => onNavigate(item.id)}
        class={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${
          active
            ? "bg-blue-500/15 text-sky-200 ring-1 ring-sky-400/20 ring-inset"
            : "text-app-muted hover:bg-app-hover hover:text-app-text"
        }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon name={item.icon} size={15} />
        <span class="flex-1">{item.label}</span>
        {#if item.id === "tabs" && tabCount > 0}
          <span
            class="rounded-full bg-app-hover px-1.5 py-0.5 text-[11px] text-app-muted tabular-nums"
          >
            {tabCount}
          </span>
        {:else if item.id === "saved" && savedCount > 0}
          <span
            class="rounded-full bg-app-hover px-1.5 py-0.5 text-[11px] text-app-muted tabular-nums"
          >
            {savedCount}
          </span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="mt-4 px-3">
    <button
      type="button"
      onclick={onOpenOrganizer}
      class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-300 hover:to-blue-500"
    >
      <Icon name="sparkles" size={14} />
      Open organizer
    </button>
  </div>

  <div class="mt-auto p-4">
    <div class="rounded-xl border border-app-border bg-app-surface p-3">
      <div class="flex items-center gap-1.5 text-[12px] text-app-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
        Local-first
      </div>
      <p class="mt-1.5 text-[11px] leading-relaxed text-app-subtle">
        No account, sync, analytics, or backend. Only titles and hostnames go to
        your AI provider.
      </p>
    </div>
    <p class="mt-3 text-center text-[11px] text-app-subtle">
      AI Tab Organizer v0.1.0
    </p>
  </div>
</aside>
