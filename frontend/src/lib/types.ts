export type EstadoSolicitud = "pendiente" | "en_revision" | "presupuestado" | "en_obra" | "finalizado";
export type EstadoPresupuesto = "pendiente" | "aceptado" | "rechazado";
export type EstadoObra = "planificada" | "en_curso" | "pausada" | "finalizada";
export type Ambito = "EMPRESA" | "PERSONAL_HOGAR";
export type TipoMov = "INGRESO" | "GASTO";
export type Fase = "antes" | "durante" | "despues";

export type SolicitudPublica = {
  id: string;
  numero_solicitud: string;
  fecha_creacion: string;
  servicio: string;
  es_urgencia: boolean;
  direccion: string;
  estado: EstadoSolicitud;
  descripcion: string;
  nombre_cliente: string;
  num_fotos: number;
  descuento_bienvenida?: number;
  presupuesto: { numero: string; total: number; estado: EstadoPresupuesto; descuento_importe?: number } | null;
  obra: { estado: EstadoObra; porcentaje_avance: number; fecha_inicio: string } | null;
};

export type Solicitud = {
  id: string;
  numero_solicitud: string;
  fecha_creacion: string;
  servicio: string;
  es_urgencia: boolean;
  direccion: string;
  estado: EstadoSolicitud;
  nombre_cliente: string;
  telefono_cliente: string;
  correo_cliente: string;
  descripcion: string;
  fotografias: string[];
  descuento_bienvenida?: number;
  cliente_id?: string | null;
  presupuesto_id?: string | null;
  obra_id?: string | null;
};

export type Mensaje = {
  id: string;
  tipo: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  estado: string;
  fecha: string;
  error?: string | null;
};

export type Linea = {
  id?: string;
  tipo: "MATERIAL" | "MANO_OBRA";
  concepto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal?: number;
};

export type Presupuesto = {
  id: string;
  numero_presupuesto: string;
  solicitud_id?: string | null;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_correo: string;
  direccion: string;
  servicio: string;
  titulo: string;
  lineas: Linea[];
  iva_porcentaje: number;
  importe_lineas?: number;
  descuento_porcentaje?: number;
  descuento_importe?: number;
  base_imponible: number;
  iva_importe: number;
  total: number;
  estado: EstadoPresupuesto;
  notas: string;
  fecha_creacion: string;
  fecha_envio?: string | null;
  obra_id?: string | null;
};

export type Material = {
  id: string;
  concepto: string;
  cantidad: number;
  unidad: string;
  precio_previsto: number;
  precio_real?: number | null;
  comprado: boolean;
  proveedor: string;
  ticket_foto?: string | null;
};

export type ManoObra = {
  id: string;
  trabajador_id?: string | null;
  trabajador_nombre: string;
  concepto: string;
  horas: number;
  coste_hora: number;
  coste: number;
  fecha: string;
};

export type Fotos = { antes: string[]; durante: string[]; despues: string[] };

export type Movimiento = {
  id: string;
  tipo: TipoMov;
  ambito: Ambito;
  categoria: string;
  concepto: string;
  importe: number;
  iva: number;
  iva_importe: number;
  total: number;
  fecha: string;
  obra_id?: string | null;
  foto_ticket_factura?: string | null;
  numero_factura?: string | null;
  contraparte: string;
  origen: string;
};

export type Obra = {
  id: string;
  numero_obra: string;
  titulo: string;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  presupuesto_id?: string | null;
  solicitud_id?: string | null;
  direccion: string;
  fecha_inicio: string;
  fecha_fin_prevista: string;
  fecha_fin_real?: string | null;
  estado: EstadoObra;
  porcentaje_avance: number;
  trabajadores_asignados: string[];
  fotos: Fotos;
  materiales: Material[];
  mano_obra: ManoObra[];
  presupuesto_previsto: number;
  ingresos_totales: number;
  coste_materiales_real: number;
  coste_mano_obra_real: number;
  beneficio_neto: number;
  notas: string;
};

export type ObraDetalle = Obra & {
  coste_materiales_previsto: number;
  coste_total_real: number;
  margen_pct: number;
  cobrado: number;
  pendiente_cobro: number;
  cobros: Movimiento[];
  trabajadores: { id: string; nombre: string; especialidad: string; telefono: string; coste_hora_o_servicio: number; tipo_coste: string }[];
};

export type Trabajador = {
  id: string;
  codigo: string;
  nombre: string;
  especialidad: string;
  telefono: string;
  disponibilidad: "disponible" | "ocupado" | "vacaciones";
  coste_hora_o_servicio: number;
  tipo_coste: "hora" | "servicio";
  obras_asignadas: string[];
  obras_activas: number;
};

export type Recordatorio = {
  id: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  hora?: string | null;
  tipo: "visita" | "obra" | "factura" | "cobro" | "pago";
  ambito: Ambito;
  importe?: number | null;
  obra_id?: string | null;
  completado: boolean;
};

export type Anuncio = {
  id: string;
  titulo: string;
  descripcion: string;
  descuento: string;
  fecha_inicio: string;
  fecha_fin?: string | null;
  activo: boolean;
  imagen?: string | null;
};

export type Derivacion = {
  id: string;
  fecha: string;
  cliente_nombre: string;
  descripcion: string;
  obra_id?: string | null;
  importe_compra: number;
  comision: number;
  estado: "pendiente" | "cobrada";
};

export type Ferreteria = {
  id: string;
  codigo?: string;
  nombre: string;
  direccion: string;
  barrio: string;
  telefono: string;
  horario: string;
  descripcion: string;
  imagen?: string | null;
  valoracion: number;
  productos_destacados: string[];
  anuncios: Anuncio[];
  porcentaje_comision?: number;
  tarifa_publicidad_mensual?: number;
  derivaciones?: Derivacion[];
  activa?: boolean;
};

export type WorkerObra = {
  id: string;
  numero_obra: string;
  titulo: string;
  direccion: string;
  fecha_inicio: string;
  fecha_fin_prevista: string;
  estado: EstadoObra;
  porcentaje_avance: number;
  fotos: Fotos;
  cliente_nombre: string;
  cliente_telefono: string;
  notas: string;
  companeros: string[];
  materiales: { concepto: string; cantidad: number; unidad: string; comprado: boolean }[];
};
