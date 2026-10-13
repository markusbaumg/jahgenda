<script>
  /* The panel under the list head (§7 S5): the «nur in diesem Browser» line, «Alle merken» for a friend's
   * list, then Kalender (.ics) · Teilen · Link. Teilen is navigator.share where it exists, the WhatsApp
   * link everywhere else (so WhatsApp never disappears); Link copies the #m= link. */
  import Icon from "../Icon.svelte";
  import { mine } from "../../stores/marks.svelte.js";
  import { createFlasher } from "../../stores/feedback.svelte.js";
  import { t } from "../../i18n/i18n.svelte.js";

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);
  const hidden = $derived(!mine.listMode || !mine.listShows.length);
  const taken = $derived(mine.allTaken);
  const waHref = $derived(hidden ? "#" : mine.listWaUrl());
  const note = $derived.by(() => {
    const k = mine.sharedMissing;
    const gone = k ? t("mine.gone", { n: k }) : "";
    return t(!mine.shared ? "mine.noteOwn" : taken ? "mine.noteTaken" : "mine.noteShared") + gone;
  });

  const { flashes, flash } = createFlasher();
  async function share() {
    flash("share", await mine.shareList());
  }
  async function link() {
    flash("link", await mine.copyListLink());
  }
</script>

{#snippet fb(name)}
  {#if flashes[name]}<span class="fb" aria-hidden="true">{flashes[name]}</span>{/if}
{/snippet}

<div id="mine-panel" class="mine-panel" {hidden}>
  <span class="mine-note">{hidden ? "" : note}</span><button
    type="button"
    class="act take"
    data-mine="take"
    title={t("mine.takeTitle")}
    hidden={!mine.shared}
    disabled={taken}
    onclick={() => mine.takeAll()}
    ><Icon name="star" /><span class="lbl">{t(taken ? "mine.taken" : "mine.take")}</span></button
  ><button
    type="button"
    class="act"
    data-mine="ics"
    title={t("mine.icsTitle")}
    onclick={() => mine.saveListIcs()}><Icon name="cal" /><span class="lbl">{t("mine.ics")}</span></button
  >{#if canShare}<button
      type="button"
      class="act{flashes.share ? ' fb-on' : ''}"
      data-mine="share"
      title={t("mine.shareTitle")}
      onclick={share}
      ><Icon name="share" /><span class="lbl">{t("row.share")}</span>{@render fb("share")}</button
    >{:else}<a class="act" id="mine-wa" href={waHref} target="_blank" rel="noopener" title={t("mine.waTitle")}
      ><Icon name="wa" /><span class="lbl">{t("row.share")}</span></a
    >{/if}<button
    type="button"
    class="act{flashes.link ? ' fb-on' : ''}"
    data-mine="link"
    title={t("mine.linkTitle")}
    onclick={link}><Icon name="link" /><span class="lbl">{t("row.link")}</span>{@render fb("link")}</button
  >
</div>
