import { mount } from "svelte";
import App from "./App.svelte";
import "@/assets/app.css";
import { initTheme } from "@/lib/theme";

initTheme();

const target = document.getElementById("app");
if (!target) throw new Error("Popup root element is missing.");

const app = mount(App, { target });

export default app;
