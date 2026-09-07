import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import { updateProfilo } from '../../lib/api';
import { avvisa } from '../../lib/avviso';
import { AppHeader } from '../../components/AppHeader';
import { Button, Card, Chip, IconButton, Input, Muted } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../../constants/theme';
import type { FasciaOraria, Genere, ManoDominante, Posizione } from '../../types/models';

// Stessi campi del form "Modifica giocatore" del gestionale
// (src/routes/giocatori/+page.svelte), riorganizzati nelle 4 sezioni chieste:
// Anagrafica, Contatti, Preferenze di gioco, Disponibilità oraria.
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

/** ISO ("AAAA-MM-GG", quello che salva il backend) → italiano
 *  ("GG-MM-AAAA", quello che il giocatore vuole scrivere/leggere — fix
 *  utente esplicito). '' se non ancora impostata. */
function isoAItaliano(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
/** Italiano → ISO, solo quando la stringa è una data completa e valida
 *  (mentre si digita è quasi sempre incompleta: null in quel caso, non un
 *  errore — il chiamante deve limitarsi a non salvare finché non lo è). */
function italianoAIso(it: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(it.trim());
  if (!m) return null;
  const [, gg, mm, aaaa] = m;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(gg));
  if (d.getFullYear() !== Number(aaaa) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(gg)) return null;
  return `${aaaa}-${mm}-${gg}`;
}

const MESI_LUNGHI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const GIORNI_SETT_CORTI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Calendario a scelta giorno per la data di nascita (fix utente esplicito:
 *  "deve essere sia scrivibile che selezionabile a calendario") — frecce
 *  di mese E di anno (una data di nascita è spesso decenni fa: solo mese
 *  per mese sarebbe troppo lento) più un tap diretto sull'anno per
 *  aprire l'elenco, così si arriva in due tocchi a qualunque anno. */
function CalendarioDataNascita({ visibile, valoreIso, onChiudi, onScegli }: {
  visibile: boolean; valoreIso: string; onChiudi: () => void; onScegli: (iso: string) => void;
}) {
  const { colors, glass, scheme } = useTheme();
  const s = useMemo(() => makeStylesCalendario(colors), [colors]);
  const partenza = valoreIso ? new Date(`${valoreIso}T12:00:00`) : new Date();
  const [mese, setMese] = useState(() => new Date(partenza.getFullYear(), partenza.getMonth(), 1));
  const [elencoAnniAperto, setElencoAnniAperto] = useState(false);

  const anno = mese.getFullYear(); const meseIdx = mese.getMonth();
  const primo = new Date(anno, meseIdx, 1);
  const giorniMese = new Date(anno, meseIdx + 1, 0).getDate();
  const offset = (primo.getDay() + 6) % 7; // lun=0
  const celle: (number | null)[] = [];
  for (let i = 0; i < offset; i++) celle.push(null);
  for (let d = 1; d <= giorniMese; d++) celle.push(d);
  const oggi = new Date();
  const selezionatoGiorno = valoreIso && valoreIso.startsWith(`${anno}-${pad2(meseIdx + 1)}`) ? Number(valoreIso.slice(8, 10)) : -1;

  // Elenco anni per lo scroll rapido: da 100 anni fa (nessun giocatore
  // realisticamente più vecchio) a oggi.
  const anniScelta = useMemo(() => {
    const fine = oggi.getFullYear();
    const inizio = fine - 100;
    const arr: number[] = [];
    for (let a = fine; a >= inizio; a--) arr.push(a);
    return arr;
  }, []);

  return (
    <Modal visible={visibile} transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.sfondo} onPress={onChiudi}>
        <Pressable style={s.box} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          {elencoAnniAperto ? (
            <>
              <Text style={s.titolo}>Scegli l'anno</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {anniScelta.map((a) => (
                  <Pressable key={a} style={s.annoRiga} onPress={() => { setMese(new Date(a, meseIdx, 1)); setElencoAnniAperto(false); }}>
                    <Text style={[s.annoRigaText, a === anno && { color: colors.gold }]}>{a}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={s.head}>
                <Pressable onPress={() => setMese(new Date(anno - 1, meseIdx, 1))} hitSlop={8}>
                  <Ionicons name="play-back" size={16} color={colors.slate} />
                </Pressable>
                <Pressable onPress={() => setMese(new Date(anno, meseIdx - 1, 1))} hitSlop={8}>
                  <Ionicons name="chevron-back" size={20} color={colors.slate} />
                </Pressable>
                <Pressable onPress={() => setElencoAnniAperto(true)} style={s.headTitoloBtn}>
                  <Text style={s.headTitolo}>{MESI_LUNGHI[meseIdx]} {anno}</Text>
                </Pressable>
                <Pressable onPress={() => setMese(new Date(anno, meseIdx + 1, 1))} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={20} color={colors.slate} />
                </Pressable>
                <Pressable onPress={() => setMese(new Date(anno + 1, meseIdx, 1))} hitSlop={8}>
                  <Ionicons name="play-forward" size={16} color={colors.slate} />
                </Pressable>
              </View>
              <View style={s.settRow}>
                {GIORNI_SETT_CORTI.map((g, i) => <Text key={i} style={s.settText}>{g}</Text>)}
              </View>
              <View style={s.griglia}>
                {celle.map((d, i) => {
                  if (d === null) return <View key={i} style={s.cella} />;
                  const eOggi = anno === oggi.getFullYear() && meseIdx === oggi.getMonth() && d === oggi.getDate();
                  const eSelezionato = d === selezionatoGiorno;
                  return (
                    <Pressable
                      key={i} style={[s.cella, s.cellaBtn, eSelezionato && { backgroundColor: colors.gold }]}
                      onPress={() => onScegli(`${anno}-${pad2(meseIdx + 1)}-${pad2(d)}`)}
                    >
                      <Text style={[s.cellaText, eOggi && !eSelezionato && { color: colors.gold, fontWeight: '800' }, eSelezionato && { color: colors.navyDeep, fontWeight: '800' }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStylesCalendario(colors: AppColors) {
  return StyleSheet.create({
    sfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    box: { width: '100%', maxWidth: 340, borderRadius: Radius.modal, overflow: 'hidden', padding: Spacing.lg },
    titolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body, textAlign: 'center', marginBottom: Spacing.sm },
    annoRiga: { paddingVertical: 10, alignItems: 'center' },
    annoRigaText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
    headTitoloBtn: { flex: 1, alignItems: 'center' },
    headTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body },
    settRow: { flexDirection: 'row', marginBottom: 4 },
    settText: { flex: 1, textAlign: 'center', color: colors.slate, fontSize: Font.tiny, fontWeight: '700' },
    griglia: { flexDirection: 'row', flexWrap: 'wrap' },
    cella: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    cellaBtn: { borderRadius: 999 },
    cellaText: { color: colors.navyDeep, fontSize: Font.small },
  });
}

export default function ModificaProfilo() {
  const { me, refreshMe, demoMode } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Anagrafica
  const [nome, setNome] = useState(me?.nome ?? '');
  const [cognome, setCognome] = useState(me?.cognome ?? '');
  const [genere, setGenere] = useState<Genere | ''>(me?.genere ?? '');
  const [dataNascita, setDataNascita] = useState(me?.data_nascita ?? '');
  const [dataNascitaTesto, setDataNascitaTesto] = useState(isoAItaliano(me?.data_nascita ?? ''));
  const [calendarioAperto, setCalendarioAperto] = useState(false);
  const [codiceFiscale, setCodiceFiscale] = useState(me?.codice_fiscale ?? '');
  // Contatti
  const [telefono, setTelefono] = useState(me?.telefono ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  // Preferenze di gioco
  const [nickname, setNickname] = useState(me?.profilo?.nickname ?? '');
  const [mano, setMano] = useState<ManoDominante | ''>(me?.mano_dominante ?? '');
  const [posizione, setPosizione] = useState<Posizione | ''>(me?.posizione ?? '');
  // Disponibilità oraria
  const [disponibilita, setDisponibilita] = useState<Record<string, FasciaOraria[]>>(me?.disponibilita_oraria ?? {});

  const [saving, setSaving] = useState(false);
  const [sezioniAperte, setSezioniAperte] = useState({
    anagrafica: true, contatti: true, preferenze: true, disponibilita: false,
  });
  const toggleSezione = (k: keyof typeof sezioniAperte) => setSezioniAperte((p) => ({ ...p, [k]: !p[k] }));

  // Data di nascita digitata in formato italiano (GG-MM-AAAA, fix utente
  // esplicito) — i trattini si inseriscono da soli mentre si scrivono solo
  // le cifre (stesso comfort di un vero input data), poi convertita in ISO
  // solo quando è una data completa/valida; finché l'utente sta ancora
  // scrivendo resta solo testo, non un errore.
  const onCambiaTestoData = (testo: string) => {
    const cifre = testo.replace(/\D/g, '').slice(0, 8);
    let formattato = cifre;
    if (cifre.length > 4) formattato = `${cifre.slice(0, 2)}-${cifre.slice(2, 4)}-${cifre.slice(4)}`;
    else if (cifre.length > 2) formattato = `${cifre.slice(0, 2)}-${cifre.slice(2)}`;
    setDataNascitaTesto(formattato);
    const iso = italianoAIso(formattato);
    if (iso) setDataNascita(iso);
  };
  const onSceglieCalendario = (iso: string) => {
    setDataNascita(iso);
    setDataNascitaTesto(isoAItaliano(iso));
    setCalendarioAperto(false);
  };

  const toggleGiorno = (giorno: string) => {
    setDisponibilita((prev) => {
      if (prev[giorno]) { const { [giorno]: _rimosso, ...resto } = prev; return resto; }
      return { ...prev, [giorno]: [{ da: '18:00', a: '20:00' }] };
    });
  };
  const aggiungiFascia = (giorno: string) => {
    setDisponibilita((prev) => ({ ...prev, [giorno]: [...(prev[giorno] ?? []), { da: '18:00', a: '20:00' }] }));
  };
  const rimuoviFascia = (giorno: string, idx: number) => {
    setDisponibilita((prev) => {
      const attuali = (prev[giorno] ?? []).filter((_, i) => i !== idx);
      const resto = { ...prev };
      if (attuali.length === 0) delete resto[giorno]; else resto[giorno] = attuali;
      return resto;
    });
  };
  const modificaFascia = (giorno: string, idx: number, campo: 'da' | 'a', valore: string) => {
    setDisponibilita((prev) => {
      const attuali = [...(prev[giorno] ?? [])];
      attuali[idx] = { ...attuali[idx], [campo]: valore };
      return { ...prev, [giorno]: attuali };
    });
  };

  const salva = async () => {
    if (!me) return;
    setSaving(true);
    await updateProfilo(me.id, {
      nome, cognome,
      genere: (genere || null) as any,
      data_nascita: dataNascita || null,
      codice_fiscale: codiceFiscale || null,
      telefono, email,
      mano_dominante: (mano || null) as any,
      posizione: (posizione || null) as any,
      disponibilita_oraria: disponibilita,
      profilo: { ...(me.profilo ?? {}), nickname },
    });
    if (!demoMode) await refreshMe();
    setSaving(false);
    avvisa('Salvato', `Profilo aggiornato.${demoMode ? '\n\n(demo: non salvato sul server)' : ''}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>Modifica profilo</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Es. Il Muro" />

        <Sezione titolo="Anagrafica" aperta={sezioniAperte.anagrafica} onToggle={() => toggleSezione('anagrafica')}>
          <View style={s.riga2}>
            <Field style={{ flex: 1 }} label="Nome" value={nome} onChangeText={setNome} />
            <Field style={{ flex: 1 }} label="Cognome" value={cognome} onChangeText={setCognome} />
          </View>
          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Genere</Muted>
            <View style={s.chips}>
              <Chip label="—" active={genere === ''} onPress={() => setGenere('')} />
              <Chip label="M" active={genere === 'M'} onPress={() => setGenere('M')} />
              <Chip label="F" active={genere === 'F'} onPress={() => setGenere('F')} />
            </View>
          </View>
          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Data di nascita</Muted>
            <View style={s.dataRiga}>
              <Input
                style={{ flex: 1 }} value={dataNascitaTesto} onChangeText={onCambiaTestoData}
                placeholder="GG-MM-AAAA" keyboardType="number-pad" maxLength={10}
              />
              <Pressable style={s.dataCalendarioBtn} onPress={() => setCalendarioAperto(true)}>
                <Ionicons name="calendar-outline" size={20} color={colors.navyDeep} />
              </Pressable>
            </View>
          </View>
          <CalendarioDataNascita
            visibile={calendarioAperto} valoreIso={dataNascita ?? ''}
            onChiudi={() => setCalendarioAperto(false)} onScegli={onSceglieCalendario}
          />
          <Field label="Codice fiscale" value={codiceFiscale ?? ''} onChangeText={setCodiceFiscale} autoCapitalize="characters" />
        </Sezione>

        <Sezione titolo="Contatti" aperta={sezioniAperte.contatti} onToggle={() => toggleSezione('contatti')}>
          <Field label="Telefono" value={telefono ?? ''} onChangeText={setTelefono} placeholder="+39..." keyboardType="phone-pad" />
          <Field label="Email" value={email ?? ''} onChangeText={setEmail} placeholder="nome@esempio.it" keyboardType="email-address" autoCapitalize="none" />
        </Sezione>

        {/* "Sport praticati" rimosso (fix utente esplicito, confermato): si
            popola già da solo — un giocatore aggiunto a una prenotazione di
            uno sport lo acquisisce automaticamente tra i preferiti (vedi
            backend _sincronizza_sport_preferiti), un campo manuale qui
            sarebbe ridondante. */}
        <Sezione titolo="Preferenze di gioco" aperta={sezioniAperte.preferenze} onToggle={() => toggleSezione('preferenze')}>
          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Mano dominante</Muted>
            <View style={s.chips}>
              <Chip label="—" active={mano === ''} onPress={() => setMano('')} />
              {(['destro', 'mancino', 'ambidestro'] as ManoDominante[]).map((m) => (
                <Chip key={m} label={cap(m)} active={mano === m} onPress={() => setMano(m)} />
              ))}
            </View>
          </View>
          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Posizione in campo</Muted>
            <View style={s.chips}>
              <Chip label="—" active={posizione === ''} onPress={() => setPosizione('')} />
              {(['destra', 'sinistra', 'entrambe'] as Posizione[]).map((p) => (
                <Chip key={p} label={cap(p)} active={posizione === p} onPress={() => setPosizione(p)} />
              ))}
            </View>
          </View>
        </Sezione>

        <Sezione
          titolo="Disponibilità oraria"
          badge={Object.keys(disponibilita).length || undefined}
          aperta={sezioniAperte.disponibilita}
          onToggle={() => toggleSezione('disponibilita')}
        >
          <Muted style={{ marginBottom: Spacing.sm }}>Seleziona i giorni e aggiungi le fasce che preferisci.</Muted>
          {GIORNI.map((gi) => {
            const attivo = Boolean(disponibilita[gi]);
            return (
              <View key={gi} style={s.giornoBlocco}>
                <Pressable style={s.giornoRiga} onPress={() => toggleGiorno(gi)}>
                  <Ionicons name={attivo ? 'checkbox' : 'square-outline'} size={20} color={attivo ? colors.gold : colors.slate} />
                  <Text style={s.giornoNome}>{gi}</Text>
                </Pressable>
                {attivo && (
                  <View style={s.fasceBox}>
                    {(disponibilita[gi] ?? []).map((f, idx) => (
                      <View key={idx} style={s.fasciaRiga}>
                        <Input style={s.orario} value={f.da} onChangeText={(v) => modificaFascia(gi, idx, 'da', v)} placeholder="18:00" />
                        <Text style={s.fasciaSep}>–</Text>
                        <Input style={s.orario} value={f.a} onChangeText={(v) => modificaFascia(gi, idx, 'a', v)} placeholder="20:00" />
                        <Pressable onPress={() => rimuoviFascia(gi, idx)} style={s.fasciaRimuovi}>
                          <Ionicons name="close" size={16} color={colors.red} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => aggiungiFascia(gi)} style={s.aggiungiFascia}>
                      <Ionicons name="add" size={14} color={colors.navyDeep} />
                      <Text style={s.aggiungiFasciaText}>fascia</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </Sezione>

        <Button title="Salva" onPress={salva} loading={saving} style={{ marginTop: Spacing.xl }} />
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Sezione({ titolo, badge, aperta, onToggle, children }: {
  titolo: string; badge?: number; aperta: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card style={s.sezione}>
      <Pressable style={s.sezioneHead} onPress={onToggle}>
        <Text style={s.sezioneTitolo}>{titolo}{badge ? ` · ${badge}` : ''}</Text>
        <Ionicons name={aperta ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} />
      </Pressable>
      {aperta && <View style={s.sezioneBody}>{children}</View>}
    </Card>
  );
}

function Field({ label, style, ...rest }: any) {
  return (
    <View style={style}>
      <Muted style={{ marginBottom: Spacing.sm }}>{label}</Muted>
      <Input {...rest} />
    </View>
  );
}
function cap(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.lg },
    chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
    riga2: { flexDirection: 'row', gap: Spacing.md },
    dataRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    dataCalendarioBtn: {
      width: 50, height: 50, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.navyCard, borderWidth: 1, borderColor: colors.navyLine + '55',
    },
    sezione: {},
    sezioneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, margin: -Spacing.lg, marginBottom: 0 },
    sezioneTitolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.body, textTransform: 'uppercase', letterSpacing: 0.3 },
    sezioneBody: { paddingTop: Spacing.lg, gap: Spacing.lg },
    giornoBlocco: { marginBottom: Spacing.sm },
    giornoRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
    giornoNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body },
    fasceBox: { marginLeft: 28, gap: Spacing.sm },
    fasciaRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    orario: { width: 76, height: 38 },
    fasciaSep: { color: colors.slate },
    fasciaRimuovi: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
    aggiungiFascia: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
    aggiungiFasciaText: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small, textDecorationLine: 'underline' },
  });
}
