import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icon");
mkdirSync(outDir, { recursive: true });

const SPARKLES = [
  "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z",
  "M20 3v4",
  "M22 5h-4",
  "M4 17v2",
  "M5 18H3",
];

const STATUS_COLORS = {
  green: "#34c759",
  amber: "#ff9f0a",
  red: "#ff453a",
};

function iconSvg(size, status = null) {
  const dot = status
    ? `<circle cx="18.6" cy="18.6" r="5.2" fill="#ffffff"/>
       <circle cx="18.6" cy="18.6" r="4.25" fill="${STATUS_COLORS[status]}"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#379cff"/>
        <stop offset="1" stop-color="#0a64f0"/>
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="5.2" fill="url(#background)"/>
    <g fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      ${SPARKLES.map((path) => `<path d="${path}"/>`).join("\n")}
    </g>
    ${dot}
  </svg>`;
}

function render(size, status = null) {
  const resvg = new Resvg(iconSvg(size, status), {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}

for (const size of [16, 32, 48, 128]) {
  const file = join(outDir, `${size}.png`);
  writeFileSync(file, render(size));
  console.log(`Generated ${file}`);
}

for (const status of Object.keys(STATUS_COLORS)) {
  for (const size of [16, 32, 48, 128]) {
    const file = join(outDir, `status-${status}-${size}.png`);
    writeFileSync(file, render(size, status));
    console.log(`Generated ${file}`);
  }
}
