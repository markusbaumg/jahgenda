/* Entry of the Mischpult, the owners' console (mischpult.html, the second Vite entry). It shares the global
 * tokens, the header lockup, the stripes and the footer bar with the agenda (src/styles/index.css, the same
 * cascade as the page) and adds its own small stylesheet. */
import "../styles/index.css";
import "./mischpult.css";
import { mount } from "svelte";
import Mischpult from "./Mischpult.svelte";

mount(Mischpult, { target: document.getElementById("app") });
