import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { updateProfilo } from '../lib/api';
import { Button, Card, Chip, IconButton, Input, Muted } from '../components/ui';
import { Colors, Spacing, Font } from '../constants/theme';
import type { FasciaOraria, Genere, ManoDominante, Posizione } from '../types/models';

// Stessi campi del form "Modifica giocatore" del gestionale
// (src/routes/giocatori/+page.svelte), riorganizzati nelle 4 sezioni chieste:
// Anagrafica, Contatti, Preferenze di gioco, Disponibilità oraria.
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const SPORT_DISPONIBILI = ['Padel', 'Tennis', 'Pickleball', 'Beach Tennis'];

export default function ModificaProfilo() {
  const { me, refreshMe, demoMode } = useAuth();
  const router = useRouter();

  // Anagrafica
  const [nome, setNome] = useState(me?.nome ?? '');
  const [cognome, setCognome] = useState(me?.cognome ?? '');
  const [genere, setGenere] = useState<Genere | ''>(me?.genere ?? '');
  const [dataNascita, setDataNascita] = useState(me?.data_nascita ?? '');
  const [codiceFiscale, setCodiceFiscale] = useState(me?.codice_fiscale ?? '');
  // Contatti
  const [telefono, setTelefono] = useState(me?.telefono ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  // Preferenze di gioco
  const [nickname, setNickname] = useState(me?.profilo?.nickname ?? '');
  const [sportPraticati, setSportPraticati] = useState<string[]>(me?.sport_preferiti ?? []);
  const [mano, setMano] = useState<ManoDominante | ''>(me?.mano_dominante ?? '');
  const [posizione, setPosizione] = useState<Posizione | ''>(me?.posizione ?? '');
  // Disponibilità oraria
  const [disponibilita, setDisponibilita] = useState<Record<string, FasciaOraria[]>>(me?.disponibilita_oraria ?? {});

  const [saving, setSaving] = useState(false);
  const [sezioniAperte, setSezioniAperte] = useState({
    anagrafica: true, contatti: true, preferenze: true, disponibilita: false,
  });
  const toggleSezione = (k: keyof typeof sezioniAperte) => setSezioniAperte((p) => ({ ...p, [k]: !p[k] }));

  const toggleSport = (sp: string) => {
    setSportPraticati((prev) => prev.includes(sp) ? prev.filter((x) => x !== sp) : [...prev, sp]);
  };
  const tuttiGliSport = sportPraticati.length === SPORT_DISPONIBILI.length;
  const toggleTuttiSport = () => setSportPraticati(tuttiGliSport ? [] : [...SPORT_DISPONIBILI]);

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
      sport_preferiti: sportPraticati,
      mano_dominante: (mano || null) as any,
      posizione: (posizione || null) as any,
      disponibilita_oraria: disponibilita,
      profilo: { ...(me.profilo ?? {}), nickname },
    });
    if (!demoMode) await refreshMe();
    setSaving(false);
    Alert.alert('Salvato', `Profilo aggiornato.${demoMode ? '\n\n(demo: non salvato sul server)' : ''}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
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
          <Field label="Data di nascita" value={dataNascita ?? ''} onChangeText={setDataNascita} placeholder="AAAA-MM-GG" />
          <Field label="Codice fiscale" value={codiceFiscale ?? ''} onChangeText={setCodiceFiscale} autoCapitalize="characters" />
        </Sezione>

        <Sezione titolo="Contatti" aperta={sezioniAperte.contatti} onToggle={() => toggleSezione('contatti')}>
          <Field label="Telefono" value={telefono ?? ''} onChangeText={setTelefono} placeholder="+39..." keyboardType="phone-pad" />
          <Field label="Email" value={email ?? ''} onChangeText={setEmail} placeholder="nome@esempio.it" keyboardType="email-address" autoCapitalize="none" />
        </Sezione>

        <Sezione titolo="Preferenze di gioco" aperta={sezioniAperte.preferenze} onToggle={() => toggleSezione('preferenze')}>
          <View>
            <Muted style={{ marginBottom: Spacing.sm }}>Sport praticati</Muted>
            <View style={s.chips}>
              <Chip label="Tutti" active={tuttiGliSport} onPress={toggleTuttiSport} />
              {SPORT_DISPONIBILI.map((sp) => (
                <Chip key={sp} label={sp} active={sportPraticati.includes(sp)} onPress={() => toggleSport(sp)} />
              ))}
            </View>
          </View>
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
                  <Ionicons name={attivo ? 'checkbox' : 'square-outline'} size={20} color={attivo ? Colors.gold : Colors.slate} />
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
                          <Ionicons name="close" size={16} color={Colors.red} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => aggiungiFascia(gi)} style={s.aggiungiFascia}>
                      <Ionicons name="add" size={14} color={Colors.navyDeep} />
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
  return (
    <Card style={s.sezione}>
      <Pressable style={s.sezioneHead} onPress={onToggle}>
        <Text style={s.sezioneTitolo}>{titolo}{badge ? ` · ${badge}` : ''}</Text>
        <Ionicons name={aperta ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.slate} />
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
  scroll: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.lg },
  chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  riga2: { flexDirection: 'row', gap: Spacing.md },
  sezione: {},
  sezioneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, margin: -Spacing.lg, marginBottom: 0 },
  sezioneTitolo: { color: Colors.navyDeep, fontWeight: '800', fontSize: Font.body, textTransform: 'uppercase', letterSpacing: 0.3 },
  sezioneBody: { paddingTop: Spacing.lg, gap: Spacing.lg },
  giornoBlocco: { marginBottom: Spacing.sm },
  giornoRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  giornoNome: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.body },
  fasceBox: { marginLeft: 28, gap: Spacing.sm },
  fasciaRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orario: { width: 76, height: 38 },
  fasciaSep: { color: Colors.slate },
  fasciaRimuovi: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  aggiungiFascia: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  aggiungiFasciaText: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.small, textDecorationLine: 'underline' },
});
