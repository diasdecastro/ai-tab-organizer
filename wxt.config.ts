import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "AI Tab Organizer",
    description:
      "Group open tabs into tidy categories with your own AI provider. No account, no backend, no tracking.",
    version: "0.1.0",
    permissions: ["tabs", "tabGroups", "storage"],
    host_permissions: ["https://openrouter.ai/*", "https://api.deepseek.com/*"],
    minimum_chrome_version: "121",
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    action: {
      default_title: "AI Tab Organizer",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
