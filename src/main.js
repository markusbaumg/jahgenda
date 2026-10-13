/* Entry of the Vite build (index.html → src/main.js). The styles: src/styles/index.css lists every
 * stylesheet in cascade order (tokens, base, one file per part of the page, motion and preferences). */
import "./styles/index.css";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app") });
