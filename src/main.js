/* Entry of the Vite build (index.html → src/main.js). The global stylesheet is still the one style.css
 * for now (story #33, M0); it is split per component in the later stories. */
import "../style.css";
import { mount } from "svelte";
// The language first (story #48): the locale is picked before the first render.
import "./i18n/i18n.svelte.js";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app") });
