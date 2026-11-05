import { useLocalSearchParams } from "expo-router";
import React from "react";

import { RequestForm } from "@/src/components/RequestForm";

export default function SolicitarPresupuesto() {
  const { servicio } = useLocalSearchParams<{ servicio?: string }>();
  return <RequestForm initialServicio={servicio} />;
}
