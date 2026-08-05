export type DialogCloseKind = "form" | "modal";

const closeMessages: Record<DialogCloseKind, string> = {
  form:
    "¿Seguro que querés cerrar este formulario? Los cambios no guardados se perderán.",
  modal: "¿Seguro que querés cerrar esta ventana?",
};

export function confirmDialogClose(kind: DialogCloseKind = "modal") {
  return window.confirm(closeMessages[kind]);
}
