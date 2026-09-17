import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Muted, Pill, Chip, Button, Input, Avatar } from './ui';
import { useTheme } from '../lib/theme';
import { getVotiPartita, votaPartita, cercaGiocatori } from '../lib/api';
import { categoriaRanking, CATEGORIE_RANKING } from '../lib/stars';
import { Radius, Spacing, Font, AppColors } from '../constants/theme';
import type { CampionatoPartecipante, TorneoPartecipante, Giocatore, RigaClassifica, VotoPartita } from '../types/models';

// Componenti condivisi tra il dettaglio Campionato e il dettaglio Torneo
// (app/(tabs)/eventi/campionato/[id].tsx, app/(tabs)/eventi/torneo/[id].tsx)
// — stessa forma dati per entrambi (CampionatoPartecipante/TorneoPartecipante
// e CampionatoMatch/TorneoMatch sono strutturalmente identici, solo il nome
// della FK genitore cambia), quindi qui SOLO presentazione, nessuna
// business logic — quella resta lato backend (stesso principio del
// gestionale: motore campionato.py/torneo.py duplicati apposta, ma qui è
// puro rendering, niente da duplicare per prudenza).

export interface MatchComune {
  id: string;
  partecipante_a_id: string | null;
  partecipante_b_id: string | null;
  set_a: number | null;
  set_b: number | null;
  set_risultati: { a: number; b: number; tb?: boolean }[];
  vincitore_id: string | null;
  stato: 'programmato' | 'giocato' | 'forfait';
  bye: boolean;
}

/** Nome da mostrare per un partecipante (coppia "Nome1 / Nome2" o singolo
 *  "Nome Cognome") — dato in pasto a tutti i componenti sotto tramite un
 *  resolver invece di ripassare partecipanti+giocatori ovunque. */
export function mappaNomiPartecipanti(
  partecipanti: (CampionatoPartecipante | TorneoPartecipante)[],
  giocatoriMap: Map<string, Giocatore>
): Map<string, string> {
  const nomeGiocatore = (id: string) => {
    const g = giocatoriMap.get(id);
    return g ? `${g.nome} ${g.cognome}`.trim() : '—';
  };
  const mappa = new Map<string, string>();
  for (const p of partecipanti) {
    mappa.set(p.id, p.giocatore_2_id ? `${nomeGiocatore(p.giocatore_1_id)} / ${nomeGiocatore(p.giocatore_2_id)}` : nomeGiocatore(p.giocatore_1_id));
  }
  return mappa;
}

/** Turno N → "Finale"/"Semifinale"/"Quarti di finale" per gli ultimi
 *  turni di un tabellone a eliminazione diretta (playoff campionato o
 *  torneo SE) — il gestionale li chiama solo "Turno N", qui in più per
 *  chi segue da app non ha bisogno di contare quanti turni mancano. */
export function etichettaTurno(numero: number, totale: number): string {
  const daFine = totale - numero;
  if (daFine === 0) return 'Finale';
  if (daFine === 1) return 'Semifinale';
  if (daFine === 2) return 'Quarti di finale';
  if (daFine === 3) return 'Ottavi di finale';
  return `Turno ${numero}`;
}

export function punteggioMatch(m: MatchComune): string {
  if (m.set_risultati?.length) return m.set_risultati.map((s) => `${s.a}-${s.b}${s.tb ? '*' : ''}`).join(', ');
  if (m.set_a != null && m.set_b != null) return `${m.set_a}-${m.set_b}`;
  return '';
}

/** "Classifica a punti" derivata dai risultati di un tabellone a
 *  eliminazione diretta (fix utente esplicito: nessuna classifica reale
 *  esiste per il singolo_elimination — al posto della box info rimossa,
 *  una graduatoria calcolata qui: punti = vittorie nel tabellone, più
 *  strada si fa più si sale, esattamente come una classifica a gironi ma
 *  senza girone — stessa identica forma RigaClassifica, riusa
 *  TabellaClassifica così com'è). Puro calcolo client, nessun round-trip
 *  al backend: la fonte (i match) è già in pagina. */
export function calcolaClassificaBracket(
  partecipanti: (CampionatoPartecipante | TorneoPartecipante)[],
  match: MatchComune[]
): RigaClassifica[] {
  const righe = new Map<string, RigaClassifica>(
    partecipanti.map((p) => [p.id, { partecipante_id: p.id, punti: 0, vittorie: 0, sconfitte: 0, set_vinti: 0, set_persi: 0, ranking: p.ranking, partite: 0 }])
  );
  for (const m of match) {
    if (m.bye || (m.stato !== 'giocato' && m.stato !== 'forfait') || !m.partecipante_a_id || !m.partecipante_b_id) continue;
    const ra = righe.get(m.partecipante_a_id), rb = righe.get(m.partecipante_b_id);
    if (!ra || !rb) continue;
    const vinceA = m.vincitore_id === m.partecipante_a_id;
    ra.set_vinti += m.set_a ?? 0; ra.set_persi += m.set_b ?? 0;
    rb.set_vinti += m.set_b ?? 0; rb.set_persi += m.set_a ?? 0;
    ra.partite += 1; rb.partite += 1;
    if (vinceA) { ra.vittorie += 1; ra.punti += 1; rb.sconfitte += 1; } else { rb.vittorie += 1; rb.punti += 1; ra.sconfitte += 1; }
  }
  return [...righe.values()].sort((a, b) => b.punti - a.punti || (b.set_vinti - b.set_persi) - (a.set_vinti - a.set_persi) || a.ranking - b.ranking);
}

// `onPress` (fix utente esplicito, Eventi "In corso": "pigiando su ogni
// singola partita ogni giocatore può dichiarare una preferenza sulla
// coppia vincitrice") — assente per i bye, che non hanno un vero
// avversario su cui votare. Il chiamante decide cosa succede al tap
// (apre ModaleVotoPartita sotto), RigaMatch resta puramente di
// presentazione.
export function RigaMatch({ match, nomeA, nomeB, compatto, onPress }: {
  match: MatchComune; nomeA: string; nomeB: string; compatto?: boolean; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (match.bye) {
    return (
      <View style={s.matchRiga}>
        <Text style={s.matchByeTesto}>{nomeA} — bye</Text>
      </View>
    );
  }
  const vinceA = match.vincitore_id && match.vincitore_id === match.partecipante_a_id;
  const vinceB = match.vincitore_id && match.vincitore_id === match.partecipante_b_id;
  const giocato = match.stato === 'giocato' || match.stato === 'forfait';

  // Nel tabellone (colonne strette) i nomi in coppia sono troppo lunghi
  // per stare affiancati su una riga senza troncarsi illeggibili — un
  // lato sopra l'altro, ciascuno con la SUA riga intera di larghezza e il
  // proprio punteggio di set a fianco, è il layout standard di un
  // bracket e qui risolve il problema alla radice (fix: nomi troncati a
  // "Cri…"/"Salv…" nel tabellone).
  if (compatto) {
    return (
      <Pressable style={s.matchRigaCompatta} onPress={onPress} disabled={!onPress}>
        <View style={s.matchLatoCompatto}>
          <Text style={[s.matchNomeCompatto, vinceA && s.matchNomeVincitore]} numberOfLines={2}>{nomeA}</Text>
          {giocato && <Text style={[s.matchSetCompatto, vinceA && s.matchNomeVincitore]}>{match.stato === 'forfait' ? (vinceA ? '' : 'W.O.') : match.set_a ?? ''}</Text>}
        </View>
        <View style={s.matchLatoCompatto}>
          <Text style={[s.matchNomeCompatto, vinceB && s.matchNomeVincitore]} numberOfLines={2}>{nomeB}</Text>
          {giocato && <Text style={[s.matchSetCompatto, vinceB && s.matchNomeVincitore]}>{match.stato === 'forfait' ? (vinceB ? '' : 'W.O.') : match.set_b ?? ''}</Text>}
        </View>
        {!giocato && <Pill label="Da giocare" />}
      </Pressable>
    );
  }

  return (
    <Pressable style={s.matchRiga} onPress={onPress} disabled={!onPress}>
      <View style={s.matchLati}>
        <Text style={[s.matchNome, vinceA && s.matchNomeVincitore]} numberOfLines={2}>{nomeA}</Text>
        <View style={s.matchCentro}>
          {giocato ? (
            <Text style={s.matchPunteggio}>{match.stato === 'forfait' ? 'W.O.' : punteggioMatch(match)}</Text>
          ) : (
            <Text style={s.matchVs}>vs</Text>
          )}
        </View>
        <Text style={[s.matchNome, s.matchNomeB, vinceB && s.matchNomeVincitore]} numberOfLines={2}>{nomeB}</Text>
      </View>
      {!giocato && <Pill label="Da giocare" />}
    </Pressable>
  );
}

export function TabellaClassifica({ righe, nomeDi }: { righe: RigaClassifica[]; nomeDi: (id: string) => string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (righe.length === 0) return <Muted style={{ textAlign: 'center', paddingVertical: Spacing.lg }}>Classifica non ancora disponibile.</Muted>;
  return (
    <View>
      <View style={s.classHead}>
        <Text style={[s.classHeadCell, s.classColPos]}>#</Text>
        <Text style={[s.classHeadCell, s.classColNome]}>Squadra</Text>
        <Text style={[s.classHeadCell, s.classColNum]}>Pt</Text>
        <Text style={[s.classHeadCell, s.classColNum]}>V</Text>
        <Text style={[s.classHeadCell, s.classColNum]}>S</Text>
        <Text style={[s.classHeadCell, s.classColNum]}>Set</Text>
      </View>
      {righe.map((r, i) => (
        <View key={r.partecipante_id} style={[s.classRiga, i % 2 === 1 && s.classRigaAlt]}>
          <Text style={[s.classCell, s.classColPos, s.classPos]}>{i + 1}</Text>
          <Text style={[s.classCell, s.classColNome]} numberOfLines={1}>{nomeDi(r.partecipante_id)}</Text>
          <Text style={[s.classCell, s.classColNum, s.classPunti]}>{r.punti}</Text>
          <Text style={[s.classCell, s.classColNum]}>{r.vittorie}</Text>
          <Text style={[s.classCell, s.classColNum]}>{r.sconfitte}</Text>
          <Text style={[s.classCell, s.classColNum]}>{r.set_vinti}-{r.set_persi}</Text>
        </View>
      ))}
    </View>
  );
}

export interface ColonnaTabellone { titolo: string; match: MatchComune[]; nomeA: (id: string | null) => string; nomeB: (id: string | null) => string }

// Griglia fissa (stesso principio di qualunque libreria di bracket):
// il turno 1 ha N match equispaziati di SLOT px; ogni turno successivo ha
// metà dei match del precedente, ciascuno centrato esattamente a metà tra
// i suoi due match "genitori" — questo raddoppio geometrico è quello che
// permette alle linee di collegamento di unire i turni in modo coerente
// (fix utente esplicito: "le righe che uniscono a modo i turni prima e
// dopo"). Il backend genera SEMPRE l'intero tabellone in un solo passaggio
// in ordine di seeding (vedi torneo.py:se_generate_schedule, campionato.py:
// genera_playoff) quindi l'ordine dei match così come arrivano da
// getTorneoDettaglio/getCampionatoDettaglio (ordinati per created_at) è
// già l'ordine sinistra-destra del tabellone: nessuna ricostruzione extra
// necessaria qui.
const SLOT = 140;
const CARD_H = 112;
const COL_W = 208;
const COL_GAP = 46;
const HEADER_H = 30; // spazio riservato in alto per il titolo del turno

/** Tabellone a eliminazione diretta: colonne = turni, con le linee di
 *  collegamento tra un turno e il successivo e una barra di fasi
 *  cliccabile per saltare direttamente a un turno (fix utente esplicito:
 *  "l'indicazione della fase cliccabile così da poter andare alla fase
 *  direttamente e non solo a scorrimento"). */
export function Tabellone({ colonne, onMatchPress }: { colonne: ColonnaTabellone[]; onMatchPress?: (m: MatchComune) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [turnoAttivo, setTurnoAttivo] = useState(0);
  if (colonne.length === 0) return <Muted style={{ textAlign: 'center', paddingVertical: Spacing.lg }}>Tabellone non ancora generato.</Muted>;

  const xOf = (r: number) => r * (COL_W + COL_GAP);
  const centerY = (r: number, i: number) => HEADER_H + SLOT * Math.pow(2, r) * (i + 0.5);
  const primoTurnoCount = colonne[0].match.length;
  const larghezza = colonne.length * COL_W + (colonne.length - 1) * COL_GAP;
  const altezza = HEADER_H + SLOT * primoTurnoCount;

  const vaiAlTurno = (r: number) => {
    setTurnoAttivo(r);
    scrollRef.current?.scrollTo({ x: Math.max(0, xOf(r) - Spacing.md), animated: true });
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          {colonne.map((col, r) => (
            <Chip key={col.titolo} label={col.titolo} active={turnoAttivo === r} onPress={() => vaiAlTurno(r)} />
          ))}
        </View>
      </ScrollView>

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: larghezza, height: altezza }}>
          <Svg width={larghezza} height={altezza} style={StyleSheet.absoluteFillObject}>
            {colonne.slice(1).map((col, idx) => {
              const r = idx; // turno "genitore" (0-based, prima dello slice)
              return col.match.map((m, i) => {
                const y1 = centerY(r, 2 * i), y2 = centerY(r, 2 * i + 1), yMid = centerY(r + 1, i);
                const xStart = xOf(r) + COL_W, xEnd = xOf(r + 1), xMid = xStart + COL_GAP / 2;
                return (
                  <Path
                    key={m.id}
                    d={`M${xStart},${y1} L${xMid},${y1} L${xMid},${yMid} M${xStart},${y2} L${xMid},${y2} L${xMid},${yMid} M${xMid},${yMid} L${xEnd},${yMid}`}
                    stroke={colors.navyLine} strokeWidth={1.5} fill="none"
                  />
                );
              });
            })}
          </Svg>

          {colonne.map((col, r) => (
            <React.Fragment key={col.titolo}>
              <Text style={[s.colonnaTitolo, { position: 'absolute', left: xOf(r), width: COL_W, top: 0 }]}>{col.titolo}</Text>
              {col.match.map((m, i) => (
                <View key={m.id} style={{ position: 'absolute', left: xOf(r), top: centerY(r, i) - CARD_H / 2, width: COL_W, minHeight: CARD_H }}>
                  <View style={s.bracketCard}>
                    <RigaMatch match={m} nomeA={col.nomeA(m.partecipante_a_id)} nomeB={col.nomeB(m.partecipante_b_id)} compatto onPress={m.bye ? undefined : () => onMatchPress?.(m)} />
                  </View>
                </View>
              ))}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================
// Voto "chi vince questa partita" (fix utente esplicito, Eventi "In
// corso") — apribile dal tap su una RigaMatch/card di Tabellone non-bye
// (vedi onPress sopra). Percentuali sempre visibili (anche a match già
// giocato, come "quanti ci avevano preso"); si può votare/cambiare voto
// solo finché il match è "programmato" — a risultato inserito il tap sui
// due lati resta disabilitato, non ha più senso "prevedere" un esito noto.
// ============================================================
export function ModaleVotoPartita({ match, tipoMatch, nomeA, nomeB, meId, onChiudi }: {
  match: MatchComune; tipoMatch: 'campionato' | 'torneo'; nomeA: string; nomeB: string; meId?: string; onChiudi: () => void;
}) {
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [voti, setVoti] = useState<VotoPartita[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [votando, setVotando] = useState(false);

  useEffect(() => { getVotiPartita(match.id).then((v) => { setVoti(v); setCaricando(false); }); }, [match.id]);

  const votiA = voti.filter((v) => v.voto === 'A').length;
  const votiB = voti.filter((v) => v.voto === 'B').length;
  const totale = votiA + votiB;
  const percA = totale ? Math.round((votiA / totale) * 100) : 0;
  const percB = totale ? 100 - percA : 0;
  const mioVoto = voti.find((v) => v.giocatore_id === meId)?.voto ?? null;
  const puoiVotare = match.stato === 'programmato' && !!meId && !votando;

  const vota = async (scelta: 'A' | 'B') => {
    if (!meId || votando || scelta === mioVoto) return;
    setVotando(true);
    const res = await votaPartita({ matchId: match.id, tipoMatch, giocatoreId: meId, voto: scelta });
    if (res.ok) setVoti((cur) => [...cur.filter((v) => v.giocatore_id !== meId), { id: `tmp-${meId}`, match_id: match.id, tipo_match: tipoMatch, giocatore_id: meId, voto: scelta }]);
    setVotando(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <Text style={s.modaleTitolo}>Chi vince?</Text>
          {caricando ? (
            <Muted style={{ textAlign: 'center' }}>Carico…</Muted>
          ) : (
            <>
              <VotoRiga nome={nomeA} percentuale={percA} numeroVoti={votiA} attivo={mioVoto === 'A'} onPress={() => vota('A')} disabled={!puoiVotare} colors={colors} s={s} />
              <VotoRiga nome={nomeB} percentuale={percB} numeroVoti={votiB} attivo={mioVoto === 'B'} onPress={() => vota('B')} disabled={!puoiVotare} colors={colors} s={s} />
              <Muted style={{ textAlign: 'center', marginTop: Spacing.md }}>
                {totale} {totale === 1 ? 'voto' : 'voti'}{match.stato !== 'programmato' ? ' · partita già giocata' : ''}
              </Muted>
            </>
          )}
          <Button title="Chiudi" variant="ghost" onPress={onChiudi} style={{ marginTop: Spacing.lg }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VotoRiga({ nome, percentuale, numeroVoti, attivo, onPress, disabled, colors, s }: {
  nome: string; percentuale: number; numeroVoti: number; attivo: boolean; onPress: () => void; disabled: boolean;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.votoRiga, attivo && s.votoRigaAttiva]}>
      <View style={s.votoTestata}>
        <Text style={[s.votoNome, attivo && { color: colors.gold }]} numberOfLines={1}>{nome}</Text>
        <Text style={[s.votoPercentuale, attivo && { color: colors.gold }]}>{percentuale}%</Text>
      </View>
      <View style={s.votoBarraSfondo}>
        <View style={[s.votoBarra, { width: `${percentuale}%`, backgroundColor: attivo ? colors.gold : colors.slate }]} />
      </View>
      <Muted style={{ fontSize: Font.tiny }}>{numeroVoti} {numeroVoti === 1 ? 'voto' : 'voti'}{attivo ? ' · il tuo' : ''}</Muted>
    </Pressable>
  );
}

// ============================================================
// Elenco partecipanti diviso per categoria di ranking, dal più forte al
// più debole (fix utente esplicito, Eventi "Iscriviti": "elenco
// partecipanti diviso per categorie con ranking visibile e se ci sono
// coppie già formate devo vedere le coppie con il ranking di coppia in
// ordine di ranking, dal più alto al più basso") — ogni riga È già una
// coppia quando il formato la prevede (CampionatoPartecipante/
// TorneoPartecipante/EventoPartecipante rappresentano tutti "un'iscrizione",
// coppia o singolo in attesa), quindi un solo elenco ordinato per ranking
// soddisfa entrambe le richieste insieme — non serve una lista separata.
// ============================================================
export interface RigaPartecipanteGenerica { id: string; nome: string; ranking: number; mio?: boolean }

export function ListaPartecipantiPerCategoria({ righe }: { righe: RigaPartecipanteGenerica[] }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const gruppi = useMemo(() => {
    const mappa = new Map<string, RigaPartecipanteGenerica[]>();
    for (const r of [...righe].sort((a, b) => b.ranking - a.ranking)) {
      const cat = categoriaRanking(r.ranking);
      if (!mappa.has(cat)) mappa.set(cat, []);
      mappa.get(cat)!.push(r);
    }
    return CATEGORIE_RANKING.filter((c) => mappa.has(c)).map((c) => ({ categoria: c, righe: mappa.get(c)! }));
  }, [righe]);

  if (righe.length === 0) return <Muted style={{ textAlign: 'center' }}>Nessun iscritto ancora.</Muted>;
  return (
    <View>
      {gruppi.map((g) => (
        <View key={g.categoria} style={{ marginBottom: Spacing.md }}>
          <Text style={s.categoriaTitolo}>{g.categoria}</Text>
          {g.righe.map((r) => (
            <View key={r.id} style={s.partRiga}>
              <Text style={[s.partNome, r.mio && s.partNomeMio]} numberOfLines={1}>{r.nome}</Text>
              <Text style={s.partRanking}>{r.ranking.toFixed(2)}</Text>
              {r.mio && <Ionicons name="person" size={16} color={colors.gold} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ============================================================
// Scelta del compagno per un'iscrizione in coppia (spostata qui da
// eventi.tsx: serve ora anche ai 3 dettagli evento/campionato/torneo, non
// più solo alla lista) — stesso pattern di ricerca già usato in "Invita
// giocatori" (prenota.tsx) e "Cerca giocatori" (amici.tsx). `obbligaCoppia`
// (fix utente esplicito: EventoPartecipante.giocatore_2_id è NOT NULL a
// differenza di CampionatoPartecipante/TorneoPartecipante) nasconde
// l'opzione "iscriviti da solo", che per un evento custom fallirebbe
// sempre lato backend.
// ============================================================
export function ModaleCoppia({ titolo, sottotitolo, meId, obbligaCoppia, onChiudi, onConferma }: {
  titolo: string; sottotitolo: string; meId: string; obbligaCoppia?: boolean; onChiudi: () => void; onConferma: (partnerId?: string) => void;
}) {
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<Giocatore[]>([]);
  const [cercando, setCercando] = useState(false);

  const cerca = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) { setRisultati([]); return; }
    setCercando(true);
    const r = await cercaGiocatori(text);
    setRisultati(r.filter((g) => g.id !== meId));
    setCercando(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.modaleBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.modaleTitolo}>Con chi giochi?</Text>
            <Muted style={{ marginBottom: Spacing.md }}>{titolo} — {sottotitolo}</Muted>

            <Input icon="search" placeholder="Cerca il tuo compagno per nome…" value={q} onChangeText={cerca} autoFocus style={{ marginBottom: Spacing.md }} />

            {q.trim().length >= 2 && (
              cercando ? null : risultati.length === 0 ? (
                <Muted style={{ textAlign: 'center', marginBottom: Spacing.md }}>Nessun giocatore trovato.</Muted>
              ) : (
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
                  {risultati.map((g) => (
                    <Pressable key={g.id} onPress={() => onConferma(g.id)}>
                      <View style={s.invitoCard}>
                        <Avatar name={`${g.nome} ${g.cognome}`} size={40} genere={g.genere} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.partNome}>{g.nome} {g.cognome}</Text>
                          {g.profilo?.nickname ? <Muted>"{g.profilo.nickname}"</Muted> : null}
                        </View>
                        <Ionicons name="add-circle" size={24} color={colors.gold} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )
            )}

            {!obbligaCoppia && (
              <Button title="Iscriviti da solo (aggiungo il compagno dopo)" variant="ghost" onPress={() => onConferma(undefined)} style={{ marginBottom: Spacing.sm }} />
            )}
            <Button title="Annulla" variant="ghost" onPress={onChiudi} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    matchRiga: { paddingVertical: Spacing.sm, gap: 6 },
    matchLati: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    matchNome: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    matchNomeB: { textAlign: 'right' },
    matchNomeVincitore: { fontWeight: '800', color: colors.gold },
    matchCentro: { minWidth: 56, alignItems: 'center' },
    matchPunteggio: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '800' },
    matchVs: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700' },
    matchByeTesto: { color: colors.slate, fontSize: Font.small, fontStyle: 'italic' },
    matchRigaCompatta: { gap: 4 },
    matchLatoCompatto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    matchNomeCompatto: { flex: 1, color: colors.navyDeep, fontSize: Font.tiny, fontWeight: '600', lineHeight: 15 },
    matchSetCompatto: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '800' },
    classHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.navyLine },
    classHeadCell: { color: colors.slate, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase' },
    classRiga: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderRadius: Radius.xs },
    classRigaAlt: { backgroundColor: colors.navyLine + '18' },
    classCell: { color: colors.navyDeep, fontSize: Font.small },
    classColPos: { width: 22 },
    classColNome: { flex: 1, paddingRight: 4 },
    classColNum: { width: 30, textAlign: 'center' },
    classPos: { fontWeight: '800', color: colors.slate },
    classPunti: { fontWeight: '800', color: colors.gold },
    colonnaTitolo: { color: colors.slate, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center' },
    bracketCard: {
      padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: colors.navyCard,
      borderWidth: 1, borderColor: colors.navyLine, justifyContent: 'center',
    },
    // Modale voto/coppia — stesso linguaggio "vetro" già in uso altrove.
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    modaleBox: { width: '100%', maxWidth: 380, maxHeight: '80%', borderRadius: Radius.card, padding: Spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } as any,
    modaleTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    votoRiga: { paddingVertical: Spacing.sm, gap: 4, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm },
    votoRigaAttiva: { backgroundColor: colors.gold + '14' },
    votoTestata: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    votoNome: { flex: 1, color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    votoPercentuale: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '900' },
    votoBarraSfondo: { height: 8, borderRadius: 4, backgroundColor: colors.navyLine + '33', overflow: 'hidden' },
    votoBarra: { height: '100%', borderRadius: 4 },
    categoriaTitolo: { color: colors.slate, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    partRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.navyLine + '18' },
    partNome: { flex: 1, color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    partNomeMio: { color: colors.gold, fontWeight: '800' },
    partRanking: { color: colors.slate, fontSize: Font.small, fontWeight: '700' },
    invitoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8 },
  });
}
