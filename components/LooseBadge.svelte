<script lang="ts">
  import { OVERLOAD_GAUGE_MAX, overloadInfo } from "@/lib/overload";

  let {
    loose,
  }: {
    loose: number;
  } = $props();

  const info = $derived(overloadInfo(loose));
  const arcPercent = $derived(
    Math.min(100, Math.max(0, (loose / OVERLOAD_GAUGE_MAX) * 100)),
  );
  const toneClass = $derived(
    info.zone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : info.zone === "amber"
        ? "text-amber-600 dark:text-amber-300"
        : "text-red-600 dark:text-red-400",
  );
</script>

<div
  class="flex h-8 items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-2"
  title={`${loose} loose tab${loose === 1 ? "" : "s"}`}
  aria-label={`${loose} loose tabs`}
>
  <svg viewBox="0 0 24 15" class="h-[15px] w-[24px]" aria-hidden="true">
    <path
      d="M 2 13 A 10 10 0 0 1 22 13"
      fill="none"
      stroke="var(--app-border-strong)"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M 2 13 A 10 10 0 0 1 22 13"
      fill="none"
      stroke={info.hex}
      stroke-width="3"
      stroke-linecap="round"
      pathLength="100"
      stroke-dasharray={`${arcPercent} 100`}
    />
  </svg>
  <span class={`text-[13px] font-semibold tabular-nums ${toneClass}`}>
    {loose}
  </span>
</div>
