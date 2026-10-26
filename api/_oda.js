// Henting og tolking av data fra oda.com.
// Oda har ikke et offentlig, dokumentert API. Oppskrifts- og søkesidene er
// Next.js-sider der dataene ligger innebygd i HTML-en (React Query-state).
// Denne modulen henter siden og trekker ut de dataene vi trenger.
// Filer som starter med "_" i /api blir ikke egne endepunkter på Vercel.

const BASE = "https://oda.com/no";
const MIDDAG_FILTER = "meal:65"; // Oda-filteret «Middag»

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "no,nb;q=0.9,en;q=0.8",
};

// ---------- Tolking av HTML ----------

// Finn slutten på JSON-arrayen/objektet som starter på `start` og parse den.
function parseJsonAt(text, start) {
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// Next.js App Router strømmer data som self.__next_f.push([1, "<bit>"]).
function flightPayload(html) {
  const re = /self\.__next_f\.push\(/g;
  let out = "", m;
  while ((m = re.exec(html)) !== null) {
    let i = m.index + m[0].length;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== "[") continue;
    const arr = parseJsonAt(html, i);
    if (Array.isArray(arr) && arr[0] === 1 && typeof arr[1] === "string") out += arr[1];
  }
  return out;
}

export function extractQueries(html) {
  const queries = [];
  // Eldre sideoppsett (__NEXT_DATA__)
  const legacy = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (legacy) {
    try {
      const d = JSON.parse(legacy[1]);
      queries.push(...(d?.props?.pageProps?.dehydratedState?.queries || []));
    } catch { /* faller videre */ }
  }
  const flight = flightPayload(html);
  const re = /"queries"\s*:\s*\[/g;
  let m;
  while ((m = re.exec(flight)) !== null) {
    const arr = parseJsonAt(flight, m.index + m[0].length - 1);
    if (Array.isArray(arr)) queries.push(...arr.filter((q) => q && typeof q === "object" && "queryKey" in q));
  }
  return queries;
}

function findQuery(queries, ...names) {
  for (const q of queries) {
    const first = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
    const id = typeof first === "string" ? first : first?._id;
    if (names.includes(id) && q.state?.data) return q;
  }
  return null;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function minutesFromIso(iso) {
  // P0DT00H30M00S -> 30
  const m = /T(\d+)H(\d+)M/.exec(iso || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function parseSearch(html) {
  const q = findQuery(extractQueries(html), "mixedSearch", "searchresponse");
  if (!q || !Array.isArray(q.state.data.items)) {
    throw new Error("Fant ikke søkeresultater i svaret fra Oda. Oda kan ha endret sidene sine.");
  }
  const data = q.state.data;
  return {
    ids: data.items.filter((i) => i.type === "recipe").map((i) => i.attributes?.id || i.id).filter(Boolean),
    hasMore: data.attributes?.hasMoreItems === true,
  };
}

// Gjør om Odas oppskriftsdata til det formatet appen bruker.
// Mengder lagres per porsjon slik at klienten kan skalere fritt.
export function parseRecipe(html) {
  const q = findQuery(extractQueries(html), "recipeDetailApi", "get-recipe-detail");
  if (!q) throw new Error("Fant ikke oppskriftsdata i svaret fra Oda.");
  const d = q.state.data;
  const keyQuery = Array.isArray(q.queryKey) && typeof q.queryKey[0] === "object" ? q.queryKey[0].query : null;
  const shownPortions = num(keyQuery?.portions) || num(d.defaultNumPortions) || 4;

  const display = new Map((d.ingredientsDisplayList || []).map((x, i) => [x.id ?? `#${i}`, x]));
  const linked = new Map((d.ingredients || []).map((x, i) => [x.id ?? `#${i}`, x]));
  const keys = [...new Set([...display.keys(), ...linked.keys()])];

  const ingredients = keys.map((k) => {
    const dsp = display.get(k) || {};
    const ing = linked.get(k) || {};
    const p = ing.product || null;
    return {
      title: dsp.title || ing.ingredient?.title || p?.fullName || "",
      // visningsmengde per porsjon (f.eks. 62.5 g)
      amount: num(dsp.displayQuantity) / shownPortions,
      unit: dsp.displayUnit || "",
      basic: ing.isBasic === true || ing.ingredient?.isBasic === true,
      product: p
        ? {
            id: p.id,
            name: p.fullName || p.name || "",
            extra: p.nameExtra || "",
            price: num(p.grossPrice),
            regularPrice: num(p.discount?.undiscountedGrossPrice) || num(p.grossPrice),
            available: p.availability ? p.availability.isAvailable !== false : true,
            url: p.frontUrl || (p.absoluteUrl ? "https://oda.com" + p.absoluteUrl : ""),
            // andel av én pakke som går med per porsjon
            perPortion: num(ing.portionQuantity),
          }
        : null,
    };
  }).filter((x) => x.title);

  return {
    id: d.id,
    title: (d.title || "").trim(),
    url: d.frontUrl || `${BASE}/recipes/${d.id}/`,
    image: d.featureImageUrl || "",
    minutes: minutesFromIso(d.cookingDurationIso8601 || d.totalDurationIso8601),
    durationText: d.cookingDurationString || d.totalDurationString || "",
    tags: (d.tags || []).map((t) => t.title).filter(Boolean),
    // hovedråvare (Kylling, Fisk, Kjøttdeig …) brukes for å unngå like middager
    main: (d.tags || []).filter((t) => t.groupKey === "main_ingredient").map((t) => t.title),
    ingredients,
    steps: (d.instructions?.instructions || []).map((s) => s.text || "").filter(Boolean),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- Henting ----------

async function getHtml(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (res.status === 425 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    if (!res.ok) throw new Error(`Oda svarte ${res.status} på ${url}`);
    return res.text();
  }
  throw new Error(`Oda svarte ikke på ${url}. Prøv igjen om litt.`);
}

export async function searchDinnerIds(page) {
  const url = `${BASE}/recipes/all/?filters=${encodeURIComponent(MIDDAG_FILTER)}${page > 1 ? `&page=${page}` : ""}`;
  return parseSearch(await getHtml(url));
}

export async function getRecipe(id) {
  return parseRecipe(await getHtml(`${BASE}/recipes/${id}/`));
}

// Kjør async-funksjoner med begrenset samtidighet.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]); } catch (e) { out[i] = { error: String(e.message || e) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
