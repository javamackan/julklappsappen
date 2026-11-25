# Julklappsappen

Mobilwebbapp i React och TypeScript för familjens julklappslistor. Familjepiloten har konton med mejladress och lösenord, adressbekräftelse, lösenordsåterställning, privata grupper och personliga inbjudningslänkar.

## Grupp och inbjudningar

Efter inloggning ser varje medlem sina grupper och vilka som gått med. Gruppägaren anger en persons mejladress, skapar en länk och delar den själv via exempelvis Messenger. Länken gäller i sju dagar och kan kopieras igen eller återkallas. För att använda den bekräftar mottagaren sin mejladress, skriver sitt visningsnamn och trycker på **Gå med i gruppen**. En förhandsvisning förbrukar aldrig länken. Endast ägaren ser inbjudningarnas mejladresser.

Projektadministratören skapar pilotgrupper i Firestore. Dokumentet i `groups/{grupp-id}` innehåller `name`, `ownerUid`, `capacity`, `memberUids` (från början ägarens Firebase Authentication-UID) och `members` (för varje UID en karta med `name` och `slot`). Ägarens plats är strängen `"0"`. Övriga platser och inbjudningar skapas när gruppägaren bjuder in någon. Familjens uppgifter hanteras i projektets databas.

## Kör lokalt

Använd Node.js 24 och Java 21. Kör följande i projektmappen.

```sh
npm ci
npm run dev
```

Öppna <http://127.0.0.1:5000>. Firebase kör Authentication, Firestore och Hosting lokalt med projekt-ID `demo-julklappsappen`. Använd påhittade testadresser. Emulatorn skriver ut länkar för adressbekräftelse och lösenordsåterställning i terminalen.

Kör grupp- och behörighetstesterna med emulatorerna avstängda.

```sh
npm run test:grupper
```

## Publicera familjens testversion

Webbappen använder klassiska Firebase Hosting, Email/Password och Cloud Firestore i projektet `julklappsappen`. Den hämtar webbkonfigurationen från Hosting på `/__/firebase/init.json`.

Med den färdigbyggda utgåvan packar du upp hela ZIP-filen och öppnar PowerShell i mappen `julklappsappen`, där `package.json` ligger. Kör sedan

```powershell
npm.cmd run publicera
```

Firebase CLI använder projektadministratörens Google-konto. Kommandot publicerar Firestore-reglerna och därefter innehållet i `dist`.

För att publicera från källkoden bygger du appen först.

```sh
npm ci
npm run build
npm run publicera
```
