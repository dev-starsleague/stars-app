import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import { useSport } from '../../lib/sport';
import { useTheme } from '../../lib/theme';
import { apiUrl } from '../../lib/apiClient';
import { getCentri, getProdottiShop, getAbbonamentiShop, getStarsCoinPerCentro, getTotaleCoinSpeso, centriPreferiti, toggleCentroPreferito, acquistaProdotto, acquistaAbbonamento } from '../../lib/api';
import { coinInEuro, formattaEuro } from '../../lib/stars';
import { avvisa } from '../../lib/avviso';
import { AppHeader } from '../../components/AppHeader';
import { Card, Chip, IconBadge, IconButton, Muted, Segmented, Button } from '../../components/ui';
import { Radius, Spacing, Font, AppColors, AppGlass } from '../../constants/theme';
import type { Centro, ShopProdotto, AbbonamentoTemplate } from '../../types/models';

type SchedaShop = 'prodotti' | 'abbonamenti';
type FiltroCondizione = 'tutti' | 'nuovo' | 'usato';
type VistaProdotti = 'griglia' | 'elenco';

function immagineUri(url: string): string {
  return url.startsWith('http') ? url : apiUrl(url);
}

// Controvalore in € da MOSTRARE accanto al prezzo in SC — SEMPRE calcolato
// dal tasso fisso (1 SC = €0,01, dato hardcoded — fix utente esplicito:
// "sistema tutte le cifre"), MAI dal campo prezzo_euro impostato a mano
// dallo staff: quel campo può discostarsi dal tasso reale (es. un
// abbonamento con prezzo_coin=450 ma prezzo_euro=45, invece dei €4,50
// corretti) e mostrarlo creerebbe corrispettivi sbagliati/incoerenti tra
// loro. prezzo_euro resta comunque l'importo REALE addebitato se il
// giocatore sceglie di pagare in € nella modale di acquisto (una scelta di
// business dello staff, non un controvalore informativo) — non tocco
// quella logica, solo questa vetrina.
function euroDaMostrare(prezzoCoin: number): number {
  return coinInEuro(prezzoCoin);
}

// Il backend è condiviso da centinaia di centri: lo Shop aggrega i prodotti
// di TUTTI, quindi come primissima cosa fa scegliere quale centro visitare
// (i coin di un centro si spendono solo nel suo shop, vedi CoinSaldo/
// ShopAcquisto — entrambi scoped per centro_id) — fix utente esplicito.
export default function StarsCoin() {
  const { me } = useAuth();
  const router = useRouter();
  const { colors, glass, scheme } = useTheme();
  const { sportAttivo } = useSport();
  const s = useMemo(() => makeStyles(colors, glass), [colors, glass]);
  // Deep-link dal carosello ADV della Home: tap su UN prodotto/abbonamento
  // sponsorizzato deve portare dritto lì, non solo aprire la scelta centro
  // (fix utente esplicito) — vedi components/HomeCarousel.tsx.
  const params = useLocalSearchParams<{ centroId?: string; prodottoId?: string; abbonamentoId?: string }>();

  const [saldi, setSaldi] = useState<{ centro: Centro; saldo: number }[]>([]);
  const [totaleSpeso, setTotaleSpeso] = useState(0);
  const [centri, setCentri] = useState<Centro[]>([]);
  const [preferiti, setPreferiti] = useState<Set<string>>(new Set());
  const [soloPreferiti, setSoloPreferiti] = useState(false);
  const [regione, setRegione] = useState<string | null>(null);
  const [provincia, setProvincia] = useState<string | null>(null);

  const [centroShop, setCentroShop] = useState<Centro | null>(null);
  const [scheda, setScheda] = useState<SchedaShop>('prodotti');
  const [prodotti, setProdotti] = useState<ShopProdotto[] | null>(null);
  const [abbonamenti, setAbbonamenti] = useState<AbbonamentoTemplate[] | null>(null);
  const [filtroCondizione, setFiltroCondizione] = useState<FiltroCondizione>('tutti');
  // Griglia (immagine grande, com'era) o elenco compatto (fix utente
  // esplicito: "la visualizzazione deve poter essere sia a griglia che ad
  // elenco") — solo per i Prodotti: gli Abbonamenti sono già un elenco per
  // natura (niente immagine), non hanno una controparte "a griglia" sensata.
  const [vistaProdotti, setVistaProdotti] = useState<VistaProdotti>('griglia');
  const [dettaglioProdotto, setDettaglioProdotto] = useState<ShopProdotto | null>(null);
  const [dettaglioAbbonamento, setDettaglioAbbonamento] = useState<AbbonamentoTemplate | null>(null);
  // Acquisto: variante+metodo di pagamento scelti per il prodotto aperto
  // nel dettaglio — resettati ogni volta che se ne apre uno diverso.
  const [varianteScelta, setVarianteScelta] = useState<string | null>(null);
  const [metodoScelto, setMetodoScelto] = useState<'coin' | 'euro' | null>(null);
  const [acquistando, setAcquistando] = useState(false);

  useEffect(() => {
    if (!me) return;
    getStarsCoinPerCentro(me.id).then(setSaldi);
    getTotaleCoinSpeso(me.id).then(setTotaleSpeso);
    getCentri().then(setCentri);
    setPreferiti(centriPreferiti(me));
  }, [me]);

  useEffect(() => {
    if (!centroShop) { setProdotti(null); setAbbonamenti(null); return; }
    getProdottiShop(centroShop.id).then(setProdotti);
    getAbbonamentiShop(centroShop.id).then(setAbbonamenti);
  }, [centroShop]);

  // Deep-link 1/3: appena i centri sono caricati, se arriviamo con un
  // centroId nei parametri saltiamo dritti al suo shop.
  useEffect(() => {
    if (!params.centroId || centroShop || centri.length === 0) return;
    const c = centri.find((x) => x.id === params.centroId);
    if (c) setCentroShop(c);
  }, [params.centroId, centri, centroShop]);

  // Deep-link 2/3 e 3/3: appena prodotti/abbonamenti di quel centro sono
  // caricati, apriamo subito il dettaglio dell'elemento richiesto.
  useEffect(() => {
    if (!params.prodottoId || !prodotti) return;
    const p = prodotti.find((x) => x.id === params.prodottoId);
    if (p) setDettaglioProdotto(p);
  }, [params.prodottoId, prodotti]);
  useEffect(() => {
    if (!params.abbonamentoId || !abbonamenti) return;
    setScheda('abbonamenti');
    const a = abbonamenti.find((x) => x.id === params.abbonamentoId);
    if (a) setDettaglioAbbonamento(a);
  }, [params.abbonamentoId, abbonamenti]);

  // Ogni volta che si apre un prodotto diverso, si riparte da zero: niente
  // variante/metodo ereditati dal prodotto aperto prima.
  useEffect(() => { setVarianteScelta(null); setMetodoScelto(null); }, [dettaglioProdotto?.id]);
  // Stesso reset per l'abbonamento — le due modali non sono mai aperte
  // insieme, ma il metodo scelto non deve "sopravvivere" da una all'altra.
  useEffect(() => { setMetodoScelto(null); }, [dettaglioAbbonamento?.id]);

  const saldoCentro = centroShop ? Math.round(saldi.find((s) => s.centro.id === centroShop.id)?.saldo ?? 0) : 0;
  const varianteStock = dettaglioProdotto && varianteScelta
    ? dettaglioProdotto.varianti.find((v) => v.nome === varianteScelta)?.stock ?? 0
    : null;
  const esaurito = dettaglioProdotto
    ? dettaglioProdotto.varianti.length > 0
      ? dettaglioProdotto.varianti.every((v) => v.stock <= 0)
      : dettaglioProdotto.stock != null && dettaglioProdotto.stock <= 0
    : false;
  const puoAcquistare = !!dettaglioProdotto && !esaurito && !!metodoScelto
    && (dettaglioProdotto.varianti.length === 0 || (!!varianteScelta && (varianteStock ?? 0) > 0));

  // Acquisto vero (fix utente esplicito: "deve essere possibile acquistare
  // il prodotto e decidere se pagarlo in Star Coin o €") — in Star Coin
  // scala subito il saldo (il backend rifiuta da sé se non basta); in € non
  // esiste una passerella di pagamento in questo progetto (stessa
  // limitazione onesta già dichiarata per la sponsorizzazione "demo"),
  // quindi registra l'acquisto da saldare e ritirare fisicamente al
  // centro — stesso principio delle prenotazioni campo "da pagare".
  const acquista = async () => {
    if (!me || !dettaglioProdotto || !metodoScelto) return;
    setAcquistando(true);
    const res = await acquistaProdotto({
      giocatoreId: me.id, prodottoId: dettaglioProdotto.id, variante: varianteScelta, metodo: metodoScelto,
    });
    setAcquistando(false);
    if (!res.ok) { avvisa('Errore', res.error ?? 'Acquisto non riuscito.'); return; }
    const nomeProdotto = dettaglioProdotto.nome;
    setDettaglioProdotto(null);
    if (centroShop) getProdottiShop(centroShop.id).then(setProdotti);
    if (me) { getStarsCoinPerCentro(me.id).then(setSaldi); getTotaleCoinSpeso(me.id).then(setTotaleSpeso); }
    avvisa(
      'Acquisto confermato',
      metodoScelto === 'coin'
        ? `Hai acquistato "${nomeProdotto}". Ritiralo al centro quando vuoi.`
        : `Hai prenotato "${nomeProdotto}". Paga e ritiralo direttamente al centro.`
    );
  };

  const puoAcquistareAbb = !!dettaglioAbbonamento && !!metodoScelto;

  // Acquisto abbonamento — stesso principio di acquista() sopra, ma il
  // backend attiva subito l'istanza a prescindere dal metodo (non esiste
  // uno stato "da pagare" per gli abbonamenti come per i prodotti, vedi
  // AbbonamentoIstanza/abbonamento.py): in € il saldo va comunque regolato
  // fisicamente al centro, ma l'abbonamento è già utilizzabile.
  const acquistaAbb = async () => {
    if (!me || !dettaglioAbbonamento || !metodoScelto) return;
    setAcquistando(true);
    const res = await acquistaAbbonamento({
      giocatoreId: me.id, templateId: dettaglioAbbonamento.id, metodo: metodoScelto,
    });
    setAcquistando(false);
    if (!res.ok) { avvisa('Errore', res.error ?? 'Acquisto non riuscito.'); return; }
    const nomeAbb = dettaglioAbbonamento.nome;
    setDettaglioAbbonamento(null);
    if (centroShop) getAbbonamentiShop(centroShop.id).then(setAbbonamenti);
    if (me) { getStarsCoinPerCentro(me.id).then(setSaldi); getTotaleCoinSpeso(me.id).then(setTotaleSpeso); }
    avvisa(
      'Acquisto confermato',
      metodoScelto === 'coin'
        ? `Hai acquistato "${nomeAbb}". È già attivo sul tuo profilo.`
        : `Hai acquistato "${nomeAbb}", già attivo. Salda l'importo al centro quando vuoi.`
    );
  };

  // Lo shop segue lo sport globale scelto nell'header, come il resto
  // dell'app (fix utente esplicito: "Anche SHOP è dettato dallo sport,
  // quindi devo vedere SOLO i prodotti del tennis") — un prodotto/
  // abbonamento senza sport (null) è merchandising/pacchetto generico del
  // centro e resta visibile qualunque sia lo sport attivo, stessa identica
  // regola già in uso lato gestionale per gli abbonamenti (filtroSportAbb).
  const prodottiFiltrati = (prodotti ?? [])
    .filter((p) => !p.sport || p.sport === sportAttivo)
    .filter((p) => filtroCondizione === 'tutti' || p.condizione === filtroCondizione);
  const abbonamentiFiltrati = (abbonamenti ?? []).filter((a) => !a.sport || a.sport === sportAttivo);

  // Il saldo è una valuta a punti, non decimale: nessun numero dopo la
  // virgola in nessuna delle due visualizzazioni (fix utente esplicito).
  const totale = Math.round(saldi.reduce((acc, s) => acc + s.saldo, 0));

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

  // Saldo del singolo centro, per la card cliccabile sotto (fix utente
  // esplicito: "rimuovi la lista degli stars coin per ogni circolo ed
  // inserisci anzi delle schede cliccabili... con il quantitativo di Stars
  // Coin di quel centro specifico" — non più un elenco separato).
  const saldoPerCentro = useMemo(() => new Map(saldi.map((s) => [s.centro.id, s.saldo])), [saldi]);

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
      <AppHeader />
      <View style={s.topbar}>
        <IconButton icon="chevron-back" onPress={() => (centroShop ? setCentroShop(null) : router.back())} />
        <Text style={s.title}>{centroShop ? centroShop.nome : 'Stars Coin'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!centroShop && (
          <>
            <Text style={s.sectionTitle}>Il tuo saldo</Text>
            {/* 2 box (fix utente esplicito): saldo totale + quanto hai
                risparmiato pagando in Star Coin invece che in contanti —
                stesso tasso fisso di conversione di stars-system (1 SC =
                €0,01, vedi lib/stars.ts coinInEuro). */}
            <View style={s.saldiRow}>
              <Card style={s.saldoBox}>
                <View style={s.saldoBoxInner}>
                  <Ionicons name="star" size={22} color={colors.gold} />
                  <Text style={s.saldoBoxValore}>{totale} SC</Text>
                  <Muted style={s.saldoBoxLabel}>Saldo totale</Muted>
                </View>
              </Card>
              <Card style={s.saldoBox}>
                <View style={s.saldoBoxInner}>
                  <Ionicons name="wallet-outline" size={22} color={colors.green} />
                  <Text style={s.saldoBoxValore}>{Math.round(totaleSpeso)} SC</Text>
                  <Muted style={s.saldoBoxLabel}>Hai risparmiato {formattaEuro(coinInEuro(totaleSpeso))}</Muted>
                </View>
              </Card>
            </View>

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

            {centri.length === 0 && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
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
                  {saldoPerCentro.has(c.id) && (
                    <View style={s.centroSaldoPill}>
                      <Ionicons name="star" size={12} color={colors.gold} />
                      <Text style={s.centroSaldoPillTesto}>{Math.round(saldoPerCentro.get(c.id)!)} SC</Text>
                    </View>
                  )}
                  <Pressable hitSlop={8} onPress={() => onTogglePreferito(c)}>
                    <Ionicons name={preferiti.has(c.id) ? 'star' : 'star-outline'} size={20} color={preferiti.has(c.id) ? colors.gold : colors.slate} />
                  </Pressable>
                  <Ionicons name="chevron-forward" size={20} color={colors.slate} />
                </Card>
              </Pressable>
            ))}
          </>
        )}

        {centroShop && (
          <>
            <Segmented
              value={scheda}
              onChange={(v) => setScheda(v)}
              options={[{ value: 'prodotti', label: 'Prodotti' }, { value: 'abbonamenti', label: 'Abbonamenti' }]}
              style={{ marginBottom: Spacing.md }}
            />

            {scheda === 'prodotti' ? (
              <>
                <View style={s.filtriRowTraToggle}>
                  <View style={s.filtriRow}>
                    <Chip label="Tutti" active={filtroCondizione === 'tutti'} onPress={() => setFiltroCondizione('tutti')} />
                    <Chip label="Nuovo" active={filtroCondizione === 'nuovo'} onPress={() => setFiltroCondizione('nuovo')} />
                    <Chip label="Usato" active={filtroCondizione === 'usato'} onPress={() => setFiltroCondizione('usato')} />
                  </View>
                  {/* Griglia/elenco (fix utente esplicito: "la visualizzazione
                      deve poter essere sia a griglia che ad elenco"). */}
                  <View style={s.vistaToggle}>
                    <IconButton icon="grid-outline" size={34} variant={vistaProdotti === 'griglia' ? 'solid' : 'glass'} onPress={() => setVistaProdotti('griglia')} />
                    <IconButton icon="list-outline" size={34} variant={vistaProdotti === 'elenco' ? 'solid' : 'glass'} onPress={() => setVistaProdotti('elenco')} />
                  </View>
                </View>

                {prodotti === null && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
                {prodotti !== null && prodottiFiltrati.length === 0 && (
                  <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                    {prodotti.length === 0 ? 'Nessun prodotto disponibile in questo centro.' : `Nessun prodotto per ${sportAttivo}.`}
                  </Muted>
                )}
                {vistaProdotti === 'griglia' ? (
                  <View style={s.grid}>
                    {prodottiFiltrati.map((p) => (
                      <Pressable key={p.id} style={s.prodCard} onPress={() => setDettaglioProdotto(p)}>
                        <View style={s.prodImgBox}>
                          {p.immagine_url
                            ? <Image source={{ uri: immagineUri(p.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                            : <Ionicons name="pricetag-outline" size={36} color={colors.gold} />}
                          {p.condizione === 'usato' && <View style={s.badgeUsato}><Text style={s.badgeUsatoText}>USATO</Text></View>}
                          {p.sport && <View style={s.badgeSport}><Text style={s.badgeSportText}>{p.sport}</Text></View>}
                        </View>
                        <View style={s.prodInfo}>
                          <Text style={s.prodNome} numberOfLines={2}>{p.nome}</Text>
                          <View style={s.prodPrezzoRow}>
                            <Ionicons name="star" size={14} color={colors.gold} />
                            <Text style={s.prodPrezzo}>{Math.round(p.prezzo_coin)} SC</Text>
                          </View>
                          <Muted style={{ fontSize: Font.tiny }}>oppure {formattaEuro(euroDaMostrare(p.prezzo_coin))}</Muted>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: Spacing.sm }}>
                    {prodottiFiltrati.map((p) => (
                      <Pressable key={p.id} onPress={() => setDettaglioProdotto(p)}>
                        <Card style={s.prodRigaElenco}>
                          <View style={s.prodImgBoxElenco}>
                            {p.immagine_url
                              ? <Image source={{ uri: immagineUri(p.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                              : <Ionicons name="pricetag-outline" size={22} color={colors.gold} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.prodNome} numberOfLines={1}>{p.nome}</Text>
                            {/* minHeight fisso anche da vuota (fix utente
                                esplicito: "alcune più corte, altre più
                                lunghe") — un prodotto senza condizione/sport
                                non deve rendere la sua riga più bassa delle
                                altre. */}
                            <View style={{ flexDirection: 'row', gap: 6, minHeight: 16 }}>
                              {p.condizione === 'usato' && <Muted style={{ fontSize: Font.tiny }}>Usato</Muted>}
                              {p.sport && <Muted style={{ fontSize: Font.tiny }}>{p.sport}</Muted>}
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={s.prodPrezzoRow}>
                              <Ionicons name="star" size={13} color={colors.gold} />
                              <Text style={s.prodPrezzo}>{Math.round(p.prezzo_coin)} SC</Text>
                            </View>
                            <Muted style={{ fontSize: Font.tiny }}>{formattaEuro(euroDaMostrare(p.prezzo_coin))}</Muted>
                          </View>
                        </Card>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                {abbonamenti === null && <ActivityIndicator color={colors.gold} style={{ marginTop: Spacing.xl }} />}
                {abbonamenti !== null && abbonamentiFiltrati.length === 0 && (
                  <Muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                    {abbonamenti.length === 0 ? 'Nessun abbonamento disponibile in questo centro.' : `Nessun abbonamento per ${sportAttivo}.`}
                  </Muted>
                )}
                {abbonamentiFiltrati.map((a) => (
                  <Pressable key={a.id} onPress={() => setDettaglioAbbonamento(a)}>
                    <Card style={s.abbCard}>
                      <View style={s.abbIcon}>
                        <Ionicons name={a.tipo === 'lezioni' ? 'school-outline' : 'tennisball-outline'} size={24} color={colors.gold} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prodNome}>{a.nome}</Text>
                        <Muted>
                          {a.quantita_inclusa} {a.tipo === 'lezioni' ? 'lezioni' : 'ingressi campo'}
                          {a.validita_giorni ? ` · valido ${a.validita_giorni} giorni` : ''}
                        </Muted>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={s.prodPrezzoRow}>
                          <Ionicons name="star" size={13} color={colors.gold} />
                          <Text style={s.prodPrezzo}>{Math.round(a.prezzo_coin)} SC</Text>
                        </View>
                        <Muted>{formattaEuro(euroDaMostrare(a.prezzo_coin))}</Muted>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Dettaglio prodotto: apre sia dal tap in griglia sia dal deep-link
          ADV della Home (fix utente esplicito, "cliccando sul prodotto
          specifico deve portare direttamente a quel prodotto"). */}
      <Modal visible={!!dettaglioProdotto} transparent animationType="fade" onRequestClose={() => setDettaglioProdotto(null)}>
        <Pressable style={s.modaleSfondo} onPress={() => setDettaglioProdotto(null)}>
          <Pressable style={s.dettaglioBox} onPress={(e) => e.stopPropagation()}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            {dettaglioProdotto && (
              <>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <View style={s.dettaglioImgBox}>
                  {dettaglioProdotto.immagine_url
                    ? <Image source={{ uri: immagineUri(dettaglioProdotto.immagine_url) }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    : <Ionicons name="pricetag-outline" size={56} color={colors.gold} />}
                  <Pressable style={s.dettaglioChiudi} onPress={() => setDettaglioProdotto(null)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={colors.white} />
                  </Pressable>
                </View>
                <View style={{ padding: Spacing.lg }}>
                  <View style={s.dettaglioBadgeRow}>
                    <View style={[s.badgePill, dettaglioProdotto.condizione === 'usato' && s.badgePillUsato]}>
                      <Text style={s.badgePillText}>{dettaglioProdotto.condizione === 'usato' ? 'Usato' : 'Nuovo'}</Text>
                    </View>
                    {dettaglioProdotto.sport && <View style={s.badgePill}><Text style={s.badgePillText}>{dettaglioProdotto.sport}</Text></View>}
                  </View>
                  <Text style={s.dettaglioTitolo}>{dettaglioProdotto.nome}</Text>
                  {dettaglioProdotto.descrizione && <Muted style={{ marginTop: Spacing.xs }}>{dettaglioProdotto.descrizione}</Muted>}
                  <View style={s.dettaglioPrezzoRow}>
                    <Ionicons name="star" size={20} color={colors.gold} />
                    <Text style={s.dettaglioPrezzo}>{Math.round(dettaglioProdotto.prezzo_coin)} SC</Text>
                    <Muted>oppure {formattaEuro(euroDaMostrare(dettaglioProdotto.prezzo_coin))}</Muted>
                  </View>
                  <Muted style={{ marginTop: Spacing.sm }}>
                    {dettaglioProdotto.stock == null && dettaglioProdotto.varianti.length === 0 ? 'Scorte illimitate' : !esaurito ? `${dettaglioProdotto.stock ?? ''} disponibili`.trim() : null}
                  </Muted>
                  {esaurito && <Text style={s.esauritoTesto}>Esaurito</Text>}

                  {!esaurito && dettaglioProdotto.varianti.length > 0 && (
                    <>
                      <Text style={s.acquistaLabel}>Scegli una variante</Text>
                      <View style={s.variantiRow}>
                        {dettaglioProdotto.varianti.map((v) => (
                          <Pressable
                            key={v.nome} disabled={v.stock <= 0}
                            onPress={() => setVarianteScelta(v.nome)}
                            style={[s.variantePill, varianteScelta === v.nome && s.variantePillAttiva, v.stock <= 0 && { opacity: 0.4 }]}
                          >
                            <Text style={[s.variantePillText, varianteScelta === v.nome && s.variantePillTextAttiva]}>
                              {v.nome} {v.stock <= 0 ? '(esaurita)' : `· ${v.stock}`}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {!esaurito && (
                    <>
                      <Text style={s.acquistaLabel}>Come vuoi pagare?</Text>
                      <View style={{ gap: Spacing.sm }}>
                        <Pressable
                          onPress={() => setMetodoScelto('coin')}
                          disabled={saldoCentro < dettaglioProdotto.prezzo_coin}
                          style={[s.metodoRiga, metodoScelto === 'coin' && s.metodoRigaAttiva, saldoCentro < dettaglioProdotto.prezzo_coin && { opacity: 0.45 }]}
                        >
                          <Ionicons name={metodoScelto === 'coin' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'coin' ? colors.gold : colors.slate} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.metodoTitolo}>⭐ Star Coin</Text>
                            <Muted style={{ fontSize: Font.tiny }}>
                              {saldoCentro < dettaglioProdotto.prezzo_coin ? `Saldo insufficiente (hai ${saldoCentro} SC)` : `Il tuo saldo: ${saldoCentro} SC`}
                            </Muted>
                          </View>
                          <Text style={s.metodoPrezzo}>{Math.round(dettaglioProdotto.prezzo_coin)} SC</Text>
                        </Pressable>

                        {dettaglioProdotto.prezzo_euro != null && (
                          <Pressable onPress={() => setMetodoScelto('euro')} style={[s.metodoRiga, metodoScelto === 'euro' && s.metodoRigaAttiva]}>
                            <Ionicons name={metodoScelto === 'euro' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'euro' ? colors.gold : colors.slate} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.metodoTitolo}>€ Euro</Text>
                              <Muted style={{ fontSize: Font.tiny }}>Paghi e ritiri direttamente al centro</Muted>
                            </View>
                            <Text style={s.metodoPrezzo}>€ {dettaglioProdotto.prezzo_euro}</Text>
                          </Pressable>
                        )}
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
              {!esaurito && (
                <View style={s.dettaglioFooter}>
                  <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
                  <Button
                    title={acquistando ? 'Acquisto…' : 'Acquista'} onPress={acquista}
                    loading={acquistando} disabled={!puoAcquistare || acquistando}
                  />
                </View>
              )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dettaglio abbonamento — stesso pattern del prodotto (scroll +
          footer sempre visibile con "Acquista"), contenuto più semplice
          (niente immagine/varianti). Acquistabile anche dall'app come i
          prodotti — fix utente esplicito, prima era solo consultabile. */}
      <Modal visible={!!dettaglioAbbonamento} transparent animationType="fade" onRequestClose={() => setDettaglioAbbonamento(null)}>
        <Pressable style={s.modaleSfondo} onPress={() => setDettaglioAbbonamento(null)}>
          <Pressable style={s.dettaglioAbbBox} onPress={(e) => e.stopPropagation()}>
            <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
            {dettaglioAbbonamento && (
              <>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <View style={{ padding: Spacing.lg }}>
                  <View style={s.abbIconGrande}>
                    <Ionicons name={dettaglioAbbonamento.tipo === 'lezioni' ? 'school' : 'tennisball'} size={28} color={colors.gold} />
                  </View>
                  <Text style={s.dettaglioTitolo}>{dettaglioAbbonamento.nome}</Text>
                  {dettaglioAbbonamento.sport && (
                    <View style={[s.badgePill, { alignSelf: 'flex-start', marginTop: Spacing.sm }]}><Text style={s.badgePillText}>{dettaglioAbbonamento.sport}</Text></View>
                  )}
                  <Muted style={{ marginTop: Spacing.md }}>
                    {dettaglioAbbonamento.quantita_inclusa} {dettaglioAbbonamento.tipo === 'lezioni' ? 'lezioni' : 'ingressi campo'}
                    {dettaglioAbbonamento.validita_giorni ? ` · valido ${dettaglioAbbonamento.validita_giorni} giorni` : ' · non scade mai'}
                  </Muted>
                  <View style={s.dettaglioPrezzoRow}>
                    <Ionicons name="star" size={20} color={colors.gold} />
                    <Text style={s.dettaglioPrezzo}>{Math.round(dettaglioAbbonamento.prezzo_coin)} SC</Text>
                    <Muted>oppure {formattaEuro(euroDaMostrare(dettaglioAbbonamento.prezzo_coin))}</Muted>
                  </View>

                  <Text style={s.acquistaLabel}>Come vuoi pagare?</Text>
                  <View style={{ gap: Spacing.sm }}>
                    <Pressable
                      onPress={() => setMetodoScelto('coin')}
                      disabled={saldoCentro < dettaglioAbbonamento.prezzo_coin}
                      style={[s.metodoRiga, metodoScelto === 'coin' && s.metodoRigaAttiva, saldoCentro < dettaglioAbbonamento.prezzo_coin && { opacity: 0.45 }]}
                    >
                      <Ionicons name={metodoScelto === 'coin' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'coin' ? colors.gold : colors.slate} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.metodoTitolo}>⭐ Star Coin</Text>
                        <Muted style={{ fontSize: Font.tiny }}>
                          {saldoCentro < dettaglioAbbonamento.prezzo_coin ? `Saldo insufficiente (hai ${saldoCentro} SC)` : `Il tuo saldo: ${saldoCentro} SC`}
                        </Muted>
                      </View>
                      <Text style={s.metodoPrezzo}>{Math.round(dettaglioAbbonamento.prezzo_coin)} SC</Text>
                    </Pressable>

                    {dettaglioAbbonamento.prezzo_euro != null && (
                      <Pressable onPress={() => setMetodoScelto('euro')} style={[s.metodoRiga, metodoScelto === 'euro' && s.metodoRigaAttiva]}>
                        <Ionicons name={metodoScelto === 'euro' ? 'radio-button-on' : 'radio-button-off'} size={20} color={metodoScelto === 'euro' ? colors.gold : colors.slate} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.metodoTitolo}>€ Euro</Text>
                          <Muted style={{ fontSize: Font.tiny }}>Paghi direttamente al centro</Muted>
                        </View>
                        <Text style={s.metodoPrezzo}>€ {dettaglioAbbonamento.prezzo_euro}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </ScrollView>
              <View style={s.dettaglioFooter}>
                <BlurView intensity={glass.blurStrong} tint={scheme} style={StyleSheet.absoluteFillObject} />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.strongBg }]} />
                <Button
                  title={acquistando ? 'Acquisto…' : 'Acquista'} onPress={acquistaAbb}
                  loading={acquistando} disabled={!puoAcquistareAbb || acquistando}
                />
              </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors, glass: AppGlass) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
    title: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    scroll: { padding: Spacing.lg, paddingTop: 0 },
    sectionTitle: { color: colors.navyDeep, fontSize: Font.h3, fontWeight: '800', marginBottom: Spacing.sm },
    // 2 box saldo/risparmio affiancati (fix utente esplicito), stesso
    // linguaggio delle Card generiche dell'app. IMPORTANTE: `alignItems`
    // passato allo `style` di <Card> non va MAI usato per centrare i figli
    // quando la Card è anche vincolata in larghezza da un flex del
    // genitore (qui flex:1 dentro saldiRow) — <Card> duplica alignItems/
    // flexDirection/gap/justifyContent anche sul nodo ESTERNO che porta
    // l'ombra (per far funzionare `style={{flexDirection:'row', ...}}`
    // nei tanti punti dove Card avvolge una riga), ma quel nodo esterno ha
    // come UNICO figlio il nodo interno bordato/sfocato — con
    // alignItems:'center' (asse incrociato = orizzontale, in colonna) il
    // figlio si RESTRINGE al contenuto invece di riempire la Card,
    // lasciando il vero riquadro bianco più piccolo e "fluttuante" dentro
    // l'area piena (larga quanto flex:1) del nodo esterno — esattamente il
    // bug "sembra ci sia una box dentro un'altra" segnalato dall'utente.
    // Fix: alignItems/gap SOLO su un View interno vero, mai sullo style di
    // Card quando c'è un vincolo di larghezza esterno come flex:1 qui.
    saldiRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
    saldoBox: { flex: 1 },
    saldoBoxInner: { alignItems: 'center', gap: 4 },
    saldoBoxValore: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '900' },
    saldoBoxLabel: { fontSize: Font.tiny, textAlign: 'center' },
    filtriRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
    filtriRowTraToggle: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
    vistaToggle: { flexDirection: 'row', gap: 6 },
    chipScroll: { marginBottom: Spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
    nome: { color: colors.navyDeep, fontSize: Font.body, fontWeight: '700' },
    // Saldo del centro specifico, dentro la sua card cliccabile (fix utente
    // esplicito: "delle schede cliccabili... con il quantitativo di Stars
    // Coin di quel centro specifico").
    centroSaldoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gold + '18',
      paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.pill,
    },
    centroSaldoPillTesto: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.tiny },

    // Griglia prodotti: 2 colonne "a quadrati", immagine reale grande in
    // proporzione 1:1 (non più un'iconcina 70px persa in un angolo) — fix
    // utente esplicito: "devono essere visualizzati meglio... le
    // informazioni devono essere chiare".
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
    prodCard: {
      width: '47%', borderRadius: Radius.card, overflow: 'hidden', backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.navyLine + '2a',
    },
    prodImgBox: { width: '100%', aspectRatio: 1, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center' },
    badgeUsato: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: colors.navy, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    badgeUsatoText: { color: colors.white, fontSize: 9.5, fontWeight: '800' },
    badgeSport: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    badgeSportText: { color: colors.navyDeep, fontSize: 9.5, fontWeight: '800' },
    prodInfo: { padding: Spacing.md },
    prodNome: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small, minHeight: 32, marginBottom: 6 },
    prodPrezzoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    prodPrezzo: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.body },

    // Vista elenco (fix utente esplicito: "griglia o elenco") — riga
    // compatta, stesso linguaggio di abbCard sotto: immagine piccola invece
    // del quadrato grande della griglia.
    prodRigaElenco: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    prodImgBoxElenco: {
      width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: colors.navyCard,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },

    // alignItems:'flex-start' (non più 'center'): con l'aggiunta del
    // controvalore in € SEMPRE mostrato (fix utente esplicito, vedi
    // euroDaMostrare) il blocco prezzo ha sempre 2 righe come il testo a
    // sinistra, ma l'allineamento in alto resta comunque più robusto di un
    // centraggio che dipende dal numero di righe combaciare per caso —
    // era proprio questo il "problema di visualizzazione" segnalato
    // (badge/prezzo che saltavano al centro della card quando il testo a
    // sinistra aveva più righe del prezzo a destra).
    abbCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.sm },
    abbIcon: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center' },
    abbIconGrande: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center' },

    // Dettaglio prodotto/abbonamento — vetro forte, stesso linguaggio dei
    // modali già in uso nell'app (AppHeader, impegni.tsx).
    modaleSfondo: { flex: 1, backgroundColor: 'rgba(15,23,38,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    dettaglioBox: { width: '100%', maxWidth: 400, maxHeight: '82%', borderRadius: Radius.modal, overflow: 'hidden', borderWidth: 1, borderColor: glass.strongBorder },
    dettaglioFooter: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: glass.strongBorder },
    dettaglioAbbBox: { width: '100%', maxWidth: 400, maxHeight: '82%', borderRadius: Radius.modal, overflow: 'hidden', borderWidth: 1, borderColor: glass.strongBorder },
    dettaglioImgBox: { width: '100%', aspectRatio: 1.3, backgroundColor: colors.navyCard, alignItems: 'center', justifyContent: 'center' },
    dettaglioChiudi: {
      position: 'absolute', top: Spacing.md, right: Spacing.md, width: 34, height: 34, borderRadius: 17,
      backgroundColor: 'rgba(15,23,38,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    dettaglioBadgeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    badgePill: { backgroundColor: colors.navyCard, paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill },
    badgePillUsato: { backgroundColor: colors.navy },
    badgePillText: { color: colors.navyDeep, fontSize: Font.tiny, fontWeight: '800' },
    dettaglioTitolo: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '800' },
    dettaglioPrezzoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.lg },
    dettaglioPrezzo: { color: colors.navyDeep, fontSize: Font.h2, fontWeight: '900' },
    variantiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    variantePill: { backgroundColor: colors.navyCard, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: 'transparent' },
    variantePillAttiva: { backgroundColor: colors.gold + '22', borderColor: colors.gold },
    variantePillText: { color: colors.navyDeep, fontSize: Font.tiny, fontWeight: '700' },
    variantePillTextAttiva: { color: colors.gold },
    esauritoTesto: { color: colors.red, fontWeight: '800', fontSize: Font.small, marginTop: Spacing.xs },
    acquistaLabel: { color: colors.navyDeep, fontWeight: '800', fontSize: Font.small, marginTop: Spacing.lg, marginBottom: Spacing.sm },
    metodoRiga: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
      borderRadius: Radius.control, backgroundColor: colors.navyCard, borderWidth: 1, borderColor: 'transparent',
    },
    metodoRigaAttiva: { borderColor: colors.gold, backgroundColor: colors.gold + '14' },
    metodoTitolo: { color: colors.navyDeep, fontWeight: '700', fontSize: Font.small },
    metodoPrezzo: { color: colors.navyDeep, fontWeight: '900', fontSize: Font.body },
  });
}
