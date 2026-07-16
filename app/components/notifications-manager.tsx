"use client";

import {
  BellRing,
  Check,
  CircleAlert,
  CircleCheck,
  Info,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Truck,
  UserRoundSearch,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  MAX_NOTIFICATION_BODY_LENGTH,
  MAX_NOTIFICATION_RECIPIENTS,
  MAX_NOTIFICATION_TITLE_LENGTH,
} from "@/app/lib/api/notifications";

type UserRole = "ADMIN" | "MERCHANT" | "COURIER" | "CUSTOMER";
type AppRole = "ALL" | "CUSTOMER" | "COURIER";
type AudienceMode = "SELECTED" | "CUSTOMERS" | "COURIERS" | "ALL_APPS";

type DirectoryUser = {
  id: number;
  email: string;
  nickname?: string | null;
  phone?: string | null;
  isActive: boolean;
  roles: UserRole[];
  merchant?: { id?: number | string; name?: string | null } | null;
  courier?: { id?: number | string; name?: string | null } | null;
};

type DirectoryResponse = {
  data?: DirectoryUser[];
  truncated?: boolean;
  message?: string;
};

type SendResponse = {
  status?: "queued" | "partial" | "failed";
  attempted?: number;
  queued?: number;
  failed?: number;
  failedUserIds?: number[];
  message?: string;
};

const audienceLabels: Record<AudienceMode, string> = {
  SELECTED: "Selección manual",
  CUSTOMERS: "Clientes",
  COURIERS: "Repartidores",
  ALL_APPS: "Ambas apps",
};

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasRole(user: DirectoryUser, role: UserRole) {
  return user.roles?.includes(role) ?? false;
}

function isAppUser(user: DirectoryUser) {
  return hasRole(user, "CUSTOMER") || hasRole(user, "COURIER");
}

function userName(user: DirectoryUser) {
  return (
    user.nickname?.trim() ||
    user.courier?.name?.trim() ||
    user.email?.trim() ||
    `Usuario #${user.id}`
  );
}

function userInitial(user: DirectoryUser) {
  return userName(user).slice(0, 1).toUpperCase() || "U";
}

function userMatchesSearch(user: DirectoryUser, query: string) {
  if (!query) return true;

  const haystack = normalizeSearch(
    [
      user.id,
      user.nickname,
      user.email,
      user.phone,
      user.courier?.name,
      user.merchant?.name,
    ].join(" ")
  );

  return haystack.includes(query);
}

function parseOptionalData(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Los datos opcionales deben contener JSON válido.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Los datos opcionales deben ser un objeto JSON.");
  }

  const data: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry !== "string") {
      throw new Error(`El campo data.${key} debe ser texto.`);
    }
    data[key] = entry;
  }

  return data;
}

function responseMessage(payload: SendResponse | null, fallback: string) {
  return payload?.message?.trim() || fallback;
}

export function NotificationsManager() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [audience, setAudience] = useState<AudienceMode>("SELECTED");
  const [roleFilter, setRoleFilter] = useState<AppRole>("ALL");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dataJson, setDataJson] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [directoryTruncated, setDirectoryTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications/users", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as
        | DirectoryResponse
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.message ?? "No se pudo cargar el directorio de usuarios."
        );
      }

      const nextUsers = (payload?.data ?? []).filter(
        (user) => Number.isSafeInteger(Number(user.id)) && isAppUser(user)
      );
      setUsers(nextUsers);
      setDirectoryTruncated(Boolean(payload?.truncated));
      setSelectedIds((current) => {
        const validIds = new Set(
          nextUsers.filter((user) => user.isActive).map((user) => user.id)
        );
        return new Set(Array.from(current).filter((id) => validIds.has(id)));
      });
    } catch (loadError) {
      setUsers([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el directorio de usuarios."
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadInitialUsers() {
      try {
        const response = await fetch("/api/notifications/users", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json().catch(() => null)) as
          | DirectoryResponse
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.message ?? "No se pudo cargar el directorio de usuarios."
          );
        }

        if (!ignore) {
          setUsers(
            (payload?.data ?? []).filter(
              (user) =>
                Number.isSafeInteger(Number(user.id)) && isAppUser(user)
            )
          );
          setDirectoryTruncated(Boolean(payload?.truncated));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el directorio de usuarios."
          );
        }
      } finally {
        if (!ignore) setIsLoadingUsers(false);
      }
    }

    void loadInitialUsers();

    return () => {
      ignore = true;
    };
  }, []);

  const activeAppUsers = useMemo(
    () => users.filter((user) => user.isActive && isAppUser(user)),
    [users]
  );

  const customerCount = useMemo(
    () => activeAppUsers.filter((user) => hasRole(user, "CUSTOMER")).length,
    [activeAppUsers]
  );
  const courierCount = useMemo(
    () => activeAppUsers.filter((user) => hasRole(user, "COURIER")).length,
    [activeAppUsers]
  );

  const normalizedQuery = normalizeSearch(query);
  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        if (roleFilter !== "ALL" && !hasRole(user, roleFilter)) return false;
        return userMatchesSearch(user, normalizedQuery);
      })
      .sort((left, right) => {
        if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
        return userName(left).localeCompare(userName(right), "es");
      });
  }, [normalizedQuery, roleFilter, users]);

  const displayedUsers = filteredUsers.slice(0, 100);

  const recipientIds = useMemo(() => {
    if (audience === "SELECTED") {
      return Array.from(selectedIds);
    }

    return activeAppUsers
      .filter((user) => {
        if (audience === "CUSTOMERS") return hasRole(user, "CUSTOMER");
        if (audience === "COURIERS") return hasRole(user, "COURIER");
        return true;
      })
      .map((user) => user.id);
  }, [activeAppUsers, audience, selectedIds]);

  const recipientIdSet = useMemo(() => new Set(recipientIds), [recipientIds]);
  const recipientCount = recipientIds.length;
  const exceedsSendLimit = recipientCount > MAX_NOTIFICATION_RECIPIENTS;

  const targetAppLabel = useMemo(() => {
    if (audience === "CUSTOMERS") return "Pedidos App";
    if (audience === "COURIERS") return "Pedidos Repartidor";
    if (audience === "ALL_APPS") return "Pedidos App + Repartidor";

    const selectedUsers = activeAppUsers.filter((user) =>
      selectedIds.has(user.id)
    );
    const includesCustomers = selectedUsers.some((user) =>
      hasRole(user, "CUSTOMER")
    );
    const includesCouriers = selectedUsers.some((user) =>
      hasRole(user, "COURIER")
    );

    if (includesCustomers && includesCouriers) return "Ambas apps";
    if (includesCouriers) return "Pedidos Repartidor";
    if (includesCustomers) return "Pedidos App";
    return "App de destino";
  }, [activeAppUsers, audience, selectedIds]);

  function chooseAudience(value: AudienceMode) {
    setAudience(value);
    if (value === "CUSTOMERS") setRoleFilter("CUSTOMER");
    if (value === "COURIERS") setRoleFilter("COURIER");
    if (value === "ALL_APPS") setRoleFilter("ALL");
    setError(null);
    setSuccess(null);
  }

  function toggleUser(user: DirectoryUser) {
    if (!user.isActive || audience !== "SELECTED") return;

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(user.id)) {
        next.delete(user.id);
      } else if (next.size < MAX_NOTIFICATION_RECIPIENTS) {
        next.add(user.id);
      } else {
        setError(
          `Podés seleccionar hasta ${MAX_NOTIFICATION_RECIPIENTS} usuarios por envío.`
        );
      }
      return next;
    });
  }

  function selectFilteredUsers() {
    const resultIds = filteredUsers
      .filter((user) => user.isActive)
      .map((user) => user.id);

    setSelectedIds((current) => {
      const combined = Array.from(new Set([...current, ...resultIds]));
      if (combined.length > MAX_NOTIFICATION_RECIPIENTS) {
        setError(
          `La selección se limitó a ${MAX_NOTIFICATION_RECIPIENTS} usuarios. Refiná la búsqueda para otro envío.`
        );
      }
      return new Set(combined.slice(0, MAX_NOTIFICATION_RECIPIENTS));
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!recipientCount) {
      setError("Seleccioná al menos un destinatario activo.");
      return;
    }

    if (exceedsSendLimit) {
      setError(
        `Este segmento tiene ${recipientCount} usuarios. El máximo por envío es ${MAX_NOTIFICATION_RECIPIENTS}.`
      );
      return;
    }

    if (!trimmedTitle || !trimmedBody) {
      setError("Completá el título y el cuerpo de la notificación.");
      return;
    }

    let data: Record<string, string> | undefined;
    try {
      data = parseOptionalData(dataJson);
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Los datos opcionales no son válidos."
      );
      return;
    }

    const confirmed = window.confirm(
      `¿Encolar esta notificación para ${recipientCount} ${
        recipientCount === 1 ? "usuario" : "usuarios"
      } de ${audienceLabels[audience]}?`
    );
    if (!confirmed) return;

    setIsSending(true);
    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userIds: recipientIds,
          title: trimmedTitle,
          body: trimmedBody,
          ...(data ? { data } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SendResponse
        | null;

      if (!response.ok) {
        const failedCount = payload?.failed ?? recipientCount;
        throw new Error(
          responseMessage(
            payload,
            `No se pudo encolar la notificación para ${failedCount} ${
              failedCount === 1 ? "usuario" : "usuarios"
            }.`
          )
        );
      }

      const queued = payload?.queued ?? recipientCount;
      const failed = payload?.failed ?? 0;
      setSuccess(
        `${queued} ${queued === 1 ? "notificación encolada" : "notificaciones encoladas"}. El envío a FCM se procesa en segundo plano.`
      );

      if (failed > 0) {
        setError(
          `${failed} ${failed === 1 ? "destinatario no pudo" : "destinatarios no pudieron"} encolarse. Podés reintentar con una selección manual.`
        );
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "No se pudo enviar la notificación."
      );
    } finally {
      setIsSending(false);
    }
  }

  const audienceOptions: Array<{
    value: AudienceMode;
    label: string;
    description: string;
    count: number;
    icon: typeof Users;
  }> = [
    {
      value: "SELECTED",
      label: "Selección manual",
      description: "Buscá por nombre, correo, teléfono o ID.",
      count: selectedIds.size,
      icon: UserRoundSearch,
    },
    {
      value: "CUSTOMERS",
      label: "Clientes",
      description: "Usuarios activos de Pedidos App.",
      count: customerCount,
      icon: Smartphone,
    },
    {
      value: "COURIERS",
      label: "Repartidores",
      description: "Usuarios activos de Pedidos Repartidor.",
      count: courierCount,
      icon: Truck,
    },
    {
      value: "ALL_APPS",
      label: "Ambas apps",
      description: "Clientes y repartidores, sin duplicados.",
      count: activeAppUsers.length,
      icon: Users,
    },
  ];

  return (
    <div className="notifications-manager">
      {error ? (
        <div className="error-box notification-global-message" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div
          className="success-box notification-global-message"
          role="status"
        >
          <CircleCheck aria-hidden="true" size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      <section className="card card-lg notification-audience-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">1. Elegí los destinatarios</h2>
            <p className="muted">
              Usá un segmento por app o armá una selección precisa.
            </p>
          </div>
          <button
            aria-label="Actualizar directorio"
            className="icon-button"
            disabled={isLoadingUsers}
            onClick={() => void loadUsers()}
            title="Actualizar directorio"
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={isLoadingUsers ? "spin-icon" : undefined}
              size={17}
            />
          </button>
        </div>

        <div className="notification-audience-grid">
          {audienceOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = audience === option.value;

            return (
              <label
                className={
                  isSelected
                    ? "notification-audience-option active"
                    : "notification-audience-option"
                }
                key={option.value}
              >
                <input
                  checked={isSelected}
                  name="notification-audience"
                  onChange={() => chooseAudience(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span className="notification-audience-icon">
                  <Icon aria-hidden="true" size={19} />
                </span>
                <span className="notification-audience-copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                <span className="notification-audience-count">{option.count}</span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="notifications-workspace">
        <section className="card card-lg notification-directory-card">
          <div className="card-header notification-directory-header">
            <div>
              <h2 className="card-title">Directorio de las apps</h2>
              <p className="muted">
                {isLoadingUsers
                  ? "Cargando usuarios…"
                  : `${activeAppUsers.length} usuarios activos disponibles`}
              </p>
            </div>
            {audience === "SELECTED" ? (
              <div className="dashboard-actions">
                <button
                  className="button-tonal"
                  disabled={!filteredUsers.some((user) => user.isActive)}
                  onClick={selectFilteredUsers}
                  type="button"
                >
                  <Check size={15} />
                  Seleccionar resultados
                </button>
                <button
                  className="button-secondary"
                  disabled={!selectedIds.size}
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  Limpiar
                </button>
              </div>
            ) : null}
          </div>

          <div className="notification-directory-tools">
            <label className="field-group">
              <span className="field-label">Buscar usuario</span>
              <span className="notification-search-control">
                <Search aria-hidden="true" size={17} />
                <input
                  className="field-control"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nombre, correo, teléfono o ID"
                  type="search"
                  value={query}
                />
              </span>
            </label>
            <label className="field-group">
              <span className="field-label">Tipo de usuario</span>
              <select
                className="field-control"
                onChange={(event) =>
                  setRoleFilter(event.target.value as AppRole)
                }
                value={roleFilter}
              >
                <option value="ALL">Clientes y repartidores</option>
                <option value="CUSTOMER">Clientes · Pedidos App</option>
                <option value="COURIER">Repartidores · Pedidos Repartidor</option>
              </select>
            </label>
          </div>

          {directoryTruncated ? (
            <div className="notification-info-box" role="note">
              <Info aria-hidden="true" size={16} />
              <span>
                El directorio es muy grande y se mostró una parte. Refiná el
                envío o dividilo en lotes.
              </span>
            </div>
          ) : null}

          <div className="notification-user-list" aria-live="polite">
            {isLoadingUsers ? (
              Array.from({ length: 6 }).map((_, index) => (
                <span className="skeleton notification-user-skeleton" key={index} />
              ))
            ) : displayedUsers.length ? (
              displayedUsers.map((user) => {
                const isTargeted = recipientIdSet.has(user.id);
                const isManuallySelectable =
                  audience === "SELECTED" && user.isActive;

                return (
                  <label
                    className={[
                      "notification-user-row",
                      audience !== "SELECTED" ? "segment" : "",
                      isTargeted ? "targeted" : "",
                      !user.isActive ? "inactive" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={user.id}
                  >
                    {audience === "SELECTED" ? (
                      <input
                        checked={isTargeted}
                        disabled={!isManuallySelectable}
                        onChange={() => toggleUser(user)}
                        type="checkbox"
                      />
                    ) : (
                      <span
                        aria-label={
                          isTargeted
                            ? "Incluido en el segmento"
                            : "Fuera del segmento"
                        }
                        className={
                          isTargeted
                            ? "notification-target-indicator active"
                            : "notification-target-indicator"
                        }
                      >
                        {isTargeted ? <Check aria-hidden="true" size={13} /> : null}
                      </span>
                    )}
                    <span className="notification-user-avatar">
                      {userInitial(user)}
                    </span>
                    <span className="notification-user-copy">
                      <strong>{userName(user)}</strong>
                      <span>
                        {user.email} · ID {user.id}
                        {user.phone ? ` · ${user.phone}` : ""}
                      </span>
                      <span className="notification-user-tags">
                        {hasRole(user, "CUSTOMER") ? (
                          <span className="pill">Pedidos App</span>
                        ) : null}
                        {hasRole(user, "COURIER") ? (
                          <span className="pill assigned">Pedidos Repartidor</span>
                        ) : null}
                        {!user.isActive ? (
                          <span className="pill error">Inactivo</span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="empty-table-state notification-directory-empty">
                <UserRoundSearch aria-hidden="true" size={25} />
                <strong>Sin coincidencias</strong>
                <span>Probá con otro nombre, correo, teléfono, ID o tipo.</span>
              </div>
            )}
          </div>

          {!isLoadingUsers && filteredUsers.length > displayedUsers.length ? (
            <p className="notification-results-note">
              Se muestran 100 de {filteredUsers.length} coincidencias. Refiná la
              búsqueda para ubicar un usuario específico.
            </p>
          ) : null}
        </section>

        <div className="notification-composer-column">
          <section className="card card-lg notification-composer-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">2. Prepará el mensaje</h2>
                <p className="muted">
                  {recipientCount} {recipientCount === 1 ? "destinatario" : "destinatarios"}
                  {` · ${targetAppLabel}`}
                </p>
              </div>
              <span className="notification-fcm-badge">
                <BellRing aria-hidden="true" size={14} />
                FCM
              </span>
            </div>

            <form className="notification-form" onSubmit={handleSubmit}>
              <label className="field-group">
                <span className="field-label-row">
                  <span className="field-label">Título</span>
                  <span className="notification-character-count">
                    {title.length}/{MAX_NOTIFICATION_TITLE_LENGTH}
                  </span>
                </span>
                <input
                  className="field-control"
                  maxLength={MAX_NOTIFICATION_TITLE_LENGTH}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej.: Tu pedido está listo"
                  required
                  value={title}
                />
              </label>

              <label className="field-group">
                <span className="field-label-row">
                  <span className="field-label">Cuerpo</span>
                  <span className="notification-character-count">
                    {body.length}/{MAX_NOTIFICATION_BODY_LENGTH}
                  </span>
                </span>
                <textarea
                  className="field-control textarea-control notification-body-control"
                  maxLength={MAX_NOTIFICATION_BODY_LENGTH}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Escribí un mensaje claro y breve."
                  required
                  rows={5}
                  value={body}
                />
              </label>

              <details className="advanced-section notification-data-section">
                <summary>
                  <span>
                    <strong>Datos opcionales</strong>
                    <span>JSON para funciones reconocidas por las apps.</span>
                  </span>
                  <span className="pill">Avanzado</span>
                </summary>
                <div className="notification-data-content">
                  <textarea
                    className="field-control textarea-control metadata-control"
                    onChange={(event) => setDataJson(event.target.value)}
                    placeholder={'{"screen":"orders","orderId":"123"}'}
                    rows={4}
                    value={dataJson}
                  />
                  <p className="muted">
                    Todas las claves y valores deben ser texto. Sólo agregá
                    campos que las apps sepan interpretar.
                  </p>
                </div>
              </details>

              <div className="notification-preview" aria-label="Vista previa">
                <div className="notification-preview-topline">
                  <span className="notification-preview-app">
                    <BellRing aria-hidden="true" size={14} />
                    {targetAppLabel}
                  </span>
                  <span>ahora</span>
                </div>
                <strong>{title.trim() || "Título de la notificación"}</strong>
                <p>{body.trim() || "El cuerpo del mensaje aparecerá aquí."}</p>
              </div>

              {exceedsSendLimit ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={17} />
                  <span>
                    El segmento supera el máximo de {MAX_NOTIFICATION_RECIPIENTS}
                    usuarios. Usá la selección manual para dividirlo.
                  </span>
                </div>
              ) : null}

              <button
                className="button-primary notification-send-button"
                disabled={
                  isSending ||
                  isLoadingUsers ||
                  !recipientCount ||
                  exceedsSendLimit
                }
                type="submit"
              >
                {isSending ? (
                  <span aria-hidden="true" className="spinner" />
                ) : (
                  <Send aria-hidden="true" size={17} />
                )}
                {isSending
                  ? "Encolando…"
                  : `Enviar a ${recipientCount} ${
                      recipientCount === 1 ? "usuario" : "usuarios"
                    }`}
              </button>
            </form>
          </section>

          <aside className="notification-delivery-help" role="note">
            <Info aria-hidden="true" size={18} />
            <div>
              <strong>Cómo funciona la entrega</strong>
              <span>
                La solicitud se encola por usuario. El sistema sólo podrá entregarla si
                ese usuario inició sesión en la app y tiene un token vigente.
                “Encolada” no confirma la recepción en el dispositivo.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
