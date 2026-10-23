// "Come funziona" di un campionato, lato giocatore (fix utente esplicito:
// le giornate massime servono a "dare un'idea ai giocatori di quanto
// durerà"): durata stimata, formula (girone unico o gironi), Rising Stars /
// Fallen Stars e premi. Stessa stima del wizard del gestionale
// (eventi-standard/nuovo): una giornata a settimana + recupero + circa 3
// settimane di playoff. Il calendario non si sceglie più: lo genera il
// centro sulle disponibilità (fix utente esplicito). Premi anche per
// modalità (progressivi / budget / bonus a soglia) sull'evento padre.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { Spacing, Font } from '../constants/theme';

const SETTIMANE_PLAYOFF_STIMATE = 3;

type PremioSalvato = { posizione: number; premi: { tipo: string; coin_quantita?: number; descrizione?: string | null }[] };
type FormatConfig = { [key: string]: unknown } | null | undefined;

function descriviPremi(premio: PremioSalvato[] | null | undefined): string | null {
  if (!premio?.length) return null;
  return premio
    .map((pos) => `${pos.posizione}° ${pos.premi.map((p) => (p.tipo === 'coin' ? `${p.coin_quantita} Stars Coin` : p.descrizione || '—')).join(' + ')}`)
    .join(' · ');
}

const etichettaPos = (n: number) => `${n}°`;

function descriviModalitaPremi(config: any, premioBase: PremioSalvato[] | null | undefined): string | null {
  if (!config?.modalita) return null;
  if (config.modalita === 'progressivi') {
    const righe = Object.entries(config.per_categoria ?? {}).map(([c, p]) => `${c}: ${descriviPremi(p as PremioSalvato[])}`);
    return `Crescono con il livello della categoria.\n${righe.join('\n')}`;
  }
  if (config.modalita === 'budget') {
    return `Montepremi di €${config.budget_euro} diviso tra le categorie ${config.distribuzione === 'manuale' ? 'secondo le quote decise dal centro' : 'in base agli iscritti'}, in Stars Coin: ${(config.ripartizione ?? []).map((v: number, i: number) => `${etichettaPos(i + 1)} ${v}%`).join(', ')}. Più iscritti, premi più ricchi.`;
  }
  const base = descriviPremi(premioBase);
  const bonus = (config.soglie ?? []).map((sg: any) => `da ${sg.iscritti_minimi} squadre: + ${descriviPremi(sg.bonus) ?? '—'}`);
  return `${base ? `Base: ${base}` : 'Base'}\nBonus se la tua categoria raggiunge:\n${bonus.join('\n')}`;
}

export function RiepilogoCampionato({ formatConfig, premio, inizio }: {
  formatConfig: FormatConfig; premio?: unknown; inizio?: string | null;
}) {
  const { colors } = useTheme();
  const fc = (formatConfig ?? {}) as Record<string, any>;
  const andataRitorno = fc.turni === 'andata_ritorno';
  const giornate = Number(fc.giornate_massime) || 0;
  const recupero = Number(fc.settimane_recupero) || 0;
  const rising = !!fc.playoff?.attivo;
  const fallen = !!fc.fallen_stars?.attivo;
  const settimane = giornate + recupero + (rising ? SETTIMANE_PLAYOFF_STIMATE : 0);
  const fine = inizio && giornate ? new Date(new Date(inizio).getTime() + settimane * 7 * 86400000) : null;

  const righe: { icona: keyof typeof Ionicons.glyphMap; titolo: string; testo: string }[] = [];
  if (giornate) {
    righe.push({
      icona: 'calendar-outline', titolo: 'Durata',
      testo: `Fino a ${giornate} partite di regular season, una a settimana${recupero ? `, + ${recupero} ${recupero === 1 ? 'settimana' : 'settimane'} di recupero` : ''}${rising ? ' + playoff' : ''}: circa ${settimane} settimane${fine ? `, fine intorno al ${fine.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}` : ''}.`,
    });
  }
  righe.push({
    icona: 'git-network-outline', titolo: 'Formula',
    testo: fc.struttura === 'girone_unico'
      ? `Girone unico con classifica unica: ogni squadra gioca al massimo ${fc.partite_per_squadra} partite${andataRitorno ? ' di andata, più il ritorno' : ''}, quindi non tutte si incontrano.`
      : `Gironi: nel tuo girone incontri tutte le squadre${andataRitorno ? ', in andata e ritorno' : ''}.`,
  });
  // calendario sulle disponibilità (i vecchi campionati "per ranking" no)
  if (fc.criterio_calendario !== 'ranking') {
    righe.push({ icona: 'time-outline', titolo: 'Calendario', testo: 'Il calendario verrà generato automaticamente in base alle disponibilità dei giocatori.' });
  }
  if (rising) {
    righe.push({
      icona: 'trending-up-outline', titolo: 'Rising Stars',
      testo: fc.playoff?.meta ? 'La metà superiore di ogni girone gioca i playoff per il titolo.' : `Le prime ${fc.playoff?.qualificate_per_girone ?? 2} di ogni girone giocano i playoff.`,
    });
  }
  if (fallen) {
    righe.push({ icona: 'trending-down-outline', titolo: 'Fallen Stars', testo: 'La metà inferiore gioca un torneo di consolazione.' });
  }
  const premiPrincipali = descriviModalitaPremi(fc.premi_config, premio as PremioSalvato[] | null) ?? descriviPremi(premio as PremioSalvato[] | null);
  if (premiPrincipali) righe.push({ icona: 'trophy-outline', titolo: rising && fc.playoff?.meta ? 'Premi Rising Stars' : 'Premi', testo: premiPrincipali });
  const premiFallen = fallen ? descriviPremi(fc.fallen_stars?.premio) : null;
  if (premiFallen) righe.push({ icona: 'medal-outline', titolo: 'Premi Fallen Stars', testo: premiFallen });

  return (
    <View style={{ gap: Spacing.sm }}>
      {righe.map((r) => (
        <View key={r.titolo} style={s.riga}>
          <Ionicons name={r.icona} size={18} color={colors.slate} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[s.titolo, { color: colors.navyDeep }]}>{r.titolo}</Text>
            <Text style={[s.testo, { color: colors.slate }]}>{r.testo}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  riga: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  titolo: { fontSize: Font.small, fontWeight: '800' },
  testo: { fontSize: Font.small, lineHeight: 18 },
});
