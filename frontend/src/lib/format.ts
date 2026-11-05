export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function eur(n?: number | null, decimals = 2): string {
  const v = Number(n ?? 0);
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(decimals).split(".");
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : ""}${withDots}${decimals ? `,${dec}` : ""} €`;
}

function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function fechaHora(iso?: string | null): string {
  if (!iso) return "";
  const d = parseDate(iso);
  return `${pad2(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()} – ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fecha(value?: string | null): string {
  if (!value) return "";
  const d = parseDate(value);
  return `${pad2(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function fechaCorta(value?: string | null): string {
  if (!value) return "";
  const d = parseDate(value);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDays(value: string, days: number): string {
  const d = parseDate(value);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function isValidDateStr(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = parseDate(v);
  return !isNaN(d.getTime()) && toDateStr(d) === v;
}

export function digits(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

export function waNumber(phone: string): string {
  const d = digits(phone);
  return d.length === 9 ? `34${d}` : d;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:${digits(phone)}`;
}

export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function formatPhone(phone: string): string {
  const d = digits(phone);
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return phone;
}

export function genKey(): string {
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}-${r()}`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseNum(v: string): number {
  const n = parseFloat((v || "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
