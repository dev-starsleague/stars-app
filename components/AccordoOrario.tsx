// Partita di campionato senza orari in comune tra le due squadre (fix
// utente esplicito): si gioca comunque, e l'orario se lo accordano i
// giocatori — conferma della proposta o controproposta, il centro vigila.
// "giorno" = stesso giorno ma orari diversi, "fascia" = stesso orario ma
// giorni diversi, "bonus" = niente in comune: prima il centro fissa un
// orario bonus, poi lo confermano le squadre.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Button, Chip } from './ui';
import { accordoOrarioPartita } from '../lib/api';
import { avvisa } from '../lib/avviso';
import { useTheme } from '../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../constants/theme';
import type { AccordoOrario } from '../types/models';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const ORARI = Array.from({ length: 31 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
const METODO: Record<AccordoOrario['metodo'], string> = {
  giorno: 'Giocate lo stesso giorno ma in orari diversi',
  fascia: 'Giocate negli stessi orari ma in giorni diversi',
  bonus: 'Non avete né un giorno né un orario in comune',
};

export function AccordoOrarioCard({ matchId, accordo, lato, onAggiornato }: {
  matchId: string; accordo: AccordoOrario; lato: 'a' | 'b' | null; onAggiornato: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [proponendo, setProponendo] = useState(false);
  const [giorno, setGiorno] = useState(accordo.proposta?.giorno ?? 'Lun');
  const [ora, setOra] = useState(accordo.proposta?.ora ?? '20:00');
  const [invio, setInvio] = useState(false);

  const p = accordo.proposta;
  const quando = p ? `${p.giorno} alle ${p.ora}` : null;
  const concordato = accordo.stato === 'concordato';
  const hoConfermato = !!lato && accordo.conferme?.[lato];

  async function invia(azione: 'conferma' | 'proponi') {
    if (!lato) return;
    setInvio(true);
    const r = await accordoOrarioPartita(matchId, azione, lato, giorno, ora);
    setInvio(false);
    if (!r.ok) { avvisa('Errore', r.error ?? 'Riprova.'); return; }
    setProponendo(false);
    onAggiornato();
  }

  if (concordato) {
    return (
      <View style={[s.box, s.boxOk]}>
        <Text style={[s.titolo, { color: colors.green }]}>🕒 Orario concordato: {quando}</Text>
      </View>
    );
  }
  return (
    <View style={s.box}>
      <Text style={s.titolo}>⚠️ Orario da concordare</Text>
      <Text style={s.testo}>{METODO[accordo.metodo]}.</Text>
      {accordo.stato === 'attesa_centro' ? (
        <Text style={s.testo}>Il centro sta fissando un orario bonus{quando ? ` (consigliato: ${quando})` : ''}: lo trovi qui appena è pronto.</Text>
      ) : (
        <>
          <Text style={s.testo}>
            Proposta: <Text style={s.forte}>{quando ?? '—'}</Text>
            {p?.da === 'gestionale' ? ' (consigliata dal gestionale)' : p?.da === 'centro' ? ' (orario bonus del centro)' : p?.da === lato ? ' (vostra)' : p?.da ? ' (degli avversari)' : ''}
          </Text>
          {lato && (hoConfermato ? (
            <Text style={s.testo}>Avete confermato: aspettiamo la conferma degli avversari.</Text>
          ) : !proponendo ? (
            <View style={s.azioni}>
              <Button title="Va bene" onPress={() => invia('conferma')} loading={invio} style={{ flex: 1 }} />
              <Button title="Proponi un altro" variant="ghost" onPress={() => setProponendo(true)} style={{ flex: 1 }} />
            </View>
          ) : null)}
          {lato && proponendo && (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                {GIORNI.map((g) => <Chip key={g} label={g} active={g === giorno} onPress={() => setGiorno(g)} />)}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                {ORARI.map((o) => <Chip key={o} label={o} active={o === ora} onPress={() => setOra(o)} />)}
              </ScrollView>
              <View style={s.azioni}>
                <Button title={`Proponi ${giorno} ${ora}`} onPress={() => invia('proponi')} loading={invio} style={{ flex: 1 }} />
                <Pressable onPress={() => setProponendo(false)} style={s.annulla}><Text style={s.annullaTesto}>Annulla</Text></Pressable>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    box: {
      marginTop: 6, marginBottom: 4, padding: Spacing.md, borderRadius: Radius.card, gap: 4,
      backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)',
    },
    boxOk: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.45)' },
    titolo: { color: colors.red, fontWeight: '800', fontSize: Font.small },
    testo: { color: colors.slate, fontSize: Font.small },
    forte: { color: colors.navyDeep, fontWeight: '800' },
    azioni: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, alignItems: 'center' },
    chips: { gap: 6, paddingVertical: 2 },
    annulla: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    annullaTesto: { color: colors.slate, fontWeight: '700' },
  });
}
