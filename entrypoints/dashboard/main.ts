import { mount } from "svelte";
import Dashboard from "./Dashboard.svelte";
import "@/assets/app.css";
import { initTheme } from "@/lib/theme";

initTheme();

const target = document.getElementById("app");
if (!target) throw new Error("Dashboard root element is missing.");

const app = mount(Dashboard, { target });

export default app;
