# Julklappsappen

Mobilwebbapp i React och TypeScript för familjens julklappslistor. Familjepiloten har personliga önskelistor, hemliga presentidéer och en privat tomtesäck. Medlemmar loggar in med verifierad mejladress och kan återställa sitt lösenord via mejl.

## Julklappar i tre flikar

- **Min önskelista.** Lägg till, ändra och ta bort egna önskningar. Bara namnet på klappen är obligatoriskt. Pris i kronor, länk och detaljer är frivilliga.
- **Familjens listor.** Tryck på ett av familjens porträtt för att öppna en lista. Byt person i porträttraden eller välj **Alla medlemmar** för att återgå. På en annan medlems lista kan du paxa en önskning eller lägg till en hemlig presentidé. Övriga givare i gruppen ser vem som paxat. Mottagaren kan aldrig läsa paxningen eller de hemliga idéerna med sitt appkonto.
- **Min tomtesäck.** Se dina paxade klappar, markera dem privat som köpta, ångra köpmarkeringen eller släpp en paxning. Om en önskning ändras visas det nya innehållet. Tas den bort behåller givaren en kopia i sin säck och kan fortfarande släppa paxningen.

Varje önskning har ett stabilt ID. En paxning skapar en gemensam reservation, givarens uppgift för den aktuella gruppen och en privat rad i tomtesäcken i samma Firestore-transaktion. Databasreglerna skyddar även önskningar som tillhör gruppägaren. Om samma önskning senare delas med en andra grupp gäller reservationen i båda. Givarens namn visas i gruppen där klappen paxades.

## Grupp och inbjudningar

Gruppens deltagare finns under flikarna. Ägaren öppnar **Grupp och inbjudningar** för att bjuda in fler. Gruppägaren anger visningsnamn och mejladress och kan lägga till ett beskuret porträttförslag. Sedan skapar ägaren länken och delar den via exempelvis Messenger. Länken gäller i sju dagar och kan kopieras igen eller återkallas. Efter mejlbekräftelsen ser mottagaren sitt visningsnamn och sitt eventuella porträttförslag. Mottagaren kan godkänna bilden, ladda upp en egen eller välja pepparkakan. Medlemskapet och bildvalet sparas tillsammans. För äldre inbjudningar får mottagaren fortfarande skriva sitt visningsnamn. En förhandsvisning förbrukar aldrig länken. Endast ägaren ser inbjudningarnas mejladresser.

Projektadministratören skapar pilotgrupper i Firestore. Dokumentet i `groups/{grupp-id}` innehåller `name`, `ownerUid`, `capacity`, `memberUids` (från början ägarens Firebase Authentication-UID) och `members` (för varje UID en karta med `name` och `slot`). Ägarens plats är strängen `"0"`. Övriga platser och inbjudningar skapas när gruppägaren bjuder in någon. Familjens uppgifter hanteras i projektets databas.

## Grupporträtt och paxningsljud

När en inbjuden person har gått med öppnar gruppägaren **Grupp och inbjudningar**, väljer **Välj porträtt** på personens medlemskort och väljer en PNG-, JPEG- eller WebP-bild. Det går att justera utsnitt och zoom före **Skicka porträttförslag**. Medlemmen får se bilden ovanför flikarna och väljer **Godkänn porträtt** eller **Använd pepparkakan**. Varje medlem kan även ladda upp en egen bild eller byta tillbaka till pepparkakan från sitt medlemskort.

Mobilen skapar en kvadratisk JPEG-miniatyr på 256 × 256 pixlar, högst 48 KiB. Gruppens ID och medlemmens Firebase-UID kopplar bilden till medlemskortet, önskelistan och klapparna till personen i givarens tomtesäck. Ingen uppladdning till publik Hosting eller separat Storage-bucket behövs. Firestore lagrar förslaget i `groups/{grupp-id}/portraitSuggestions/{uid}`. Gruppägaren och den avbildade kan öppna det. När medlemmen godkänner kopieras exakt det visade porträttet till gruppens `portraits/{uid}` och förslaget tas bort i samma transaktion. Appen visar den godkända bilden för gruppen.

Efter en bekräftad paxning flyger ett paket ner i en tomtesäck på givarens skärm. Julbjällran vid gruppnamnet slår av och på paxningsljudet. Valet sparas på enheten. Vid minskad rörelse visas paxningsstatus direkt, och ljudet följer fortfarande ljudknappen.

## Kör lokalt

Använd Node.js 24 och Java 21. Kör följande i projektmappen.

```sh
npm ci
npm run dev
```

Öppna <http://127.0.0.1:5000>. Firebase kör Authentication, Firestore och Hosting lokalt med projekt-ID `demo-julklappsappen`. Använd påhittade testadresser. Emulatorn skriver ut länkar för adressbekräftelse och lösenordsåterställning i terminalen.

Kör testerna för grupper, önskelistor, samtidiga paxningar, porträtt och sekretess med emulatorerna avstängda.

```sh
npm test
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
