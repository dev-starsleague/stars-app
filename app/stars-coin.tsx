import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { getCentri, getProdottiShop, getStarsCoinPerCentro, centriPreferiti, toggleCentroPreferito } from '../lib/api';
import { Card, Chip, IconBadge, IconButton, Muted } from '../components/ui';
import { Colors, Radius, Spacing, Font } from '../constants/theme';
import type { Centro, ShopProdotto } from '../types/models';

// Il backend è condiviso da centinaia di centri: lo Shop aggrega i prodotti
// di TUTTI, quindi come primissima cosa fa scegliere quale centro visitare
// (i coin di un centro si spendono solo nel suo shop, vedi CoinSaldo/
// ShopAcquisto — entrambi scoped per centro_id) — fix utente esplicito.
export default function StarsCoin() {
  const { me } = useAuth();
  const router = useRouter();

  const [saldi, setSaldi] = useState<{ centro: Centro; saldo: number }[]>([]);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [preferiti, setPreferiti] = useState<Set<string>>(new Set());
  const [soloPreferiti, setSoloPreferiti] = useState(false);
  const [regione, setRegione] = useState<string | null>(null);
  const [provincia, setProvincia] = useState<string | null>(null);

  const [centroShop, setCentroShop] = useState<Centro | null>(null);
  const [prodotti, setProdotti] = useState<ShopProdotto[] | null>(null);

  useEffect(() => {
    if (!me) return;
    getStarsCoinPerCentro(me.id).then(setSaldi);
    getCentri().then(setCentri);
    setPreferiti(centriPreferiti(me));
  }, [me]);

  useEffect(() => {
    if (!centroShop) { setProdotti(null); return; }
    getProdottiShop(centroShop.id).then(setProdotti);
  }, [centroShop]);

  const totale = saldi.reduce((acc, s) => acc + s.saldo, 0);

  const regioni = useMemo(
    () => Array.from(new Set(centri.map((c) => c.regione).filter((r): r is string => !!r))).sort(),
    [centri]
  );
  const province = useMemo(
    () => Array.from(new Set(
      centri.filter((c) => !regione || c.regione === regione).map((c) => c.provincia).filter((p): p is string => !!p)
    )).sort(),
    [centri, regione]
  );

  const centriFiltrati = centri
    .filter((c) => !soloPreferiti || preferiti.has(c.id))
    .filter((c) => !regione || c.regione === regione)
    .filter((c) => !provincia || c.provincia === provincia);

  const onToggleRegione = (r: string) => {
    setRegione((cur) => (cur === r ? null : r));
    setProvincia(null);
  };

  const onTogglePreferito = async (c: Centro) => {
    setPreferiti((cur) => {
      const next = new Set(cur);
      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
      return next;
    });
    if (me) await toggleCentroPreferito(me, c.id);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => (centroShop ? setCentroShop(null) : router.back())} />
        <Text style={s.title}>{centroShop ? centroShop.nome : 'Stars Coin'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!centroShop && (
          <>
            <Text style={s.sectionTitle}>Il tuo saldo</Text>
            <Card style={s.saldoCard}>
              <Ionicons name="star" size={22} color={Colors.gold} />
              <Text style={s.saldoTotale}>{totale} SC</Text>
            </Card>
            {saldi.length === 0 && <Muted style={{ marginBottom: Spacing.lg }}>Nessun saldo accumulato ancora.</Muted>}
            {saldi.map(({ centro, saldo }) => (
              <View key={centro.id} style={s.saldoRiga}>
                <Text style={s.saldoCentro}>{centro.nome}</Text>
                <Text style={s.saldoValore}>{saldo} SC</Text>
              </View>
            ))}

            <Text style={[s.sectionTitle, { marginTop: Spacing.xl }]}>Shop</Text>
            <Muted style={{ marginBottom: Spacing.md }}>Scegli il centro per vedere i suoi prodotti.</Muted>

            <View style={s.filtriRow}>
              <Chip label="⭐ Preferiti" active={soloPreferiti} onPress={() => setSoloPreferiti((v) => !v)} />
            </View>

            {regioni.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{ gap: Spacing.sm }}>
                {regioni.map((r) => (
                  <Chip key={r} label={r} active={regione === r} onPress={() => onToggleRegione(r)} />
                ))}
              </ScrollView>
            )}
            {regione && province.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{ gap: Spacing.sm }}>
                {province.map((p) => (
                  <Chip key={p} label={p} active={provincia === p} onPress={() => setProvincia((cur) => (cur === p ? null : p))} />
                ))}
              </ScrollView>
            )}

            {centri.length === 0 && <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xl }} />}
            {centri.length > 0 && centriFiltrati.length === 0 && (
              <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun centro corrisponde ai filtri.</Muted>
            )}
            {centriFiltrati.map((c) => (
              <Pressable key={c.id} onPress={() => setCentroShop(c)}>
                <Card style={s.row}>
                  <IconBadge icon="business" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.nome}>{c.nome}</Text>
                    {(c.citta || c.provincia) ? <Muted>{[c.citta, c.provincia].filter(Boolean).join(' · ')}</Muted> : null}
                  </View>
                  <Pressable hitSlop={8} onPress={() => onTogglePreferito(c)}>
                    <Ionicons name={preferiti.has(c.id) ? 'star' : 'star-outline'} size={20} color={preferiti.has(c.id) ? Colors.gold : Colors.slate} />
                  </Pressable>
                  <Ionicons name="chevron-forward" size={20} color={Colors.slate} />
                </Card>
              </Pressable>
            ))}
          </>
        )}

        {centroShop && (
          <>
            {prodotti === null && <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xl }} />}
            {prodotti?.length === 0 && <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nessun prodotto disponibile in questo centro.</Muted>}
            <View style={s.grid}>
              {prodotti?.map((p) => (
                <Card key={p.id} style={s.prodCard}>
                  <View style={s.prodImg}>
                    <Ionicons name="pricetag-outline" size={28} color={Colors.gold} />
                  </View>
                  {p.condizione === 'usato' && <View style={s.badgeUsato}><Text style={s.badgeUsatoText}>USATO</Text></View>}
                  <Text style={s.prodNome} numberOfLines={2}>{p.nome}</Text>
                  <View style={s.prodPrezzoRow}>
                    <Ionicons name="star" size={13} color={Colors.gold} />
                    <Text style={s.prodPrezzo}>{p.prezzo_coin} SC</Text>
                  </View>
                  {p.prezzo_euro != null && <Muted>oppure {p.prezzo_euro} €</Muted>}
                </Card>
              ))}
            </View>
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { color: Colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
  scroll: { padding: Spacing.lg, paddingTop: 0 },
  sectionTitle: { color: Colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
  saldoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  saldoTotale: { color: Colors.gold, fontSize: Font.h1, fontWeight: '900' },
  saldoRiga: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.navyLine + '22' },
  saldoCentro: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.body },
  saldoValore: { color: Colors.navyDeep, fontWeight: '800', fontSize: Font.body },
  filtriRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  chipScroll: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  nome: { color: Colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  prodCard: { width: '47%' },
  prodImg: { height: 70, borderRadius: Radius.md, backgroundColor: Colors.navyCard, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  badgeUsato: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.navyDeep, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeUsatoText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  prodNome: { color: Colors.navyDeep, fontWeight: '700', fontSize: Font.small, marginBottom: 4, minHeight: 32 },
  prodPrezzoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prodPrezzo: { color: Colors.navyDeep, fontWeight: '900', fontSize: Font.body },
});
