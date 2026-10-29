<script lang="ts">
  import {
    LOOSE_RED_MIN,
    LOOSE_GREEN_MAX,
    OVERLOAD_ARC_AMBER_END,
    OVERLOAD_ARC_GREEN_END,
    OVERLOAD_GAUGE_MAX,
    overloadArcRatio,
    overloadInfo,
  } from "@/lib/overload";

  let {
    loose,
    max = OVERLOAD_GAUGE_MAX,
  }: {
    loose: number;
    max?: number;
  } = $props();

  const info = $derived(overloadInfo(loose));
  const ratio = $derived(overloadArcRatio(loose, max));
  const needleAngle = $derived(-90 + ratio * 180);
  const toneClass = $derived(
    info.zone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : info.zone === "amber"
        ? "text-amber-600 dark:text-amber-300"
        : "text-red-600 dark:text-red-400",
  );

  function arcPoint(pointRatio: number): { x: number; y: number } {
    const clamped = Math.min(1, Math.max(0, pointRatio));
    const angle = Math.PI * (1 - clamped);
    return {
      x: 110 + 88 * Math.cos(angle),
      y: 110 - 88 * Math.sin(angle),
    };
  }

  /** Horizontal gradient offset (0–100) matching an arc position. */
  function gradientOffset(pointRatio: number): number {
    return ((arcPoint(pointRatio).x - 22) / 176) * 100;
  }

  const amberStop = $derived(gradientOffset(OVERLOAD_ARC_GREEN_END));
  const redStop = $derived(gradientOffset(OVERLOAD_ARC_AMBER_END));

  const breakpoints = $derived([
    {
      tabs: LOOSE_GREEN_MAX,
      ...arcPoint(overloadArcRatio(LOOSE_GREEN_MAX, max)),
      message: "Around here is where most people start feeling overwhelmed.",
    },
    {
      tabs: LOOSE_RED_MIN,
      ...arcPoint(overloadArcRatio(LOOSE_RED_MIN, max)),
      message: "By here, most people are already feeling it.",
    },
  ]);
</script>

<div class="mx-auto w-full max-w-75">
  <div class="relative w-full" style="aspect-ratio: 220 / 140;">
    <svg
      viewBox="0 0 220 140"
      class="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="overload-arc-gradient"
          gradientUnits="userSpaceOnUse"
          x1="22"
          y1="110"
          x2="198"
          y2="110"
        >
          <stop offset="0%" stop-color="#17c964" />
          <stop offset={`${amberStop * 0.74}%`} stop-color="#34c759" />
          <stop offset={`${amberStop}%`} stop-color="#8ee04a" />
          <stop offset={`${amberStop + 8}%`} stop-color="#ffd60a" />
          <stop offset={`${redStop * 0.92}%`} stop-color="#ff9f0a" />
          <stop offset={`${redStop}%`} stop-color="#ff7a1f" />
          <stop
            offset={`${Math.min(100, redStop + 7)}%`}
            stop-color="#ff453a"
          />
          <stop offset="100%" stop-color="#ff2d20" />
        </linearGradient>
        <filter
          id="overload-neon-glow"
          x="-30%"
          y="-60%"
          width="160%"
          height="220%"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur stdDeviation="4" result="overload-blur" />
          <feMerge>
            <feMergeNode in="overload-blur" />
            <feMergeNode in="overload-blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 22 110 A 88 88 0 0 1 198 110"
        fill="none"
        stroke="var(--app-border-strong)"
        stroke-width="14"
        stroke-linecap="round"
      />
      <path
        d="M 22 110 A 88 88 0 0 1 198 110"
        fill="none"
        stroke="url(#overload-arc-gradient)"
        stroke-width="14"
        stroke-linecap="round"
        filter="url(#overload-neon-glow)"
      />

      <g transform={`rotate(${needleAngle} 110 110)`}>
        <line
          x1="110"
          y1="110"
          x2="110"
          y2="38"
          stroke="var(--app-text)"
          stroke-width="5"
          stroke-linecap="round"
        />
      </g>
      <circle
        cx="110"
        cy="110"
        r="8"
        fill="var(--app-surface-strong)"
        stroke="var(--app-text)"
        stroke-width="3"
      />
    </svg>

    {#each breakpoints as point (point.tabs)}
      <div
        class="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
        style={`left:${(point.x / 220) * 100}%;top:${(point.y / 140) * 100}%;`}
      >
        <button
          type="button"
          aria-label={`${point.tabs} loose tabs: ${point.message}`}
          class="block h-3.5 w-3.5 cursor-help rounded-full border-[3px] border-app-surface-strong bg-app-text shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        ></button>
        <div
          class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-60 -translate-x-1/2 rounded-xl border border-app-border bg-app-surface-strong px-3 py-2.5 text-left text-[12px] leading-relaxed text-app-text shadow-2xl group-hover:block group-focus-visible:block"
          role="tooltip"
        >
          <strong>{point.tabs} tabs</strong> — {point.message}
          <span
            class="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-r border-b border-app-border bg-app-surface-strong"
          ></span>
        </div>
      </div>
    {/each}
  </div>

  <div class="-mt-7 text-center">
    <p class={`text-[44px] leading-none font-semibold ${toneClass}`}>{loose}</p>
    <p
      class="mt-1 text-[10px] font-semibold tracking-[0.16em] text-app-subtle uppercase"
    >
      Loose tabs
    </p>
    <p class="mt-1 text-[12px] text-app-muted">{info.status}</p>
  </div>
</div>
