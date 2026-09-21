import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { servePagamento } from '../lib/impegni';
import { formattaEuro } from '../lib/stars';
import { avvisa } from '../lib/avviso';
import { Muted, Button } from './ui';
import { Radius, Spacing, Font, AppColors } from '../constants/theme';
import type { Prenotazione, Centro } from '../types/models';

// Componente CONDIVISO tra Home (app/(tabs)/index.tsx, calendario inline)
// e app/(tabs)/giorno/[data].tsx (destinazione di link esterni, es. la
// condivisione WhatsApp dal gestionale) — prima erano due copie separate,
// che avevano già iniziato a divergere (centro/indirizzo/Maps aggiunti
// solo a una delle due, trovato in un audit del codice) — fix utente
// esplicito "sistema TUTTO": un solo punto, non due da tenere allineati.

function nomeGiocatore(id: string, p: Prenotazione): string {
  const g = p.giocatori?.find((x) => x.id === id);
  return g ? `${g.nome} ${g.cognome}`.trim() : 'Giocatore';
}
function squadreRiepilogo(p: Prenotazione): { a: string[]; b: string[] } {
  if (p.squadre) return p.squadre;
  const meta = Math.ceil(p.giocatori_extra.length / 2);
  return { a: p.giocatori_extra.slice(0, meta), b: p.giocatori_extra.slice(meta) };
}
function oggiISOLocale() { return new Date().toISOString().slice(0, 10); }

// Collegamento al centro / Google Maps: link ufficiale "Maps URLs" di
// Google — apre l'app Google Maps se installata (mobile), altrimenti il
// sito nel browser, sempre con la destinazione già impostata.
function linkGoogleMaps(indirizzo: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`;
}

export function RiepilogoPrenotazioneModal({ prenotazione, centro, onChiudi }: {
  prenotazione: Prenotazione | null; centro?: Centro | null; onChiudi: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [mapsAperto, setMapsAperto] = useState(false);

  const apriMaps = async (indirizzo: string) => {
    try {
      await Linking.openURL(linkGoogleMaps(indirizzo));
    } catch {
      avvisa('Errore', 'Non riesco ad aprire Google Maps su questo dispositivo.');
    }
  };

  return (
    <Modal visible={!!prenotazione} transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.sfondo} onPress={onChiudi}>
        <Pressable style={s.box} onPress={(e) => e.stopPropagation()}>
          {prenotazione && (() => {
            const p = prenotazione;
            const squadre = squadreRiepilogo(p);
            const haSquadre = p.tipo !== 'lezione' && (squadre.a.length > 0 || squadre.b.length > 0);
            return (
              <View>
                <Text style={s.titolo}>{p.campo?.nome ?? (p.tipo === 'lezione' ? 'Lezione' : 'Partita')}</Text>
                <View style={s.riga}>
                  <Ionicons name="calendar-outline" size={16} color={colors.slate} />
                  <Text style={s.testo}>{p.data} · {p.inizio?.slice(0, 5) ?? '—'}{p.fine ? `-${p.fine.slice(0, 5)}` : ''}</Text>
                </View>
                {p.campo?.sport && (
                  <View style={s.riga}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.slate} />
                    <Text style={s.testo}>{p.campo.sport}</Text>
                  </View>
                )}
                {centro?.nome && (
                  <View style={s.riga}>
                    <Ionicons name="location-outline" size={16} color={colors.slate} />
                    <Text style={s.testo}>{centro.nome}{p.campo?.nome ? ` · ${p.campo.nome}` : ''}</Text>
                  </View>
                )}
                <View style={s.riga}>
                  <Ionicons name="wallet-outline" size={16} color={colors.slate} />
                  <Text style={s.testo}>{formattaEuro(p.prezzo)} · {servePagamento(p) ? 'Da pagare' : 'Pagato'}</Text>
                </View>

                {centro?.indirizzo && (
                  <View style={{ marginTop: Spacing.sm }}>
                    <Pressable onPress={() => setMapsAperto((v) => !v)} style={s.mapsToggle}>
                      <Ionicons name="map-outline" size={13} color={colors.gold} />
                      <Text style={s.mapsToggleText}>Come arrivare</Text>
                      <Ionicons name={mapsAperto ? 'chevron-up' : 'chevron-down'} size={12} color={colors.slate} />
                    </Pressable>
                    {mapsAperto && (
                      <View style={{ marginTop: 6, gap: 8 }}>
                        <Text style={s.indirizzo}>{centro.indirizzo}</Text>
                        <Pressable onPress={() => apriMaps(centro.indirizzo!)} style={s.portamiQui}>
                          <Ionicons name="navigate" size={13} color={colors.navyDeep} />
                          <Text style={s.portamiQuiText}>Portami qui</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}

                {haSquadre && (
                  <View style={{ marginTop: Spacing.md }}>
                    <Muted style={{ marginBottom: 4 }}>Squadra A</Muted>
                    <Text style={s.testo}>{squadre.a.map((id) => nomeGiocatore(id, p)).join(', ') || '—'}</Text>
                    <Muted style={{ marginTop: Spacing.sm, marginBottom: 4 }}>Squadra B</Muted>
                    <Text style={s.testo}>{squadre.b.map((id) => nomeGiocatore(id, p)).join(', ') || '—'}</Text>
                  </View>
                )}

                {p.risultato?.sets?.length ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <Muted style={{ marginBottom: 4 }}>Risultato</Muted>
                    <Text style={s.testo}>
                      {p.risultato.sets.map((set) => `${set.a}-${set.b}${set.tb ? ' TB' : ''}`).join('  ')}
                      {p.risultato.vincitore ? ` · Vince squadra ${p.risultato.vincitore}` : ' · Pareggio'}
                    </Text>
                  </View>
                ) : p.tipo !== 'lezione' && p.data && p.data < oggiISOLocale() ? (
                  <Muted style={{ marginTop: Spacing.md }}>Risultato non ancora inserito.</Muted>
                ) : null}
              </View>
            );
          })()}
          <Button title="Chiudi" variant="ghost" onPress={onChiudi} style={{ marginTop: Spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    box: {
      width: '100%', maxWidth: 360, borderRadius: Radius.card, padding: Spacing.lg,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.navyLine + '33',
    },
    titolo: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.h3, marginBottom: Spacing.md },
    riga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
    testo: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '600' },
    mapsToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
    mapsToggleText: { color: colors.gold, fontSize: Font.small - 1, fontWeight: '700' },
    indirizzo: { color: colors.slate, fontSize: Font.small, fontWeight: '600' },
    portamiQui: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
      backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    },
    portamiQuiText: { color: colors.navyDeep, fontSize: Font.small, fontWeight: '800' },
  });
}
