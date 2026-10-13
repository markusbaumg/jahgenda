/* The link contract: short per-show hashes and the one parser for every hash the page writes or accepts.
 * Every shared link depends on shortId, so the algorithm must never change (pinned by tests/lib.test.mjs). */

// Short, stable hash per show for links: FNV-1a over the id, base36 (6-7 chars), e.g. #k3f9zq.
export function shortId(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// One parser for every hash the page writes or accepts: #<short hash or id> (a show), #m=<list> /
// #mine=<list> (a shared list) and #view=<name> (the view switch); parts may be combined with "&" in
// any order, e.g. #view=map&m=…. Returns { id, mine, view } with "" for what is absent; a bad escape in
// the id never throws. `views` lists the view names that count.
export function parseHash(hash, views = ["list", "calendar", "map"]) {
  const out = { id: "", mine: "", view: "" };
  for (const part of String(hash || "")
    .replace(/^#/, "")
    .split("&")) {
    if (/^(mine|m)=/.test(part)) out.mine = part.replace(/^(mine|m)=/, "");
    else if (part.startsWith("view=")) {
      const v = part.slice(5);
      if (views.includes(v)) out.view = v;
    } else if (part && !out.id) {
      try {
        out.id = decodeURIComponent(part);
      } catch {
        out.id = part;
      }
    }
  }
  return out;
}
