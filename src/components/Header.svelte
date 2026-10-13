<script>
  /* The header lockup (logo #10 + wordmark «Jah»/«genda», the tricolor tagline) and one of the slogans
   * per page load. The slogans are inline in index.html (<script type="application/json" id="slogans">):
   * the same lines go on the stickers – data/slogans.json – and tests/test_contract.py keeps the two
   * lists equal. The first one is the default. */
  const DEFAULT = "Reggae, Dub & Ska in der Schweiz";
  let slogan = DEFAULT;
  try {
    const lines = JSON.parse(document.getElementById("slogans").textContent);
    const line = lines[Math.floor(Math.random() * lines.length)];
    if (line) slogan = line;
  } catch {
    /* the default line stays */
  }
</script>

<header class="wrap head" id="top">
  <h1 class="logo">
    <a class="logo-link" href="./" title="Zum Anfang: Agenda ohne Filter"
      ><img class="logo-mark" src="img/logo/jahgenda.svg" alt="" width="48" height="48" /><span
        class="wordmark"><span class="logo-word">Jah</span><span class="logo-word genda">genda</span></span
      ></a
    >
  </h1>
  <p class="tag">
    Reggae<span class="tri-dots" aria-hidden="true"><i></i><i></i><i></i></span>Dub<span
      class="tri-dots"
      aria-hidden="true"><i></i><i></i><i></i></span
    >Ska <span>— Schweiz</span>
  </p>
  <p class="slogan" id="tagline">{slogan}</p>
</header>
