# Jahgenda promo stickers – research report (2026-10-12)

## 1. Domain

**Availability (checked today via `whois`, authoritative registries):**

| Domain | Status |
|---|---|
| jahgenda.ch | **free** – SWITCH: "We do not have an entry in our database matching your query." |
| jahgenda.net | **free** – "No match for domain JAHGENDA.NET" |
| jahgenda.com | **free** – "No match for domain JAHGENDA.COM" |

`jahgenda.cjr.net` is not an option unless the owner controls `cjr.net` (a subdomain can only be created by that zone's owner).

**Indicative yearly prices** (registrar price pages are JS-rendered and could not all be fetched; sources noted):

| Registrar | .ch | .com | .net | Source / verification |
|---|---|---|---|---|
| Hostpoint | CHF 15/yr incl. VAT, first year CHF 5 (promo) | CHF 10 first year, CHF 20/yr after (**unverified**, third-party whtop.com, May 2026) | n/a | hostpoint.ch/en/domains (verified for .ch) |
| Infomaniak | ~CHF 12/yr reg + renewal (**unverified**, third-party infoswitch.fr 2026 shows "€12"; Infomaniak bills in CHF, ex VAT) | ~€12 (**unverified**) | ~€15 (**unverified**) | infomaniak.com/en/domains/prices (page not readable) |
| Gandi (en-CH page, EUR ex VAT) | €6.99 1st yr promo, regular €11.90; **renewal €31.98/yr** | €11 reg; renewal €31.98 | €11.99 promo / €17.26; renewal €40 | gandi.net (verified) |

**Recommendation:** register **jahgenda.ch** at **Hostpoint** (CHF 15/yr, transparent, Swiss, VAT incl.) or Infomaniak (similar, verify in cart). Skip Gandi (renewals 2–3× higher). .com/.net are optional defensive buys; for a Swiss-only audience .ch alone is enough and reads best on a sticker.

**Pointing it at GitHub Pages** (docs.github.com, verified):
1. Repo → Settings → Pages → Custom domain: enter `jahgenda.ch`. GitHub commits a `CNAME` file (content: `jahgenda.ch`) to the publishing branch – keep it in the repo so deploys don't delete it. Optionally verify the domain first under Profile → Settings → Pages (reduces takeover risk).
2. DNS at the registrar:
   - Apex `@` → A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (optionally AAAA `2606:50c0:8000::153` … `8003::153`).
   - `www` → CNAME `markusbaumg.github.io` (no repo name). GitHub redirects www ↔ apex automatically.
3. Wait for DNS, then tick **Enforce HTTPS** (Let's Encrypt cert is issued automatically; the checkbox can take up to 24 h to appear).
4. The old `markusbaumg.github.io/jahgenda/` URL keeps redirecting to the custom domain, so nothing already shared breaks. Check `manifest.webmanifest`/`sw.js` scopes and absolute paths (`/jahgenda/` prefix) once the site lives at the root.

## 2. Sticker printing in Switzerland

Prices are per design, 4/0 CMYK; marked **(unverified)** where the configurator could not be read.

| Provider | Formats relevant to us | Material | Min. qty | Indicative price 100 / 250 / 500 | File specs | Notes |
|---|---|---|---|---|---|---|
| **Onlineprinters.ch** (de.onlineprinters.ch, Werbeaufkleber) | round 5.0 / 6.0 / 7.0 / 9.5 cm, oval, free die-cut contour (no extra charge) | 90 µm white PP film glossy (outdoor-suitable), transparent PP, 80 g paper matte/gloss | 10 | Round **9.5 cm**: CHF 52.36 / 57.94 / 69.90 net (+8.1 % VAT), verified. Round 5 cm will be lower – **check configurator** | 2 mm bleed, 4 mm safety margin, 300 dpi, CMYK (FOGRA51), fonts embedded/outlined, PDF; templates downloadable | Production 3–4 working days, free standard shipping. Best price/quantity ratio found. |
| **Flyerline.ch** (Frauenfeld TG) | round ø30/40/**50**/74 mm, square **50×50** / 74×74 mm, Freeform die-cut | monomeric vinyl 100 µm gloss or matte, permanent or removable; Yupo Tako (adhesive-free) | 20 | **unverified** – price table not readable; expect roughly CHF 40–90 for 100–500 pcs at 5 cm | PDF, CMYK, bleed per "Checkliste Druckdaten" (typically 3 mm), 300 dpi | Delivered on SRA4 sheets (kiss-cut), free shipping from CHF 100. Swiss, vinyl, matte option – good fit. |
| **Printzessin.ch** (Belp BE) | 50×50 mm up to A3, round, oval, free-form laser-cut | paper (indoor), white plastic film (weatherproof/outdoor), transparent film | 40 (runs 40–2000) | **unverified** – configurator only | Datasheet `db_kleber_einzel_2025_de.pdf` (not readable); assume PDF/X, CMYK, 3 mm bleed, 300 dpi | Few working days, express available, pickup in Belp. Small Swiss shop, good for odd shapes. |
| **Sticker Mule EU** (stickermule.com/eu) | die-cut or circle 25/50/75/100 mm, custom | thick matte vinyl, scratch/water/UV-resistant | 10 (configurator starts at 50) | **unverified** – shown only after configuring; third-party blogs cite ~€0.35–0.60/pc at 100 pcs. Shipping "free", but **Swiss import VAT/customs possible** – get a checkout quote | upload any logo; online proof after checkout | 4-day turnaround. Best material, pricier and non-Swiss. |
| Vistaprint.ch | round/square/die-cut vinyl | vinyl | – | **unverified** – pages returned 404 to fetcher | – | Check manually if needed; usually mid-price. |

**Format suggestion:** round ø 5 cm or square 5×5 cm, matte vinyl (no glare on the QR, outdoor-proof). Dark background `#14110e` with the stripes + Swiss cross logo, QR in white box, URL in gold `#f2b632`. Keep the QR ≥ 2 cm.

**Universal file checklist:** PDF (PDF/X-4 or X-1a), CMYK (convert #d8342f / #f2b632 / #1e8f4e and check proofs – greens shift most), 3 mm bleed (2 mm at Onlineprinters), 3–4 mm safety margin, ≥ 300 dpi raster or pure vector, fonts outlined, QR as vector, no RGB/ICC surprises, cut line on a separate spot colour layer for die-cut.

## 3. QR code

**Best practice**
- Error correction **H** (30 % recoverable) whenever a logo covers the middle; logo ≤ ~20–25 % of the code area, centred, never over the three finder squares.
- Quiet zone ≥ 4 modules on every side (white box around the QR on the dark sticker).
- Encode the shortest URL possible: `https://jahgenda.ch` → version 2–3 with EC-H (25–29 modules) vs. `https://markusbaumg.github.io/jahgenda/` → version 5+ (37 modules). Fewer modules = larger modules = scans at 2 cm.
- Min. print size ~2 × 2 cm at 5 cm sticker; module size ≥ 0.5 mm. High contrast: dark modules on white, not gold on black.
- Export as **SVG** (vector), not PNG.
- Test on iPhone camera, Android camera and a Lens app, from 20–40 cm, before sending to print; test a real print on matte vinyl, not just screen.

**Generators**
- Free online with logo: qr-code-generator.com, qrcode-monkey.com (free, SVG export, logo + EC-H).
- Python, usable in the Makefile:
  - `segno` (pure Python, SVG out): `segno.make("https://jahgenda.ch", error="h").save("design/qr.svg", scale=10, border=4, dark="#14110e")`; logo overlay via plugin `qrcode-artistic` (`to_artistic(background="img/logo.png", target="qr.png", scale=10)`) or by placing the logo over the SVG in the sticker layout file.
  - `qrcode` 8.2 (Pillow): `qrcode.QRCode(error_correction=ERROR_CORRECT_H)` + `make_image(image_factory=StyledPilImage, embedded_image_path="img/logo.png")` – PNG only.
  - Neither is installed locally (`segno`, `qrcode`, `qrencode` all missing); a `make qr` target would `pip install segno` into a venv and write `design/qr.svg`.

**Short link idea:** with the custom domain, the domain root *is* the short link – `jahgenda.ch` on the sticker, nothing else. For campaign tracking use path redirects handled client-side in `index.html`/a tiny `s/` folder (e.g. `jahgenda.ch/s` → `/?src=sticker` via a meta-refresh page), since GitHub Pages has no server redirects. Avoid third-party shorteners (bit.ly) – they die, the domain doesn't.

## 4. Claim lines (Swiss-German / German)

1. **Alli Reggae-Shows. Ei Site.**
2. **Jah weiss, wo's lauft.** – Reggae, Dub & Ska i de ganze Schwiiz
3. **Kei Show meh verpasse.** – jahgenda.ch

Alternates: "Reggae-Agenda für d'Schwiiz", "Wo lauft hüt Reggae? Lueg uf jahgenda.ch", "Dub. Ska. Reggae. Alles uf eim Blatt."

## 5. Checklist to review with Seraina

- [ ] Domain: go with `jahgenda.ch` only, or also .com/.net? Registrar: Hostpoint vs Infomaniak (verify cart prices)
- [ ] Who owns the registrar account / pays the ~CHF 15/yr; renewal on auto-pay
- [ ] Sticker shape: round ø5 cm vs square 5×5 cm vs die-cut Swiss-cross
- [ ] Material: matte vinyl (recommended) vs gloss vs paper
- [ ] Quantity for first run: 250 or 500 (per-piece price drops steeply)
- [ ] Provider: Onlineprinters (cheapest, verified prices) vs Flyerline (Swiss, vinyl matte) vs Printzessin (Belp, local)
- [ ] Claim line: pick one of the three, check dialect/spelling
- [ ] Layout: logo + QR + `jahgenda.ch` + claim fit legibly at 5 cm; QR ≥ 2 cm with white quiet zone
- [ ] Colours checked in CMYK proof (red/gold/green on dark brown)
- [ ] QR tested on both phones from a printed sample before mass order
- [ ] Custom domain live + HTTPS enforced **before** stickers are printed
- [ ] Where to hand them out / consent of venues; also a small stack for bands and bars
- [ ] Optional: `?src=sticker` tracking or a `/s` redirect to measure sticker scans

**Sources:** SWITCH/Verisign whois (local `whois`, 2026-10-12); hostpoint.ch/en/domains; gandi.net/en-CH/domain/tld/{ch,com,net}; whtop.com compare hostpoint/infomaniak; infoswitch.fr Infomaniak pricing 2026; docs.github.com managing a custom domain; de.onlineprinters.ch/p/werbeaufkleber-rund-95mm; flyerline.ch aufkleber-rund-oe50mm and quadratisch-50x50mm; printzessin.ch/kleber-konfigurieren; stickermule.com/eu die-cut and circle stickers; segno.readthedocs.io artistic QR; pypi.org/project/qrcode; dev.to QR error-correction guide; qrplanet.com print size guide.
