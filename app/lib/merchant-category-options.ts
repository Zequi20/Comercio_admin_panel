export type MerchantCategoryOption = {
  value: string;
  label: string;
};

/**
 * Canonical categories accepted by the client catalog.
 * Keep values aligned with the client presentation keys so metadata can be
 * consumed consistently across the admin and customer applications.
 */
export const MERCHANT_CATEGORY_OPTIONS: readonly MerchantCategoryOption[] = [
  { value: "mercado", label: "Mercado" },
  { value: "comida", label: "Comida" },
  { value: "helados", label: "Helados" },
  { value: "tiendas", label: "Tiendas" },
  { value: "bodegas", label: "Bodegas" },
  { value: "floreria", label: "Florería" },
  { value: "hogar", label: "Hogar" },
  { value: "farmacia", label: "Farmacia" },
  { value: "servicios", label: "Servicios" },
  { value: "ferreteria", label: "Ferretería" },
  { value: "auxilio-mecanico", label: "Auxilio Mecánico" },
  { value: "gomeria", label: "Gomería" },
  { value: "corte-de-cesped", label: "Corte de Césped" },
  { value: "regalos", label: "Regalos" },
];

export const MERCHANT_CATEGORY_VALUES = new Set(
  MERCHANT_CATEGORY_OPTIONS.map((option) => option.value)
);
