# Srpski Tajkun Online — Beograd 13×13

Online verzija igre sa proširenom tablom od 48 polja, beogradskim opštinama i naseljima, pet vrsta gradskog prevoza i dva stadiona sa tri nivoa unapređenja.

Detaljan raspored i početni balans nalaze se u `MAP_NOTES_BEOGRAD_13X13.md`.

## Šta je uključeno

- `server.js` — Node.js + Express + Socket.IO server
- `package.json` — zavisnosti i start komanda
- `public/index.html` — browser UI
- `public/style.css` — stilovi i 13×13 raspored table
- `public/client.js` — online browser logika
- `public/assets/` — prilagođene ikone kuće i hotela
- `render.yaml` — opciona Render konfiguracija

## Kako radi

- Jedan privremeni kod sobe po igri.
- 2–6 igrača.
- Bez naloga i baze podataka.
- Stanje igre se čuva samo u memoriji servera.
- Ako se server restartuje ili zaspi, aktivna soba nestaje.
- Kada ostane samo jedan igrač, igra se završava i soba se kasnije briše.
- Browser šalje mali heartbeat na 25 sekundi dok je povezan.

## Lokalno pokretanje

```bash
npm install
npm start
```

Zatim otvoriti `http://localhost:3000`.

## Render podešavanja

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `NODE_ENV=production`

Server koristi `process.env.PORT`, kako Render zahteva.
