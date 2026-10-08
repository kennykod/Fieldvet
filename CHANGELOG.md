# Ändringslogg

## Ångra fungerar även efter några sekunder (8 oktober 2026)

**Rättat**
- **Ångra:** efter en flytt nekades Ångra så fort Provet svarat att ägaren fått ny tid (efter ungefär en halv sekund). Nu spärrar bara ändringar i själva planen Ångra, inte meddelandestatus eller logg (`src/store.tsx`).
- **Testet `ops`:** väntar nu 2,5 sekunder innan Ångra trycks, så att felet inte kan komma tillbaka obemärkt.

## Kartan hackar inte längre, alla tester gröna (7 oktober 2026)

**Rättat**
- **Kartan:** zoomanimeringen kunde ge negativa mått och få kartan att blinka. Webbläsarens bildrutetid kan ligga lite före starttiden, och då blev framstegen negativa. Framstegen hålls nu mellan 0 och 1 (`easeProgress` i `src/map.tsx`), med ett nytt domäntest.
- **Testet `safety`:** sökvägen till `dist/web/index.html` blev fel i Windows (`file:///C:/C:/…`).
- `npm test` är nu helt grönt i Windows: 33 domäntester och tio Playwright-flöden.

## Typkontrollen grön (7 oktober 2026)

**Rättat, inget ändrat beteende**
- `npm run typecheck` ger 0 fel (tidigare 16). Den nyare TypeScript-versionen (5.9) var striktare.
- `src/lib/xlsx.ts`: tydligare typ för binärdata till `Blob`. Byggd kod är identisk.
- `src/ui.tsx`: statusstegens etikett kontrollerar `avbokad` först, så att TypeScript förstår indexet. Samma logik.
- Tester: `@types/node` tillagt som utvecklingspaket, dubbel import borttagen i `tests/domain.test.ts`.
- `tests/flows.ts` (felsökningsskript) packar upp `{ ok, world }` från planändringar och kraschar inte längre. Oanvända importer borttagna i `tests/print.ts`.

## Inramad karta, rättad rapport och färgdemo (4 oktober 2026)

**Rättat**
- **Rapport:** staplarna under "Per veterinär" visade grå streck över hela sidan. De delade klassnamnet `b-drive` med teamtavlan. Nu heter de `rb-clin`, `rb-drive` och `rb-idle`.

**Tydligare Idag-vy**
- **Två kort:** teamtavlan och kartan ligger som två rundade kort på bakgrunden, som i Rapport.
- **Kartan har ett eget huvud:** "Karta · Var teamet är just nu", en förklaring (veterinär, nästa besök, försenat) och knappen "Dölj karta". Väljer man ett team står det till exempel "Johans rutt · Visa alla".
- **"Visa karta"** syns i tavlans huvud bara när kartan är dold.
- **Rapport:** förklaringen har neutral färg, eftersom staplarna har veterinärernas färger. Varje rad visar nu också klinisk tid. Korten i nedre raden sträcks inte ut.

**Färgdemo**
- **Färgtema i demomenyn:** FieldVet (grön), Klinikens rosa, och "Egen" med en färgväljare.
- **Bara accentfärgen byts:** knappar, logga och markeringar. Statusfärgerna (sen, akut, klar, ledigt) och veterinärernas färger ligger fast.
- **Läsbar text:** knappfärgen mörkas automatiskt tills den vita texten når kontrast 4.5:1.
- **Färg via länk:** `?farg=rosa` eller `?farg=c2185b` öppnar demon direkt i den färgen. Valet sparas också för fliken.

## Teamtavlan och förfinad app (4 oktober 2026)
Samordnarens Idag-vy är omgjord kring en rad per team. Veterinärappen är förfinad för körning.

**Samordnaren**
- **Teamtavlan** (`src/desktop/Board.tsx`) ersätter tidslinjen, teamkorten i sidan och filtret på kartan. Varje team har:
  - en rad med läget i en mening, till exempel "Pågår hos Luna · klar ca 10:55"
  - avvikelse i gult, med ett klick till lösningen
  - ledig tid i grönt ("Plats för akut · 1 h 27 ledigt från 10:05")
  - kommunikationsläget medan veterinären kör
  - en stapel för dagens besök
  - besöken som breda block
- **Tidsfönster:** "Från nu" visar från 45 minuter bakåt till 3,5 timmar framåt, med namn som går att läsa. "Hela dagen" visar allt. "+2 senare" byter till hela dagen.
- **Lediga luckor** visas som gröna streckade block. Ändrad tid syns som en streckad linje under blocket, där besöket låg i morgonplanen.
- **Kedjan syns:** håller man över ett besök markeras de besök det skjuter framåt.
- **Påverkan innan man släpper:** när man drar ett besök till ett annat team står det till exempel "Till Erik · framme 11:20 · +12 min körning", eller "Går inte: …". Bekräftelsen sker som förut.
- **Nästa timme** ersätter teamkorten i sidan: vad som händer härnäst, för alla team i en lista.
- **Kartan** ligger under tavlan och kan döljas. Förhandsvisningar visar den alltid.
- **Sammanfattningen** högst upp blir röd vid akuta patienter och gul vid planeringsärenden.
- **Kortkommandon:** N för nytt akutärende, / för sök, Esc tillbaka och Ctrl/Cmd+Z för att ångra.
- **Menyn:** Rapport och System ligger längre ned i vänstermenyn.

**Veterinären**
- **Dagens stapel** under hälsningen, en ruta per besök.
- **Körläge:** när hon är på väg visar kortet bara ankomst, bokad tid, allergi, portkod, parkering, kommunikationsläget och en mindre karta. Allt får plats ovanför knappen.
- **När dagen är klar** visar kortet antal besök, kilometer och signerade journaler.

**Borttaget**
- Gamla tidslinjen (`Timeline.tsx`), teamkorten i sidan, veterinärfiltret på kartan och oanvänd kod och importer.

**Tester och dokument**
- Testerna är uppdaterade för tavlan, med nya kontroller för tidsfönster, att kartan kan döljas, kortkommandot N och påverkan innan man släpper.
- Pitchen (22 sidor) och onboardingen (14 sidor) har nya bilder och texter om teamtavlan.

## Provet i bakgrunden: kundmeddelanden och historik via Provet (2 oktober 2026)
Byggt enligt `FieldVet_Provet_Masterprompt.pdf`. Samma prototyp, ingen ny parallell modul.

**Ändrad UX**
- Veterinären: Starta navigering ger På väg och ankomsttid. Kortet visar Skickar… och sedan "Karin informerad via Provet ✓". Ny tid visas som "Ny ankomsttid skickad ✓". Inga sms-kontroller i appen.
- Visa historik ersätter Visa mer: på besökskortet, i besöket och under besöket. Historiken öppnas ovanpå besöket, så du kommer tillbaka till samma ställe. Den visar en kort lista med diagnoser, läkemedel och åtgärder, och hela anteckningen hämtas en i taget. Under listan står "Hämtat från Provet · uppdaterat hh:mm · endast läsning" och knappen Öppna i Provet.
- Viktigt inför besöket visar nu också mediciner från Provet.
- Samordnaren: besöket visar kommunikationsläget. Det kan vara informerad via Provet, kunde inte skickas (med Försök igen och Kontakta ägaren) eller tar inte emot sms (med Jag har ringt). Teamkortet visar läget medan veterinären kör.
- Under Behöver åtgärdas syns bara misslyckade meddelanden och ägare som behöver ringas.
- Mer → Visa ändringar idag (tidigare Visa historik), så att det inte blandas ihop med patienthistorik.
- System → Provet idag visar vad som skickats, vad som väntar, vad som misslyckats, vad som blockerats av ägarens val, stoppade dubbletter, sparade journaler och historikläsningar.

**Provet-gränsen**
- `src/shared/provet.ts` innehåller fem adaptrar: ProvetBookingAdapter, ProvetPatientAdapter (kontaktval), ProvetClinicalHistoryAdapter, ProvetMessagingAdapter och ProvetJournalWritebackAdapter.
- Kommunikation sker som händelser med idempotensnyckel. FieldVet stoppar dubbletter i sin logg, och Provet-adaptern ignorerar en nyckel den redan sett.
- `COMM_RULES` styr när en ny tid skickas: minst 10 min ändring, en tyst period och en gräns för stora ändringar.
- Behörigheten `history:read` gäller bara veterinären och bara egna patienter. Den kontrolleras innan adaptern anropas, och läsningarna loggas utan klinisk text.
- Journalens write-back är idempotent: ett nytt försök skapar aldrig en andra anteckning.
- När Provet svarar igen skickas misslyckade meddelanden om med samma nyckel.

**Demo och tester**
- Ny guidad demo, Provet i bakgrunden, med sju steg från kl. 08:20.
- Nya händelser i demomenyn: Köer på Annas väg (+20 min) och Appen skickar samma händelse igen.
- Fiktiva kontaktval: ägarna till Sigge och Frasse har fast telefon och tar inte emot sms.
- Tester: 8 nya domäntester och `tests/provet.e2e.mjs`, som kör hela scenariot. Det omfattar fel, kontaktval, offline och åtkomst.
- Ny pitch (22 sidor, tre nya sidor om Provet) och ny onboarding (14 sidor, nya sidor om kundmeddelanden och Visa historik). Bilderna tas med `scripts/capture-provet.mjs`.

## Tydlighetspass: färre beslut, lugnare skärmar (2 oktober 2026)
Byggt enligt `FieldVet_Clarity_Simplification_UX_Prompt.pdf`. Samma prototyp, inga nya moduler eller beroenden.

**Borttaget**
- Klocka, plan-chip, driftstatus, klocka/notisikon och KPI-ruta på kartan i samordnarens topprad. Knappen Optimera dagen i toppen.
- Dubbla prioritetsetiketter och kapacitetschips i förslagsraderna.

**Sammanslaget**
- En sammanfattning högst upp ("N behöver din uppmärksamhet" / "Allt ser bra ut") i stället för flera statusytor.
- En enda yta för beslut: **Behöver åtgärdas**. Kliniska ärenden (röd, Akut patient) skiljs från planering (gul). Info som inte kräver beslut visas inte där.
- Veterinärappen: tre flikar (Idag, Rutt, Inkorg). Profilen ligger bakom avataren.

**Dolt tills det behövs**
- Under **Mer**: Se förslag för hela dagen, Importera bokningar, Visa historik. I ett besök: Lås tiden och Avboka.
- Andra alternativ i förslag, andra team vid akutärenden, besökets historik, ägare/fler uppgifter i akutformuläret, valfria anteckningar/bilder under besök.

**Förenklat**
- Ett rekommenderat förslag först, med en rad om resultatet, bekräftelse och **Ångra** i 8 sekunder.
- Vanliga ord: Planerat, På väg, Framme, Pågår, Klart. Kapacitet i ord ("Har plats för ett akutbesök").
- Teamkort och karta: en rad per team, bara nästa sträcka framhävd. Tidslinjen visar NU och tonar ned det som passerat.
- Appens startsida: Åk senast / Framme ca / Bokad tid, bara avvikelser i utrustning, en fast knapp längst ner. Efter besöket: Diktera journal eller Nästa besök.
- Akutärende och överlämning till klinik: färre fält, tydliga steg.

**Nytt akutärende: kunden ringer in**
- Formuläret är tomt när man trycker Nytt akutärende. Ärenden från receptionen eller Slack är fortfarande ifyllda. Länken "Fyll i exempel (demo)" fyller i Tessan för visningar.
- Adressen skrivs in för hand: gatuadress, postnummer och ort, portkod och åtkomst. Kända adresser föreslås medan man skriver. FieldVet placerar adressen via känd adress, stadsdel eller postnummer och visar "Hittad · Kungsholmen". Hittas inte området väljer man stadsdel.
- Ägare och telefon ligger i huvudformuläret, eftersom telefonnumret behövs för sms med ankomsttid. Saknas adress eller anledning står det vid knappen.

**Bevarat**
- All funktionalitet från fas 2: motorn, regler, låsta tider, ETA till ägaren, klinik, import, Slack, röst, journal, rollskydd, offline, historik och guidad demo.
- Testerna: 24 domäntester och 9 flöden i webbläsaren, uppdaterade till de nya orden.
- Nya dokument: `docs/FieldVet_pitch.pdf` (20 sidor) och `docs/FieldVet_Onboarding.pdf` (12 sidor). Bilder tas med `scripts/capture-v3.mjs`.

## Fas 2: akutflöde, påverkan, kundens ETA, överlämning till klinik och guidad demo (30 september 2026)
Byggt enligt `FieldVet_Claude_Phase2_Prompt.pdf`. Samma stack och designspråk, inga nya beroenden.

**Tillagt**
- Knappen **Akutbesök**: välj hur bråttom (inom 30 min / 1 h / 2 h / idag), bara det viktigaste i formuläret, resten under "Fler uppgifter". Inget läggs in förrän ett team är valt. Stängs rutan utan tilldelning ligger ärendet kvar under Att hantera.
- Föreslagna team med etikett (Bäst lämpad / Möjlig / Stor påverkan / Ej möjlig), körtidspåverkan, vad som händer med nästa besök, belastning, status, plats och ankomstfönster. Samma rader används vid omfördelning. Text under listan: förslagen är operativa, ingen medicinsk bedömning.
- Bekräftelse från veterinären: nytt akutbesök syns överst i appen med **Uppfattat**. Samordnaren ser "Väntar på att … bekräftar" tills dess.
- Kundens ETA: sms och länk skickas automatiskt när veterinären kör, när ett akutbesök tilldelas, vid flytt, vid godkänd ny plan och när samordnaren skickar ny tid. Uppdateras om ankomsten ändras mer än 10 min. **Kundens vy** visar exakt vad ägaren ser: förnamn, tidsfönster, status och kontaktråd, inget annat.
- Överlämning till klinik: **Fortsätt på kliniken** under pågående besök (behov, prioritet, önskad tid, kort notering). Samordnaren får ett ärende och väljer nästa lediga kliniktid, akut ankomst eller att avvakta. Veterinären, ägaren och klinikkanalen i Slack får besked.
- Besökets **Händelser idag**: vem gjorde vad och när, inklusive flytt, ETA, bekräftelse och klinikfortsättning.
- **Redo för besöket** på nästa besök i appen: adress, kundbekräftelse, journalhistorik, specialutrustning och parkering.
- Synkstatus i appen: Synkad / Uppdaterar… / Offline (demo). Rolletikett för samordnaren i menyn.
- **Guidad demo** i nio steg med markering och "Gör det åt mig". Fast startläge 09:45, går att spela om.
- Simulerad klinikkalender bakom ett eget gränssnitt (`integrations.clinic`).
- Tester: två nya domäntester och `tests/story.e2e.mjs` som kör hela berättelsen två gånger.
- Pitchen (`docs/FieldVet_pitch.pdf`) är uppdaterad: nya bilder, tre nya bilder om akutbesök, kundens ETA och hembesök till klinik, och flödesbilden visar den guidade demon. Bilderna tas med `scripts/capture-phase2.mjs`.

**Förbättrat**
- Motorn provar alla insättningspunkter och väljer den billigaste som inte bryter en regel, så ett akutbesök kan läggas senare inom sitt fönster i stället för att spärras. Ett låst besök som redan var sent spärrar bara om det blir senare. Akutbesök spärras om ankomsten blir mer än 30 min efter önskat fönster.
- Kön "Att hantera": otilldelade akutärenden och klinikärenden först.
- "Behåll planen" skickar tiden som ett 15-minutersfönster och öppnar besöket så att det syns att ETA:n är skickad.

**Bevarat**
- Allt från tidigare omgångar: driftsammanfattning, teamkort, risknivåer, kapacitet, import, Slack, röst, journal, rollskydd, offline och återställning. Samma namn, färger och märkning.

**Medvetet inte tillagt**
- Lager, försäkring, lab, CRM, lön och schemaläggning av personal, kundportal, medicinsk AI, ny navigation, backend.

## Driftläge för samordnaren (30 september 2026)
Byggt enligt `FieldVet_Claude_Enhancement_Prompt.pdf`. Befintlig prototyp förbättrad, ingen ny stack eller nya beroenden.

**Tillagt**
- Driftsammanfattning över kartan: team i fält, besök klara, pågår, förseningsrisker (klickbar) och akutluckor inom 3 h.
- Klick på en teammarkör öppnar ett kompakt teamkort: status, nästa patient, ETA, avvikelse, kapacitet, "Meddela" och "Öppna besök".
- Lugna risknivåer: Enligt plan / Bevaka (≤15 min) / Åtgärda (>15 min).
- Kön "Att hantera" med typerna förseningsrisk, akutbesök som väntar på tilldelning, övertid, kund som väntar på ny ETA och flytt. "Skicka ny ETA" (simulerat sms) och "Behåll planen" skickar ny tid och tonar ned risken.
- Kapacitetsetiketter per team: Ledig kapacitet / Balanserad / Hög belastning / Risk / Klar för dagen, med "X besök kvar · Y ledigt".
- Snabb omfördelning: 2–4 föreslagna team med område, kapacitet och påverkan, och "Bekräfta flytt till …". Därefter visas den mottagande veterinärens plan.
- En statusmodell överallt: Planerad → På väg → Framme → Pågår → Klar (stegvisning i besökspanelen).
- Mobilen: "Uppdaterad av samordnaren" på nästa besök när det flyttats eller fått ny tid. Välj vilken veterinärs app som visas i "Båda samtidigt".
- Nytt test `tests/ops.e2e.mjs` som kör hela demoscenariot.
- Namnfiltret på kartan ligger direkt under sammanfattningen när kartan är smal (laptop, projektor, mobil), i stället för att sväva mitt i kartan.

**Förbättrat**
- Sidopanelen heter "Team och kapacitet". Kön visar de tre viktigaste först.
- Tydligare spärrtexter vid omfördelning ("Går över passet …", "Krockar med schemat …").

**Bevarat**
- Karta, tidslinje, akutflöde, import, Slack-fliken, röstassistent, journal, rollskydd, återställning och all fiktiv data. Märkningen "Konceptprototyp · fiktiv data" finns kvar.

**Medvetet inte tillagt**
- Raster, sparad status mellan omladdningar (omladdning återställer demon med flit), fler än fyra team, ny drag-och-släpp-logik, inloggning, betalning, medicinsk AI och ändrat varumärke.

## Importera bokningar (30 september 2026)
- Knappen **Importera** i samordnarens dashboard läser en export (Excel .xlsx eller CSV) direkt i webbläsaren.
- Kolumnerna kopplas automatiskt och kan ändras. Raderna kontrolleras: tider, adresser, besökstyper, veterinärer och dubbletter.
- Adresser placeras per stadsdel eller postnummer på den schematiska kartan. Adresser utanför kartan rättas med ett val.
- Välj "Behåll veterinär från filen" eller "Låt FieldVet fördela alla". Besöken fördelas efter plats, tid, kompetens och utrustning, och rutterna planeras.
- Exempelfiler i `examples/`. Nya tester: importfunktioner i `tests/domain.test.ts` och `tests/import.e2e.mjs`.

## Delbar demo (30 september 2026)
- Introduktion för besökare som klickar runt själva (visas första gången, går att öppna igen via Demo → Så fungerar demon). Presentatörslänk utan introduktion: lägg till `?intro=0` i adressen.
- `npm run build` ger nu också `dist/web/` (index.html, robots.txt, _headers) för gratis hosting på Cloudflare Pages eller Netlify. Sidan är dold för sökmotorer.

## Omgång A – demosäkerhet (30 september 2026)
- "Återställ demo" kan inte längre ge vit skärm: all lokal UI-status nollställs vid återställning, och ett felskydd visar "Återställ demo" i stället för en tom sida om något ändå kraschar.
- Meddelanden från samordnaren syns som olästa i veterinärens app (siffra på fliken och kort på startsidan). Avbokningar av egna besök likaså.
- Ett förslag som togs fram innan veterinären hann vidare kan inte längre ge en omöjlig rutt. Akutbesökets förslag räknas om direkt när något ändras.
- "Båda samtidigt" och samordnarvyn fyller hela skärmhöjden på laptop och projektor.
- Nytt domäntest och nytt flöde (`tests/safety.e2e.mjs`).
