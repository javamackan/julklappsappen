# Julklappsappen

Mobilwebbapp i React och TypeScript för familjens julklappslistor. Projektgrunden innehåller inloggning med mejl och lösenord, adressbekräftelse, utloggning och **Glömt lösenord?**. Medlemskap och inlösen av gruppinbjudningar tillkommer i nästa steg.

## Kör lokalt

Använd Node.js 24 och Java 21. Kör följande i projektmappen.

```sh
npm ci
npm run dev
```

Öppna <http://127.0.0.1:5000>. Firebase kör Authentication, Firestore och Hosting lokalt med projekt-ID `demo-julklappsappen`. I den lokala testmiljön skriver Firebase ut länkar för adressbekräftelse och lösenordsåterställning i terminalen. Använd påhittade testadresser.

## Publicera familjens testversion

Familjens projekt-ID är `julklappsappen`. Webbappen är registrerad och kopplad till klassiska Firebase Hosting. **Email/Password** är aktiverat under Authentication. Projektet använder Spark.

### Från ZIP-filen med färdigbyggd webbapp

På Windows med Node.js 24 packar du upp hela ZIP-filen och öppnar PowerShell i undermappen `julklappsappen`, där `package.json` ligger. Kör följande kommando.

```powershell
npm.cmd run publicera
```

Logga in med projektets Google-konto när Firebase öppnar webbläsaren. Kommandot hämtar vid behov Firebase CLI och publicerar den byggda webbappen i `dist` till `julklappsappen`. På macOS och Linux fungerar `npm run publicera` i samma mapp.

Du kan också ladda upp `Julklappsappen-projektgrund.zip` via **⋮ → Upload** i [Google Cloud Shell](https://shell.cloud.google.com/). Kör följande i terminalen.

```sh
pilotmapp=$(mktemp -d)
unzip -q ~/Julklappsappen-projektgrund.zip -d "$pilotmapp"
cd "$pilotmapp/julklappsappen"
npx --yes firebase-tools@15.37.0 deploy --only hosting --project julklappsappen
```

Om Firebase efterfrågar inloggning i Cloud Shell, kör `npx --yes firebase-tools@15.37.0 login --no-localhost`, följ Googles anvisningar och kör publiceringskommandot igen.

### Från källkoden

```sh
npm ci
npm run build
npm run publicera
```

Öppna adressen som står efter **Hosting URL** på mobilen. Skapa ett testkonto med din egen mejladress och prova både adressbekräftelsen och **Glömt lösenord?**. Hosting levererar webbappens offentliga konfiguration på `/__/firebase/init.json`.

Det första inloggningstestet använder Firebase Authentication. Cloud Firestore sätts upp i nästa steg, inför de privata familjelistorna. Reglerna i `firestore.rules` nekar all åtkomst tills gruppbehörigheterna har byggts.

## Inbjudningar

En inbjudan ska vara en vanlig HTTPS-länk som går att kopiera och skicka i valfri kanal. Hosting leder även direkta länkar in i webbappen. Inloggning, verifierad inbjuden mejladress och giltig inbjudan ska kontrolleras innan medlemskap ges. En förhandsvisning av länken ska aldrig lösa in inbjudan.
