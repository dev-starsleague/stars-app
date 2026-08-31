import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Radius } from '../constants/theme';
import type { EventoStorico } from '../types/models';

// Porting diretto di stars-system/src/lib/components/GraficoRanking.svelte
// (stessa identica logica di costruzione) su react-native-svg. Due viste:
// "ultime 10" interattiva (punti cliccabili, assi su min/centro/max reali) e
// "tutto lo storico" (nessun punto — affollerebbe il disegno — livelli di
// riferimento fissi e regolari così l'asse resta leggibile con molti eventi).
const ETICHETTA_OVERRIDE_TIPO: Record<string, string> = {
  verifica: 'Verifica confermata',
  radar: 'Correzione automatica (radar)',
  centro: 'Correzione manuale del centro',
  maestro: 'Correzione del maestro',
};

function sceglilStepGriglia(span: number): number {
  const candidati = [0.1, 0.25, 0.5, 1, 2, 5];
  for (const step of candidati) if (span / step <= 6) return step;
  return candidati[candidati.length - 1];
}

function formatDataBrevissima(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const W = 320, H = 150, PAD_L = 40, PAD_T = 16, PAD_B = 26, PAD_R = 10;

function costruisciGrafico(storico: EventoStorico[], interattivo: boolean) {
  if (storico.length < 2) return null;
  const valori = storico.map((s) => s.post);
  const minRaw = Math.min(...valori), maxRaw = Math.max(...valori);
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;

  let min: number, max: number, livelli: number[];
  if (interattivo) {
    min = minRaw; max = maxRaw;
    livelli = [max, (min + max) / 2, min];
  } else {
    const step = sceglilStepGriglia(maxRaw - minRaw || 0.5);
    min = Math.floor(minRaw / step) * step;
    max = Math.ceil(maxRaw / step) * step;
    if (max === min) max += step;
    livelli = [];
    for (let v = min; v <= max + 1e-9; v += step) livelli.push(+v.toFixed(2));
    livelli.reverse();
  }

  const span = max - min || 1;
  const pts = valori.map((v, i) => ({
    x: PAD_L + (i / (valori.length - 1)) * innerW,
    y: PAD_T + innerH - ((v - min) / span) * innerH,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const base = (H - PAD_B).toFixed(1);
  const areaPath = `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
  const righeGriglia = livelli.map((v) => ({ v, y: PAD_T + innerH - ((v - min) / span) * innerH }));

  return {
    path, areaPath, pts, righeGriglia,
    delta: valori[valori.length - 1] - valori[0],
    primaData: storico[0].data, ultimaData: storico[storico.length - 1].data,
  };
}

export function RankingChart({ eventi, titolo = 'Andamento ranking' }: { eventi: EventoStorico[]; titolo?: string }) {
  const [vistaCompleta, setVistaCompleta] = useState(false);
  const [selezionato, setSelezionato] = useState<number | null>(null);

  const visibili = vistaCompleta ? eventi : eventi.slice(-10);
  const haStoricoEsteso = eventi.length > 10;
  const grafico = useMemo(() => costruisciGrafico(visibili, !vistaCompleta), [visibili, vistaCompleta]);

  if (!grafico) {
    return (
      <View style={s.wrap}>
        <Text style={s.titolo}>{titolo}</Text>
        <Text style={s.vuoto}>Non ci sono ancora abbastanza dati per un grafico.</Text>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.titoloRiga}>
        <Text style={s.titolo}>{titolo}</Text>
        <Text style={[s.delta, { color: grafico.delta >= 0 ? Colors.green : Colors.red }]}>
          {grafico.delta >= 0 ? '▲' : '▼'} {grafico.delta >= 0 ? '+' : ''}{grafico.delta.toFixed(2)}
        </Text>
      </View>
      <Text style={s.sub}>{vistaCompleta ? `${eventi.length} eventi in tutto` : `ultimi ${visibili.length} eventi`}</Text>

      <Svg viewBox={`0 0 ${W} ${H}`} style={s.svg}>
        {grafico.righeGriglia.map((riga, i) => (
          <React.Fragment key={i}>
            <Line x1={PAD_L} y1={riga.y} x2={W - 6} y2={riga.y} stroke={Colors.navyLine} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
            <SvgText x={2} y={riga.y + 3} fontSize={8} fill={Colors.slate}>{riga.v.toFixed(2)}</SvgText>
          </React.Fragment>
        ))}
        <SvgText x={PAD_L} y={H - 6} fontSize={8} fill={Colors.slate}>{formatDataBrevissima(grafico.primaData)}</SvgText>
        <SvgText x={W - 6} y={H - 6} fontSize={8} fill={Colors.slate} textAnchor="end">{formatDataBrevissima(grafico.ultimaData)}</SvgText>

        <Path d={grafico.areaPath} fill={Colors.gold} fillOpacity={0.15} stroke="none" />
        <Path d={grafico.path} fill="none" stroke={Colors.gold} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {!vistaCompleta && grafico.pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x} cy={p.y}
            r={selezionato === i ? 6.5 : i === grafico.pts.length - 1 ? 5 : 3.5}
            fill={selezionato === i ? Colors.red : i === grafico.pts.length - 1 ? Colors.navyDeep : Colors.gold}
            stroke={Colors.surface}
            strokeWidth={1.5}
            onPress={() => setSelezionato((sel) => (sel === i ? null : i))}
          />
        ))}
      </Svg>

      {!vistaCompleta && selezionato !== null && visibili[selezionato] && (
        <View style={s.dettaglio}>
          <Pressable onPress={() => setSelezionato(null)} style={s.dettaglioChiudi}>
            <Text style={s.dettaglioChiudiText}>✕</Text>
          </Pressable>
          <Text style={s.dettaglioVal}>
            Ranking <Text style={{ fontWeight: '900' }}>{visibili[selezionato].post.toFixed(2)}</Text>{' '}
            <Text style={{ color: visibili[selezionato].delta >= 0 ? Colors.green : Colors.red }}>
              ({visibili[selezionato].delta >= 0 ? '+' : ''}{visibili[selezionato].delta.toFixed(2)})
            </Text>
          </Text>
          <Text style={s.dettaglioMeta}>
            {new Date(visibili[selezionato].data).toLocaleDateString('it-IT')}
            {visibili[selezionato].tipo === 'match'
              ? ` · ${visibili[selezionato].vinta ? '✅ Vittoria' : '❌ Sconfitta'}${visibili[selezionato].compagno ? ` con ${visibili[selezionato].compagno}` : ''}${visibili[selezionato].avversari ? ` vs ${visibili[selezionato].avversari}` : ''}`
              : ` · ${(visibili[selezionato].overrideTipo && ETICHETTA_OVERRIDE_TIPO[visibili[selezionato].overrideTipo!]) || 'Correzione ranking'}${visibili[selezionato].motivazione ? ` · ${visibili[selezionato].motivazione}` : ''}`}
          </Text>
        </View>
      )}

      {haStoricoEsteso && (
        <Pressable onPress={() => { setVistaCompleta((v) => !v); setSelezionato(null); }}>
          <Text style={s.toggle}>{vistaCompleta ? '← Vedi solo le ultime 10' : `Vedi tutto lo storico (${eventi.length}) →`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 4 },
  titoloRiga: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  titolo: { fontWeight: '700', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.3, color: Colors.slate },
  delta: { fontWeight: '800', fontSize: 13 },
  sub: { fontSize: 11, color: Colors.slate, marginVertical: 4 },
  svg: { width: '100%', height: H },
  dettaglio: { marginTop: Spacing.sm, padding: 10, paddingRight: 28, borderRadius: Radius.compact, backgroundColor: Colors.navyCard },
  dettaglioVal: { fontWeight: '700', fontSize: 12.5, color: Colors.navyDeep },
  dettaglioMeta: { color: Colors.slate, marginTop: 2, fontSize: 12 },
  dettaglioChiudi: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dettaglioChiudiText: { color: Colors.slate, fontWeight: '700' },
  toggle: { marginTop: Spacing.sm, color: Colors.navy, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  vuoto: { color: Colors.slate, fontSize: 13, marginTop: 6 },
});
