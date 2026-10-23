// Welcome Kit del campionato, lato giocatore (fix utente esplicito):
// vantaggi degli sponsor con logo, condizioni e scadenza. Chi è iscritto
// tocca "Usa ora" davanti a chi convalida: l'utilizzo viene registrato sul
// backend (solo iscritti, entro la scadenza e il numero di utilizzi) e si
// apre una schermata con il codice, l'orologio che scorre e un bordo che
// pulsa, così uno screenshot non vale come prova.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Modal, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { Spacing, Font, Radius, AppColors } from '../constants/theme';
import { Button, Card, Muted } from './ui';
import { apiUrl } from '../lib/apiClient';
import { avvisa } from '../lib/avviso';
import { getWelcomeKit, usaVantaggio, VantaggioKit, UtilizzoVantaggio } from '../lib/api';

// per quanto si può rimostrare la schermata dopo l'utilizzo
const MINUTI_SCHERMATA = 10;

const srcLogo = (url: string) => (url.startsWith('http') ? url : apiUrl(url));
const dataBreve = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

export function WelcomeKitCard({ tipo, id, giocatoreId, iscritto }: {
  tipo: 'standard' | 'campionato'; id: string; giocatoreId?: string | null; iscritto: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [vantaggi, setVantaggi] = useState<VantaggioKit[]>([]);
  const [usando, setUsando] = useState<string | null>(null);
  const [attivo, setAttivo] = useState<{ vantaggio: VantaggioKit; utilizzo: UtilizzoVantaggio } | null>(null);

  const carica = useCallback(async () => {
    setVantaggi(await getWelcomeKit(tipo, id, giocatoreId));
  }, [tipo, id, giocatoreId]);
  useEffect(() => { carica(); }, [carica]);

  if (!vantaggi.length) return null;

  const usa = (v: VantaggioKit) => {
    if (!giocatoreId) return;
    avvisa('Usare adesso?', `Fallo solo davanti a chi deve convalidare "${v.nome}": l'utilizzo viene registrato e non si può annullare dall'app.`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Usa ora', onPress: async () => {
          setUsando(v.id);
          const r = await usaVantaggio(v.id, giocatoreId);
          setUsando(null);
          if (!r.ok || !r.utilizzo) { avvisa('Non disponibile', r.error); carica(); return; }
          setAttivo({ vantaggio: v, utilizzo: r.utilizzo });
          carica();
        },
      },
    ]);
  };
  const ancoraVisibile = (u?: UtilizzoVantaggio | null) => !!u && Date.now() - new Date(u.usato_at).getTime() < MINUTI_SCHERMATA * 60000;

  return (
    <>
      <Text style={s.sezioneTitolo}>Welcome Kit</Text>
      <Card style={s.card}>
        <Muted style={{ marginBottom: Spacing.sm }}>
          {iscritto ? 'Vantaggi dei nostri sponsor per chi gioca il campionato.' : 'Vantaggi dei nostri sponsor per chi si iscrive al campionato.'}
        </Muted>
        {vantaggi.map((v, i) => {
          const usati = v.usati ?? 0;
          const esauriti = usati >= v.utilizzi_per_giocatore;
          return (
            <View key={v.id} style={[s.vantaggio, i > 0 && s.separatore, v.scaduto && { opacity: 0.5 }]}>
              <View style={s.riga}>
                <View style={s.logo}>
                  {v.sponsor_logo_url
                    ? <Image source={{ uri: srcLogo(v.sponsor_logo_url) }} style={s.logoImg} resizeMode="contain" />
                    : <Ionicons name="gift-outline" size={24} color={colors.gold} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nome}>{v.nome}</Text>
                  {!!v.sponsor_nome && <Text style={s.sponsor}>offerto da {v.sponsor_nome}</Text>}
                </View>
              </View>
              {!!v.descrizione && <Text style={s.testo}>{v.descrizione}</Text>}
              {!!v.modalita_utilizzo && <Text style={s.condizioni}><Text style={{ fontWeight: '800' }}>Come si usa: </Text>{v.modalita_utilizzo}</Text>}
              <Text style={s.meta}>
                {v.utilizzi_per_giocatore === 1 ? 'Una volta' : `${v.utilizzi_per_giocatore} volte`}
                {iscritto ? ` · usato ${usati}/${v.utilizzi_per_giocatore}` : ''}
                {v.scadenza ? ` · ${v.scaduto ? 'scaduto il' : 'valido fino al'} ${dataBreve(v.scadenza)}` : ''}
              </Text>
              {iscritto && !v.scaduto && (
                esauriti ? (
                  ancoraVisibile(v.ultimo_utilizzo)
                    ? <Button title="Mostra di nuovo la convalida" variant="ghost" onPress={() => setAttivo({ vantaggio: v, utilizzo: v.ultimo_utilizzo! })} style={{ marginTop: Spacing.sm }} />
                    : <View style={s.usato}><Ionicons name="checkmark-circle" size={16} color={colors.green} /><Text style={s.usatoText}>Già usato</Text></View>
                ) : (
                  <Button title={usando === v.id ? 'Registrazione…' : 'Usa ora'} loading={usando === v.id} onPress={() => usa(v)} style={{ marginTop: Spacing.sm }} />
                )
              )}
            </View>
          );
        })}
      </Card>
      {attivo && <SchermataConvalida vantaggio={attivo.vantaggio} utilizzo={attivo.utilizzo} onChiudi={() => setAttivo(null)} />}
    </>
  );
}

function SchermataConvalida({ vantaggio, utilizzo, onChiudi }: { vantaggio: VantaggioKit; utilizzo: UtilizzoVantaggio; onChiudi: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [adesso, setAdesso] = useState(new Date());
  const pulsa = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setInterval(() => setAdesso(new Date()), 1000);
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulsa, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(pulsa, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]));
    anim.start();
    return () => { clearInterval(t); anim.stop(); };
  }, [pulsa]);
  const bordo = pulsa.interpolate({ inputRange: [0, 1], outputRange: [colors.gold, colors.green] });
  const usato = new Date(utilizzo.usato_at);

  return (
    <Modal transparent animationType="fade" onRequestClose={onChiudi}>
      <View style={s.overlay}>
        <Animated.View style={[s.convalida, { borderColor: bordo }]}>
          <Text style={s.convalidaLabel}>Vantaggio convalidato</Text>
          {vantaggio.sponsor_logo_url
            ? <Image source={{ uri: srcLogo(vantaggio.sponsor_logo_url) }} style={s.convalidaLogo} resizeMode="contain" />
            : <Ionicons name="gift" size={48} color={colors.gold} />}
          <Text style={s.convalidaNome}>{vantaggio.nome}</Text>
          {!!vantaggio.sponsor_nome && <Text style={s.sponsor}>{vantaggio.sponsor_nome}</Text>}
          <Text style={s.codice}>{utilizzo.codice}</Text>
          <Text style={s.orologio}>{adesso.toLocaleTimeString('it-IT')}</Text>
          <Text style={s.meta}>Usato il {usato.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle {usato.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</Text>
          <Muted style={{ textAlign: 'center', marginTop: Spacing.sm }}>Mostra questa schermata: l'orologio che scorre e il bordo che cambia colore confermano che è dal vivo.</Muted>
          <Pressable onPress={onChiudi} style={s.chiudi}><Text style={s.chiudiText}>Chiudi</Text></Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sezioneTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
    card: { marginBottom: Spacing.lg },
    vantaggio: { paddingVertical: Spacing.sm },
    separatore: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.navyLine },
    riga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    logo: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    logoImg: { width: 46, height: 46 },
    nome: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '800' },
    sponsor: { color: colors.slate, fontSize: Font.small },
    testo: { color: colors.navyDeep, fontSize: Font.small, marginTop: Spacing.sm, lineHeight: 18 },
    condizioni: { color: colors.slate, fontSize: Font.small, marginTop: 4, lineHeight: 18 },
    meta: { color: colors.slate, fontSize: Font.tiny, marginTop: 6, fontWeight: '700' },
    usato: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
    usatoText: { color: colors.green, fontWeight: '700', fontSize: Font.small },
    overlay: { flex: 1, backgroundColor: 'rgba(8,12,20,0.75)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    convalida: {
      width: '100%', maxWidth: 380, alignItems: 'center', gap: 6, padding: Spacing.xl,
      borderRadius: Radius.card, borderWidth: 4, backgroundColor: colors.surface,
    },
    convalidaLabel: { color: colors.green, fontSize: Font.tiny, fontWeight: '800', textTransform: 'uppercase', marginBottom: Spacing.sm },
    convalidaLogo: { width: 96, height: 64 },
    convalidaNome: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', textAlign: 'center' },
    codice: { color: colors.navyDeep, fontSize: 40, fontWeight: '900', letterSpacing: 6, marginTop: Spacing.md },
    orologio: { color: colors.slate, fontSize: Font.h3, fontWeight: '700', fontVariant: ['tabular-nums'] },
    chiudi: { marginTop: Spacing.md, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 999, backgroundColor: colors.navyCard },
    chiudiText: { color: colors.navyDeep, fontWeight: '800' },
  });
}
