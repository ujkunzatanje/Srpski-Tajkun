# Srpski Tajkun Online — izbor mape

Ova verzija sadrži obe mape u istom projektu. Host bira mapu pre pravljenja sobe, a svi igrači koji se pridruže dobijaju istu mapu i njena pravila.

## Dostupne mape

### Gradovi Srbije — 11×11

Originalna mapa od 40 polja sa gradovima Srbije, aerodromima, železničkom i autobuskom stanicom. Zadržani su originalni raspored, cene, rente, setovi i izgled table.

### Opštine Beograda — 13×13

Proširena mapa od 48 polja sa beogradskim opštinama i naseljima, pet vrsta gradskog prevoza i dva stadiona sa tri nivoa unapređenja. Detaljan raspored i početni balans nalaze se u `MAP_NOTES_BEOGRAD_13X13.md`.

## Kako se bira mapa

1. Na početnom ekranu host izabere **Gradovi Srbije** ili **Opštine Beograda**.
2. Host pritisne **Napravi sobu**.
3. Izabrana mapa se vezuje za tu sobu i ne može da se promeni nakon pravljenja sobe.
4. Igrači koji ulaze kodom ili linkom automatski koriste mapu te sobe.

## Šta je uključeno

- `server.js` — Node.js + Express + Socket.IO server i obe definicije mapa
- `public/index.html` — izbor mape i browser UI
- `public/style.css` — dinamički 11×11 i 13×13 raspored
- `public/client.js` — online logika i automatsko prilagođavanje veličini mape
- `public/assets/` — prilagođene ikone kuće i hotela
- `render.yaml` — opciona Render konfiguracija

## Pravila i online funkcije

- Jedan privremeni kod sobe po igri.
- 2–6 igrača.
- Bez naloga i baze podataka.
- Sve postojeće razmene, uslovi razmene, pritvor, karte, porezi, Odmor, kuće/hoteli, tajmeri, statistika, rejoin i host kontrole ostaju aktivni na obe mape.
- Kartica polja se zatvara dugmetom ×, tasterom Escape ili klikom/dodirom van kartice.
- Stanje igre se čuva samo u memoriji servera. Restart servera briše aktivne sobe.

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

## Izbor mape

Na početnom ekranu host mora da izabere jednu od dve vizuelno prikazane mape pre pravljenja sobe: **Opštine Beograda** ili **Gradovi Srbije**. Dugme za pravljenje sobe ostaje zaključano dok mapa nije izabrana.
