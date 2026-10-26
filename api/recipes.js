// GET /api/recipes?count=15&exclude=1,2,3
//   Henter `count` tilfeldige middagsoppskrifter fra Oda, med ingredienser og
//   dagens produktpriser. Brukes når du trykker «Generer ukesmeny» eller «Bytt».
// GET /api/recipes?ids=608,2574
//   Henter bestemte oppskrifter på nytt (brukes av «Oppdater priser»).
import { searchDinnerIds, getRecipe, mapLimit } from "./_oda.js";
import { checkPin } from "./_auth.js";

const MAX_PAGE = 18; // «Middag» har ca. 900 oppskrifter fordelt på ~19 sider

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const parseIds = (s) => String(s || "").split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0);

export default async function handler(req, res) {
  if (!checkPin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    const ids = parseIds(req.query.ids);
    if (ids.length) {
      const recipes = await mapLimit(ids.slice(0, 14), 7, getRecipe);
      return res.status(200).json({ recipes: recipes.filter((r) => r && !r.error) });
    }

    const count = Math.min(24, Math.max(1, parseInt(req.query.count, 10) || 15));
    const exclude = new Set(parseIds(req.query.exclude));

    // To tilfeldige søkesider gir et stort nok utvalg å trekke fra.
    const pages = shuffle(Array.from({ length: MAX_PAGE }, (_, i) => i + 1)).slice(0, 2);
    const results = await Promise.all(pages.map((p) => searchDinnerIds(p).catch(() => ({ ids: [] }))));
    let pool = [...new Set(results.flatMap((r) => r.ids))].filter((id) => !exclude.has(id));
    if (pool.length < count) {
      const first = await searchDinnerIds(1);
      pool = [...new Set([...pool, ...first.ids])].filter((id) => !exclude.has(id));
    }
    // Hent litt flere enn nødvendig i tilfelle noen feiler eller mangler varer.
    const picked = shuffle(pool).slice(0, count + 3);
    const recipes = (await mapLimit(picked, 8, getRecipe))
      .filter((r) => r && !r.error && r.ingredients.some((i) => i.product))
      .slice(0, count);

    if (!recipes.length) throw new Error("Fikk ingen oppskrifter fra Oda.");
    res.status(200).json({ recipes });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
