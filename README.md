# Padel Stars League — App Giocatori

App mobile/web per i giocatori del centro, costruita con **Expo (React Native)** + **Supabase** (database e login) e pronta per il deploy su **Vercel**.

Funzioni: prenotazione campi, iscrizione a eventi/tornei, classifiche mensili e ranking, profilo personale e amici.

> Il **gestionale** (pannello staff) resta separato: questa app è solo per i giocatori. Le due parti condividono lo stesso modello dati, ma qui il database vive su Supabase con login vero.

---

## Modalità demo (funziona subito, senza configurare niente)

Se non imposti le chiavi Supabase, l'app parte lo stesso in **modalità demo**: dati finti, nessun login reale. Utile per vedere subito com'è fatta, anche appena deployata su Vercel. Per avere login e dati reali, segui i passi sotto.

---

## 1. Carica il progetto su GitHub

Dalla cartella del progetto:

```bash
git init
git add .
git commit -m "Padel Stars League - app giocatori"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/padel-stars-league.git
git push -u origin main
```

(Prima crea un repository vuoto su GitHub — senza README — e usa il suo URL qui sopra.)

---

## 2. Crea il backend su Supabase

1. Vai su [supabase.com](https://supabase.com) → **New project**. Scegli nome e password del database.
2. A progetto creato, apri **SQL Editor** (icona a sinistra).
3. Apri il file [`supabase/schema.sql`](supabase/schema.sql) di questo progetto, copia tutto, incollalo nell'editor e premi **Run**. Crea tabelle, trigger e permessi (RLS).
4. (Opzionale ma consigliato per vedere subito dati) Apri [`supabase/seed.sql`](supabase/seed.sql), copia, incolla e **Run**. Popola centro, campi, giocatori demo, classifiche ed eventi.
5. Vai su **Project Settings → API** e copia due valori:
   - **Project URL** (es. `https://abcd1234.supabase.co`)
   - **anon public** key (una stringa lunga)

### Login via email
In **Authentication → Providers → Email** assicurati che l'email sia abilitata. Per i test puoi disattivare "Confirm email" (Authentication → Settings) così l'accesso è immediato senza conferma.

---

## 3. Collega le chiavi

In locale, crea un file `.env` (copia da `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=la-tua-anon-key
```

Queste due variabili attivano il login reale e i dati veri al posto della modalità demo.

---

## 4. Deploy su Vercel

1. Vai su [vercel.com](https://vercel.com) → **Add New → Project** e importa il repo GitHub.
2. Vercel rileva la configurazione da `vercel.json` (build: `expo export --platform web`, output: `dist`).
3. In **Settings → Environment Variables** aggiungi le stesse due variabili del punto 3:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. Al termine avrai l'app web pubblica. Ad ogni `git push` Vercel ricostruisce da solo.

> Se fai il deploy **senza** le variabili, il sito parte comunque in modalità demo.

---

## 5. Provarla in locale (facoltativo)

```bash
npm install
npx expo start
```

Premi `w` per aprirla nel browser, oppure inquadra il QR code con l'app **Expo Go** sul telefono.

---

## Struttura del progetto

```
app/                    schermate (routing per file, expo-router)
  (auth)/               login e registrazione
  (tabs)/               home, prenota, eventi, classifiche, profilo
  amici.tsx             lista amici, richieste, ricerca
  giocatore/[id].tsx    profilo di un altro giocatore
  modifica-profilo.tsx  modifica del proprio profilo
lib/
  supabase.ts           client Supabase
  auth.tsx              gestione login/sessione
  api.ts                accesso ai dati (con fallback demo)
  mockData.ts           dati demo
components/ui.tsx        componenti riutilizzabili
constants/theme.ts       colori e stile del brand
supabase/
  schema.sql            struttura del database (da eseguire)
  seed.sql              dati di esempio (da eseguire)
types/models.ts          tipi dei dati
```

## Note

- I colori del brand (navy `#1E314A`, oro `#FFAF00`) sono in `constants/theme.ts`.
- Le icone dell'app (`assets/`) sono segnaposto: sostituiscile con il logo reale quando vuoi (stessi nomi file).
- I permessi Supabase (RLS) fanno sì che ogni giocatore possa modificare solo il proprio profilo, le proprie prenotazioni e le proprie iscrizioni, ma vedere classifiche, ranking ed eventi di tutti.
