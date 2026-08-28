"use client";

import {
  Braces,
  CircleAlert,
  CircleCheck,
  CirclePause,
  Edit3,
  Image as ImageIcon,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateRows,
  TablePagination,
  type TablePaginationState,
} from "@/app/components/table-pagination";
import { MerchantAvatar } from "@/app/components/merchant-avatar";
import type { MerchantDetails } from "@/app/lib/auth/types";
import { confirmFormClose } from "@/app/lib/confirm-dialog-close";
import {
  isSupportedImageUrl,
  parseImageUrl,
} from "@/app/lib/image-url";

type MerchantForm = {
  name: string;
  contactEmail: string;
  deliveryCost: string;
  imageUrl: string;
  isOpen: boolean;
  autoConfirmOrders: boolean;
  metadata: string;
};

type MerchantStatusFilter = "ALL" | "OPEN" | "CLOSED";
type ActiveModal = "create" | "edit" | null;

const emptyForm: MerchantForm = {
  name: "",
  contactEmail: "",
  deliveryCost: "0",
  imageUrl: "",
  isOpen: true,
  autoConfirmOrders: false,
  metadata: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function merchantName(merchant: MerchantDetails) {
  return merchant.name?.trim() || `Comercio #${merchant.id}`;
}

function merchantEmail(merchant: MerchantDetails) {
  return merchant.contactEmail?.trim() || merchant.email?.trim() || "Sin correo";
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "Sin costo definido";
  return `Gs. ${amount.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function technicalMetadata(metadata?: Record<string, unknown> | null) {
  const technical = { ...(metadata ?? {}) };
  delete technical.imageUrl;
  return technical;
}

function formatTechnicalMetadata(metadata?: Record<string, unknown> | null) {
  const technical = technicalMetadata(metadata);
  if (!Object.keys(technical).length) return "";
  return JSON.stringify(technical, null, 2);
}

function merchantToForm(merchant: MerchantDetails): MerchantForm {
  return {
    name: merchant.name ?? "",
    contactEmail: merchant.contactEmail ?? merchant.email ?? "",
    deliveryCost:
      merchant.deliveryCost === undefined || merchant.deliveryCost === null
        ? "0"
        : String(merchant.deliveryCost),
    imageUrl: metadataText(merchant.metadata, "imageUrl"),
    isOpen: merchant.isOpen !== false,
    autoConfirmOrders: merchant.autoConfirmOrders === true,
    metadata: formatTechnicalMetadata(merchant.metadata),
  };
}

function buildPayload(form: MerchantForm) {
  const name = form.name.trim();
  const contactEmail = form.contactEmail.trim().toLowerCase();
  const deliveryCost = Number(form.deliveryCost.replace(",", "."));

  if (!name) throw new Error("Ingresá el nombre del comercio.");
  if (!emailPattern.test(contactEmail)) {
    throw new Error("Ingresá un correo de contacto válido.");
  }
  if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
    throw new Error("Ingresá un costo de envío válido.");
  }
  const imageUrl = parseImageUrl(form.imageUrl);
  if (!isSupportedImageUrl(imageUrl)) {
    throw new Error("Ingresá una URL de imagen válida.");
  }

  let metadata: Record<string, unknown> = {};
  if (form.metadata.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.metadata);
    } catch {
      throw new Error("La metadata técnica debe ser un JSON válido.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("La metadata técnica debe ser un objeto JSON.");
    }
    metadata = parsed as Record<string, unknown>;
  }

  delete metadata.imageUrl;
  if (imageUrl) metadata.imageUrl = imageUrl;

  return {
    name,
    contactEmail,
    deliveryCost,
    isOpen: form.isOpen,
    autoConfirmOrders: form.autoConfirmOrders,
    metadata,
  };
}

async function requestMerchantDirectory() {
  const response = await fetch("/api/merchants", {
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: MerchantDetails[]; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      messageFromPayload(payload, "No se pudo cargar la lista de comercios.")
    );
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

export function MerchantsManager() {
  const [merchants, setMerchants] = useState<MerchantDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<MerchantStatusFilter>("ALL");
  const [pagination, setPagination] = useState<TablePaginationState>({
    page: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingMerchant, setEditingMerchant] = useState<MerchantDetails | null>(null);
  const [form, setForm] = useState<MerchantForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMerchants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMerchants(await requestMerchantDirectory());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar la lista de comercios."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void requestMerchantDirectory()
      .then((directory) => {
        if (isCurrent) setMerchants(directory);
      })
      .catch((cause: unknown) => {
        if (!isCurrent) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cargar la lista de comercios."
        );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", activeModal !== null);
    return () => document.body.classList.remove("modal-open");
  }, [activeModal]);

  const filteredMerchants = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es");

    return merchants.filter((merchant) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OPEN" && merchant.isOpen !== false) ||
        (statusFilter === "CLOSED" && merchant.isOpen === false);
      const matchesQuery =
        !normalizedQuery ||
        [merchant.id, merchant.name, merchant.contactEmail, merchant.email]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [deferredQuery, merchants, statusFilter]);

  const merchantsPage = useMemo(
    () => paginateRows(filteredMerchants, pagination),
    [filteredMerchants, pagination]
  );
  const openMerchants = useMemo(
    () => merchants.filter((merchant) => merchant.isOpen !== false).length,
    [merchants]
  );
  const closedMerchants = merchants.length - openMerchants;
  const merchantsWithMetadata = useMemo(
    () =>
      merchants.filter(
        (merchant) => Object.keys(technicalMetadata(merchant.metadata)).length > 0
      ).length,
    [merchants]
  );
  const previewImageUrl = parseImageUrl(form.imageUrl);
  const hasPreviewImage = Boolean(
    previewImageUrl &&
      isSupportedImageUrl(previewImageUrl) &&
      failedImageUrl !== previewImageUrl
  );

  function resetPage() {
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function openCreateModal() {
    setEditingMerchant(null);
    setForm(emptyForm);
    setFailedImageUrl(null);
    setFormError(null);
    setSuccess(null);
    setActiveModal("create");
  }

  function openEditModal(merchant: MerchantDetails) {
    setEditingMerchant(merchant);
    setForm(merchantToForm(merchant));
    setFailedImageUrl(null);
    setFormError(null);
    setSuccess(null);
    setActiveModal("edit");
  }

  function closeModal() {
    if (isSaving) return;
    if (!confirmFormClose()) return;
    setActiveModal(null);
    setEditingMerchant(null);
    setFormError(null);
  }

  async function submitMerchant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    let payload: ReturnType<typeof buildPayload>;
    try {
      payload = buildPayload(form);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Revisá los datos ingresados.");
      return;
    }

    const isEditing = activeModal === "edit";
    if (isEditing && !editingMerchant) return;

    setIsSaving(true);
    try {
      const endpoint = isEditing
        ? `/api/merchants/${encodeURIComponent(String(editingMerchant!.id))}`
        : "/api/merchants";
      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            responsePayload,
            isEditing ? "No se pudo actualizar el comercio." : "No se pudo crear el comercio."
          )
        );
      }

      setActiveModal(null);
      setEditingMerchant(null);
      setSuccess(
        isEditing
          ? `Comercio ${payload.name} actualizado correctamente.`
          : `Comercio ${payload.name} creado correctamente.`
      );
      await loadMerchants();
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "No se pudo guardar el comercio."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMerchant(merchant: MerchantDetails) {
    if (
      !window.confirm(
        `¿Querés eliminar ${merchantName(merchant)}? Esta acción puede afectar sus usuarios, productos y órdenes asociados.`
      )
    ) {
      return;
    }

    const merchantId = String(merchant.id);
    setDeletingId(merchantId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/merchants/${encodeURIComponent(merchantId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(messageFromPayload(payload, "No se pudo eliminar el comercio."));
      }
      setSuccess(`${merchantName(merchant)} eliminado correctamente.`);
      await loadMerchants();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo eliminar el comercio."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="merchants-manager">
      {error ? (
        <div className="error-box catalog-status-message" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="success-box catalog-status-message" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="stats-grid merchants-stats-grid">
        {[
          { label: "Comercios", value: merchants.length, icon: Store, pill: "Directorio" },
          { label: "Abiertos", value: openMerchants, icon: ShoppingBag, pill: "Operando" },
          { label: "Cerrados", value: closedMerchants, icon: CirclePause, pill: "Pausados" },
          {
            label: "Config. técnica",
            value: merchantsWithMetadata,
            icon: Braces,
            pill: "Configurados",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <article className="card stat-card" key={stat.label}>
              <div className="card-header">
                <span className="icon-surface" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="pill">{stat.pill}</span>
              </div>
              <span className="stat-label">{stat.label}</span>
              <strong className="stat-value">{isLoading ? "—" : stat.value}</strong>
            </article>
          );
        })}
      </div>

      <section className="card card-lg merchants-directory-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Directorio de comercios</h2>
            <p className="muted">
              {filteredMerchants.length} resultados · administración central del sistema
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="button-tonal" onClick={openCreateModal} type="button">
              <Plus aria-hidden="true" size={17} />
              Crear comercio
            </button>
            <button
              aria-label="Actualizar comercios"
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadMerchants()}
              title="Actualizar directorio"
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={isLoading ? "spin-icon" : undefined}
                size={17}
              />
            </button>
          </div>
        </div>

        <div className="catalog-filters merchants-filters">
          <label className="field-group">
            <span className="field-label">Buscar</span>
            <span className="notification-search-control">
              <Search aria-hidden="true" size={17} />
              <input
                className="field-control"
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder="Nombre, correo o ID"
                type="search"
                value={query}
              />
            </span>
          </label>
          <label className="field-group">
            <span className="field-label">Estado</span>
            <select
              className="field-control"
              onChange={(event) => {
                setStatusFilter(event.target.value as MerchantStatusFilter);
                resetPage();
              }}
              value={statusFilter}
            >
              <option value="ALL">Todos</option>
              <option value="OPEN">Abiertos</option>
              <option value="CLOSED">Cerrados</option>
            </select>
          </label>
          <button
            className="button-secondary"
            disabled={!query && statusFilter === "ALL"}
            onClick={() => {
              setQuery("");
              setStatusFilter("ALL");
              resetPage();
            }}
            type="button"
          >
            Limpiar
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table merchants-data-table">
            <thead>
              <tr>
                <th>Comercio</th>
                <th>Contacto</th>
                <th>Envío</th>
                <th>Estado</th>
                <th>Flujo delivery</th>
                <th>Campos técnicos</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={8}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : merchantsPage.rows.length ? (
                merchantsPage.rows.map((merchant) => {
                  const isDeleting = deletingId === String(merchant.id);
                  const metadataCount = Object.keys(
                    technicalMetadata(merchant.metadata)
                  ).length;
                  return (
                    <tr key={merchant.id}>
                      <td>
                        <div className="merchants-commerce-cell">
                          <MerchantAvatar
                            className="merchants-table-avatar"
                            iconSize={17}
                            metadata={merchant.metadata}
                            name={merchantName(merchant)}
                          />
                          <div>
                            <strong>{merchantName(merchant)}</strong>
                            <span className="table-muted">ID {merchant.id}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{merchantEmail(merchant)}</strong>
                        <span className="table-muted">
                          <Mail aria-hidden="true" size={11} /> Contacto principal
                        </span>
                      </td>
                      <td>{formatMoney(merchant.deliveryCost)}</td>
                      <td>
                        <span className={`pill ${merchant.isOpen === false ? "error" : "success"}`}>
                          {merchant.isOpen === false ? "Cerrado" : "Abierto"}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${merchant.autoConfirmOrders ? "assigned" : "confirmed"}`}>
                          {merchant.autoConfirmOrders ? "Automático" : "Al preparar"}
                        </span>
                        <span className="table-muted">
                          {merchant.autoConfirmOrders
                            ? "Confirmación con demora"
                            : "Confirmación manual"}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {metadataCount} {metadataCount === 1 ? "campo" : "campos"}
                        </strong>
                        <span className="table-muted">
                          {metadataCount ? "Configuración avanzada" : "Sin datos técnicos"}
                        </span>
                      </td>
                      <td>{formatDate(merchant.updatedAt ?? merchant.createdAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            aria-label={`Editar ${merchantName(merchant)}`}
                            className="icon-button"
                            disabled={isDeleting}
                            onClick={() => openEditModal(merchant)}
                            title="Editar comercio"
                            type="button"
                          >
                            <Edit3 aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Eliminar ${merchantName(merchant)}`}
                            className="icon-button danger-button"
                            disabled={isDeleting}
                            onClick={() => void removeMerchant(merchant)}
                            title="Eliminar comercio"
                            type="button"
                          >
                            {isDeleting ? (
                              <span aria-hidden="true" className="spinner merchants-action-spinner" />
                            ) : (
                              <Trash2 aria-hidden="true" size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-table-state">
                      <Store aria-hidden="true" size={28} />
                      <strong>No hay comercios para mostrar</strong>
                      <span>
                        {query || statusFilter !== "ALL"
                          ? "Probá con otros filtros."
                          : "Creá el primer comercio para comenzar."}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={merchantsPage.currentPage}
          itemLabelPlural="comercios"
          itemLabelSingular="comercio"
          onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
          onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
          pageSize={merchantsPage.pageSize}
          totalItems={merchantsPage.totalItems}
          totalPages={merchantsPage.totalPages}
        />
      </section>

      {activeModal && typeof document !== "undefined"
        ? createPortal(
            <div className="catalog-modal-layer" data-modal-owner="merchants" role="presentation">
              <button
                aria-label="Cerrar ventana"
                className="catalog-modal-backdrop"
                disabled={isSaving}
                onClick={closeModal}
                type="button"
              />
              <section
                aria-label={activeModal === "create" ? "Crear comercio" : "Editar comercio"}
                aria-modal="true"
                className="card card-lg catalog-modal merchants-modal"
                role="dialog"
              >
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      {activeModal === "create" ? "Crear comercio" : "Editar comercio"}
                    </h2>
                    <p className="muted">
                      {activeModal === "create"
                        ? "Definí los datos operativos iniciales."
                        : `${merchantName(editingMerchant!)} · ID ${editingMerchant?.id}`}
                    </p>
                  </div>
                  <button
                    aria-label="Cerrar ventana"
                    className="icon-button"
                    disabled={isSaving}
                    onClick={closeModal}
                    type="button"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>

                <form className="catalog-form" onSubmit={submitMerchant}>
                  <div className="form-grid">
                    <label className="field-group">
                      <span className="field-label">Nombre</span>
                      <input
                        autoFocus
                        className="field-control"
                        disabled={isSaving}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Nombre del comercio"
                        required
                        value={form.name}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">Correo de contacto</span>
                      <input
                        autoComplete="email"
                        className="field-control"
                        disabled={isSaving}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            contactEmail: event.target.value,
                          }))
                        }
                        placeholder="contacto@comercio.com"
                        required
                        type="email"
                        value={form.contactEmail}
                      />
                    </label>
                  </div>
                  <div className="form-grid merchants-form-grid">
                    <label className="field-group">
                      <span className="field-label">Costo de envío (Gs.)</span>
                      <input
                        className="field-control"
                        disabled={isSaving}
                        min="0"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            deliveryCost: event.target.value,
                          }))
                        }
                        step="1"
                        type="number"
                        value={form.deliveryCost}
                      />
                    </label>
                    <label className="toggle-row merchants-open-toggle">
                      <span>
                        <strong>Comercio abierto</strong>
                        <span>Disponible para recibir pedidos.</span>
                      </span>
                      <input
                        checked={form.isOpen}
                        disabled={isSaving}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, isOpen: event.target.checked }))
                        }
                        role="switch"
                        type="checkbox"
                      />
                    </label>
                  </div>

                  <label className="toggle-row merchants-open-toggle">
                    <span>
                      <strong>Confirmación automática de delivery</strong>
                      <span>
                        Usa las demoras por defecto para confirmar y asignar. Si está apagado, se asigna al marcar el pedido preparado.
                      </span>
                    </span>
                    <input
                      checked={form.autoConfirmOrders}
                      disabled={isSaving}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          autoConfirmOrders: event.target.checked,
                        }))
                      }
                      role="switch"
                      type="checkbox"
                    />
                  </label>

                  <div className="merchants-image-field">
                    <span
                      className={`merchants-image-preview${hasPreviewImage ? " has-image" : ""}`}
                    >
                      {hasPreviewImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt="Previsualización del comercio"
                          referrerPolicy="no-referrer"
                          src={previewImageUrl}
                          onError={() => setFailedImageUrl(previewImageUrl)}
                        />
                      ) : (
                        <ImageIcon aria-hidden="true" size={24} />
                      )}
                    </span>
                    <label className="field-group">
                      <span className="field-label">URL de imagen</span>
                      <input
                        className="field-control"
                        disabled={isSaving}
                        inputMode="url"
                        onChange={(event) => {
                          setFailedImageUrl(null);
                          setForm((current) => ({
                            ...current,
                            imageUrl: event.target.value,
                          }));
                        }}
                        placeholder="https://..."
                        value={form.imageUrl}
                      />
                      <span className="muted merchants-image-hint">
                        {previewImageUrl
                          ? hasPreviewImage
                            ? "Previsualización disponible."
                            : "No se pudo previsualizar esta imagen."
                          : "Se mostrará como imagen principal del comercio."}
                      </span>
                    </label>
                  </div>

                  <details className="advanced-section merchants-technical-section">
                    <summary>
                      <span>
                        <strong>Metadata técnica</strong>
                        <span>Configuración avanzada en formato JSON.</span>
                      </span>
                      <span className="pill">
                        <Braces aria-hidden="true" size={13} />
                        Campo técnico
                      </span>
                    </summary>
                    <div className="advanced-section-content">
                      <label className="field-group">
                        <span className="field-label">Objeto JSON</span>
                        <textarea
                          className="field-control textarea-control metadata-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              metadata: event.target.value,
                            }))
                          }
                          placeholder={'{"category": "restaurant", "city": "Asunción"}'}
                          spellCheck={false}
                          value={form.metadata}
                        />
                      </label>
                      <p className="muted merchants-form-note">
                        Reservado para integraciones y configuraciones avanzadas. La imagen se gestiona arriba.
                      </p>
                    </div>
                  </details>

                  {formError ? (
                    <div className="error-box" role="alert">
                      <CircleAlert aria-hidden="true" size={17} />
                      <span>{formError}</span>
                    </div>
                  ) : null}
                  <div className="form-actions">
                    <button className="button-primary" disabled={isSaving} type="submit">
                      {isSaving ? (
                        <span aria-hidden="true" className="spinner" />
                      ) : activeModal === "create" ? (
                        <Plus aria-hidden="true" size={17} />
                      ) : (
                        <Save aria-hidden="true" size={17} />
                      )}
                      {isSaving
                        ? "Guardando…"
                        : activeModal === "create"
                          ? "Crear comercio"
                          : "Guardar cambios"}
                    </button>
                    <button
                      className="button-secondary"
                      disabled={isSaving}
                      onClick={closeModal}
                      type="button"
                    >
                      <X aria-hidden="true" size={17} />
                      Cancelar
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
