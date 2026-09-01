import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import { getCampi, getPrenotazioniGiorno, creaPrenotazione } from '../../lib/api';
import { CENTRO_ID } from '../../lib/mockData';
import { Card, H1, H2, Muted, Button, Pill } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing, Font, AppColors } from '../../constants/theme';
import type { Campo, Prenotazione, Tariffa } from '../../types/models';

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const DURATA = 90; // minuti
const APERTURA = 8, CHIUSURA = 23;

// Barra di conferma in fondo: stessa superficie scura intenzionale della
// navbar/sidebar (§ "one dark surface"), non segue il toggle chiaro/scuro.
const GLASS_BLUR_STRONG = 34;

export default function Prenota() {
  const { me, demoMode } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [campi, setCampi] = useState<Campo[]>([]);
  const [campoSel, setCampoSel] = useState<Campo | null>(null);
  const [giorniOffset, setGiorniOffset] = useState(0);
  const [occupati, setOccupati] = useState<Prenotazione[]>([]);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dataSel = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + giorniOffset); return d;
  }, [giorniOffset]);
  const dataISO = dataSel.toISOString().slice(0, 10);

  useEffect(() => { getCampi().then((c) => { setCampi(c); setCampoSel(c[0] ?? null); }); }, []);

  const loadOccupati = useCallback(async () => {
    if (!campoSel) return;
    const rows = await getPrenotazioniGiorno([campoSel.id], dataISO);
    setOccupati(rows); setSlotSel(null);
  }, [campoSel, dataISO]);
  useEffect(() => { loadOccupati(); }, [loadOccupati]);

  const slots = useMemo(() => generaSlot(campoSel), [campoSel]);

  const isOccupato = (slot: string) =>
    occupati.some((p) => p.inizio?.slice(0, 5) === slot);

  const prezzoSlot = (slot: string): number => {
    if (!campoSel) return 0;
    const t = tariffaPerOra(campoSel.tariffe, slot);
    return t?.prezzo ?? 0;
  };

  const conferma = async () => {
    if (!campoSel || !slotSel || !me) return;
    const fine = addMin(slotSel, DURATA);
    setSaving(true);
    const res = await creaPrenotazione({
      centro_id: campoSel.centro_id || CENTRO_ID, campo_id: campoSel.id, creata_da: me.id,
      data: dataISO, inizio: slotSel, fine, prezzo: prezzoSlot(slotSel),
    });
    setSaving(false);
    if (res.ok) {
      Alert.alert('Prenotazione confermata', `${campoSel.nome}\n${GIORNI[dataSel.getDay()]} ${dataSel.getDate()} · ${slotSel}–${fine}${demoMode ? '\n\n(demo: non salvata sul server)' : ''}`);
      setSlotSel(null); loadOccupati();
    } else {
      Alert.alert('Errore', res.error ?? 'Impossibile prenotare.');
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <H1>Prenota un campo</H1>
        <Muted style={{ marginBottom: Spacing.lg }}>Scegli giorno, campo e orario.</Muted>

        {/* Selettore giorni */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {Array.from({ length: 14 }).map((_, i) => {
              const d = new Date(); d.setDate(d.getDate() + i);
              const active = i === giorniOffset;
              return (
                <Pressable key={i} onPress={() => setGiorniOffset(i)} style={[s.dayPill, active && s.dayPillActive]}>
                  <Text style={[s.dayPillTop, active && s.dayPillTextActive]}>{GIORNI[d.getDay()]}</Text>
                  <Text style={[s.dayPillNum, active && s.dayPillTextActive]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Selettore campi */}
        <H2 style={{ marginBottom: Spacing.md }}>Campo</H2>
        <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
          {campi.map((c) => {
            const active = campoSel?.id === c.id;
            return (
              <Pressable key={c.id} onPress={() => setCampoSel(c)}>
                <Card style={[s.campoCard, active && s.campoCardActive]}>
                  <View style={s.campoIcon}><Ionicons name="tennisball" size={20} color={active ? colors.navyDeep : colors.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.campoNome}>{c.nome}</Text>
                    <Muted>{c.sport} · {c.tipo}</Muted>
                  </View>
                  <Pill label={`da €${Math.min(...c.tariffe.map((t) => t.prezzo))}`} />
                </Card>
              </Pressable>
            );
          })}
        </View>

        {/* Griglia slot */}
        <H2 style={{ marginBottom: Spacing.md }}>Orari disponibili</H2>
        <View style={s.slotGrid}>
          {slots.map((slot) => {
            const occ = isOccupato(slot);
            const sel = slotSel === slot;
            return (
              <Pressable key={slot} disabled={occ} onPress={() => setSlotSel(slot)}
                style={[s.slot, occ && s.slotOcc, sel && s.slotSel]}>
                <Text style={[s.slotText, occ && s.slotTextOcc, sel && s.slotTextSel]}>{slot}</Text>
                {!occ && <Text style={[s.slotPrezzo, sel && s.slotTextSel]}>€{prezzoSlot(slot)}</Text>}
                {occ && <Text style={s.slotTextOcc}>occupato</Text>}
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {slotSel && (
        <View style={s.bar}>
          <BlurView intensity={GLASS_BLUR_STRONG} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, s.barTint]} />
          <View style={{ flex: 1 }}>
            <Text style={s.barTitle}>{campoSel?.nome} · {slotSel}–{addMin(slotSel, DURATA)}</Text>
            <Muted style={{ color: '#93A6C0' }}>{GIORNI[dataSel.getDay()]} {dataSel.getDate()} · €{prezzoSlot(slotSel)}</Muted>
          </View>
          <Button title="Conferma" onPress={conferma} loading={saving} style={{ paddingHorizontal: Spacing.xl }} />
        </View>
      )}
    </SafeAreaView>
  );
}

function generaSlot(campo: Campo | null): string[] {
  const out: string[] = [];
  for (let h = APERTURA; h < CHIUSURA; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
}
function tariffaPerOra(tariffe: Tariffa[], slot: string): Tariffa | undefined {
  const m = toMin(slot);
  return tariffe.find((t) => m >= toMin(t.inizio) && m < toMin(t.fine)) ?? tariffe[0];
}
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function addMin(t: string, min: number) {
  const tot = toMin(t) + min; return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: Spacing.lg },
    dayPill: { width: 52, height: 64, borderRadius: Radius.md, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.navyLine + '55' },
    dayPillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    dayPillTop: { color: colors.slate, fontSize: Font.tiny, fontWeight: '700', textTransform: 'uppercase' },
    dayPillNum: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800' },
    dayPillTextActive: { color: colors.navyDeep },
    campoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
    campoCardActive: { borderColor: colors.gold, backgroundColor: colors.navy },
    campoIcon: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
    campoNome: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    slot: { width: '31%', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: colors.navyCard, alignItems: 'center', borderWidth: 1, borderColor: colors.navyLine + '55' },
    slotOcc: { backgroundColor: colors.navy + '80', borderColor: 'transparent', opacity: 0.6 },
    slotSel: { backgroundColor: colors.gold, borderColor: colors.gold },
    slotText: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    slotPrezzo: { color: colors.slate, fontSize: Font.tiny, marginTop: 2 },
    slotTextOcc: { color: colors.white, fontSize: Font.tiny },
    slotTextSel: { color: colors.navyDeep },
    bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, overflow: 'hidden', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
    barTint: { backgroundColor: 'rgba(30, 49, 74, 0.82)' },
    barTitle: { color: colors.white, fontWeight: '700', fontSize: Font.body },
  });
}
