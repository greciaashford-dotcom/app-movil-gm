import type { IconName } from "@/src/ui/Icon";
import type { ThemeColors } from "@/src/theme";

export const COMPANY_PHONE = "640677948";

export type ServiceInfo = {
  slug: string;
  nombre: string;
  servicio: string;
  desc: string;
  icon: IconName;
  color: keyof ThemeColors;
  iconBg: keyof ThemeColors;
  intro: string;
  trabajos: string[];
};

export const SERVICES: ServiceInfo[] = [
  {
    slug: "fontaneria",
    nombre: "Fontanería",
    servicio: "Fontanería",
    desc: "Reparaciones, fugas, grifería e instalaciones.",
    icon: "droplets",
    color: "plumbingBlue",
    iconBg: "infoCard",
    intro: "Fontaneros profesionales para reparar fugas, renovar grifería o hacer instalaciones nuevas en tu vivienda, local o comunidad.",
    trabajos: ["Detección y reparación de fugas", "Cambio de grifería y sanitarios", "Desatascos", "Instalación de calentadores y termos", "Tuberías y bajantes"],
  },
  {
    slug: "electricidad",
    nombre: "Electricidad",
    servicio: "Electricidad",
    desc: "Averías, enchufes, iluminación e instalaciones.",
    icon: "zap",
    color: "brandPrimary",
    iconBg: "brand",
    intro: "Electricistas autorizados para averías, ampliación de enchufes, iluminación LED y renovación de cuadros eléctricos.",
    trabajos: ["Reparación de averías", "Nuevos enchufes y puntos de luz", "Iluminación LED", "Cuadros eléctricos y boletines", "Revisión de instalaciones"],
  },
  {
    slug: "pintura",
    nombre: "Pintura",
    servicio: "Pintura",
    desc: "Pintura de viviendas, alisado y acabados.",
    icon: "paint-roller",
    color: "brandPrimary",
    iconBg: "brand",
    intro: "Pintores con acabados limpios: pintura de pisos completos, alisado de gotelé, lacados y pintura de fachadas o portales.",
    trabajos: ["Pintura de viviendas y locales", "Alisado de gotelé", "Lacado de puertas", "Portales y zonas comunes", "Tratamiento de humedades"],
  },
  {
    slug: "reformas",
    nombre: "Reformas",
    servicio: "Reformas / Mantenimiento",
    desc: "Albañilería, baños, cocinas y reformas integrales.",
    icon: "brick-wall",
    color: "renovation",
    iconBg: "warningSoft",
    intro: "Reformas de baños, cocinas y viviendas completas, además de albañilería y mantenimiento para comunidades de propietarios.",
    trabajos: ["Reforma de baño y cocina", "Reformas integrales", "Albañilería y alicatados", "Mantenimiento de comunidades", "Pladur y falsos techos"],
  },
];

export const CATEGORIAS_FORM: { label: string; icon: IconName; urgent?: boolean }[] = [
  { label: "Fontanería", icon: "droplets" },
  { label: "Electricidad", icon: "zap" },
  { label: "Pintura", icon: "paint-roller" },
  { label: "Reformas / Mantenimiento", icon: "brick-wall" },
  { label: "Urgencia 24h", icon: "siren", urgent: true },
];

export const URGENCIA_TIPOS: { label: string; icon: IconName }[] = [
  { label: "Cerrajería", icon: "key-round" },
  { label: "Fontanería", icon: "droplets" },
  { label: "Electricidad", icon: "zap" },
];

export type Tone = "neutral" | "info" | "success" | "warning" | "error" | "yellow" | "navy";

export const ESTADOS_SOLICITUD: Record<string, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "yellow" },
  en_revision: { label: "En revisión", tone: "info" },
  presupuestado: { label: "Presupuestado", tone: "navy" },
  en_obra: { label: "En obra", tone: "warning" },
  finalizado: { label: "Finalizado", tone: "success" },
};

export const ESTADOS_PRESUPUESTO: Record<string, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "yellow" },
  aceptado: { label: "Aceptado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "error" },
};

export const ESTADOS_OBRA: Record<string, { label: string; tone: Tone }> = {
  planificada: { label: "Planificada", tone: "info" },
  en_curso: { label: "En curso", tone: "warning" },
  pausada: { label: "Pausada", tone: "neutral" },
  finalizada: { label: "Finalizada", tone: "success" },
};

export const DISPONIBILIDAD: Record<string, { label: string; tone: Tone }> = {
  disponible: { label: "Disponible", tone: "success" },
  ocupado: { label: "Ocupado", tone: "warning" },
  vacaciones: { label: "Vacaciones", tone: "neutral" },
};

export const CATEGORIAS_MOV = {
  EMPRESA: {
    INGRESO: ["Ingresos por obra", "Comisiones", "Publicidad", "Otros ingresos"],
    GASTO: ["Materiales", "Personal", "Suministros", "Cuota autónomos", "Impuestos", "Vehículo", "Herramientas", "Otros gastos"],
  },
  PERSONAL_HOGAR: {
    INGRESO: ["Retribución propietario", "Otros ingresos"],
    GASTO: ["Hipoteca", "Seguros", "Supermercado", "Suministros hogar", "Ocio", "Otros gastos"],
  },
} as const;

export const TIPOS_RECORDATORIO: Record<string, { label: string; icon: IconName; tone: Tone }> = {
  visita: { label: "Visita", icon: "map-pin", tone: "info" },
  obra: { label: "Obra", icon: "hard-hat", tone: "warning" },
  factura: { label: "Factura", icon: "receipt", tone: "navy" },
  cobro: { label: "Cobro", icon: "circle-dollar-sign", tone: "success" },
  pago: { label: "Pago", icon: "wallet", tone: "error" },
};

export const FASES: { key: "antes" | "durante" | "despues"; label: string }[] = [
  { key: "antes", label: "Antes" },
  { key: "durante", label: "Durante" },
  { key: "despues", label: "Después" },
];

export const HERO_IMAGE =
  "https://images.unsplash.com/photo-1689854497064-0553123a1030?crop=entropy&cs=srgb&fm=jpg&q=80&w=900";
