"use client";

import {
  Check,
  CircleAlert,
  CircleCheck,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateRows,
  TablePagination,
  type TablePaginationState,
} from "@/app/components/table-pagination";
import { confirmFormClose } from "@/app/lib/confirm-dialog-close";
import {
  MANAGED_USER_ROLES,
  managedUserPermissionNames,
  managedUserRoleNames,
  type ManagedUser,
  type ManagedUserRole,
} from "@/app/lib/auth/managed-users";
import type { MerchantDetails } from "@/app/lib/auth/types";

type UserFilters = {
  query: string;
  role: "ALL" | ManagedUserRole;
  status: "ALL" | "ACTIVE" | "INACTIVE";
};

type CreateUserForm = {
  email: string;
  nickname: string;
  password: string;
  phone: string;
  role: ManagedUserRole;
  merchantId: string;
};

type EditUserForm = {
  email: string;
  nickname: string;
  phone: string;
};

type UsersResponse = {
  data?: ManagedUser[];
  truncated?: boolean;
};

type ActiveModal = "create" | "edit" | null;

async function requestUsersDirectory() {
  const response = await fetch("/api/users", { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as
    | UsersResponse
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      messageFromPayload(payload, "No se pudo cargar el directorio de usuarios.")
    );
  }

  return {
    data: (payload as UsersResponse | null)?.data ?? [],
    truncated: Boolean((payload as UsersResponse | null)?.truncated),
  };
}

const initialFilters: UserFilters = {
  query: "",
  role: "ALL",
  status: "ALL",
};

const emptyCreateForm: CreateUserForm = {
  email: "",
  nickname: "",
  password: "",
  phone: "",
  role: "MERCHANT",
  merchantId: "",
};

const emptyEditForm: EditUserForm = {
  email: "",
  nickname: "",
  phone: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function userName(user: ManagedUser) {
  return user.nickname?.trim() || user.email?.trim() || `Usuario #${user.id}`;
}

function userMerchantName(user: ManagedUser) {
  return (
    user.merchant?.name?.trim() ||
    user.merchant?.email?.trim() ||
    (user.merchant?.id !== undefined
      ? `Comercio #${user.merchant.id}`
      : user.merchantId !== undefined && user.merchantId !== null
        ? `Comercio #${user.merchantId}`
        : "Sin comercio asociado")
  );
}

function userIsActive(user: ManagedUser) {
  if (typeof user.isActive === "boolean") return user.isActive;
  const status = user.status?.trim().toLowerCase();
  if (["active", "enabled", "activo"].includes(status ?? "")) return true;
  if (["inactive", "disabled", "inactivo", "suspended"].includes(status ?? "")) {
    return false;
  }
  return undefined;
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

function rolePillClass(role: string) {
  if (role === "ADMIN") return "error";
  if (role === "MERCHANT") return "assigned";
  if (role === "COURIER") return "confirmed";
  if (role === "CUSTOMER") return "success";
  return "";
}

function merchantLabel(merchant: MerchantDetails) {
  return (
    merchant.name?.trim() ||
    merchant.contactEmail?.trim() ||
    merchant.email?.trim() ||
    `Comercio #${merchant.id}`
  );
}

function MerchantCombobox({
  disabled,
  inputId,
  isLoading,
  merchants,
  onChange,
  value,
}: {
  disabled: boolean;
  inputId: string;
  isLoading: boolean;
  merchants: MerchantDetails[];
  onChange: (merchantId: string) => void;
  value: string;
}) {
  const comboboxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedMerchant =
    merchants.find((merchant) => String(merchant.id) === value) ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [optionsStyle, setOptionsStyle] = useState<CSSProperties>({});
  const [query, setQuery] = useState(
    selectedMerchant ? merchantLabel(selectedMerchant) : ""
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const selectedLabel = selectedMerchant ? merchantLabel(selectedMerchant) : "";
  const isShowingSelectedValue =
    Boolean(value) && normalizedQuery === selectedLabel.toLocaleLowerCase("es");
  const visibleMerchants = useMemo(() => {
    const matches = normalizedQuery && !isShowingSelectedValue
      ? merchants.filter((merchant) =>
          [merchant.id, merchant.name, merchant.contactEmail, merchant.email]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("es")
            .includes(normalizedQuery)
        )
      : merchants;
    return matches.slice(0, 30);
  }, [isShowingSelectedValue, merchants, normalizedQuery]);

  const updateOptionsPosition = useCallback(() => {
    const combobox = comboboxRef.current;
    if (!combobox) return;

    const rect = combobox.getBoundingClientRect();
    const viewportPadding = 12;
    const panelGap = 6;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const opensAbove = availableBelow < 220 && availableAbove > availableBelow;
    const availableHeight = opensAbove ? availableAbove : availableBelow;
    const maxHeight = Math.min(300, Math.max(120, availableHeight - panelGap));
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - viewportPadding - width
    );

    setOptionsStyle({
      bottom: opensAbove
        ? window.innerHeight - rect.top + panelGap
        : undefined,
      left,
      maxHeight,
      right: "auto",
      top: opensAbove ? undefined : rect.bottom + panelGap,
      width,
    });
  }, [setOptionsStyle]);

  useEffect(() => {
    if (!isOpen) return;

    updateOptionsPosition();
    window.addEventListener("resize", updateOptionsPosition);
    window.addEventListener("scroll", updateOptionsPosition, true);

    return () => {
      window.removeEventListener("resize", updateOptionsPosition);
      window.removeEventListener("scroll", updateOptionsPosition, true);
    };
  }, [isOpen, updateOptionsPosition]);

  function openOptions() {
    if (disabled || isLoading) return;
    updateOptionsPosition();
    setActiveIndex(
      Math.max(
        0,
        visibleMerchants.findIndex(
          (merchant) => String(merchant.id) === value
        )
      )
    );
    setIsOpen(true);
  }

  function closeOptions() {
    setIsOpen(false);
    setQuery(selectedMerchant ? merchantLabel(selectedMerchant) : "");
  }

  function selectMerchant(merchant: MerchantDetails) {
    onChange(String(merchant.id));
    setQuery(merchantLabel(merchant));
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      closeOptions();
      return;
    }

    if (event.key === "Tab") {
      closeOptions();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openOptions();
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!visibleMerchants.length) return 0;
        return (current + direction + visibleMerchants.length) % visibleMerchants.length;
      });
      return;
    }

    if (event.key === "Enter" && isOpen && visibleMerchants[activeIndex]) {
      event.preventDefault();
      selectMerchant(visibleMerchants[activeIndex]);
    }
  }

  const optionsListMaxHeight =
    typeof optionsStyle.maxHeight === "number"
      ? Math.max(100, optionsStyle.maxHeight - 12)
      : optionsStyle.maxHeight;
  const optionsPanel = isOpen && !disabled && !isLoading ? (
    <div
      className="admin-scope-options-panel user-merchant-options-panel"
      style={optionsStyle}
    >
      {visibleMerchants.length ? (
        <ul
          aria-label="Comercios disponibles"
          className="admin-scope-options"
          id={listboxId}
          role="listbox"
          style={{ maxHeight: optionsListMaxHeight }}
        >
          {visibleMerchants.map((merchant, index) => {
            const isSelected = String(merchant.id) === value;
            const isActive = index === activeIndex;
            return (
              <li
                aria-selected={isSelected}
                className={`admin-scope-option${
                  isSelected ? " is-selected" : ""
                }${isActive ? " is-active" : ""}`}
                id={`${listboxId}-option-${index}`}
                key={merchant.id}
                onClick={() => selectMerchant(merchant)}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => event.preventDefault()}
                role="option"
              >
                <span className="admin-scope-option-icon" aria-hidden="true">
                  <Store size={15} />
                </span>
                <span className="admin-scope-option-copy">
                  <strong>{merchantLabel(merchant)}</strong>
                  <span>
                    ID {merchant.id}
                    {merchant.contactEmail ? ` · ${merchant.contactEmail}` : ""}
                  </span>
                </span>
                {isSelected ? (
                  <Check
                    aria-hidden="true"
                    className="admin-scope-option-check"
                    size={16}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="admin-scope-empty" role="status">
          <Search aria-hidden="true" size={18} />
          <span>
            <strong>Sin coincidencias</strong>
            Probá con otro nombre, correo o ID.
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="user-merchant-combobox"
      ref={comboboxRef}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        closeOptions();
      }}
    >
      <span className="notification-search-control">
        {isLoading ? (
          <span aria-hidden="true" className="spinner user-merchant-spinner" />
        ) : (
          <Search aria-hidden="true" size={17} />
        )}
        <input
          aria-activedescendant={
            isOpen && visibleMerchants[activeIndex]
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          autoComplete="off"
          className="field-control"
          disabled={disabled || isLoading}
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange("");
            setActiveIndex(0);
            updateOptionsPosition();
            setIsOpen(true);
          }}
          onClick={openOptions}
          onFocus={openOptions}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Cargando comercios…" : "Buscar comercio"}
          role="combobox"
          type="text"
          value={query}
        />
      </span>

      {optionsPanel && typeof document !== "undefined"
        ? createPortal(optionsPanel, document.body)
        : null}
    </div>
  );
}

export function UsersManager({ currentUserId }: { currentUserId?: string | null }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>(initialFilters);
  const deferredQuery = useDeferredValue(filters.query);
  const [pagination, setPagination] = useState<TablePaginationState>({
    page: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<MerchantDetails[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>(emptyEditForm);
  const [assignedRoles, setAssignedRoles] = useState<ManagedUserRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<ManagedUserRole>("MERCHANT");
  const [editError, setEditError] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [roleAction, setRoleAction] = useState<"add" | "remove" | null>(null);

  const applyUsersDirectory = useCallback(
    (directory: ManagedUser[], isTruncated: boolean) => {
      setUsers(directory);
      setTruncated(isTruncated);
      setPagination((current) => {
        const page = paginateRows(directory, current).currentPage;
        return page === current.page ? current : { ...current, page };
      });
    },
    []
  );

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const directory = await requestUsersDirectory();
      applyUsersDirectory(directory.data, directory.truncated);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar el directorio de usuarios."
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyUsersDirectory]);

  useEffect(() => {
    let isCurrent = true;

    void requestUsersDirectory()
      .then((directory) => {
        if (!isCurrent) return;
        applyUsersDirectory(directory.data, directory.truncated);
      })
      .catch((cause: unknown) => {
        if (!isCurrent) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cargar el directorio de usuarios."
        );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [applyUsersDirectory]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", activeModal !== null);
    return () => document.body.classList.remove("modal-open");
  }, [activeModal]);

  const filteredUsers = useMemo(() => {
    const query = deferredQuery.trim().toLocaleLowerCase("es");

    return users.filter((user) => {
      const roles = managedUserRoleNames(user);
      const isActive = userIsActive(user);
      const matchesRole = filters.role === "ALL" || roles.includes(filters.role);
      const matchesStatus =
        filters.status === "ALL" ||
        (filters.status === "ACTIVE" && isActive === true) ||
        (filters.status === "INACTIVE" && isActive === false);
      const matchesQuery =
        !query ||
        [
          user.id,
          user.email,
          user.nickname,
          user.phone,
          userMerchantName(user),
          ...roles,
          ...managedUserPermissionNames(user),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(query);

      return matchesRole && matchesStatus && matchesQuery;
    });
  }, [deferredQuery, filters.role, filters.status, users]);

  const usersPage = useMemo(
    () => paginateRows(filteredUsers, pagination),
    [filteredUsers, pagination]
  );
  const activeUsers = useMemo(
    () => users.filter((user) => userIsActive(user) === true).length,
    [users]
  );
  const adminUsers = useMemo(
    () => users.filter((user) => managedUserRoleNames(user).includes("ADMIN")).length,
    [users]
  );
  const affiliatedUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.merchant?.id !== undefined ||
          (user.merchantId !== undefined && user.merchantId !== null)
      ).length,
    [users]
  );

  async function loadMerchants() {
    if (isLoadingMerchants || merchants.length) return;
    setIsLoadingMerchants(true);
    setMerchantsError(null);
    try {
      const response = await fetch("/api/merchants", { credentials: "include" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: MerchantDetails[]; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudieron cargar los comercios.");
      }
      setMerchants(payload?.data ?? []);
    } catch (cause) {
      setMerchantsError(
        cause instanceof Error ? cause.message : "No se pudieron cargar los comercios."
      );
    } finally {
      setIsLoadingMerchants(false);
    }
  }

  function resetPage() {
    setPagination((current) =>
      current.page === 1 ? current : { ...current, page: 1 }
    );
  }

  function updateFilters(next: Partial<UserFilters>) {
    resetPage();
    setFilters((current) => ({ ...current, ...next }));
  }

  function openCreateModal() {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    setSuccess(null);
    setActiveModal("create");
    void loadMerchants();
  }

  function openEditModal(user: ManagedUser) {
    const roles = managedUserRoleNames(user).filter((role) =>
      MANAGED_USER_ROLES.includes(role as ManagedUserRole)
    ) as ManagedUserRole[];
    const assigned = new Set(roles);
    setEditingUser(user);
    setEditForm({
      email: user.email ?? "",
      nickname: user.nickname ?? "",
      phone: user.phone ?? "",
    });
    setAssignedRoles(roles);
    setSelectedRole(
      MANAGED_USER_ROLES.find((role) => !assigned.has(role)) ?? roles[0] ?? "MERCHANT"
    );
    setEditError(null);
    setRoleMessage(null);
    setSuccess(null);
    setActiveModal("edit");
  }

  function closeModal() {
    if (isSaving || roleAction) return;
    if (!confirmFormClose()) return;

    setActiveModal(null);
    setEditingUser(null);
    setCreateError(null);
    setEditError(null);
    setRoleMessage(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    const email = createForm.email.trim().toLowerCase();
    const nickname = createForm.nickname.trim();
    const password = createForm.password;
    const phone = createForm.phone.trim();

    if (!emailPattern.test(email)) {
      setCreateError("Ingresá un correo válido.");
      return;
    }
    if (!nickname) {
      setCreateError("Ingresá el nombre del usuario.");
      return;
    }
    if (password.length < 8) {
      setCreateError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          email,
          nickname,
          password,
          role: createForm.role,
          ...(phone ? { phone } : {}),
          ...(createForm.merchantId ? { merchantId: createForm.merchantId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(messageFromPayload(payload, "No se pudo crear el usuario."));
      }

      setActiveModal(null);
      setCreateForm(emptyCreateForm);
      setSuccess(`Usuario ${email} creado correctamente.`);
      await loadUsers();
    } catch (cause) {
      setCreateError(
        cause instanceof Error ? cause.message : "No se pudo crear el usuario."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError(null);
    if (!editingUser) return;

    const email = editForm.email.trim().toLowerCase();
    const nickname = editForm.nickname.trim();
    const phone = editForm.phone.trim();
    if (!emailPattern.test(email)) {
      setEditError("Ingresá un correo válido.");
      return;
    }

    const payload: Record<string, string | null> = {};
    if (email !== (editingUser.email ?? "").trim().toLowerCase()) payload.email = email;
    if (nickname !== (editingUser.nickname ?? "").trim()) {
      payload.nickname = nickname || null;
    }
    if (phone !== (editingUser.phone ?? "").trim()) payload.phone = phone || null;
    if (!Object.keys(payload).length) {
      setEditError("No hay cambios de datos para guardar.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(String(editingUser.id))}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          messageFromPayload(responsePayload, "No se pudo actualizar el usuario.")
        );
      }

      setActiveModal(null);
      setEditingUser(null);
      setSuccess(`Datos de ${email} actualizados correctamente.`);
      await loadUsers();
    } catch (cause) {
      setEditError(
        cause instanceof Error ? cause.message : "No se pudo actualizar el usuario."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRoleChange(mode: "add" | "remove") {
    if (!editingUser) return;
    const roleSet = new Set(assignedRoles);
    if (mode === "add" && roleSet.has(selectedRole)) {
      setRoleMessage({ kind: "error", text: "El usuario ya tiene ese rol." });
      return;
    }
    if (mode === "remove" && !roleSet.has(selectedRole)) {
      setRoleMessage({ kind: "error", text: "El usuario no tiene ese rol." });
      return;
    }
    if (mode === "remove" && roleSet.size <= 1) {
      setRoleMessage({ kind: "error", text: "No se puede quitar el último rol." });
      return;
    }
    if (
      mode === "remove" &&
      selectedRole === "ADMIN" &&
      currentUserId &&
      String(editingUser.id) === currentUserId
    ) {
      setRoleMessage({ kind: "error", text: "No podés quitar tu propio rol ADMIN." });
      return;
    }

    setRoleAction(mode);
    setRoleMessage(null);
    try {
      const response = await fetch("/api/roles/assign", {
        method: mode === "add" ? "POST" : "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingUser.id, role: selectedRole }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { user?: ManagedUser; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudo actualizar el rol.");
      }

      const nextRoles = payload?.user
        ? (managedUserRoleNames(payload.user).filter((role) =>
            MANAGED_USER_ROLES.includes(role as ManagedUserRole)
          ) as ManagedUserRole[])
        : (() => {
            const next = new Set(assignedRoles);
            if (mode === "add") next.add(selectedRole);
            else next.delete(selectedRole);
            return Array.from(next);
          })();
      setAssignedRoles(nextRoles);
      setUsers((current) =>
        current.map((user) =>
          String(user.id) === String(editingUser.id)
            ? {
                ...user,
                roles: nextRoles,
                ...(payload?.user?.permissions !== undefined
                  ? { permissions: payload.user.permissions }
                  : {}),
              }
            : user
        )
      );
      setEditingUser((current) =>
        current
          ? {
              ...current,
              roles: nextRoles,
              ...(payload?.user?.permissions !== undefined
                ? { permissions: payload.user.permissions }
                : {}),
            }
          : current
      );
      setRoleMessage({
        kind: "success",
        text:
          mode === "add"
            ? `Rol ${selectedRole} asignado.`
            : `Rol ${selectedRole} retirado.`,
      });
    } catch (cause) {
      setRoleMessage({
        kind: "error",
        text: cause instanceof Error ? cause.message : "No se pudo actualizar el rol.",
      });
    } finally {
      setRoleAction(null);
    }
  }

  async function toggleUserStatus(user: ManagedUser) {
    const isActive = userIsActive(user);
    if (isActive === undefined) {
      setError("No se pudo determinar el estado actual del usuario.");
      return;
    }
    const isSelf = currentUserId && String(user.id) === currentUserId;
    if (isActive && isSelf) {
      setError("No podés desactivar tu propia cuenta administrativa.");
      return;
    }
    const action = isActive ? "desactivar" : "reactivar";
    if (!window.confirm(`¿Querés ${action} a ${userName(user)}?`)) return;

    setPendingUserId(String(user.id));
    setError(null);
    setSuccess(null);
    try {
      const endpoint = isActive
        ? `/api/users/${encodeURIComponent(String(user.id))}`
        : `/api/users/${encodeURIComponent(String(user.id))}/reactivate`;
      const response = await fetch(endpoint, {
        method: isActive ? "DELETE" : "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(messageFromPayload(payload, `No se pudo ${action} el usuario.`));
      }
      setSuccess(`Usuario ${isActive ? "desactivado" : "reactivado"} correctamente.`);
      await loadUsers();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `No se pudo ${action} el usuario.`
      );
    } finally {
      setPendingUserId(null);
    }
  }

  const selectedRoleAssigned = assignedRoles.includes(selectedRole);
  const isEditingSelf = Boolean(
    editingUser && currentUserId && String(editingUser.id) === currentUserId
  );
  const canRemoveSelectedRole =
    selectedRoleAssigned &&
    assignedRoles.length > 1 &&
    !(isEditingSelf && selectedRole === "ADMIN");
  const permissions = editingUser ? managedUserPermissionNames(editingUser) : [];

  return (
    <div className="users-manager">
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

      <div className="stats-grid users-stats-grid">
        {[
          { label: "Usuarios", value: users.length, icon: Users, pill: "Directorio" },
          { label: "Activos", value: activeUsers, icon: UserCheck, pill: "Habilitados" },
          { label: "Administradores", value: adminUsers, icon: ShieldCheck, pill: "ADMIN" },
          { label: "Con comercio", value: affiliatedUsers, icon: Store, pill: "Afiliados" },
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

      <section className="card card-lg users-directory-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Directorio de usuarios</h2>
            <p className="muted">
              {filteredUsers.length} resultados · roles y permisos efectivos del servicio de autenticación
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="button-tonal" onClick={openCreateModal} type="button">
              <Plus aria-hidden="true" size={17} />
              Crear usuario
            </button>
            <button
              aria-label="Actualizar usuarios"
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadUsers()}
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

        <div className="catalog-filters users-filters">
          <label className="field-group">
            <span className="field-label">Buscar</span>
            <span className="notification-search-control">
              <Search aria-hidden="true" size={17} />
              <input
                className="field-control"
                onChange={(event) => updateFilters({ query: event.target.value })}
                placeholder="Nombre, correo, teléfono, comercio o ID"
                type="search"
                value={filters.query}
              />
            </span>
          </label>
          <label className="field-group">
            <span className="field-label">Rol</span>
            <select
              className="field-control"
              onChange={(event) =>
                updateFilters({ role: event.target.value as UserFilters["role"] })
              }
              value={filters.role}
            >
              <option value="ALL">Todos los roles</option>
              {MANAGED_USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="field-group">
            <span className="field-label">Estado</span>
            <select
              className="field-control"
              onChange={(event) =>
                updateFilters({ status: event.target.value as UserFilters["status"] })
              }
              value={filters.status}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </label>
          <button
            className="button-secondary"
            disabled={
              !filters.query && filters.role === "ALL" && filters.status === "ALL"
            }
            onClick={() => {
              setFilters(initialFilters);
              resetPage();
            }}
            type="button"
          >
            Limpiar
          </button>
        </div>

        {truncated ? (
          <div className="notification-info-box" role="note">
            <CircleAlert aria-hidden="true" size={16} />
            <span>
              El directorio supera 2.000 usuarios. Se muestra un subconjunto para mantener una respuesta ágil.
            </span>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data-table users-data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Roles</th>
                <th>Permisos</th>
                <th>Comercio</th>
                <th>Estado</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : usersPage.rows.length ? (
                usersPage.rows.map((user) => {
                  const roles = managedUserRoleNames(user);
                  const permissionsCount = managedUserPermissionNames(user).length;
                  const isActive = userIsActive(user);
                  const isPending = pendingUserId === String(user.id);
                  const isSelf = currentUserId && String(user.id) === currentUserId;

                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{userName(user)}</strong>
                        <span className="table-muted">
                          {user.email ?? "Sin correo"} · ID {user.id}
                          {user.phone ? ` · ${user.phone}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className="pill-row users-role-pills">
                          {roles.length ? (
                            roles.map((role) => (
                              <span className={`pill ${rolePillClass(role)}`} key={role}>
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="table-muted">Sin roles</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <strong>{permissionsCount}</strong>
                        <span className="table-muted">
                          {permissionsCount === 1 ? "permiso efectivo" : "permisos efectivos"}
                        </span>
                      </td>
                      <td>
                        <strong>{userMerchantName(user)}</strong>
                        <span className="table-muted">
                          {user.merchant?.id !== undefined
                            ? `ID ${user.merchant.id}`
                            : "Sin afiliación"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            isActive === true
                              ? "success"
                              : isActive === false
                                ? "error"
                                : "pending"
                          }`}
                        >
                          {isActive === true
                            ? "Activo"
                            : isActive === false
                              ? "Inactivo"
                              : "Sin estado"}
                        </span>
                        {isSelf ? <span className="table-muted">Tu cuenta</span> : null}
                      </td>
                      <td>{formatDate(user.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            aria-label={`Editar ${userName(user)}`}
                            className="icon-button"
                            disabled={isPending}
                            onClick={() => openEditModal(user)}
                            title="Editar usuario y roles"
                            type="button"
                          >
                            <Edit3 aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`${isActive ? "Desactivar" : "Reactivar"} ${userName(user)}`}
                            className={`icon-button${isActive ? " danger-button" : ""}`}
                            disabled={isPending || isActive === undefined || Boolean(isSelf && isActive)}
                            onClick={() => void toggleUserStatus(user)}
                            title={
                              isSelf && isActive
                                ? "No podés desactivar tu propia cuenta"
                                : isActive
                                  ? "Desactivar usuario"
                                  : "Reactivar usuario"
                            }
                            type="button"
                          >
                            {isPending ? (
                              <span aria-hidden="true" className="spinner" />
                            ) : isActive ? (
                              <UserMinus aria-hidden="true" size={16} />
                            ) : (
                              <UserCheck aria-hidden="true" size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-table-state">
                      <Users aria-hidden="true" size={26} />
                      <strong>Sin usuarios para mostrar</strong>
                      <span>Probá con otros filtros o creá un usuario.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={usersPage.currentPage}
          itemLabelPlural="usuarios"
          itemLabelSingular="usuario"
          onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
          onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
          pageSize={usersPage.pageSize}
          totalItems={usersPage.totalItems}
          totalPages={usersPage.totalPages}
        />
      </section>

      {activeModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="catalog-modal-layer"
              data-modal-owner="users"
              role="presentation"
            >
              <button
                aria-label="Cerrar ventana"
                className="catalog-modal-backdrop"
                disabled={isSaving || Boolean(roleAction)}
                onClick={() => closeModal()}
                type="button"
              />
              <section
                aria-label={activeModal === "create" ? "Crear usuario" : "Editar usuario"}
                aria-modal="true"
                className="card card-lg catalog-modal users-modal"
                role="dialog"
              >
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      {activeModal === "create" ? "Crear usuario" : "Editar usuario y roles"}
                    </h2>
                    <p className="muted">
                      {activeModal === "create"
                        ? "Creá una cuenta y definí su acceso inicial."
                        : `${userName(editingUser!)} · ID ${editingUser?.id}`}
                    </p>
                  </div>
                  <button
                    aria-label="Cerrar ventana"
                    className="icon-button"
                    disabled={isSaving || Boolean(roleAction)}
                    onClick={() => closeModal()}
                    type="button"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>

                {activeModal === "create" ? (
                  <form className="catalog-form" onSubmit={handleCreate}>
                    <div className="form-grid">
                      <label className="field-group">
                        <span className="field-label">Correo</span>
                        <input
                          autoComplete="email"
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, email: event.target.value }))
                          }
                          placeholder="usuario@correo.com"
                          required
                          type="email"
                          value={createForm.email}
                        />
                      </label>
                      <label className="field-group">
                        <span className="field-label">Teléfono</span>
                        <input
                          autoComplete="tel"
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, phone: event.target.value }))
                          }
                          placeholder="+595…"
                          type="tel"
                          value={createForm.phone}
                        />
                      </label>
                    </div>
                    <div className="form-grid">
                      <label className="field-group">
                        <span className="field-label">Nombre</span>
                        <input
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, nickname: event.target.value }))
                          }
                          placeholder="Nombre visible"
                          required
                          value={createForm.nickname}
                        />
                      </label>
                      <label className="field-group">
                        <span className="field-label">Contraseña temporal</span>
                        <input
                          autoComplete="new-password"
                          className="field-control"
                          disabled={isSaving}
                          minLength={8}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, password: event.target.value }))
                          }
                          placeholder="Mínimo 8 caracteres"
                          required
                          type="password"
                          value={createForm.password}
                        />
                      </label>
                    </div>
                    <div className="form-grid users-access-grid">
                      <label className="field-group">
                        <span className="field-label">Rol inicial</span>
                        <select
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              role: event.target.value as ManagedUserRole,
                            }))
                          }
                          value={createForm.role}
                        >
                          {MANAGED_USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="field-group">
                        <label
                          className="field-label"
                          htmlFor="create-user-merchant"
                        >
                          Comercio asociado
                        </label>
                        <MerchantCombobox
                          disabled={isSaving}
                          inputId="create-user-merchant"
                          isLoading={isLoadingMerchants}
                          merchants={merchants}
                          onChange={(merchantId) =>
                            setCreateForm((current) => ({ ...current, merchantId }))
                          }
                          value={createForm.merchantId}
                        />
                      </div>
                    </div>
                    <p className="muted users-form-note">
                      El comercio es opcional. Vinculalo cuando la cuenta operará como comercio o repartidor.
                    </p>
                    {merchantsError ? (
                      <div className="error-box" role="alert">
                        <CircleAlert aria-hidden="true" size={17} />
                        <span>{merchantsError}</span>
                      </div>
                    ) : null}
                    {createError ? (
                      <div className="error-box" role="alert">
                        <CircleAlert aria-hidden="true" size={17} />
                        <span>{createError}</span>
                      </div>
                    ) : null}
                    <div className="form-actions">
                      <button className="button-primary" disabled={isSaving} type="submit">
                        {isSaving ? (
                          <span aria-hidden="true" className="spinner" />
                        ) : (
                          <Plus aria-hidden="true" size={17} />
                        )}
                        {isSaving ? "Creando…" : "Crear usuario"}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={isSaving}
                        onClick={() => closeModal()}
                        type="button"
                      >
                        <X aria-hidden="true" size={17} />
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="catalog-form" onSubmit={handleUpdate}>
                    <div className="form-grid">
                      <label className="field-group">
                        <span className="field-label">Correo</span>
                        <input
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, email: event.target.value }))
                          }
                          required
                          type="email"
                          value={editForm.email}
                        />
                      </label>
                      <label className="field-group">
                        <span className="field-label">Teléfono</span>
                        <input
                          className="field-control"
                          disabled={isSaving}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, phone: event.target.value }))
                          }
                          placeholder="Sin teléfono"
                          type="tel"
                          value={editForm.phone}
                        />
                      </label>
                    </div>
                    <label className="field-group">
                      <span className="field-label">Nombre</span>
                      <input
                        className="field-control"
                        disabled={isSaving}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, nickname: event.target.value }))
                        }
                        value={editForm.nickname}
                      />
                    </label>

                    <section className="users-role-manager" aria-label="Gestión de roles">
                      <div className="users-role-manager-header">
                        <div>
                          <strong>Roles RBAC</strong>
                          <span>Los permisos efectivos se derivan de estos roles.</span>
                        </div>
                        <span className="pill assigned">{assignedRoles.length} asignados</span>
                      </div>
                      <div className="pill-row users-role-pills">
                        {MANAGED_USER_ROLES.map((role) => (
                          <span
                            className={`pill ${
                              assignedRoles.includes(role) ? rolePillClass(role) : ""
                            } users-role-option-pill${
                              assignedRoles.includes(role) ? " assigned-role" : ""
                            }`}
                            key={role}
                          >
                            {role}
                            {assignedRoles.includes(role) ? " · asignado" : ""}
                          </span>
                        ))}
                      </div>
                      <div className="users-role-actions">
                        <label className="field-group">
                          <span className="field-label">Rol a modificar</span>
                          <select
                            className="field-control"
                            disabled={Boolean(roleAction)}
                            onChange={(event) => {
                              setSelectedRole(event.target.value as ManagedUserRole);
                              setRoleMessage(null);
                            }}
                            value={selectedRole}
                          >
                            {MANAGED_USER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button-tonal"
                          disabled={selectedRoleAssigned || Boolean(roleAction)}
                          onClick={() => void handleRoleChange("add")}
                          type="button"
                        >
                          {roleAction === "add" ? (
                            <span aria-hidden="true" className="spinner" />
                          ) : (
                            <Plus aria-hidden="true" size={16} />
                          )}
                          Agregar rol
                        </button>
                        <button
                          className="button-secondary users-remove-role-button"
                          disabled={!canRemoveSelectedRole || Boolean(roleAction)}
                          onClick={() => void handleRoleChange("remove")}
                          type="button"
                        >
                          {roleAction === "remove" ? (
                            <span aria-hidden="true" className="spinner" />
                          ) : (
                            <X aria-hidden="true" size={16} />
                          )}
                          Quitar rol
                        </button>
                      </div>
                      {assignedRoles.length <= 1 ? (
                        <p className="muted users-form-note">
                          Cada usuario debe conservar al menos un rol.
                        </p>
                      ) : null}
                      {roleMessage ? (
                        <div
                          className={roleMessage.kind === "error" ? "error-box" : "success-box"}
                          role={roleMessage.kind === "error" ? "alert" : "status"}
                        >
                          {roleMessage.kind === "error" ? (
                            <CircleAlert aria-hidden="true" size={17} />
                          ) : (
                            <CircleCheck aria-hidden="true" size={17} />
                          )}
                          <span>{roleMessage.text}</span>
                        </div>
                      ) : null}
                    </section>

                    <details className="advanced-section users-permissions-section">
                      <summary>
                        <span>
                          <strong>Permisos efectivos</strong>
                          <span>{permissions.length} derivados de los roles asignados.</span>
                        </span>
                        <span className="pill">
                          <KeyRound aria-hidden="true" size={13} />
                          Sólo lectura
                        </span>
                      </summary>
                      <div className="advanced-section-content users-permission-list">
                        {permissions.length ? (
                          permissions.map((permission) => (
                            <span className="metadata-key-pill" key={permission}>
                              {permission}
                            </span>
                          ))
                        ) : (
                          <span className="metadata-empty-state">Sin permisos efectivos.</span>
                        )}
                      </div>
                    </details>

                    {editError ? (
                      <div className="error-box" role="alert">
                        <CircleAlert aria-hidden="true" size={17} />
                        <span>{editError}</span>
                      </div>
                    ) : null}
                    <div className="form-actions">
                      <button className="button-primary" disabled={isSaving} type="submit">
                        {isSaving ? (
                          <span aria-hidden="true" className="spinner" />
                        ) : (
                          <Save aria-hidden="true" size={17} />
                        )}
                        {isSaving ? "Guardando…" : "Guardar datos"}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={isSaving || Boolean(roleAction)}
                        onClick={() => closeModal()}
                        type="button"
                      >
                        <X aria-hidden="true" size={17} />
                        Cerrar
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
