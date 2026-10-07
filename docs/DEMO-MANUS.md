# FieldVet – demomanus för pitchen

Ett manus på 10–15 minuter. För varje scen: **Klicka** (exakta knappnamn), **Säg** (en eller två meningar) och **Om det går fel**.
Kortversion på 3 minuter finns längre ner.

> Knappnamnen är kontrollerade mot demon (version 0.9.0, 7 oktober 2026). Ändras appen: uppdatera manuset.

---

## Före mötet

- [ ] **Öppna demon** på datorn: `fieldvettest.kennylantz1337.workers.dev/?intro=0` (`?intro=0` hoppar över välkomstrutan).
- [ ] **Reserv utan internet:** `dist/fieldvet.local.html` (dubbelklicka). Bygg den med `npm run build` dagen innan.
- [ ] **Läge:** välj **Båda samtidigt** högst upp i mitten. Dashboarden till vänster, veterinärens telefon till höger.
- [ ] **Skärm:** webbläsarens zoom 100 %. På en projektor med låg upplösning: zooma ut till 90 %.
- [ ] **Börja från noll:** Demo → **Återställ demo** (klockan blir 08:20).
- [ ] Stäng andra flikar och notiser.

**Säg först:** "Det här är en konceptprototyp med påhittad data. Provet, sms, karta och Slack är simulerade och märkta så. Det finns inget officiellt samarbete med Provet."

**Gyllene regeln om något krånglar:** Demo → **Återställ demo**, och hoppa in igen vid nästa akt. Den guidade demon startar alltid likadant.

---

## Akt 1 · Samordnarens morgon (ca 2 min)

### Scen 1 – Hela dagen på några sekunder
- **Klicka:** inget ännu. Peka på raden högst upp ("1 behöver din uppmärksamhet"), sedan **Behöver åtgärdas**, teamraderna, **Nästa timme** och kartan.
- **Säg:** "Samordnaren ska kunna svara på en fråga på tre sekunder: behöver något min uppmärksamhet? Fyra veterinärer, 22 hembesök. Allt som går enligt plan är en tyst rad. Det enda som syns här är ett akutärende från receptionen."
- **Säg sedan:** "Den kommer vi tillbaka till. Först: hur ser det ut för veterinären?"
- **Om det går fel:** Demo → Återställ demo.

---

## Akt 2 · Veterinären och Provet i bakgrunden (ca 1,5 min)

### Scen 2 – Nästa patient, ett tryck
- **Klicka:** Demo → **Guidad demo: Provet i bakgrunden**. Följ de markerade knapparna, eller tryck **Gör det åt mig** i varje steg.
  Stegen: Bosse är nästa besök → **Starta navigering** → Provet informerar ägaren → **Visa historik** → köer på vägen → inga dubbletter → samordnaren ser läget.
- **Säg:**
  - Vid Starta navigering: "Veterinären har alltid en knapp, på samma plats. Starta navigering betyder På väg, och kartappen öppnas."
  - Vid "informerad via Provet ✓": "FieldVet skickar inga egna sms. Vi ber Provet skicka klinikens meddelande, enligt ägarens val i Provet."
  - Vid historiken: "Historiken hämtas från Provet först när veterinären ber om den. Bara läsning, bara egna patienter. Samordnaren ser den aldrig."
- **Om det går fel:** stäng guiden, Demo → Återställ demo och starta guiden igen.

---

## Akt 3 · När något händer (ca 4–5 min) – kärnan

### Scen 3–6 – Försening, akutärende, ny tid och vidare till kliniken
- **Klicka:** Demo → **Guidad demo** (nio steg). Följ markeringen, eller **Gör det åt mig**.

| Steg | Säg |
|---|---|
| 1. En veterinär ligger efter | "Klockan är 09:45. Annas besök hos Luna drar över. Hennes app räknar om resten av dagen direkt." |
| 2. FieldVet ser risken i förväg | "Samordnaren ser att nästa kund riskerar att bli sen, innan kunden märker något." |
| 3. Ett akutärende kommer in | "Receptionen lägger in en akut katt, nära Anna. Men Anna ligger redan efter." |
| 4. Hitta rätt veterinär | "Uppgifterna är redan ifyllda. FieldVet jämför alla team innan något läggs in." |
| 5. Ett förslag, påverkan synlig | "Ett förslag först: körtid, vad som händer med nästa besök, när de är framme. Under Visa andra team syns varför de andra inte passar, till exempel utrustning i bilen. Samordnaren bestämmer." |
| 6. Mottagarens app uppdateras | "Veterinären ser besöket direkt och trycker Uppfattat. Inget telefonsamtal." |
| 7. Kunden får ny tid | "Annas nästa kund får en ny tid via Provet. Visa skickat meddelande visar exakt vad ägaren ser: förnamn, tid och status. Inget mer." |
| 8. Från hembesök till klinik | "Veterinären bedömer att katten behöver klinik. Ett tryck från besöket, med när och varför." |
| 9. Samordnaren bekräftar | "FieldVet föreslår nästa lediga kliniktid. Bekräfta, så får veterinären, ägaren och kliniken besked." |

- **Säg efter sista steget:** "Från försening till kliniktid, utan en enda telefonkedja. Och inget ändrades utan att en människa godkände det."
- **Om det går fel:** **Spela igen** i guiden, eller Demo → Återställ demo och Demo → Guidad demo. Hoppa över ett steg med **Gör det åt mig**.

---

## Akt 4 · Trygghet och vardag (ca 4 min)

Börja med Demo → **Återställ demo** (klockan blir 08:20).

### Scen 7 – En kund avbokar
- **Klicka:** Demo → **En kund avbokar** → under Behöver åtgärdas: **Se förslag** → **Godkänn ändring**.
- **Säg:** "En avbokning blir en lucka. FieldVet föreslår hur luckan används, och samordnaren godkänner. Berörda veterinärer får besked i appen."
- **Om det går fel:** står det att ingen ändring behövs, säg: "Ibland är det bästa förslaget att inte ändra något, och då säger FieldVet det."

### Scen 8 – Låst tid
- **Klicka:** klicka på ett besök på tidslinjen (t.ex. **Doris**) → **Mer** → **Lås tiden**. Peka på **Ångra** i bekräftelsen.
- **Säg:** "När ägaren har fått en bekräftad tid låser vi den. Ett låst besök flyttas aldrig automatiskt, förslagen jobbar runt det. Allt kan ångras och allt loggas."
- **Om det går fel:** Esc stänger panelen. Lås upp med **Mer → Lås upp tiden**.

### Scen 9 – Ingen täckning
- **Klicka:** Demo → **Anna tappar täckning**. Peka på telefonen ("Offline"). Visa att **Starta navigering** fortfarande fungerar. Sedan Demo → **Anna får täckning igen**.
- **Säg:** "I en källare eller på landet: nästa besök, adress och portkod finns kvar. Ändringarna skickas när täckningen är tillbaka, utan dubbletter."

### Scen 10 – Journalen innan nästa besök
- **Klicka (telefonen):** **Starta navigering** → **Jag är framme** → **Starta besök** → **Avsluta besök** → **Avsluta besök** (i rutan) → **Diktera journal** → **Börja diktera** → **Klar** → **Åtgärda 1 markering först** → bekräfta det markerade → **Signera journal** → **Signera**.
- **Säg:** "Veterinären pratar in journalen i bilen. AI skriver ett utkast och markerar det som saknas. Inget sparas förrän veterinären signerar, och då skrivs den till Provet. Samordnaren ser bara att den är signerad."
- **Extra:** Demo → **Provet slutar svara** visar att inget fastnar hos veterinären: det står i klartext och samordnaren får Försök igen. Avsluta med Demo → **Provet svarar igen**.
- **Om det går fel:** journalen ligger kvar på startsidan som Journal att signera. Gå vidare.

---

## Extra – bara om kunden frågar eller tiden räcker (ca 2 min)

Pitchen kallar röst för *målbild* och Slack för *simulerad*. Säg det.

- **Röstmeddelande:** telefonen → **Inkorg** → **Spela in röstmeddelande** → **Klar** → **Skicka röstmeddelande**. "Samordnaren får både ljudet och texten."
- **Fråga FieldVet:** telefonen → **Fråga FieldVet** → "Hur lång tid tar det till nästa kund?". "Svaret kommer från dagens plan. AI:n ändrar inget själv och ger inga medicinska råd."
- **Slack:** dashboarden → **Slack** i menyn till vänster → receptionens tråd om Tessan → **Skapa hembesök**. "Inga patientdata i Slack, bara plan, tider och område."
- **System:** dashboarden → **System**. "Roller och behörigheter, granskningslogg och hur kopplingen till Provet mår."

---

## Kortversion · 3 minuter

1. Demo → **Återställ demo**, läge **Båda samtidigt**.
2. Säg: "Konceptprototyp, påhittad data, Provet är simulerat."
3. Demo → **Guidad demo** → **Gör det åt mig** i varje steg. Använd raderna under Akt 3.
4. Avsluta: "Systemet föreslår, människan bestämmer. Provet förblir master."

---

## Avslut · frågorna som leder till en pilot

Ställ dem i slutet, och skriv ner svaren.

1. Vad är jobbigast i dag: körningen, samtalen, förseningarna eller journalen?
2. **Vilka två eller tre saker skulle göra störst skillnad?** (Det blir pilotens innehåll.)
3. Hur många veterinärer och samordnare, och i vilket område skulle en pilot passa?
4. Kan ni exportera dagens bokningar ur Provet som Excel eller CSV? Kan vi få en exempelfil med påhittade namn?
5. Har ni, eller kan ni ansöka om, API-åtkomst till Provet?
6. Vilka telefoner och vilken kartapp använder veterinärerna?
7. Vem beslutar om en pilot, och vad är nästa steg?

**Förslag på nästa steg att säga:** "Vecka 1–2 kartlägger vi ert flöde med en exportfil, vecka 3–4 testar två–tre veterinärer och en samordnare prototypen på verkliga scenarier. Sedan pilot i ett område."

---

## Svar på vanliga invändningar

| Fråga | Svar |
|---|---|
| Ersätter det Provet? | Nej. Provet är master för ägare, patienter, bokningar och journal. FieldVet håller bara ihop dagens fältarbete. Tas FieldVet bort fungerar Provet precis som i dag. |
| Flyttar FieldVet besök själv? | Nej. FieldVet föreslår, en människa godkänner. Låsta tider rörs aldrig. |
| Vem bestämmer vad som är akut? | Receptionen eller veterinären. FieldVet planerar efter det men bedömer aldrig djurets tillstånd. |
| Skickar ni sms? | Nej. Vi ber Provet skicka klinikens meddelande. Ägarens val i Provet gäller, och samma meddelande skickas aldrig två gånger. |
| Är det säkert? Vem ser vad? | Samordnaren ser status och underlag, aldrig journaltext eller kliniska flaggor. Allt loggas. En skarp version kräver inloggning, roller, loggning och en GDPR-granskning. |
| Vad händer utan täckning? | Nästa besök, adress och portkod finns kvar. Ändringarna skickas när täckningen är tillbaka. |
| Kan vi börja utan Provets API? | Ja. Samordnaren drar in dagens export som Excel eller CSV. API:et tar över när det är klart. |
| Vad kostar det? / Hur snabbt? | Säg att upplägget bestäms tillsammans efter kartläggningen. Lova inga siffror eller effekter: de ska mätas mot en baslinje i piloten. |
