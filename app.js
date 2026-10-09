// ===== Atlante delle Meridiane — mobile-first, pronto per molti comuni =====
const $ = (id) => document.getElementById(id);

let all = [];            // tutte le meridiane
let comuni = [];         // [{ key, nome, sigla, provincia, regione, lat, lon, items }]
let comuneByKey = {};
let map = null;
let markers = {};        // chiave comune -> marker
let currentRandomId = null;
const MAX_SUGGESTIONS = 8;

// ---------- utilità ----------
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}
// confronto senza accenti né maiuscole
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function resolveFotoPath(value) {
  if (!value) return "";
  let p = String(value).trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!/^catalogo\/foto\//i.test(p)) p = "catalogo/foto/" + p.split("/").pop();
  return p;
}
// Versioni leggere: thumbs (elenchi) e medie (home/scheda). Se mancano, si usa l'originale.
function variantPath(value, folder) {
  const p = resolveFotoPath(value);
  if (!p) return "";
  const stem = p.split("/").pop().replace(/\.[^.]+$/, "");
  return `catalogo/${folder}/${stem}.jpg`;
}
const thumbPath = (v) => variantPath(v, "thumbs");
const mediumPath = (v) => variantPath(v, "medie");
const fallbackAttr = (v) => `onerror="this.onerror=null;this.src='${escapeHtml(resolveFotoPath(v))}'"`;

const itemById = (id) => all.find(x => String(x.id) === String(id));
const itemsOf = (key) => all.filter(x => x.comune === key);
const nomeOf = (key) => comuneByKey[key]?.nome || key;
const labelOf = (item) => {
  const list = itemsOf(item.comune);
  const n = list.indexOf(item) + 1;
  return list.length > 1 ? `Meridiana ${n}` : "Meridiana";
};
const placeLine = (key) => {
  const c = comuneByKey[key];
  if (!c || !c.provincia) return "";
  return `Provincia di ${c.provincia}${c.regione ? " · " + c.regione : ""}`;
};

// Interpretazione prudente dei campi del foglio
const isYear = (v) => /^\d{4}$/.test(String(v).trim());
const isUrl = (v) => /^https?:\/\//i.test(String(v).trim());
const isCoord = (v) => /°/.test(String(v));

// ---------- caricamento ----------
async function loadJson(url, fallback) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : fallback;
  } catch (_) { return fallback; }
}

async function init() {
  const meta = await loadJson("comuni.json", {});
  const response = await fetch("data.json");
  if (!response.ok) throw new Error("data.json non disponibile");
  all = await response.json();

  const byKey = {};
  all.forEach(x => { if (x.comune) (byKey[x.comune] ||= []).push(x); });
  comuni = Object.keys(byKey).map(key => {
    const m = meta[key] || {};
    return {
      key,
      nome: m.nome || key,
      sigla: m.sigla || "",
      provincia: m.provincia || "",
      regione: m.regione || "",
      lat: m.lat, lon: m.lon,
      items: byKey[key]
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  comuni.forEach(c => { comuneByKey[c.key] = c; });

  $("count").textContent = all.length;
  $("count-comuni").textContent = comuni.length;

  fillBrowse();
  setupSearch();
  setupShuffle();
  pickRandom();
  try { setupMap(); }
  catch (err) {                      // Leaflet non caricato (rete assente/lenta): il resto del sito funziona lo stesso
    console.warn("Mappa non disponibile:", err);
    map = null;
    $("map-section").classList.add("map-unavailable");
  }

  window.addEventListener("hashchange", route);
  route();
}

// ---------- home: foto casuale ----------
function pickRandom() {
  const withPhoto = all.filter(x => x.foto);
  if (!withPhoto.length) return;
  let pool = withPhoto.filter(x => String(x.id) !== String(currentRandomId));
  if (!pool.length) pool = withPhoto;
  const item = pool[Math.floor(Math.random() * pool.length)];
  currentRandomId = item.id;

  const where = item.localita ? `${item.comune} · ${item.localita}` : item.comune;
  const fi = $("featured-img");
  fi.onerror = () => { fi.onerror = null; fi.src = resolveFotoPath(item.foto); };
  fi.src = mediumPath(item.foto);
  fi.alt = `Meridiana di ${nomeOf(item.comune)}`;
  $("featured-title").textContent = where;
  $("featured-link").href = "#m=" + encodeURIComponent(item.id);
  $("featured").hidden = false;
}
function setupShuffle() { $("shuffle").addEventListener("click", pickRandom); }

// ---------- home: ricerca con suggerimenti ----------
// Punteggio: 0 = il nome inizia con il testo, 1 = una parola inizia con il testo,
// 2 = il nome contiene il testo, 3 = corrisponde provincia/sigla/regione, null = nessuna corrispondenza
function scoreComune(c, q) {
  const nome = norm(c.nome);
  if (nome.startsWith(q)) return 0;
  if (nome.split(/[\s'’-]+/).some(w => w.startsWith(q))) return 1;
  if (nome.includes(q)) return 2;
  if (q.length === 2 && norm(c.sigla) === q) return 3;
  if (q.length >= 3 && (norm(c.provincia).includes(q) || norm(c.regione).includes(q))) return 3;
  return null;
}

function renderSuggestions(query) {
  const q = norm(query);
  const ul = $("suggestions");
  if (!q) { ul.innerHTML = ""; $("no-results").hidden = true; return []; }

  const found = comuni
    .map(c => ({ c, s: scoreComune(c, q) }))
    .filter(x => x.s !== null)
    .sort((a, b) => a.s - b.s || a.c.nome.localeCompare(b.c.nome, "it"))
    .map(x => x.c);

  const shown = found.slice(0, MAX_SUGGESTIONS);
  ul.innerHTML = shown.map(c => `
    <li>
      <a class="comune-btn" href="#c=${encodeURIComponent(c.key)}">
        <span class="comune-name">${escapeHtml(c.nome)}<small>${escapeHtml(c.sigla ? "Provincia di " + c.provincia : "")}</small></span>
        <span class="badge">${c.items.length}</span>
        <span class="chev">›</span>
      </a>
    </li>`).join("") +
    (found.length > shown.length
      ? `<li><p class="muted more">…e altri ${found.length - shown.length} comuni: continua a scrivere per restringere.</p></li>`
      : "");
  $("no-results").hidden = found.length > 0;
  return found;
}

function setupSearch() {
  const input = $("search");
  input.addEventListener("input", () => renderSuggestions(input.value));
  input.addEventListener("keydown", (e) => {
    const links = [...document.querySelectorAll("#suggestions a")];
    if (e.key === "Enter") {
      e.preventDefault();
      if (links[0]) { input.blur(); location.hash = links[0].getAttribute("href").slice(1); }
    } else if (e.key === "ArrowDown" && links[0]) {
      e.preventDefault(); links[0].focus();
    }
  });
  $("suggestions").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = [...document.querySelectorAll("#suggestions a")];
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowDown") (links[i + 1] || links[i]).focus();
    else (links[i - 1] || input).focus();
  });
}

// ---------- home: elenco a tendina raggruppato per provincia ----------
function fillBrowse() {
  const sel = $("browse");
  const groups = {};
  comuni.forEach(c => {
    const g = c.provincia ? `${c.provincia} (${c.sigla})` : "Altri";
    (groups[g] ||= []).push(c);
  });
  Object.keys(groups).sort((a, b) => a.localeCompare(b, "it")).forEach(g => {
    const og = document.createElement("optgroup");
    og.label = g;
    groups[g].forEach(c => {
      const o = document.createElement("option");
      o.value = c.key;
      o.textContent = `${c.nome} (${c.items.length})`;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  sel.addEventListener("change", () => {
    if (sel.value) location.hash = "c=" + encodeURIComponent(sel.value);
  });
}

// ---------- viste ----------
function showView(name) {
  ["home", "comune", "detail"].forEach(v => { $("view-" + v).hidden = (v !== name); });
  // la mappa sta in fondo alla home e all'elenco del comune, non nella scheda
  $("map-section").hidden = (name === "detail") || $("map-section").classList.contains("map-unavailable");
  if (name !== "detail" && map) setTimeout(() => map.invalidateSize(), 50);
}

function route() {
  document.title = "Atlante delle Meridiane – Meridiane d'Italia";
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith("m=")) showDetail(h.slice(2));
  else if (h.startsWith("c=")) showComune(h.slice(2));
  else showHome();
  window.scrollTo(0, 0);
}

function showHome() {
  showView("home");
  $("browse").value = "";
  highlightMarker(null);
}

function showComune(key) {
  const items = itemsOf(key);
  if (!items.length) { location.hash = ""; return; }
  showView("comune");
  $("comune-title").textContent = nomeOf(key);
  const n = items.length;
  $("comune-sub").textContent =
    [placeLine(key), n === 1 ? "1 meridiana catalogata" : `${n} meridiane catalogate`].filter(Boolean).join(" — ");

  $("sundial-list").innerHTML = items.map((item, i) => {
    const sub = [item.localita, isYear(item["anno fotografia"]) ? "foto " + item["anno fotografia"] : ""]
      .filter(Boolean).join(" · ");
    return `
    <li>
      <a class="sundial-btn" href="#m=${encodeURIComponent(item.id)}">
        <img src="${escapeHtml(thumbPath(item.foto))}" ${fallbackAttr(item.foto)} alt="" loading="lazy" width="76" height="76">
        <span class="sundial-info">
          <strong>Meridiana ${i + 1}</strong>
          ${item.motto ? `<span>“${escapeHtml(item.motto)}”</span>` : ""}
          ${sub ? `<span>${escapeHtml(sub)}</span>` : ""}
        </span>
        <span class="chev">›</span>
      </a>
    </li>`;
  }).join("");

  highlightMarker(key);
}

function showDetail(id) {
  const item = itemById(id);
  if (!item) { location.hash = ""; return; }
  showView("detail");

  const list = itemsOf(item.comune);
  const idx = list.indexOf(item);
  const prev = list[idx - 1], next = list[idx + 1];
  const foto = escapeHtml(resolveFotoPath(item.foto));        // originale (ingrandimento)
  const fotoMedia = escapeHtml(mediumPath(item.foto));        // versione leggera mostrata nella scheda
  const nome = nomeOf(item.comune);

  const anno = String(item["anno fotografia"] ?? "").trim();
  const gm = String(item["google maps"] ?? "").trim();
  const notes = [];
  if (item.note) notes.push(item.note);
  if (anno && !isYear(anno)) notes.push(anno);
  if (gm && !isUrl(gm) && !isCoord(gm)) notes.push(gm);

  const meta = [];
  if (isYear(anno)) meta.push(`<div><strong>Anno fotografia:</strong> ${escapeHtml(anno)}</div>`);
  if (item.proprieta === "Privata") {
    meta.push(`<div><strong>Proprietà:</strong> Privata — la posizione esatta non è pubblicata</div>`);
  } else if (item.proprieta === "Pubblica") {
    meta.push(`<div><strong>Proprietà:</strong> Pubblica</div>`);
  }
  if (gm && isUrl(gm)) {
    meta.push(`<div><strong>Posizione:</strong> <a href="${escapeHtml(gm)}" target="_blank" rel="noopener noreferrer">Apri in Google Maps ↗</a></div>`);
  } else if (gm && isCoord(gm)) {
    meta.push(`<div><strong>Google Maps:</strong> ${escapeHtml(gm)}</div>`);
  }
  notes.forEach(n => meta.push(`<div><strong>Note:</strong> ${escapeHtml(n)}</div>`));

  $("view-detail").innerHTML = `
    <a class="back" href="#c=${encodeURIComponent(item.comune)}">← ${escapeHtml(nome)}</a>
    ${foto ? `
      <a class="photo-wrap" href="${foto}" target="_blank" rel="noopener">
        <img src="${fotoMedia}" ${fallbackAttr(item.foto)} alt="Meridiana di ${escapeHtml(nome)}">
      </a>
      <p class="photo-hint">Tocca la foto per ingrandirla</p>` : ""}
    <div class="detail-body">
      <p class="eyebrow">${escapeHtml(labelOf(item).toUpperCase())}</p>
      <h2>${escapeHtml(nome)}</h2>
      ${placeLine(item.comune) ? `<p class="muted">${escapeHtml(placeLine(item.comune))}</p>` : ""}
      ${item.localita ? `<div class="detail-locality"><strong>Località:</strong> ${escapeHtml(item.localita)}</div>` : ""}
      ${item.motto ? `<div class="motto">“${escapeHtml(item.motto)}”</div>` : ""}
      ${meta.length ? `<div class="meta">${meta.join("")}</div>` : ""}
    </div>
    ${list.length > 1 ? `
      <nav class="pager" aria-label="Altre meridiane del comune">
        <a href="${prev ? "#m=" + encodeURIComponent(prev.id) : "#"}" class="${prev ? "" : "disabled"}">‹ Precedente</a>
        <a href="${next ? "#m=" + encodeURIComponent(next.id) : "#"}" class="${next ? "" : "disabled"}">Successiva ›</a>
      </nav>` : ""}`;
  document.title = `Meridiana a ${nome} – Atlante delle Meridiane`;
}

// ---------- mappa (in fondo alla pagina) ----------
function setupMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([42.5, 12.5], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const bounds = [];
  comuni.forEach(c => {
    if (typeof c.lat !== "number" || typeof c.lon !== "number") return;   // senza coordinate: niente marker
    const icon = L.divIcon({ className: "sundial-marker", html: "☀️", iconSize: [34, 34], iconAnchor: [17, 17] });
    const m = L.marker([c.lat, c.lon], { icon, title: c.nome }).addTo(map);
    const n = c.items.length;
    m.bindTooltip(`<strong>${escapeHtml(c.nome)}</strong><br>${n} ${n === 1 ? "meridiana" : "meridiane"}`,
      { direction: "top", offset: [0, -12] });
    m.on("click", () => { location.hash = "c=" + encodeURIComponent(c.key); });
    markers[c.key] = m;
    bounds.push([c.lat, c.lon]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
}

function highlightMarker(key) {
  Object.entries(markers).forEach(([k, m]) => m.setZIndexOffset(k === key ? 1000 : 0));
}

init().catch(err => {
  console.error(err);
  $("view-home").innerHTML = `<p class="muted">Errore nel caricamento dei dati. Se apri la pagina in locale, usa un piccolo server
    (es. <code>python -m http.server</code>) invece del doppio clic su index.html.</p>`;
});
