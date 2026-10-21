// Disponibilità mancante su un'iscrizione a un campionato (fix utente
// esplicito: il centro può iscrivere coppie e giocatori anche senza
// disponibilità, che va inserita entro l'inizio dell'evento con un
// promemoria ogni giorno). Si invia quella del profilo — per una coppia,
// le fasce in cui sono liberi entrambi.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/theme';
import { contaGiorniUtili, intersezione } from '../lib/disponibilita';
import { avvisa } from '../lib/avviso';
import { Button, Card, Muted } from './ui';
import { AvvisoDisponibilita } from './AvvisoDisponibilita';
import { Spacing, Font } from '../constants/theme';
import type { FasciaOraria } from '../types/models';

type Disp = Record<string, FasciaOraria[]> | null | undefined;

export function DisponibilitaIscrizione({ attuale, minimo, inizio, mia, compagno, nomeCompagno, onInvia }: {
  attuale: Disp; minimo: number; inizio?: string | null; mia: Disp; compagno?: Disp; nomeCompagno?: string;
  onInvia: (d: Record<string, FasciaOraria[]>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [inviando, setInviando] = useState(false);
  const giorniAttuali = contaGiorniUtili(attuale);
  if (giorniAttuali >= minimo) return null;
  const proposta = intersezione(mia, compagno);
  const giorniProposta = contaGiorniUtili(proposta);

  const invia = async () => {
    setInviando(true);
    const res = await onInvia(proposta);
    setInviando(false);
    if (!res.ok) avvisa('Errore', res.error ?? 'Invio non riuscito.');
    else if (giorniProposta < minimo) avvisa('Disponibilità inviata', `Risultano ${giorniProposta} giorni: ne servono ${minimo}. Aggiungine altri dal profilo.`);
    else avvisa('Disponibilità inviata', 'Grazie: il centro la userà per fissare le partite.');
  };

  return (
    <Card style={[s.card, { borderColor: colors.amber }]}>
      <View style={s.testa}>
        <Ionicons name="time" size={20} color={colors.amber} />
        <Text style={[s.titolo, { color: colors.navyDeep }]}>Manca la tua disponibilità</Text>
      </View>
      <Muted style={{ marginBottom: Spacing.sm }}>
        Servono almeno {minimo} giorni a settimana con 2 ore libere{inizio ? `, entro il ${new Date(inizio).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}` : ' prima dell\'inizio'}. Per ora ne risultano {giorniAttuali}.
      </Muted>
      <Muted>
        Dal tuo profilo{compagno !== undefined ? ` e da quello di ${nomeCompagno ?? 'del compagno'} (fasce in comune)` : ''}: {giorniProposta} {giorniProposta === 1 ? 'giorno' : 'giorni'}.
      </Muted>
      {giorniProposta > 0 && <AvvisoDisponibilita giorni={giorniProposta} />}
      <Button title="Invia la mia disponibilità" loading={inviando} disabled={giorniProposta === 0} onPress={invia} style={{ marginTop: Spacing.md }} />
      <Button title="Modifica disponibilità nel profilo" variant="ghost" onPress={() => router.push('/modifica-profilo')} style={{ marginTop: Spacing.sm }} />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: Spacing.lg, borderWidth: 2 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  titolo: { fontSize: Font.h3, fontWeight: '800' },
});
