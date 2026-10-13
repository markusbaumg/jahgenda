/* Entry of the Vite build (index.html → src/main.js). The styles: src/styles/index.css lists every
 * stylesheet in cascade order (tokens, base, one file per part of the page, motion and preferences). */
import "./styles/index.css";
import { mount } from "svelte";
// The language first (story #48): the locale is picked before the first render.
import "./i18n/i18n.svelte.js";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app") });
