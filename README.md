# Padel Stars League — App Giocatori

App mobile/web per i giocatori del centro, costruita con **Expo (React Native)** e pronta per il deploy su **Vercel**.

Funzioni: prenotazione campi, iscrizione a eventi/tornei, classifiche mensili e ranking, profilo personale e amici.

> Il **gestionale** (`stars-system`, pannello staff) e questa app condividono **lo stesso backend**: l'API FastAPI di `stars-system/backend` (SQLite in sviluppo, Postgres in futuro). Non c'è un database separato per l'app — nessuna dipendenza da Supabase.

---

## Modalità demo (funziona subito, senza configurare niente)

Se non imposti `EXPO_PUBLIC_API_URL`, l'app parte lo stesso in **modalità demo**: dati finti, nessun accesso ai dati reali. Utile per vedere subito com'è fatta, anche appena deployata su Vercel senza backend raggiungibile. Per avere dati reali, segui i passi sotto.

---

## 1. Avvia il backend condiviso

Nella cartella di `stars-system`:

```bash
cd backend
uvicorn app.main:app --reload
```

Il backend risponde su `http://127.0.0.1:8000`. Non serve creare nulla: l'app usa le stesse API/tabelle del gestionale (giocatori, prenotazioni, ranking, classifica, campi, eventi, coin...).

---

## 2. Collega l'app al backend

In locale, crea un file `.env` (copia da `.env.example`):

```
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

Su un **device fisico o un simulatore**, `127.0.0.1` punta al device stesso, non al Mac che esegue il backend: usa invece l'IP LAN del Mac, es. `http://192.168.1.23:8000` (e assicurati che il firewall non blocchi la porta 8000).

Questa variabile attiva i dati reali al posto della modalità demo.

---

## 3. Provarla in locale

```bash
npm install
npx expo start
```

Premi `w` per aprirla nel browser, oppure inquadra il QR code con l'app **Expo Go** sul telefono (sullo stesso Wi-Fi del Mac che esegue il backend).

---

## 4. Deploy su Vercel

1. Vai su [vercel.com](https://vercel.com) → **Add New → Project** e importa il repo GitHub.
2. Vercel rileva la configurazione da `vercel.json` (build: `expo export --platform web`, output: `dist`).
3. In **Settings → Environment Variables** aggiungi `EXPO_PUBLIC_API_URL` puntato a un backend raggiungibile pubblicamente.
4. **Deploy**.

> Il backend FastAPI oggi gira solo in locale (nessun deploy cloud configurato) — finché non viene messo online, il deploy web di questa app resta in modalità demo.

---

## Struttura del progetto

```
app/                    schermate (routing per file, expo-router)
  (auth)/               login e registrazione
  (tabs)/               home, prenota, eventi, classifiche, profilo
  amici.tsx             lista amici, richieste, ricerca (demo, vedi Note)
  giocatore/[id].tsx    profilo di un altro giocatore
  modifica-profilo.tsx  modifica del proprio profilo
lib/
  apiClient.ts           client fetch verso il backend FastAPI condiviso
  auth.tsx               sessione locale (nessuna autenticazione reale, vedi Note)
  api.ts                 accesso ai dati (con fallback demo)
  mockData.ts             dati demo
components/ui.tsx        componenti riutilizzabili
constants/theme.ts       colori e stile del brand
types/models.ts          tipi dei dati (allineati al backend FastAPI)
```

## Note

- **Nessuna autenticazione reale per ora.** `signIn`/`signUp` cercano/creano un giocatore per email nel backend condiviso, senza verificare la password — è un fermo provvisorio in attesa di un vero sistema di autenticazione.
- **La funzione "amici"** (richieste/accettazioni) non ha ancora una API nel backend condiviso e resta a dati demo finché non verrà aggiunta al gestionale.
- I colori del brand (navy `#1E314A`, oro `#FFAF00`) sono in `constants/theme.ts`.
- Le icone dell'app (`assets/`) sono segnaposto: sostituiscile con il logo reale quando vuoi (stessi nomi file).
