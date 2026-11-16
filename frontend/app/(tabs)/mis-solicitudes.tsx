import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_OBRA, ESTADOS_PRESUPUESTO, ESTADOS_SOLICITUD } from "@/src/lib/constants";
import { eur, fechaHora } from "@/src/lib/format";
import { addStoredRequest, getStoredRequests, StoredReq } from "@/src/lib/localData";
import type { SolicitudPublica } from "@/src/lib/types";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, EmptyState, ErrorView, Field, LoadingView, PillButton, ProgressBar } from "@/src/ui/kit";
import { ServiceIcon } from "@/src/ui/ServiceArt";

export default function MisSolicitudes() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [items, setItems] = useState<StoredReq[] | null>(null);
  const [numero, setNumero] = useState("");
  const [telefono, setTelefono] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getStoredRequests().then(setItems);
    }, []),
  );

  const query = useQuery({
    queryKey: ["mis-solicitudes", items],
    queryFn: () => api.post<SolicitudPublica[]>("/solicitudes/mine", { items }),
    enabled: items !== null,
  });

  const buscar = async () => {
    setSearchError(null);
    if (numero.trim().length < 4 || telefono.replace(/\D/g, "").length < 9) {
      setSearchError("Introduce el nº de solicitud (GC-…) y tu teléfono");
      return;
    }
    setSearching(true);
    try {
      const r = await api.post<SolicitudPublica>("/solicitudes/lookup", { numero: numero.trim(), telefono });
      await addStoredRequest({ numero: r.numero_solicitud, telefono });
      setItems(await getStoredRequests());
      setNumero("");
      setTelefono("");
    } catch (e) {
      setSearchError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  const list = query.data ?? [];
  return (
    <View style={styles.screen} testID="my-requests-screen">
      <BrandHeader variant="compact" />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brand} />}
      >
        <Text style={styles.title}>Mis solicitudes</Text>
        <Text style={styles.sub}>Las solicitudes de tu cuenta y de este móvil, con su estado actualizado.</Text>

        {items === null || query.isLoading ? (
          <LoadingView />
        ) : query.isError ? (
          <ErrorView message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon="clipboard-list"
              title="Aún no tienes solicitudes"
              text="Cuéntanos qué necesitas reparar o reformar y te enviaremos un presupuesto sin compromiso."
              action="Solicitar presupuesto gratis"
              actionIcon="file-text"
              onAction={() => router.push("/solicitar-presupuesto")}
              testID="my-requests-empty"
            />
          </Card>
        ) : (
          list.map((s) => {
            const st = ESTADOS_SOLICITUD[s.estado];
            return (
              <Card key={s.id} testID={`my-request-${s.numero_solicitud}`} style={styles.reqCard}>
                <View style={styles.reqHead}>
                  <Text style={styles.reqNum}>{s.numero_solicitud}</Text>
                  <Badge label={st.label} tone={st.tone} testID={`my-request-status-${s.numero_solicitud}`} />
                </View>
                <View style={styles.row}>
                  <ServiceIcon servicio={s.servicio} urgent={s.es_urgencia} size={24} />
                  <Text style={styles.reqService}>{s.servicio}</Text>
                </View>
                {s.descuento_bienvenida ? <Badge label={`−${s.descuento_bienvenida} % de bienvenida`} tone="yellow" testID={`my-request-discount-${s.numero_solicitud}`} /> : null}
                <Text style={styles.reqMeta}>
                  {fechaHora(s.fecha_creacion)} · {s.direccion}
                </Text>
                <Text style={styles.reqDesc} numberOfLines={2}>
                  {s.descripcion}
                </Text>
                {s.presupuesto ? (
                  <View style={styles.extra}>
                    <Icon name="file-text" size={16} color={colors.brand} />
                    <Text style={styles.extraText}>
                      Presupuesto {s.presupuesto.numero}: {eur(s.presupuesto.total)}
                    </Text>
                    <Badge label={ESTADOS_PRESUPUESTO[s.presupuesto.estado].label} tone={ESTADOS_PRESUPUESTO[s.presupuesto.estado].tone} />
                  </View>
                ) : null}
                {s.obra ? (
                  <View style={styles.obra}>
                    <View style={styles.row}>
                      <Icon name="hard-hat" size={16} color={colors.renovation} />
                      <Text style={styles.extraText}>
                        Obra {ESTADOS_OBRA[s.obra.estado].label.toLowerCase()} · {s.obra.porcentaje_avance}%
                      </Text>
                    </View>
                    <ProgressBar value={s.obra.porcentaje_avance} />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}

        <Card tone="blue" style={styles.searchCard}>
          <Text style={styles.searchTitle}>¿Enviaste una solicitud desde otro dispositivo?</Text>
          <Field label="Nº de solicitud" placeholder="GC-000847" value={numero} onChangeText={setNumero} autoCapitalize="characters" testID="lookup-number-input" />
          <Field label="Teléfono" placeholder="600 000 000" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" testID="lookup-phone-input" error={searchError} />
          <PillButton label="Buscar solicitud" icon="search" variant="navy" small onPress={buscar} loading={searching} testID="lookup-submit-button" />
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: fonts.black, fontSize: 26, color: c.brandDeep },
  sub: { fontFamily: fonts.body, fontSize: 14, color: c.muted, marginBottom: 4 },
  reqCard: { gap: 8 },
  reqHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reqNum: { fontFamily: fonts.black, fontSize: 18, color: c.brandDeep },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  reqService: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.textDark },
  reqMeta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  reqDesc: { fontFamily: fonts.body, fontSize: 14, color: c.textDark, lineHeight: 20 },
  extra: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.infoCard, borderRadius: 12, padding: 10, flexWrap: "wrap" },
  extraText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brandDeep, flexShrink: 1 },
  obra: { gap: 8, backgroundColor: c.warningSoft, borderRadius: 12, padding: 10 },
  searchCard: { gap: 12, marginTop: 8 },
  searchTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: c.brandDeep },
}));
