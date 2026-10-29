<script lang="ts">
  import Icon from "./Icon.svelte";
  import { ORGANIZATION_METHOD_IDS, ORGANIZATION_METHODS } from "@/lib/methods";
  import type { OrganizationMethod } from "@/lib/types";

  let {
    value,
    onSelect,
    compact = false,
  }: {
    value: OrganizationMethod;
    onSelect: (method: OrganizationMethod) => void;
    compact?: boolean;
  } = $props();

  function alignClass(index: number): string {
    if (index === 0) return "left-0";
    if (index === ORGANIZATION_METHOD_IDS.length - 1) return "right-0";
    return "left-1/2 -translate-x-1/2";
  }

  function arrowClass(index: number): string {
    if (index === 0) return "left-7";
    if (index === ORGANIZATION_METHOD_IDS.length - 1) return "right-7";
    return "left-1/2 -translate-x-1/2";
  }
</script>

<div
  class={`grid grid-cols-4 ${compact ? "gap-1.5" : "gap-2"}`}
  role="group"
  aria-label="Organization method"
>
  {#each ORGANIZATION_METHOD_IDS as methodId, index (methodId)}
    {@const method = ORGANIZATION_METHODS[methodId]}
    {@const selected = value === methodId}
    <div class="group relative">
      <button
        type="button"
        onclick={() => onSelect(methodId)}
        aria-pressed={selected}
        class={`flex w-full flex-col items-center justify-center rounded-xl border transition ${
          compact ? "h-[72px] gap-1.5 px-1.5" : "h-[88px] gap-2 px-2"
        } ${
          selected
            ? "border-sky-400/60 bg-gradient-to-b from-sky-500/25 to-blue-500/10 text-sky-100 shadow-[0_0_20px_rgba(10,132,255,0.15)] dark:text-sky-100"
            : "border-app-border bg-app-surface text-app-text-secondary hover:border-app-border-strong hover:bg-app-hover hover:text-app-text"
        }`}
      >
        <Icon
          name={method.icon}
          size={compact ? 16 : 18}
          class={selected ? "text-sky-500 dark:text-sky-300" : "text-app-muted"}
        />
        <span class={`${compact ? "text-[11px]" : "text-[12px]"} font-medium`}>
          {method.shortLabel}
        </span>
      </button>

      <div
        class={`pointer-events-none absolute top-full z-50 mt-2 hidden w-[252px] ${alignClass(index)} group-hover:block group-focus-visible:block`}
        role="tooltip"
      >
        <div
          class="relative rounded-2xl border border-app-border bg-app-surface-strong p-3.5 text-left shadow-2xl"
        >
          <div
            class={`absolute -top-1 h-2 w-2 rotate-45 border-t border-l border-app-border bg-app-surface-strong ${arrowClass(index)}`}
          ></div>
          <p class="text-[15px] font-semibold text-app-text">
            By {method.label}
          </p>
          <p
            class="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-sky-600 dark:text-sky-300"
          >
            <span class="text-[9px]">▶</span>
            What it does
          </p>
          <p class="mt-1 text-[12px] leading-relaxed text-app-muted">
            {method.description}
          </p>
        </div>
      </div>
    </div>
  {/each}
</div>
