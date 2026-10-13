<script>
  /* The header lockup (logo #10 + wordmark «Jah»/«genda», the tricolor tagline) and one of the slogans
   * per page load. The slogans are inline in index.html (<script type="application/json" id="slogans">):
   * the same lines go on the stickers – data/slogans.json – and tests/test_contract.py keeps the two
   * lists equal. The first one is the default. French and English lines: #slogans-fr / #slogans-en (the
   * same test), picked at the same position of the list, so a language switch keeps the slot. */
  import { i18n, t } from "../i18n/i18n.svelte.js";

  const DEFAULT = "Reggae, Dub & Ska in der Schweiz";
  const pick = Math.random();
  const lines = (id) => {
    try {
      return JSON.parse(document.getElementById(id).textContent);
    } catch {
      return [];
    }
  };
  const LINES = { de: lines("slogans"), fr: lines("slogans-fr"), en: lines("slogans-en") };
  const slogan = $derived.by(() => {
    const list = LINES[i18n.locale].length ? LINES[i18n.locale] : LINES.de;
    return list[Math.floor(pick * list.length)] || DEFAULT;
  });
</script>

<header class="wrap head" id="top">
  <h1 class="logo">
    <a class="logo-link" href="./" title={t("header.home")}
      ><img class="logo-mark" src="img/logo/jahgenda.svg" alt="" width="48" height="48" /><span
        class="wordmark"><span class="logo-word">Jah</span><span class="logo-word genda">genda</span></span
      ></a
    >
  </h1>
  <p class="tag">
    Reggae<span class="tri-dots" aria-hidden="true"><i></i><i></i><i></i></span>Dub<span
      class="tri-dots"
      aria-hidden="true"><i></i><i></i><i></i></span
    >Ska <span>{t("header.country")}</span>
  </p>
  <p class="slogan" id="tagline">{slogan}</p>
</header>
