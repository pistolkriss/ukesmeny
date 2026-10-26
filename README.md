# Ukesmeny

En enkel side for ukesmeny og handleliste. Oppskrifter og priser hentes fra Oda.com når du trykker «Generer ukesmeny», og lagrede menyer deles mellom alle enhetene dine.

## Slik virker det

- **Generer ukesmeny** henter rundt tre ganger så mange tilfeldige middagsoppskrifter fra Oda som du trenger, med dagens produktpriser. Siden velger den kombinasjonen som gir minst rester (varer som deles mellom rettene), holder seg innenfor ukebudsjettet og unngår samme hovedråvare flere dager.
- **Bytt** henter noen nye forslag og velger det som passer best med resten av uken.
- **Lagre meny** lagrer uken. Før du lagrer, ligger menyen bare som et utkast i nettleseren.
- **Handlelisten** summerer ingrediensene per Oda-vare på tvers av alle middagene og runder opp til hele pakker. Basisvarer (salt, olje osv.) vises separat og regnes ikke med i totalen. Avkrysninger lagres.
- **Oppdater priser** henter oppskriftene på nytt fra Oda for dagens priser.
- **Månedsbudsjettet** øverst summerer lagrede menyer i inneværende måned. Ukebudsjett er månedsbudsjett × 12 / 52.
- Middager som ble brukt de tre forrige ukene, blir ikke foreslått igjen.

Oppskrifter er ikke lagret i koden. De hentes fra Oda når du ber om det, og lagres sammen med menyen du lagrer.

## Oppsett i Vercel

1. Gå til vercel.com → **Add New → Project** og importer `pistolkriss/ukesmeny`. Ingen byggesteg eller innstillinger trengs.
2. I prosjektet: **Storage → Create Database → Upstash for Redis** (gratisnivået holder), og koble den til prosjektet. Vercel legger da inn `KV_REST_API_URL` og `KV_REST_API_TOKEN` automatisk.
3. (Valgfritt, anbefalt) Legg til miljøvariabelen `APP_PIN` under **Settings → Environment Variables**. Siden spør da om PIN første gang på hver enhet, slik at ikke hvem som helst med lenken kan endre menyene.
4. Deploy på nytt etter steg 2 og 3, slik at variablene blir tatt i bruk.

## Filer

| Fil | Innhold |
| --- | --- |
| `index.html` | Hele grensesnittet (ren HTML/CSS/JS) |
| `api/recipes.js` | Henter middagsoppskrifter og priser fra Oda |
| `api/data.js` | Lagrer innstillinger og menyer i Upstash Redis |
| `api/_oda.js` | Henting og tolking av Oda-sider |
| `api/_auth.js` | Valgfri PIN-sjekk |

Prosjektet har ingen npm-avhengigheter.

## Begrensninger

Oda har ikke et offentlig, dokumentert API. `api/_oda.js` leser dataene som ligger innebygd i Odas egne nettsider (samme metode som Oda-MCP-en bruker). Endrer Oda sidene sine, kan hentingen slutte å virke, og da er det `api/_oda.js` som må oppdateres. Feilmeldingen på siden sier fra når det skjer.
