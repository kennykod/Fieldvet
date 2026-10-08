# FieldVet – granskning

Fynd sorterade enligt masterprompten: **P1** förstör demon eller visar fel, **P2** förvirrar eller ser oproffsigt ut, **P3** trevligt att ha.

## Webbläsartest (7 oktober 2026)

Alla tio Playwright-flöden kördes i tre webbläsare på Windows 11.
Kör själv: `$env:BROWSER='webkit'; node tests/ops.e2e.mjs` (PowerShell). Utan `BROWSER` används Chromium.

| Webbläsare | Resultat |
|---|---|
| Chromium (Chrome, Edge) | ✅ 10 av 10 |
| WebKit (Safari-motorn) | ⚠️ 8 av 10 stabilt. `ops` faller alltid (P1 nedan). `import` faller ibland (P2 nedan). |
| Firefox | ❓ Kunde inte startas på den här datorn (se Miljö). Inte testad. |

### ✅ Rättat 8 oktober: P1 · "Ångra" efter en flytt fungerar bara i ungefär en halv sekund
- **Rättning:** `undo` jämför nu bara det som påverkar planen (`changedSince` i `src/store.tsx`). `tests/ops.e2e.mjs` väntar 2,5 s före Ångra och faller utan rättningen. Grönt i Chromium. Inte omtestat i WebKit än.
- **Gäller alla webbläsare**, inte bara Safari. Syns i Chrome om man väntar 2–3 sekunder innan man trycker Ångra.
- **Så upprepar du:** Demo → Annas besök drar över 25 min → öppna Milos risk → Visa andra alternativ → Erik → Bekräfta flytt till Erik → vänta 3 sekunder → Ångra.
  Då står det "Det går inte att ångra längre, planen har ändrats sedan dess", fast inget i planen har ändrats.
- **Orsak:** `act.undo` i `src/store.tsx` (rad ~694) kräver att hela appens tillstånd är oförändrat sedan flytten. Men flytten ber den simulerade Provet-tjänsten skicka ny tid till ägaren, och när svaret kommer ("informerad") uppdateras tillståndet. Då nekas Ångra.
- **Förslag (S):** jämför bara det som undo faktiskt återställer. Ändringar i leveransstatus (`comms`, `eta`, `commDupes`, `audit`) ska inte spärra Ångra, de förs redan vidare i undo. Plus ett test som väntar några sekunder före Ångra.
- **Varför P1:** pitchen och onboarding-guiden lovar "Ångra i stället för att fråga".

### P2 · Excel-import misslyckas ibland i WebKit
- `tests/import.e2e.mjs`, steget `xlsx`: i 2 av 3 körningar "Failed to load resource" när `.xlsx`-filen läses. CSV fungerar.
- Dekomprimeringen (`DecompressionStream('deflate-raw')`) fungerar i WebKit, så felet ligger troligen i hur filen läses från filväljaren.
- **Obs:** Playwrights WebKit på Windows är inte riktig Safari. **Testa Excel-import på en Mac eller iPhone** innan slutsatser dras. Påverkar inte demomanuset (importen används inte där).

### Miljö (inte demon)
- **Firefox:** Playwrights Firefox startar inte på den här datorn ("sida vid sida-konfiguration", `mozglue` hittas inte), troligen för att Windows säkerhetsskydd stoppar osignerade program. Testa på den stationära datorn, eller öppna demon manuellt i vanliga Firefox och kör demomanuset.
- **Riktig Safari:** finns inte på Windows. Kör demomanuset en gång på en Mac eller iPhone före pitchen om kunden använder Apple.
