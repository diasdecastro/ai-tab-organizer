<script lang="ts">
  type IconName =
    | "sparkles"
    | "settings"
    | "arrow-left"
    | "chevron-down"
    | "chevron-right"
    | "pin"
    | "undo"
    | "check"
    | "x"
    | "alert"
    | "eye"
    | "eye-off"
    | "refresh"
    | "layers"
    | "external"
    | "tabs"
    | "key"
    | "shield"
    | "bolt"
    | "folder"
    | "clock"
    | "target"
    | "sort"
    | "home"
    | "bookmarks"
    | "search"
    | "trash"
    | "move"
    | "pencil"
    | "merge"
    | "arrow-right"
    | "grid"
    | "chevron-up"
    | "ungroup"
    | "chevrons"
    | "sun"
    | "moon"
    | "fold"
    | "check-square"
    | "monitor"
    | "arrow-up-down";

  let {
    name,
    size = 16,
    strokeWidth = 1.8,
    class: className = "",
  }: {
    name: IconName;
    size?: number;
    strokeWidth?: number;
    class?: string;
  } = $props();

  const icons: Record<IconName, string[]> = {
    sparkles: [
      "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z",
      "M20 3v4",
      "M22 5h-4",
      "M4 17v2",
      "M5 18H3",
    ],
    settings: [
      "M4 21v-7",
      "M4 10V3",
      "M12 21v-9",
      "M12 8V3",
      "M20 21v-5",
      "M20 12V3",
      "M1 14h6",
      "M9 8h6",
      "M17 16h6",
    ],
    "arrow-left": ["m12 19-7-7 7-7", "M19 12H5"],
    "chevron-down": ["m6 9 6 6 6-6"],
    "chevron-right": ["m9 18 6-6-6-6"],
    pin: [
      "M12 17v5",
      "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z",
    ],
    undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
    check: ["M20 6 9 17l-5-5"],
    x: ["M18 6 6 18", "m6 6 12 12"],
    alert: [
      "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      "M12 9v4",
      "M12 17h.01",
    ],
    eye: [
      "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0",
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
    ],
    "eye-off": [
      "m2 2 20 20",
      "M6.71 6.7C3.9 8.3 2 12 2 12a10.75 10.75 0 0 0 19.88 0 10.7 10.7 0 0 0-4.59-5.3",
      "M9.88 9.88a3 3 0 1 0 4.24 4.24",
    ],
    refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
    layers: [
      "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
      "m22 12.18-9.17 4.16a2 2 0 0 1-1.66 0L2 12.18",
      "m22 17.18-9.17 4.16a2 2 0 0 1-1.66 0L2 17.18",
    ],
    external: [
      "M15 3h6v6",
      "M10 14 21 3",
      "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    ],
    tabs: [
      "M15 3H5a2 2 0 0 0-2 2v10",
      "M9 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
    ],
    key: [
      "m11 12 9-9",
      "m18 5 2 2",
      "m16 7 2 2",
      "M8 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    ],
    shield: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
    bolt: [
      "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
    ],
    folder: [
      "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
    ],
    clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20", "M12 6v6l4 2"],
    target: [
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
      "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12",
      "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
    ],
    sort: ["m3 8 4-4 4 4", "M7 4v16", "m21 16-4 4-4-4", "M17 20V4"],
    home: ["m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
    bookmarks: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"],
    search: ["m21 21-4.34-4.34", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
    trash: [
      "M3 6h18",
      "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
      "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
      "M10 11v6",
      "M14 11v6",
    ],
    move: [
      "M5 9l-3 3 3 3",
      "M9 5l3-3 3 3",
      "M15 19l-3 3-3-3",
      "M19 9l3 3-3 3",
      "M2 12h20",
      "M12 2v20",
    ],
    pencil: ["M21.17 6.83a2.83 2.83 0 0 0-4-4L3 17v4h4z", "m15 5 4 4"],
    merge: [
      "m8 6 4-4 4 4",
      "M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22",
      "m20 22-5-5",
    ],
    "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
    grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
    "chevron-up": ["m18 15-6-6-6 6"],
    ungroup: ["M8 8h12v12H8z", "M4 16V4h12", "m3 3 18 18"],
    chevrons: ["m7 15 5 5 5-5", "m7 9 5-5 5 5"],
    sun: [
      "M12 2v2",
      "M12 20v2",
      "m4.93 4.93 1.41 1.41",
      "m17.66 17.66 1.41 1.41",
      "M2 12h2",
      "M20 12h2",
      "m6.34 17.66-1.41 1.41",
      "m19.07 4.93-1.41 1.41",
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    ],
    moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
    fold: [
      "M12 22v-6",
      "M12 8V2",
      "M4 12H2",
      "M10 12H8",
      "M16 12h-2",
      "M22 12h-2",
      "m15 19-3-3-3 3",
      "m15 5-3 3-3-3",
    ],
    "check-square": [
      "M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5",
      "m9 11 3 3L22 4",
    ],
    monitor: [
      "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      "M8 21h8",
      "M12 17v4",
    ],
    "arrow-up-down": ["m21 16-4 4-4-4", "M17 20V4", "m3 8 4-4 4 4", "M7 4v16"],
  };
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
  focusable="false"
>
  {#each icons[name] as path}
    <path d={path} />
  {/each}
</svg>
