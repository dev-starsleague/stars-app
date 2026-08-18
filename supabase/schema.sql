-- ============================================================
-- Padel Stars League — schema Supabase (app giocatori)
-- Derivato dal modello dati del gestionale "stars-system".
-- Esegui questo file nel SQL Editor di Supabase (una sola volta).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- CENTRI ----------
create table if not exists centri (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  citta text,
  indirizzo text,
  logo_url text,
  copertina_url text,
  sport_attivi jsonb not null default '["Padel"]'::jsonb,
  coin_nome text not null default 'SC',
  created_at timestamptz not null default now()
);

-- ---------- GIOCATORI ----------
-- user_id collega la riga all'utente autenticato (auth.users).
-- Un giocatore "app" ne ha uno; i giocatori creati dallo staff possono averlo null
-- finché non rivendicano il profilo.
create table if not exists giocatori (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  cognome text not null,
  genere text,                 -- 'M' | 'F'
  data_nascita date,
  telefono text,
  email text,
  profilo jsonb default '{}'::jsonb,   -- { nickname, ranking, avatar_url }
  sport_preferiti jsonb not null default '[]'::jsonb,
  mano_dominante text,         -- destro | mancino | ambidestro
  posizione text,              -- destra | sinistra | entrambe
  numero_tessera text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_giocatori_user on giocatori(user_id);

-- ---------- CAMPI ----------
create table if not exists campi (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centri(id) on delete cascade,
  sport text not null,
  nome text not null,
  tipo text not null default 'Indoor',
  tariffe jsonb not null default '[]'::jsonb,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_campi_centro on campi(centro_id);

-- ---------- PRENOTAZIONI ----------
create table if not exists prenotazioni (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centri(id) on delete cascade,
  campo_id uuid references campi(id) on delete set null,
  creata_da uuid references giocatori(id) on delete set null, -- chi prenota dall'app
  origine text not null default 'app',
  data date,
  inizio time,
  fine time,
  tipo text not null default 'prenotato', -- rank | amich | lezione | torneo | prenotato
  stato text not null default 'completa', -- attesa | completa
  stato_pagamento text not null default 'da_pagare',
  prezzo numeric not null default 0,
  giocatori_extra jsonb not null default '[]'::jsonb,
  formato text,                -- singolo | doppio
  risultato jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_pren_centro_data on prenotazioni(centro_id, data);
create index if not exists idx_pren_campo_data on prenotazioni(campo_id, data);

-- ---------- RANKING ----------
create table if not exists ranking_giocatori (
  id uuid primary key default gen_random_uuid(),
  giocatore_id uuid not null references giocatori(id) on delete cascade,
  sport text not null default 'padel',
  ranking numeric not null,
  stato text not null default 'in_verifica', -- in_verifica | attivo
  created_at timestamptz not null default now(),
  unique (giocatore_id, sport)
);

-- ---------- CLASSIFICA MENSILE ----------
create table if not exists classifica_mensile (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centri(id) on delete cascade,
  giocatore_id uuid not null references giocatori(id) on delete cascade,
  mese date not null,          -- primo giorno del mese
  genere text not null,        -- 'M' | 'F'
  punti numeric not null default 0,
  partite integer not null default 0,
  vittorie integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_class_centro_mese on classifica_mensile(centro_id, mese);

-- ---------- EVENTI (tornei) ----------
create table if not exists eventi_custom (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centri(id) on delete cascade,
  nome text not null,
  descrizione text,
  divisione text not null default 'maschile', -- maschile | femminile | misto
  stato text not null default 'ready',        -- draft|ready|in_corso|completed|cancelled
  unita_competitiva text not null default 'coppia_fissa',
  min_partecipanti integer not null default 4,
  max_partecipanti integer,
  apertura_iscrizioni_at timestamptz,
  chiusura_iscrizioni_at timestamptz,
  data_evento date,
  created_at timestamptz not null default now()
);
create index if not exists idx_eventi_centro on eventi_custom(centro_id);

create table if not exists eventi_partecipanti (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventi_custom(id) on delete cascade,
  giocatore_1_id uuid not null references giocatori(id) on delete cascade,
  giocatore_2_id uuid references giocatori(id) on delete cascade,
  ranking_coppia numeric not null default 0,
  seed integer,
  stato text not null default 'iscritto', -- iscritto | ritirato
  created_at timestamptz not null default now()
);
create index if not exists idx_part_evento on eventi_partecipanti(evento_id);

-- ---------- COIN ----------
create table if not exists coin_saldi (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centri(id) on delete cascade,
  giocatore_id uuid not null references giocatori(id) on delete cascade,
  saldo numeric not null default 0,
  unique (centro_id, giocatore_id)
);

-- ---------- AMICIZIE (nuovo per l'app) ----------
create table if not exists amicizie (
  id uuid primary key default gen_random_uuid(),
  richiedente_id uuid not null references giocatori(id) on delete cascade,
  destinatario_id uuid not null references giocatori(id) on delete cascade,
  stato text not null default 'in_attesa', -- in_attesa | accettata
  created_at timestamptz not null default now(),
  unique (richiedente_id, destinatario_id),
  check (richiedente_id <> destinatario_id)
);
create index if not exists idx_amic_dest on amicizie(destinatario_id);
create index if not exists idx_amic_rich on amicizie(richiedente_id);

-- ============================================================
-- Trigger: alla registrazione crea automaticamente il profilo giocatore
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.giocatori (user_id, nome, cognome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', 'Nuovo'),
    coalesce(new.raw_user_meta_data->>'cognome', 'Giocatore'),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table centri enable row level security;
alter table campi enable row level security;
alter table prenotazioni enable row level security;
alter table giocatori enable row level security;
alter table ranking_giocatori enable row level security;
alter table classifica_mensile enable row level security;
alter table eventi_custom enable row level security;
alter table eventi_partecipanti enable row level security;
alter table coin_saldi enable row level security;
alter table amicizie enable row level security;

-- Lettura pubblica (utenti autenticati) su dati "di lega"
create policy "read centri" on centri for select using (auth.role() = 'authenticated');
create policy "read campi" on campi for select using (auth.role() = 'authenticated');
create policy "read giocatori" on giocatori for select using (auth.role() = 'authenticated');
create policy "read ranking" on ranking_giocatori for select using (auth.role() = 'authenticated');
create policy "read classifica" on classifica_mensile for select using (auth.role() = 'authenticated');
create policy "read eventi" on eventi_custom for select using (auth.role() = 'authenticated');
create policy "read partecipanti" on eventi_partecipanti for select using (auth.role() = 'authenticated');
create policy "read prenotazioni" on prenotazioni for select using (auth.role() = 'authenticated');

-- Il giocatore può aggiornare SOLO il proprio profilo
create policy "update own giocatore" on giocatori for update
  using (user_id = auth.uid());

-- Prenotazioni: crea/annulla solo le proprie
create policy "insert own prenotazione" on prenotazioni for insert
  with check (creata_da in (select id from giocatori where user_id = auth.uid()));
create policy "delete own prenotazione" on prenotazioni for delete
  using (creata_da in (select id from giocatori where user_id = auth.uid()));

-- Iscrizione eventi: solo per sé stesso
create policy "insert own iscrizione" on eventi_partecipanti for insert
  with check (giocatore_1_id in (select id from giocatori where user_id = auth.uid()));
create policy "delete own iscrizione" on eventi_partecipanti for delete
  using (giocatore_1_id in (select id from giocatori where user_id = auth.uid()));

-- Coin: legge solo il proprio saldo
create policy "read own coin" on coin_saldi for select
  using (giocatore_id in (select id from giocatori where user_id = auth.uid()));

-- Amicizie: vede/gestisce quelle che lo riguardano
create policy "read own amicizie" on amicizie for select
  using (
    richiedente_id in (select id from giocatori where user_id = auth.uid())
    or destinatario_id in (select id from giocatori where user_id = auth.uid())
  );
create policy "insert amicizia" on amicizie for insert
  with check (richiedente_id in (select id from giocatori where user_id = auth.uid()));
create policy "update amicizia" on amicizie for update
  using (destinatario_id in (select id from giocatori where user_id = auth.uid()));
create policy "delete amicizia" on amicizie for delete
  using (
    richiedente_id in (select id from giocatori where user_id = auth.uid())
    or destinatario_id in (select id from giocatori where user_id = auth.uid())
  );
