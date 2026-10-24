# Roznos Petržalka

Zdrojový kód webovej aplikácie na plánovanie roznosu po rajónoch, uliciach a vchodoch. Táto verejná kópia má **čistú históriu**: neobsahuje produkčnú databázu, prístupové tokeny, prihlasovacie relácie ani údaje o tom, kto čo rozniesol. Verejná kópia zámerne neobsahuje adresné a schránkové dáta Petržalky ani jednorazové interné migrácie. Po spustení má prázdnu databázu; na praktické použitie treba vložiť vlastné dáta.

## Čo potrebujete

- Node.js 22 alebo novší, npm a Git.
- Vlastný účet a projekt [Convex](https://docs.convex.dev/quickstart/react).
- Server alebo hosting, na ktorom beží aplikácia TanStack Start (príkaz `npm run build`).
- Vlastnú službu na posielanie e-mailov. Súčasné `convex/ResendOTP.ts` a `convex/dailyReport.ts` používajú Macaly e-mailový endpoint a **bez vlastnej Macaly konfigurácie na inom hostingu neposielajú správy**.

## Lokálne spustenie krok za krokom

1. Naklonujte repozitár a nainštalujte balíky: `git clone https://github.com/PeterC83/roznos-petrzalka-verejny.git`, `cd roznos-petrzalka-verejny`, `npm ci`.
2. Spustite `npx convex dev`. Pri prvom spustení si vytvorte **vlastný** Convex projekt. CLI uloží `CONVEX_DEPLOYMENT` a `VITE_CONVEX_URL` do lokálneho súboru `.env.local`. Skontrolujte, že URL je vášho projektu, nie pôvodnej aplikácie.
3. Podľa [manuálneho nastavenia Convex Auth](https://labs.convex.dev/auth/setup/manual) nastavte vo svojom Convex deploymente `JWT_PRIVATE_KEY`, `JWKS` a `SITE_URL`. Tu je port 3000, takže pri lokálnom vývoji `SITE_URL=http://localhost:3000`. V tomto projekte nastavte aj `APP_URL=http://localhost:3000` a `CONVEX_SITE_URL` na URL HTTP endpointu svojho Convex deploymentu (`.convex.site`). Tajné hodnoty patria do Convex Environment Variables, nie do GitHubu.
4. Nastavte e-mail: buď zabezpečte vo vlastnom Macaly projekte hodnoty `EMAIL_NOTIFICATION_ENDPOINT`, `MACALY_API_TOKEN`, `MACALY_CHAT_ID` a `SECRET_KEY`, alebo nahraďte odosielanie v `convex/ResendOTP.ts` a `convex/dailyReport.ts` vlastným e-mailovým poskytovateľom. Obe časti otestujte – prihlasovací odkaz aj report.
5. V druhom termináli spustite `npm run dev` a otvorte `http://localhost:3000`. Backendový terminál s `npx convex dev` nechajte bežať. Overte `npm test` a `npm run build`.
6. Vytvorte prvého admina v **svojom** Convex deploymente: `npx convex run admin:grantEmailAccess '{"email":"VAS_EMAIL","role":"ADMIN"}'`. E-mail nahraďte vlastným. Potom sa prihláste jednorazovým odkazom a ďalších používateľov pridávajte v správe aplikácie.
7. Databáza je po inštalácii prázdna. Pripravte **vlastné** volebné obvody, rajóny, ulice a vchody s počtom schránok podľa schémy v `convex/schema.ts` a vložte ich cez vlastný Convex import/migráciu. Vzor pôvodných dávok sa verejne neposkytuje, pretože obsahoval produkčne odvodené adresné údaje. Bez tohto kroku bude rozhranie fungovať, ale nebude zobrazovať vchody.
8. Pre produkciu nastavte produkčné URL a tajné hodnoty v produkčnom Convex deploymente zvlášť, nasadzujte cez `npx convex deploy`, potom `npm run build` a hostujte vygenerovaný TanStack/Nitro server. Nastavte `APP_URL` a `SITE_URL` na skutočnú HTTPS adresu. Overte prihlasovací odkaz, admina, vchody, zmenu stavu a e-mailový report pred zdieľaním odkazu používateľom.

Poznámka: tento repozitár nemá licenciu. Verejné zobrazenie kódu samo osebe nedáva tretej strane právo kód ďalej upravovať či distribuovať; vlastník musí licenciu zvoliť osobitne.
