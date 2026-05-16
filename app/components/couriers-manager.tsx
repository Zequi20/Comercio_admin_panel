"use client";

import {
  CircleAlert,
  CircleCheck,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

type EntityReference = {
  id?: number | string;
  email?: string | null;
  nickname?: string | null;
  name?: string | null;
  phone?: string | null;
};

type Courier = {
  id: number | string;
  name?: string | null;
  user?: EntityReference | null;
  isActive: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

type ListCouriersResponse = {
  data?: Courier[];
};

type CourierForm = {
  email: string;
  password: string;
  name: string;
  area: string;
  vehicle: string;
  phone: string;
};

type CourierFilters = {
  q: string;
  status: StatusFilter;
};

const emptyForm: CourierForm = {
  email: "",
  password: "",
  name: "",
  area: "",
  vehicle: "",
  phone: "",
};

const initialFilters: CourierFilters = {
  q: "",
  status: "ALL",
};

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function isCourier(value: unknown): value is Courier {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "isActive" in value;
}

function readCouriers(payload: unknown): Courier[] {
  if (Array.isArray(payload)) {
    return payload.filter(isCourier);
  }

  if (payload && typeof payload === "object") {
    const data = (payload as ListCouriersResponse).data;
    if (Array.isArray(data)) {
      return data.filter(isCourier);
    }
  }

  return [];
}

function buildCouriersUrl() {
  return "/api/couriers?limit=100";
}

function formatDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

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

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function courierDisplayName(courier: Courier) {
  return (
    courier.name ??
    courier.user?.name ??
    courier.user?.nickname ??
    courier.user?.email ??
    `Repartidor #${courier.id}`
  );
}

function courierUserDetail(courier: Courier) {
  const user = courier.user;

  if (user?.email) {
    return user.email;
  }

  return user?.id ? `Usuario #${user.id}` : "Sin usuario expandido";
}

function courierPhone(courier: Courier) {
  return metadataText(courier.metadata, "phone") || courier.user?.phone || "";
}

function courierMatchesQuery(courier: Courier, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  const searchable = [
    courier.id,
    courier.name,
    courier.user?.id,
    courier.user?.email,
    courier.user?.nickname,
    courier.user?.name,
    courier.user?.phone,
    metadataText(courier.metadata, "area"),
    metadataText(courier.metadata, "vehicle"),
    metadataText(courier.metadata, "phone"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(normalized);
}

function courierToForm(courier: Courier): CourierForm {
  return {
    email: courier.user?.email ?? "",
    password: "",
    name: courier.name ?? "",
    area: metadataText(courier.metadata, "area"),
    vehicle: metadataText(courier.metadata, "vehicle"),
    phone: courierPhone(courier),
  };
}

function formMetadata(form: CourierForm) {
  const metadata: Record<string, string> = {};

  if (form.area.trim()) {
    metadata.area = form.area.trim();
  }

  if (form.vehicle.trim()) {
    metadata.vehicle = form.vehicle.trim();
  }

  if (form.phone.trim()) {
    metadata.phone = form.phone.trim();
  }

  return metadata;
}

export function CouriersManager() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [form, setForm] = useState<CourierForm>(emptyForm);
  const [filters, setFilters] = useState<CourierFilters>(initialFilters);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCourierId, setPendingCourierId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const visibleCouriers = useMemo(
    () =>
      couriers.filter((courier) => {
        const matchesStatus =
          filters.status === "ALL" ||
          (filters.status === "ACTIVE" && courier.isActive) ||
          (filters.status === "INACTIVE" && !courier.isActive);

        return matchesStatus && courierMatchesQuery(courier, filters.q);
      }),
    [couriers, filters.q, filters.status]
  );

  const activeCount = useMemo(
    () => couriers.filter((courier) => courier.isActive).length,
    [couriers]
  );

  async function loadCouriers() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(buildCouriersUrl(), {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo cargar la lista de repartidores.")
        );
      }

      setCouriers(readCouriers(payload));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la lista de repartidores."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialCouriers() {
      try {
        const response = await fetch(buildCouriersUrl(), {
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            messageFromPayload(
              payload,
              "No se pudo cargar la lista de repartidores."
            )
          );
        }

        if (!ignore) {
          setCouriers(readCouriers(payload));
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la lista de repartidores."
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialCouriers();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isFormOpen);

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isFormOpen]);

  function updateForm<K extends keyof CourierForm>(
    key: K,
    value: CourierForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingCourier(null);
    setForm(emptyForm);
  }

  function openCreateForm() {
    resetForm();
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  function openEditForm(courier: Courier) {
    setEditingCourier(courier);
    setForm(courierToForm(courier));
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  function closeFormModal() {
    if (isSubmitting) return;
    resetForm();
    setError(null);
    setIsFormOpen(false);
  }

  function validateForm() {
    if (!form.name.trim()) {
      return "Ingresá el nombre del repartidor.";
    }

    if (!editingCourier) {
      if (!form.email.trim()) {
        return "Ingresá el email del usuario repartidor.";
      }

      if (!form.password || form.password.length < 8) {
        return "La contraseña debe tener al menos 8 caracteres.";
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      ...(!editingCourier
        ? {
            email: form.email.trim(),
            password: form.password,
            nickname: form.name.trim(),
            ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          }
        : {}),
      name: form.name.trim(),
      metadata: formMetadata(form),
    };

    setIsSubmitting(true);

    try {
      const endpoint = editingCourier
        ? `/api/couriers/${encodeURIComponent(String(editingCourier.id))}`
        : "/api/couriers";
      const response = await fetch(endpoint, {
        method: editingCourier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            responsePayload,
            editingCourier
              ? "No se pudo actualizar el repartidor."
              : "No se pudo crear el repartidor."
          )
        );
      }

      resetForm();
      setIsFormOpen(false);
      setSuccess(
        editingCourier
          ? "Repartidor actualizado correctamente."
          : "Repartidor creado correctamente."
      );
      await loadCouriers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el repartidor."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
  }

  async function handleDelete(courier: Courier) {
    const confirmed = window.confirm(
      `¿Eliminar "${courierDisplayName(courier)}" de repartidores?`
    );

    if (!confirmed) return;

    setPendingCourierId(String(courier.id));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/couriers/${encodeURIComponent(String(courier.id))}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          messageFromPayload(payload, "No se pudo eliminar el repartidor.")
        );
      }

      if (editingCourier?.id === courier.id) {
        resetForm();
        setIsFormOpen(false);
      }

      setSuccess("Repartidor eliminado correctamente.");
      await loadCouriers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el repartidor."
      );
    } finally {
      setPendingCourierId(null);
    }
  }

  return (
    <div className="catalog-layout">
      <section className="card card-lg catalog-table-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Tabla de repartidores</h2>
            <p className="muted">
              {visibleCouriers.length} repartidores · {activeCount} activos
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              className="button-tonal"
              onClick={openCreateForm}
              type="button"
            >
              <Plus size={17} />
              Agregar
            </button>
            <button
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadCouriers()}
              title="Actualizar tabla"
              type="button"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {!isFormOpen && error ? (
          <div className="error-box catalog-status-message" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {!isFormOpen && success ? (
          <div className="success-box catalog-status-message" role="status">
            <CircleCheck aria-hidden="true" size={18} />
            <span>{success}</span>
          </div>
        ) : null}

        <form
          className="catalog-filters couriers-filters"
          onSubmit={handleFilterSubmit}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="couriers-search">
              Buscar
            </label>
            <input
              className="field-control"
              id="couriers-search"
              placeholder="Nombre, usuario, zona o teléfono"
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="couriers-filter-status">
              Estado
            </label>
            <select
              className="field-control"
              id="couriers-filter-status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as StatusFilter,
                }))
              }
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </div>
          <button className="button-tonal" disabled={isLoading} type="submit">
            <Search size={17} />
            Filtrar
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table couriers-data-table">
            <thead>
              <tr>
                <th>Repartidor</th>
                <th>Usuario</th>
                <th>Estado</th>
                <th>Zona</th>
                <th>Vehículo</th>
                <th>Contacto</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={8}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : visibleCouriers.length ? (
                visibleCouriers.map((courier) => {
                  const isPending = pendingCourierId === String(courier.id);
                  const area = metadataText(courier.metadata, "area");
                  const vehicle = metadataText(courier.metadata, "vehicle");
                  const phone = courierPhone(courier);

                  return (
                    <tr key={courier.id}>
                      <td>
                        <strong>{courierDisplayName(courier)}</strong>
                        <span className="table-muted">ID {courier.id}</span>
                      </td>
                      <td>
                        <strong>
                          {courier.user?.nickname ??
                            courier.user?.name ??
                            `Usuario #${courier.user?.id ?? "-"}`}
                        </strong>
                        <span className="table-muted">
                          {courierUserDetail(courier)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            courier.isActive ? "pill success" : "pill pending"
                          }
                        >
                          {courier.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>{area || "Sin zona"}</td>
                      <td>{vehicle || "Sin vehículo"}</td>
                      <td>{phone || "Sin teléfono"}</td>
                      <td>{formatDate(courier.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            disabled={isPending}
                            onClick={() => openEditForm(courier)}
                            title="Editar"
                            type="button"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            className="icon-button danger-button"
                            disabled={isPending}
                            onClick={() => void handleDelete(courier)}
                            title="Eliminar"
                            type="button"
                          >
                            <Trash2 size={17} />
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
                      <Truck aria-hidden="true" size={26} />
                      <strong>Sin repartidores registrados</strong>
                      <span>Creá un perfil o ajustá los filtros.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar formulario"
            className="catalog-modal-backdrop"
            disabled={isSubmitting}
            onClick={closeFormModal}
            type="button"
          />
          <section
            aria-label={editingCourier ? "Editar repartidor" : "Nuevo repartidor"}
            aria-modal="true"
            className="card card-lg catalog-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {editingCourier
                    ? `Editar ${courierDisplayName(editingCourier)}`
                    : "Nuevo repartidor"}
                </h2>
                <p className="muted">
                  {editingCourier
                    ? "Perfil operativo asociado a un usuario courier."
                    : "Creá la cuenta courier y su perfil operativo."}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isSubmitting}
                onClick={closeFormModal}
                title="Cerrar formulario"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleSubmit}>
              {!editingCourier ? (
                <div className="form-grid">
                  <div className="field-group">
                    <label className="field-label" htmlFor="courier-email">
                      Email
                    </label>
                    <input
                      autoComplete="email"
                      className="field-control"
                      disabled={isSubmitting}
                      id="courier-email"
                      placeholder="repartidor@email.com"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        updateForm("email", event.target.value)
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="courier-password">
                      Contraseña
                    </label>
                    <input
                      autoComplete="new-password"
                      className="field-control"
                      disabled={isSubmitting}
                      id="courier-password"
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        updateForm("password", event.target.value)
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="field-group">
                <label className="field-label" htmlFor="courier-name">
                  Nombre visible
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="courier-name"
                  placeholder="Nombre del repartidor"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                />
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="courier-area">
                    Zona
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="courier-area"
                    placeholder="Centro, barrio o cobertura"
                    value={form.area}
                    onChange={(event) => updateForm("area", event.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="courier-vehicle">
                    Vehículo
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="courier-vehicle"
                    placeholder="Moto, bici, auto"
                    value={form.vehicle}
                    onChange={(event) => updateForm("vehicle", event.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="courier-phone">
                  Teléfono operativo
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="courier-phone"
                  inputMode="tel"
                  placeholder="+595..."
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                />
              </div>

              {editingCourier ? (
                <div className="metadata-empty-state">
                  Usuario: {courierUserDetail(editingCourier)} · Estado actual:{" "}
                  {editingCourier.isActive ? "Activo" : "Inactivo"}
                </div>
              ) : null}

              {error ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  className="button-primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="spinner" />
                      Guardando
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      {editingCourier ? "Actualizar" : "Guardar"}
                    </>
                  )}
                </button>
                <button
                  className="button-secondary"
                  disabled={isSubmitting}
                  onClick={closeFormModal}
                  type="button"
                >
                  <X size={17} />
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
