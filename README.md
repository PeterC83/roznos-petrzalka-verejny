# Roznos Petržalka

Aktuálny zdrojový kód aplikácie a obnoviteľný stav adresára vchodov. Verejná história repozitára je čistá; nejde o zverejnenie súkromného repozitára s jeho starými commitmi.

## Adresné dáta

Súbor [`data/current-addresses-2026-10-24.json`](data/current-addresses-2026-10-24.json) je snímka **živej databázy z 24. 10. 2026** po všetkých opravách vchodov a počtov schránok. Obsahuje 6 volebných obvodov, 38 rajónov, 157 ulíc, 1 737 vchodov, spolu **54 245 schránok**, a 37 označení „vonku“. Zahŕňa aj pôvodne skryté vchody a skutočné počty schránok zapísané do databázy do času snímky. Všetky vchody sú pripravené na nový roznos (stav `TODO`).

Snapshot neobsahuje používateľov, e-maily, prihlasovacie údaje, priradenia, záznamy roznosu ani auditnú históriu. Obsahuje však verejne čitateľné adresy a počty schránok. SHA-256 súboru: `222cdeb6321e5ba3213b9f07bd29dec4bd5e66d634c3062a694313b33bba65d6`.

Staré jednorazové migračné skripty tu **nie sú**. Ich výsledky sú v tejto finálnej snímke. Opakované spúšťanie starých skriptov by mohlo duplicitne pridať alebo omylom zmazať vchody. Nové opravy po dátume snímky sa do GitHubu neprepisujú automaticky.

## Spustenie na vlastnom Convexe

Potrebujete Node.js 22+, npm, Git, vlastný účet [Convex](https://docs.convex.dev/quickstart/react) a spôsob posielania e-mailov.

1. Naklonujte repozitár: `git clone https://github.com/PeterC83/roznos-petrzalka-verejny.git`, potom `cd roznos-petrzalka-verejny` a `npm ci`.
2. Spustite `npx convex dev`, pripojte **vlastný nový/prázdny** Convex projekt a nechajte tento terminál bežať. Overte, že vytvorené `.env.local` ukazuje na váš projekt, nie na pôvodnú aplikáciu. CLI pripraví aj generované súbory v `convex/_generated/`.
3. V druhom termináli spustite `node scripts/import-current-addresses.mjs`. Import odmietne databázu, ktorá už obsahuje iné adresy alebo import. Po skončení musí vypísať 1 737 vchodov a 54 245 schránok. Skript je možné po prerušení spustiť znova; existujúce zhodné záznamy nezdvojí.
4. Podľa [návodu Convex Auth](https://labs.convex.dev/auth/setup/manual) nastavte vo svojom Convex deploymente `JWT_PRIVATE_KEY`, `JWKS` a `SITE_URL`. Lokálne použite `SITE_URL=http://localhost:3000`. Nastavte `APP_URL=http://localhost:3000` a `CONVEX_SITE_URL` na HTTP URL svojho Convex deploymentu (`.convex.site`). Tajné hodnoty ukladajte iba do Convex Environment Variables.
5. Prihlasovacie odkazy a denné reporty používajú v `convex/ResendOTP.ts` a `convex/dailyReport.ts` e-mailové služby Macaly. Mimo Macaly nastavte vlastný kompatibilný spôsob odosielania; bez toho prihlásenie e-mailom nefunguje. Neprenášajte pôvodné tokeny.
6. Vytvorte prvého admina vo **svojom** Convexe: `npx convex run admin:grantEmailAccess '{"email":"VAS_EMAIL","role":"ADMIN"}'`. Nahraďte adresu vlastnou. Potom spustite `npm run dev` a otvorte `http://localhost:3000`.
7. Overte `npm test` a `npm run build`. Pri produkčnom nasadení nastavte produkčné URL a tajné hodnoty zvlášť, spustite `npx convex deploy` a zostavte aplikáciu. Skontrolujte prihlasovací odkaz, počet vchodov, zmenu stavu a e-mailový report pred zdieľaním s používateľmi.

**Pozor:** Importovací skript je určený iba pre novú databázu. Nepúšťajte ho proti pôvodnej živej databáze. Súbor `.env.local`, produkčná databáza a prihlasovacie relácie sa do GitHubu nezapisujú.

Tento repozitár nemá licenciu. Verejné zobrazenie kódu samo osebe nedáva tretej strane právo ho ďalej upravovať alebo distribuovať; vlastník musí licenciu zvoliť osobitne.
