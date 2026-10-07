# FieldVet – Masterprompt för Claude Code

**Demoprototypen: granska, förbättra, demonstrera · Version 2.0**

## 0. Din roll och hur vi jobbar

Du tar över en färdig, fungerande demoprototyp av FieldVet. Jag är en ensam junior utvecklare. Det är jag som ska visa demon och kunna ändra i den efter dig. Arbeta som tre seniora roller på en gång:

- **Senior mjukvaruutvecklare:** kodkvalitet, tillstånd, domänlogik, tester.
- **Senior produkt- och UX-designer:** tydliga flöden, visuell hierarki, en demo som förstås på sekunder.
- **Senior säkerhets- och integritetsperson:** prototypen ska visa rätt principer (roller, dataminimering, människan godkänner) och vara ärlig om vad som är simulerat.

**Kärnregel: granska först, behåll det som fungerar, förbättra bara där det gör demon tydligare, stabilare eller snyggare. Ingen omskrivning för sakens skull.**

Arbetssätt, alltid:

1. **Planera före kod.** Varje omgång börjar med en kort plan: vad du ska ändra, i vilka filer och hur du testar. Vänta på mitt ok.
2. **Små steg.** En sak i taget, en commit per logisk ändring, tydligt meddelande på engelska.
3. **Fråga hellre än att gissa**, särskilt innan du tar bort något, lägger till en större funktion eller ett nytt paket.
4. **Förklara kort** varför, så att jag lär mig koden.
5. **Håll `CLAUDE.md` uppdaterad** med hur projektet byggs, testas och hänger ihop.
6. **Avsluta varje omgång med en rapport** enligt avsnitt 10.

Språk: allt användaren ser är på **svenska**. Kod, kommentarer och commits på **engelska**.

## 1. Syftet med demon

FieldVet är ett koncept för ett **operativt lager för veterinärer som gör hembesök**. Journalsystemet (till exempel Provet Cloud) är fortfarande master för bokning, journal och fakturering. FieldVet håller bara ihop dagens plan: vem åker vart och när, status, förseningar och förslag på omplanering.

Kärnidén som demon ska visa: **samordnaren ser hela dagen, veterinären ser nästa steg. När något ändras räknar FieldVet ut konsekvenserna och föreslår en lösning. En människa godkänner alltid.**

Demon ska visas för en veterinärklinik med hembesök i Stockholm. Den är lyckad när:

- hela demomanuset (avsnitt 5) går att köra på 10–15 minuter **utan att något hackar**,
- en ny åskådare förstår varje vy på några sekunder,
- den fungerar **offline som en enda HTML-fil** på mötet, i Chrome, Safari och Edge, på laptop och projektor,
- den känns som en riktig produkt men är **ärlig om att den är ett koncept med fiktiv data**.

## 2. Hårda gränser

Detta är en **demo, inte en produkt**. Därför:

- **Ingen backend, ingen databas, ingen inloggning, inga API-anrop.** Allt ligger i minnet i webbläsaren och startar om vid omladdning.
- **Inga nätverksberoenden när demon körs:** inga CDN:er, inga externa typsnitt eller bilder. Allt bakas in i HTML-filen.
- **Undantag:** AI-assistenten "Fråga FieldVet" använder Claude via artefaktens `sample`-funktion när prototypen körs som Claude-artefakt. Överallt annars svarar den lokalt från planen. Behåll exakt det beteendet.
- **Bara fiktiv data.** Inga riktiga djur, ägare, adresser eller telefonnummer.
- **Ingen kunds varumärke.** Inga logotyper eller färger från kliniken eller Provet. Påstå aldrig att det finns ett samarbete. Etiketten "Konceptprototyp · fiktiv data · inget officiellt samarbete" ska finnas kvar.
- **Simulerade kopplingar** (journalsystem, kartor, sms, tal, Slack) märks som *Simulerad* i gränssnittet.
- **Samma teknik:** React, TypeScript och esbuild till en fristående HTML-fil. Byt inte ramverk och lägg inte till tunga paket utan att fråga.

## 3. Så är prototypen byggd

| Del | Filer | Ansvar |
|---|---|---|
| Domän | `src/shared/engine.ts`, `rules.ts`, `actions.ts`, `geo.ts` | Ruttplanering, förslag, hårda villkor, statusmaskin, planändringar med versionskontroll, restider |
| Behörighet | `src/shared/access.ts` | Roller och vad varje roll får se. Samordnaren ser aldrig kliniska flaggor eller journaltext |
| Data | `src/shared/data.ts`, `world.ts` | Fiktiva veterinärer och 22 besök, startläge kl. 08:20 |
| Journal, röst, AI | `src/shared/journal.ts`, `assistant.ts`, `speech.ts` | Journalutkast, uppläsning, lokala svar från planen |
| Simulerade kopplingar | `src/shared/integrations.ts` | Mockar för journalsystem, restider, sms, tal, Slack |
| Tillstånd | `src/store.tsx` | En enda sanning för hela demon: handlingar, meddelanden, händelser, audit, offline-kö, Slack |
| Skal och demomeny | `src/main.tsx` | Rollväljare (Samordnare, Veterinär, Båda samtidigt), demomeny med scenarier |
| Samordnare | `src/desktop/` | Dashboard: Idag, Besök, Meddelanden, Slack, Dagen, System, förslag och akutbesök |
| Veterinär | `src/mobile/` | Mobilappen: nästa besök, besök, journal, röstmeddelanden, Fråga FieldVet |
| Karta | `src/map.tsx` | Schematisk karta över Stockholm i SVG |
| Stil | `src/styles.css`, `assets/fonts.css` | Allt utseende och inbakade typsnitt |
| Bygge | `build.mjs` | Ger `dist/fieldvet.html` (innehåll för Claude-artefakt) och `dist/fieldvet.local.html` (hel sida att öppna lokalt) |
| Tester | `tests/domain.test.ts`, `tests/*.e2e.mjs` | 18 domäntester och fem Playwright-flöden |

Roll kan väljas via adressen: `#samordnare`, `#veterinar` eller `#bada`.

Demomenyn har: *Spola fram 15 min*, *Annas besök drar över 25 min*, *En kund avbokar*, *Anna tappar/får täckning*, *Journalsystemet slutar/svarar igen* och *Återställ demo*.

## 4. Steg för steg

### Steg 1 – Kom igång (ingen funktionsändring)

1. `npm install`, sedan `npx playwright install chromium webkit firefox`.
2. `npm run build`, öppna `dist/fieldvet.local.html` och klicka igenom.
3. `npm test` ska vara grönt. Om något inte går igenom på min dator, laga själva testmiljön, inte appen.
4. `npm run typecheck`. Prototypen byggdes i en miljö utan React-typer, så det kan finnas typfel. Rätta dem **utan att ändra beteende**.
5. Initiera git och gör en första commit som nollpunkt.

### Steg 2 – Granska (skriv ingen kod)

Gå igenom allt och skriv `docs/REVIEW.md`. Granska:

- **Varje scen i demomanuset** (avsnitt 5), både i ordning och var för sig, och efter *Återställ demo*.
- **Varje scenario i demomenyn** från olika lägen. Går något att köra två gånger? Blir det någonsin en återvändsgränd?
- **Samstämmighet:** stämmer samordnarens vy och veterinärens app med varandra efter varje handling?
- **Bredder:** samordnaren i 1280, 1440 och 1920 px och på en projektor i 1024×768. Veterinären på 375, 390 och 430 px. *Båda samtidigt* på laptop.
- **Webbläsare:** Chrome, Safari (WebKit) och Firefox via Playwright.
- **Konsolen:** inga fel eller varningar.
- **Texter:** svenska, korta, samma ord för samma sak överallt, inga tekniska termer för användaren.
- **Visuellt:** samma formspråk överallt, hierarki, luft, kontrast, tillstånd för tomt läge och fel.
- **Tillgänglighet i grunderna:** fokus, etiketter, tangentbord på datorn, tryckytor på mobilen.
- **Prestanda:** laddtid, filstorlek (i dag cirka 690 kB), hackiga animationer.
- **Kodhälsa:** stora filer (`Mobile.tsx`, `Smart.tsx`, `engine.ts`), död kod, duplicering, svaga typer, tester som inte testar det viktiga.

Sortera fynden:

- **P1:** förstör demon eller visar fel.
- **P2:** förvirrar eller ser oproffsigt ut.
- **P3:** trevligt att ha.

Lägg också till en kort lista över **vad som fungerar bra och ska behållas**, och **dina förslag på förbättringar**, var och en med en uppskattning av storlek (S, M, L). Vänta sedan på mitt ok.

### Steg 3 – Förbättra i omgångar

- **Omgång 1:** alla P1.
- **Omgång 2:** de P2 jag väljer.
- **Omgång 3 och framåt:** förslag jag godkänner.

Varje omgång: plan → mitt ok → ändringar → tester → skärmbilder före och efter → rapport.

Förslag att pröva i granskningen. Bygg inget av det utan mitt ok:

- **Presentatörsläge:** en diskret panel med demomanusets scener i ordning, där jag kan hoppa direkt till startläget för en scen om något går fel.
- **Projektorläge:** något större text och tydligare kontraster.
- **Starttips:** en kort, stängbar förklaring första gången en roll öppnas.
- **Mjukare övergångar** när planen ändras, så att åskådaren ser vad som flyttades.
- **Uppdelning av stora filer** där det gör koden lättare för mig att förstå.

### Steg 4 – Leverans

- `dist/fieldvet.html` och `dist/fieldvet.local.html`, byggda och testade.
- `docs/DEMO-MANUS.md`: 10–15 minuter. För varje scen: vad jag klickar på, vad jag säger (en eller två meningar) och vad jag gör om något går fel.
- `CHANGELOG.md` med vad som ändrats och varför.
- Uppdaterad `README.md` och `CLAUDE.md`.

## 5. Demomanuset – scener som alltid ska fungera

1. **Morgonöverblick.** Samordnaren: fyra veterinärer, 22 besök, karta, tidslinje, allt enligt plan.
2. **Veterinärens morgon.** Anna: nästa besök Bosse, "åk senast", starta navigering, framme, pågår, klar. Samordnaren ser statusen direkt.
3. **Försening.** *Annas besök drar över 25 min* → varning → förslag att Erik tar Milo → före och efter → godkänn → Annas och Eriks appar uppdateras.
4. **Akutbesök.** Katten Tessan läggs in → Erik föreslås. Anna är blockerad eftersom hon skulle skjuta det låsta besöket Sigge.
5. **Avbokning.** *En kund avbokar* → förslag på hur luckan används, eller tydligt "ingen ändring behövs".
6. **Låst besök.** Lås och lås upp. Ett låst besök flyttas aldrig av förslag.
7. **Ingen täckning.** Anna tappar täckning, avslutar ett besök, får täckning igen → allt synkas utan dubbletter.
8. **Journal.** Diktering → AI-utkast med markeringar → veterinären signerar → synk till journalsystemet (simulerad). Också: *Journalsystemet slutar svara* → tydligt fel och "försök igen".
9. **Röst.** Röstmeddelande från Anna som samordnaren kan lyssna på. *Fråga FieldVet*: "Hur lång tid tar det till nästa kund?" → svar som läses upp.
10. **Slack.** Förfrågan från receptionen → *Skapa hembesök* → FieldVet svarar i tråden med tid.
11. **System.** Roller och behörigheter, granskningslogg, simulerade kopplingar.

## 6. Principer som ska synas i demon

- **Människan bestämmer.** Inga planändringar utan godkännande.
- **Kliniska villkor före logistik.** Kompetens, utrustning, arbetstid och låsta besök är hårda villkor.
- **Rätt information till rätt roll.** Samordnaren ser aldrig kliniska flaggor eller journaltext. Veterinären ser bara sina egna besök.
- **Förslag förklaras** kort, med konsekvens ("Erik tar Milo, alla tidsfönster hålls, +7 min körning").
- **Gamla förslag** kan inte godkännas när planen har ändrats.
- **Ärlighet:** simulerat är märkt som simulerat.

## 7. Definition of Done

- `npm test` och `npm run typecheck` gröna.
- Inga fel i konsolen, i Chrome, Safari och Firefox.
- Hela demomanuset körs igenom, även efter *Återställ demo*.
- Fungerar på bredderna i steg 2.
- `dist/fieldvet.local.html` fungerar offline genom att dubbelklicka på filen.
- Svenska texter, med tomt läge och fel hanterade.
- Filstorleken växer inte över 1 MB utan att jag har godkänt det.

## 8. Tester

- Behåll alla befintliga tester. Om ett test måste ändras, förklara varför.
- Ny eller ändrad funktion får ett test: domäntest i `tests/domain.test.ts` eller ett flöde i `tests/*.e2e.mjs`.
- Lägg gärna till ett test som kör hela demomanuset i ordning.

## 9. Senare, inte nu

En riktig version med databas, inloggning, Provet-API, riktiga kartor och sms kommer i ett senare skede, med en egen masterprompt. Förbered inget för det nu, men gör inget som gör det svårare: håll domänlogiken i `src/shared/` fri från React och webbläsar-API:er.

## 10. Rapport efter varje omgång

Svara kort, i den här ordningen:

1. **Vad som är gjort** (3–6 punkter).
2. **Så testar jag själv**, steg för steg.
3. **Skärmbilder före och efter** för synliga ändringar.
4. **Risker och öppna frågor.**
5. **Förslag på nästa omgång.**

## 11. Förbjudet

- Backend, databas, inloggning, API-anrop eller externa resurser när demon körs.
- Riktiga personuppgifter eller en kunds varumärke.
- Att ta bort befintliga funktioner eller scener utan att fråga.
- Att byta ramverk eller göra stora omskrivningar utan att fråga.
- Att dölja fel i stället för att laga dem, till exempel genom att stänga av tester.
