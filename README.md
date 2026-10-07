# FieldVet – demoprototyp

Klickbar konceptprototyp för hembesöksveterinärer: samordnarens dashboard och veterinärens mobilapp i samma plan. Fiktiv data, ingen backend, alla kopplingar simulerade.

## Kom igång

```bash
npm install
npx playwright install chromium webkit firefox   # för testerna
npm run build        # ger dist/fieldvet.html och dist/fieldvet.local.html
npm test             # 32 domäntester + 10 flöden i webbläsaren
```

Öppna `dist/fieldvet.local.html` i webbläsaren. Den fungerar offline.
Välj roll uppe i mitten och kör scenarier från **Demo**-menyn uppe till höger.
Adressen kan styra rollen: `#samordnare`, `#veterinar` eller `#bada`.

## Guidad demo (pitch)

Demo → **Guidad demo** (eller knappen i introduktionen) spelar upp hela kedjan på ca 3 minuter, i nio steg: en veterinär blir sen, FieldVet flaggar risken, ett akutärende kommer in, samordnaren ser föreslagna team med påverkan och tilldelar, mottagarens app uppdateras och bekräftas, kunden får ny tid (se kundens vy), veterinären skickar patienten vidare till kliniken och samordnaren bokar kliniktiden. Varje steg markerar knappen att trycka på. **Gör det åt mig** trycker åt dig. Scenariot startar alltid på samma sätt (kl. 09:45), så det kan köras om hur många gånger som helst. Kräver datorskärm (dashboard och telefon sida vid sida).

## Provet i bakgrunden

Veterinären arbetar i FieldVet. Provet (kliniksystemet) är master för ägare, patienter, bokningar, journal och kontaktval. Kopplingen ligger i `src/shared/provet.ts`, en adapter per uppgift: bokningar, patient och kontaktval, historik, kundmeddelanden och journal. Allt är simulerat och deterministiskt.

- **Kundmeddelanden:** Starta navigering ger På väg. FieldVet skapar en händelse med fast nyckel (`VETERINARIAN_ON_THE_WAY`, `ETA_UPDATED` m.fl.) och ber Provet skicka klinikens mall. Status: Skickar…, Ägaren informerad via Provet ✓, Kunde inte skickas, eller ingen sms enligt ägarens val i Provet. Samma nyckel skickas aldrig två gånger. Regler för ny tid i `COMM_RULES`.
- **Visa historik:** bara för veterinären, bara egna patienter, hämtas när den öppnas, endast läsning. Offline visas en kort sammanfattning som raderas när passet slutar.
- **Demo:** Demo → Guidad demo: Provet i bakgrunden (ca 1 min), Köer på Annas väg, Appen skickar samma händelse igen, Provet slutar svara. System → Provet idag visar räknarna.

Masterprompten finns i `docs/FieldVet_Provet_Masterprompt.pdf`.

## Importera en egen dag

Som samordnare: klicka **Importera** och dra in en Excel- eller CSV-fil (en bokning per rad, rubriker på första raden), eller välj **Använd exempelfil**. Exempelfiler finns i `examples/`. Använd bara påhittade personuppgifter.

## Publicera gratis

`npm run build` skapar `dist/web/`. Ladda upp innehållet till Cloudflare Pages (Workers & Pages → Create → Pages → Drag and drop) eller Netlify Drop. Adressen `…?intro=0` hoppar över introduktionen när du själv presenterar.

## Arbeta vidare med Claude Code

Läs `docs/MASTERPROMPT.md`. Den beskriver hur prototypen granskas och förbättras.
`docs/FieldVet_pitch.pdf` visar berättelsen demon ska stödja. `docs/FieldVet_Onboarding.pdf` är en kom-igång-guide för samordnare och veterinärer.
