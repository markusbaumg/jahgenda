/* Entry of the Mischpult, the owners' console (mischpult.html, the second Vite entry). It shares the global
 * tokens, the header lockup and the stripes with the agenda (style.css) and adds its own small stylesheet. */
import "../../style.css";
import "./mischpult.css";
import { mount } from "svelte";
import Mischpult from "./Mischpult.svelte";

mount(Mischpult, { target: document.getElementById("app") });
