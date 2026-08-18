-- ============================================================
-- Dati demo per Padel Stars League
-- Esegui DOPO schema.sql. Popola centro, campi, giocatori demo,
-- ranking, classifica ed eventi. I giocatori demo non hanno user_id
-- (non sono loggati): servono a riempire classifiche/eventi/amici.
-- ============================================================

-- Centro
insert into centri (id, nome, citta, indirizzo, sport_attivi, coin_nome)
values ('11111111-1111-1111-1111-111111111111', 'Padel Stars League', 'Viareggio', 'Via del Mare 12', '["Padel"]', 'SC')
on conflict (id) do nothing;

-- Campi
insert into campi (centro_id, sport, nome, tipo, tariffe) values
('11111111-1111-1111-1111-111111111111', 'Padel', 'Campo Centrale', 'Indoor',
 '[{"nome":"Standard","inizio":"08:00","fine":"18:00","prezzo":40,"durata_base_min":90},{"nome":"Serale","inizio":"18:00","fine":"23:00","prezzo":52,"durata_base_min":90}]'),
('11111111-1111-1111-1111-111111111111', 'Padel', 'Campo 2', 'Indoor',
 '[{"nome":"Standard","inizio":"08:00","fine":"18:00","prezzo":38,"durata_base_min":90},{"nome":"Serale","inizio":"18:00","fine":"23:00","prezzo":48,"durata_base_min":90}]'),
('11111111-1111-1111-1111-111111111111', 'Padel', 'Campo Outdoor A', 'Outdoor',
 '[{"nome":"Standard","inizio":"08:00","fine":"20:00","prezzo":34,"durata_base_min":90}]')
on conflict do nothing;

-- Giocatori demo
insert into giocatori (id, nome, cognome, genere, profilo, sport_preferiti, posizione, mano_dominante) values
('a0000000-0000-0000-0000-000000000001','Marco','Bianchi','M','{"nickname":"MB Smash"}','["Padel"]','destra','destro'),
('a0000000-0000-0000-0000-000000000002','Luca','Rossi','M','{"nickname":"Il Muro"}','["Padel"]','sinistra','mancino'),
('a0000000-0000-0000-0000-000000000003','Giulia','Verdi','F','{"nickname":"GV"}','["Padel"]','destra','destro'),
('a0000000-0000-0000-0000-000000000004','Sara','Conti','F','{"nickname":"Volee"}','["Padel"]','sinistra','destro'),
('a0000000-0000-0000-0000-000000000005','Andrea','Ferrari','M','{"nickname":"Drop"}','["Padel"]','entrambe','destro'),
('a0000000-0000-0000-0000-000000000006','Paolo','Neri','M','{"nickname":"Bandeja"}','["Padel"]','destra','destro'),
('a0000000-0000-0000-0000-000000000007','Chiara','Gallo','F','{"nickname":"Chichi"}','["Padel"]','destra','mancino'),
('a0000000-0000-0000-0000-000000000008','Davide','Costa','M','{"nickname":"Vibora"}','["Padel"]','sinistra','destro')
on conflict (id) do nothing;

-- Ranking (padel)
insert into ranking_giocatori (giocatore_id, sport, ranking, stato) values
('a0000000-0000-0000-0000-000000000001','padel',3.85,'attivo'),
('a0000000-0000-0000-0000-000000000002','padel',3.40,'attivo'),
('a0000000-0000-0000-0000-000000000003','padel',3.10,'attivo'),
('a0000000-0000-0000-0000-000000000004','padel',2.95,'attivo'),
('a0000000-0000-0000-0000-000000000005','padel',4.20,'attivo'),
('a0000000-0000-0000-0000-000000000006','padel',3.60,'attivo'),
('a0000000-0000-0000-0000-000000000007','padel',2.70,'attivo'),
('a0000000-0000-0000-0000-000000000008','padel',3.95,'attivo')
on conflict (giocatore_id, sport) do nothing;

-- Classifica del mese corrente
insert into classifica_mensile (centro_id, giocatore_id, mese, genere, punti, partite, vittorie) values
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000005', date_trunc('month', now())::date, 'M', 128, 14, 11),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001', date_trunc('month', now())::date, 'M', 115, 15, 10),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000008', date_trunc('month', now())::date, 'M', 102, 13, 9),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000006', date_trunc('month', now())::date, 'M', 88, 12, 7),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002', date_trunc('month', now())::date, 'M', 74, 11, 6),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003', date_trunc('month', now())::date, 'F', 96, 12, 9),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000004', date_trunc('month', now())::date, 'F', 81, 11, 7),
('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000007', date_trunc('month', now())::date, 'F', 63, 10, 5)
on conflict do nothing;

-- Eventi
insert into eventi_custom (centro_id, nome, descrizione, divisione, stato, min_partecipanti, max_partecipanti, data_evento, chiusura_iscrizioni_at) values
('11111111-1111-1111-1111-111111111111','Torneo di Primavera','Girone all''italiana + eliminazione diretta. Categoria mista aperta a tutti.','misto','ready',8,16, (now() + interval '14 days')::date, now() + interval '10 days'),
('11111111-1111-1111-1111-111111111111','Americano del Venerdì','Formula americano, coppie a rotazione. Serata a premi.','misto','ready',8,24, (now() + interval '3 days')::date, now() + interval '2 days'),
('11111111-1111-1111-1111-111111111111','Open Maschile P1000','Tabellone principale + consolazione.','maschile','in_corso',16,32, (now() - interval '1 day')::date, now() - interval '2 days')
on conflict do nothing;
