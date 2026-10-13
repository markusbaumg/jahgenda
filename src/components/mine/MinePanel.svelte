<script>
  /* The panel under the list head (§7 S5): the «nur in diesem Browser» line, «Alle merken» for a friend's
   * list, then Kalender (.ics) · Teilen · Link. Teilen is navigator.share where it exists, the WhatsApp
   * link everywhere else (so WhatsApp never disappears); Link copies the #m= link. */
  import Icon from "../Icon.svelte";
  import { mine } from "../../stores/marks.svelte.js";
  import { createFlasher } from "../../stores/feedback.svelte.js";

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);
  const hidden = $derived(!mine.listMode || !mine.listShows.length);
  const taken = $derived(mine.allTaken);
  const waHref = $derived(hidden ? "#" : `https://wa.me/?text=${encodeURIComponent(mine.listShareText())}`);
  const note = $derived.by(() => {
    const k = mine.sharedMissing;
    const gone = k
      ? ` ${k === 1 ? "1 Show aus dem Link ist" : `${k} Shows aus dem Link sind`} vorbei oder nicht mehr in der Agenda.`
      : "";
    return (
      (!mine.shared
        ? "Gespeichert in diesem Browser. Aufs andere Handy oder zu Freunden: «Liste teilen» und dort «Alle merken»."
        : taken
          ? "Diese Shows sind in deinen Shows (★) gespeichert."
          : "Aus einem Link geöffnet. Bei dir ist nichts gespeichert, bis du «Alle merken» drückst.") + gone
    );
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
    title="Alle Shows dieser Liste in meine Shows übernehmen"
    hidden={!mine.shared}
    disabled={taken}
    onclick={() => mine.takeAll()}
    ><Icon name="star" /><span class="lbl">{taken ? "Alle gemerkt ✓" : "Alle merken"}</span></button
  ><button
    type="button"
    class="act"
    data-mine="ics"
    title="Diese Liste als .ics speichern (Apple, Outlook …)"
    onclick={() => mine.saveListIcs()}><Icon name="cal" /><span class="lbl">Kalender (.ics)</span></button
  >{#if canShare}<button
      type="button"
      class="act{flashes.share ? ' fb-on' : ''}"
      data-mine="share"
      title="Liste teilen (WhatsApp, Mail, …)"
      onclick={share}><Icon name="share" /><span class="lbl">Teilen</span>{@render fb("share")}</button
    >{:else}<a
      class="act"
      id="mine-wa"
      href={waHref}
      target="_blank"
      rel="noopener"
      title="Liste per WhatsApp teilen"><Icon name="wa" /><span class="lbl">Teilen</span></a
    >{/if}<button
    type="button"
    class="act{flashes.link ? ' fb-on' : ''}"
    data-mine="link"
    title="Link zu dieser Liste kopieren"
    onclick={link}><Icon name="link" /><span class="lbl">Link</span>{@render fb("link")}</button
  >
</div>
