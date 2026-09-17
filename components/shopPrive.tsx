// Shop Privé (fix utente esplicito: "Shop deve dividersi in 'Shop Club' e
// 'Shop privè'... nel secondo ci sono i prodotti messi in vendita dai
// privati... lista filtrabile per tipologia, zona ecc e la possibilità di
// caricare i prodotti") — annunci tra giocatori, separati dallo shop del
// centro (app/(tabs)/stars-coin.tsx, che resta "Shop Club" invariato).
// Nessun acquisto in-app: solo annuncio + contatto (il tap sul venditore
// apre il suo profilo, stesso posto in cui trovarlo altrove nell'app).
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useSport } from '../lib/sport';
import { apiUrl } from '../lib/apiClient';
import {
  getProdottiPrivati, creaProdottoPrivato, aggiornaProdottoPrivato, caricaFotoProdottoPrivato, getCentri,
} from '../lib/api';
import { formattaEuro, CATEGORIE_PRODOTTO_PRIVATO, ETICHETTA_CATEGORIA_PRIVATO, type CategoriaProdottoPrivato } from '../lib/stars';
import { avvisa } from '../lib/avviso';
import { Chip, Input, Muted, Button, Avatar, Segmented } from './ui';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../constants/theme';
import type { ProdottoPrivato, Centro } from '../types/models';

function immagineUri(url: string): string {
  return url.startsWith('http') ? url : apiUrl(url);
}

type FiltroCondizionePrive = 'tutti' | 'nuovo' | 'usato';

export function SezioneShopPrive() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);

  const [prodotti, setProdotti] = useState<ProdottoPrivato[] | null>(null);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [categoria, setCategoria] = useState<CategoriaProdottoPrivato | 'tutte'>('tutte');
  const [condizione, setCondizione] = useState<FiltroCondizionePrive>('tutti');
  const [regione, setRegione] = useState<string | null>(null);
  const [provincia, setProvincia] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<ProdottoPrivato | null>(null);
  const [creaAperto, setCreaAperto] = useState(false);

  const load = useCallback(() => {
    getProdottiPrivati().then(setProdotti);
    getCentri().then(setCentri);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const regioni = useMemo(() => Array.from(new Set(centri.map((c) => c.regione).filter((r): r is string => !!r))).sort(), [centri]);
  const province = useMemo(
    () => Array.from(new Set(centri.filter((c) => !regione || c.regione === regione).map((c) => c.provincia).filter((p): p is string => !!p))).sort(),
    [centri, regione]
  );

  // Sport globale (fix utente esplicito, stesso principio già in uso per
  // lo Shop Club: un annuncio senza sport, es. abbigliamento generico,
  // resta visibile qualunque sia lo sport attivo).
  const filtrati = (prodotti ?? [])
    .filter((p) => !p.sport || p.sport === sportAttivo)
    .filter((p) => categoria === 'tutte' || p.categoria === categoria)
    .filter((p) => condizione === 'tutti' || p.condizione === condizione)
    .filter((p) => !regione || p.centro?.regione === regione)
    .filter((p) => !provincia || p.centro?.provincia === provincia);

  const onToggleRegione = (r: string) => { setRegione((cur) => (cur === r ? null : r)); setProvincia(null); };

  return (
    <View>
      <View style={s.priveHead}>
        <Muted style={{ flex: 1 }}>Annunci tra giocatori, contatto diretto — nessun acquisto in app.</Muted>
        <Button title="Carica" onPress={() => setCreaAperto(true)} style={{ paddingHorizontal: Spacing.lg }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }} contentContainerStyle={{ gap: Spacing.sm }}>
        <Chip label="Tutte" active={categoria === 'tutte'} onPress={() => setCategoria('tutte')} />
        {CATEGORIE_PRODOTTO_PRIVATO.map((c) => (
          <Chip key={c} label={ETICHETTA_CATEGORIA_PRIVATO[c]} active={categoria === c} onPress={() => setCategoria(c)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }} contentContainerStyle={{ gap: Spacing.sm }}>
        <Chip label="Tutti" active={condizione === 'tutti'} onPress={() => setCondizione('tutti')} />
        <Chip label="Nuovo" active={condizione === 'nuovo'} onPress={() => setCondizione('nuovo')} />
        <Chip label="Usato" active={condizione === 'usato'} onPress={() => setCondizione('usato')} />
      </ScrollView>
      {regioni.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }} contentContainerStyle={{ gap: Spacing.sm }}>
          {regioni.map((r) => <Chip key={r} label={r} active={regione === r} onPress={() => onToggleRegione(r)} />)}
        </ScrollView>
      )}
      {regione && province.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }} contentContainerStyle={{ gap: Spacing.sm }}>
          {province.map((p) => <Chip key={p} label={p} active={provincia === p} onPress={() => setProvincia((cur) => (cur === p ? null : p))} />)}
        </ScrollView>
      )}

      {prodotti === null && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
      {prodotti !== null && filtrati.length === 0 && (
        <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>
          {prodotti.length === 0 ? 'Nessun annuncio ancora — sii il primo a caricarne uno.' : 'Nessun annuncio corrisponde ai filtri.'}
        </Muted>
      )}
      <View style={s.grid}>
        {filtrati.map((p) => (
          <Pressable key={p.id} style={s.prodCard} onPress={() => setDettaglio(p)}>
            <View style={s.prodImgBox}>
              {p.immagine_url
                ? <Image source={{ uri: immagineUri(p.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                : <Ionicons name="pricetag-outline" size={36} color={colors.gold} />}
              {p.condizione === 'usato' && <View style={s.badgeUsato}><Text style={s.badgeUsatoText}>USATO</Text></View>}
            </View>
            <View style={s.prodInfo}>
              <Text style={s.prodNome} numberOfLines={2}>{p.nome}</Text>
              <Text style={s.prodPrezzo}>{formattaEuro(p.prezzo_euro)}</Text>
              <Muted style={{ fontSize: Font.tiny }}>{p.venditore ? `${p.venditore.nome} · ` : ''}{p.centro?.citta ?? p.centro?.nome ?? ''}</Muted>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={{ height: 20 }} />

      {dettaglio && (
        <ModaleDettaglioProdottoPrivato
          prodotto={dettaglio} meId={me?.id}
          onChiudi={() => setDettaglio(null)}
          onApriVenditore={(id) => { setDettaglio(null); router.push({ pathname: '/(tabs)/giocatore/[id]', params: { id } }); }}
          onRimosso={() => { setDettaglio(null); load(); }}
          colors={colors} glass={glass} scheme={scheme} s={s}
        />
      )}
      {creaAperto && me && (
        <ModaleCreaProdottoPrivato
          meId={me.id} centri={centri} sportAttivo={sportAttivo}
          onChiudi={() => setCreaAperto(false)}
          onCreato={() => { setCreaAperto(false); load(); }}
          colors={colors} glass={glass} scheme={scheme} s={s}
        />
      )}
    </View>
  );
}

function ModaleDettaglioProdottoPrivato({ prodotto, meId, onChiudi, onApriVenditore, onRimosso, colors, glass, scheme, s }: {
  prodotto: ProdottoPrivato; meId?: string; onChiudi: () => void; onApriVenditore: (giocatoreId: string) => void; onRimosso: () => void;
  colors: AppColors; glass: AppGlass; scheme: ReturnType<typeof useTheme>['scheme']; s: ReturnType<typeof makeStyles>;
}) {
  const [aggiornando, setAggiornando] = useState(false);
  const eMio = meId === prodotto.giocatore_id;

  const segna = async (stato: 'venduto' | 'rimosso') => {
    setAggiornando(true);
    const res = await aggiornaProdottoPrivato(prodotto.id, stato);
    setAggiornando(false);
    if (res.ok) onRimosso();
    else avvisa('Errore', res.error ?? 'Operazione non riuscita.');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.dettaglioBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.dettaglioImgBox}>
              {prodotto.immagine_url
                ? <Image source={{ uri: immagineUri(prodotto.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                : <Ionicons name="pricetag-outline" size={56} color={colors.gold} />}
              <Pressable style={s.dettaglioChiudi} onPress={onChiudi} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.white} />
              </Pressable>
            </View>
            <View style={{ padding: Spacing.lg }}>
              <View style={s.dettaglioBadgeRow}>
                <View style={[s.badgePill, prodotto.condizione === 'usato' && s.badgePillUsato]}>
                  <Text style={s.badgePillText}>{prodotto.condizione === 'usato' ? 'Usato' : 'Nuovo'}</Text>
                </View>
                <View style={s.badgePill}><Text style={s.badgePillText}>{ETICHETTA_CATEGORIA_PRIVATO[prodotto.categoria as CategoriaProdottoPrivato] ?? prodotto.categoria}</Text></View>
              </View>
              <Text style={s.dettaglioTitolo}>{prodotto.nome}</Text>
              {prodotto.descrizione && <Muted style={{ marginTop: Spacing.xs }}>{prodotto.descrizione}</Muted>}
              <Text style={s.dettaglioPrezzoSolo}>{formattaEuro(prodotto.prezzo_euro)}</Text>

              {prodotto.venditore && (
                <Pressable style={s.venditoreRiga} onPress={() => onApriVenditore(prodotto.giocatore_id)}>
                  <Avatar name={`${prodotto.venditore.nome} ${prodotto.venditore.cognome}`} size={40} genere={prodotto.venditore.genere} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.venditoreNome}>{prodotto.venditore.nome} {prodotto.venditore.cognome}</Text>
                    {prodotto.centro && <Muted style={{ fontSize: Font.tiny }}>{prodotto.centro.nome}</Muted>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.slate} />
                </Pressable>
              )}
              <Muted style={{ textAlign: 'center', marginTop: Spacing.sm }}>Contatta {prodotto.venditore?.nome ?? 'il venditore'} dal suo profilo per accordarvi.</Muted>

              {eMio && (
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
                  <Button title={aggiornando ? '...' : 'Segna venduto'} variant="ghost" onPress={() => segna('venduto')} disabled={aggiornando} style={{ flex: 1 }} />
                  <Button title="Rimuovi" variant="ghost" onPress={() => segna('rimosso')} disabled={aggiornando} style={{ flex: 1 }} />
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModaleCreaProdottoPrivato({ meId, centri, sportAttivo, onChiudi, onCreato, colors, glass, scheme, s }: {
  meId: string; centri: Centro[]; sportAttivo: string; onChiudi: () => void; onCreato: () => void;
  colors: AppColors; glass: AppGlass; scheme: ReturnType<typeof useTheme>['scheme']; s: ReturnType<typeof makeStyles>;
}) {
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProdottoPrivato>('altro');
  const [condizione, setCondizione] = useState<'nuovo' | 'usato'>('usato');
  const [prezzo, setPrezzo] = useState('');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [fotoLocale, setFotoLocale] = useState<string | null>(null);
  const [caricandoFoto, setCaricandoFoto] = useState(false);
  const [immagineUrl, setImmagineUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const scegliFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { avvisa('Permesso negato', 'Serve il permesso per scegliere una foto dalla libreria.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFotoLocale(asset.uri);
    setCaricandoFoto(true);
    const { url, error } = await caricaFotoProdottoPrivato(asset.uri, asset.mimeType ?? 'image/jpeg');
    setCaricandoFoto(false);
    if (url) setImmagineUrl(url); else if (error) avvisa('Errore', error);
  };

  const prezzoValido = Number(prezzo.replace(',', '.')) > 0;
  const confermabile = nome.trim().length > 0 && prezzoValido && !salvando && !caricandoFoto;

  const conferma = async () => {
    if (!confermabile) return;
    setSalvando(true);
    const res = await creaProdottoPrivato({
      giocatoreId: meId, nome: nome.trim(), descrizione: descrizione.trim() || null, categoria, condizione,
      prezzoEuro: Number(prezzo.replace(',', '.')), immagineUrl, sport: sportAttivo, centroId,
    });
    setSalvando(false);
    if (res.ok) { avvisa('Annuncio pubblicato', `"${nome.trim()}" è ora visibile nello Shop Privé.`); onCreato(); }
    else avvisa('Errore', res.error ?? 'Pubblicazione non riuscita.');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onChiudi}>
      <Pressable style={s.modaleSfondo} onPress={onChiudi}>
        <Pressable style={s.dettaglioBox} onPress={(e) => e.stopPropagation()}>
          <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.lg }}>
            <Text style={s.dettaglioTitolo}>Carica un annuncio</Text>

            <Pressable style={s.fotoBox} onPress={scegliFoto}>
              {fotoLocale
                ? <Image source={{ uri: fotoLocale }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                : <Ionicons name="camera-outline" size={32} color={colors.gold} />}
              {caricandoFoto && <View style={s.fotoOverlay}><ActivityIndicator color={colors.white} /></View>}
            </Pressable>

            <Input placeholder="Nome prodotto" value={nome} onChangeText={setNome} style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }} />
            <Input placeholder="Descrizione (facoltativa)" value={descrizione} onChangeText={setDescrizione} style={{ marginBottom: Spacing.sm }} />
            <Input placeholder="Prezzo €" value={prezzo} onChangeText={setPrezzo} keyboardType="decimal-pad" style={{ marginBottom: Spacing.md }} />

            <Muted style={{ marginBottom: Spacing.sm }}>Categoria</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md }}>
              {CATEGORIE_PRODOTTO_PRIVATO.map((c) => (
                <Chip key={c} label={ETICHETTA_CATEGORIA_PRIVATO[c]} active={categoria === c} onPress={() => setCategoria(c)} />
              ))}
            </View>

            <Muted style={{ marginBottom: Spacing.sm }}>Condizione</Muted>
            <Segmented value={condizione} onChange={(v) => setCondizione(v as 'nuovo' | 'usato')}
              options={[{ value: 'nuovo', label: 'Nuovo' }, { value: 'usato', label: 'Usato' }]} style={{ marginBottom: Spacing.md }} />

            <Muted style={{ marginBottom: Spacing.sm }}>Centro di riferimento (per la zona)</Muted>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }} contentContainerStyle={{ gap: Spacing.sm }}>
              {centri.map((c) => <Chip key={c.id} label={c.nome} active={centroId === c.id} onPress={() => setCentroId((cur) => (cur === c.id ? null : c.id))} />)}
            </ScrollView>

            <Button title={salvando ? 'Pubblico…' : 'Pubblica annuncio'} onPress={conferma} disabled={!confermabile} loading={salvando} />
            <Button title="Annulla" variant="ghost" onPress={onChiudi} style={{ marginTop: Spacing.sm }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    priveHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    prodCard: { width: '47%', borderRadius: Radius.card, overflow: 'hidden', backgroundColor: colors.navyCard },
    prodImgBox: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navyLine + '22' },
    prodInfo: { padding: Spacing.sm },
    prodNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small, minHeight: 32 },
    prodPrezzo: { color: colors.gold, fontWeight: '900', fontSize: Font.body, marginTop: 2 },
    badgeUsato: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(22,37,58,0.85)', borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
    badgeUsatoText: { color: colors.white, fontSize: 9, fontWeight: '800' },
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    dettaglioBox: { width: '100%', maxWidth: 400, maxHeight: '85%', borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } as any,
    dettaglioImgBox: { width: '100%', aspectRatio: 1.3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navyLine + '22' },
    dettaglioChiudi: { position: 'absolute', top: Spacing.md, right: Spacing.md, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(22,37,58,0.6)', alignItems: 'center', justifyContent: 'center' },
    dettaglioBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.sm },
    badgePill: { backgroundColor: colors.navyLine + '33', borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    badgePillUsato: { backgroundColor: colors.amber + '33' },
    badgePillText: { color: colors.navyDeep, fontSize: Font.tiny, fontWeight: '800' },
    dettaglioTitolo: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.md },
    dettaglioPrezzoSolo: { color: colors.gold, fontSize: Font.h2, fontWeight: '900', marginTop: Spacing.md },
    venditoreRiga: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.navyLine + '33' },
    venditoreNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.body },
    fotoBox: { width: 100, height: 100, borderRadius: Radius.md, backgroundColor: colors.navyLine + '22', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', overflow: 'hidden' },
    fotoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  });
}
