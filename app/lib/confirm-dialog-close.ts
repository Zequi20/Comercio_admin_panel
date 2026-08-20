const FORM_CLOSE_MESSAGE =
  "¿Seguro que querés cerrar este formulario? Los cambios no guardados se perderán.";

export function confirmFormClose() {
  return window.confirm(FORM_CLOSE_MESSAGE);
}
