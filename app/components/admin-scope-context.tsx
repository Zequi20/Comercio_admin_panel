"use client";

import {
  Building2,
  Check,
  ChevronDown,
  Globe2,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MerchantDetails, PortalScope } from "../lib/auth/types";

type AdminScopeContextValue = {
  isAdmin: boolean;
  scope: PortalScope;
  scopeKey: string;
  scopeLabel: string;
  canManage: boolean;
};

const AdminScopeContext = createContext<AdminScopeContextValue | null>(null);

type AdminScopeOption = {
  value: string;
  label: string;
  detail: string;
  searchText: string;
  isGlobal: boolean;
};

const MAX_VISIBLE_SCOPE_OPTIONS = 50;

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function merchantLabel(merchant: MerchantDetails) {
  return (
    merchant.name?.trim() ||
    merchant.contactEmail?.trim() ||
    merchant.email?.trim() ||
    `Comercio #${merchant.id}`
  );
}

function merchantScopeOption(merchant: MerchantDetails): AdminScopeOption {
  const label = merchantLabel(merchant);
  const email = merchant.contactEmail?.trim() || merchant.email?.trim();
  const detail = email ? `ID ${merchant.id} · ${email}` : `ID ${merchant.id}`;

  return {
    value: String(merchant.id),
    label,
    detail,
    searchText: normalizeSearchText(`${label} ${detail}`),
    isGlobal: false,
  };
}

export function AdminScopeProvider({
  children,
  isAdmin,
  scope,
}: Readonly<{
  children: ReactNode;
  isAdmin: boolean;
  scope: PortalScope;
}>) {
  const value = useMemo<AdminScopeContextValue>(() => {
    const scopeLabel =
      scope.mode === "global"
        ? "Todos los comercios"
        : scope.merchant.name ?? `Comercio #${scope.merchantId}`;

    return {
      isAdmin,
      scope,
      scopeKey: `${scope.mode}:${scope.merchantId ?? "all"}`,
      scopeLabel,
      canManage: !isAdmin || scope.mode === "merchant",
    };
  }, [isAdmin, scope]);

  return (
    <AdminScopeContext.Provider value={value}>
      {children}
    </AdminScopeContext.Provider>
  );
}

export function useAdminScope() {
  const context = useContext(AdminScopeContext);

  if (!context) {
    throw new Error("useAdminScope debe usarse dentro de AdminScopeProvider.");
  }

  return context;
}

export function AdminDataScopeNotice() {
  const { canManage, isAdmin, scope, scopeLabel } = useAdminScope();

  if (!isAdmin) return null;

  return (
    <div
      className="notification-info-box admin-data-scope-notice"
      role="note"
    >
      {scope.mode === "global" ? (
        <Globe2 aria-hidden="true" size={18} />
      ) : (
        <Building2 aria-hidden="true" size={18} />
      )}
      <div>
        <strong>{scopeLabel}</strong>
        <span>
          {canManage
            ? "Las consultas y acciones están limitadas a este comercio."
            : "Vista consolidada de consulta. Seleccioná un comercio para crear o modificar registros."}
        </span>
      </div>
    </div>
  );
}

export function AdminScopeSelector({
  merchants,
  scope,
}: Readonly<{
  merchants: MerchantDetails[];
  scope: PortalScope;
}>) {
  const router = useRouter();
  const currentValue =
    scope.mode === "global" ? "all" : String(scope.merchantId);
  const allOptions = useMemo<AdminScopeOption[]>(() => {
    const merchantOptions = new Map<string, AdminScopeOption>();

    if (
      scope.mode === "merchant" &&
      !merchants.some(
        (merchant) => String(merchant.id) === String(scope.merchantId)
      )
    ) {
      const option = merchantScopeOption(scope.merchant);
      merchantOptions.set(option.value, option);
    }

    merchants.forEach((merchant) => {
      const option = merchantScopeOption(merchant);
      merchantOptions.set(option.value, option);
    });

    const sortedMerchants = [...merchantOptions.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "es", { sensitivity: "base" })
    );

    return [
      {
        value: "all",
        label: "Todos los comercios",
        detail: "Vista consolidada",
        searchText: normalizeSearchText(
          "Todos los comercios vista consolidada global"
        ),
        isGlobal: true,
      },
      ...sortedMerchants,
    ];
  }, [merchants, scope]);
  const currentOption =
    allOptions.find((option) => option.value === currentValue) ?? allOptions[0];
  const [selectedValue, setSelectedValue] = useState(currentValue);
  const [searchText, setSearchText] = useState(currentOption.label);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const matchingOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchText);

    if (!normalizedQuery) return allOptions;

    return allOptions.filter((option) =>
      option.searchText.includes(normalizedQuery)
    );
  }, [allOptions, searchText]);
  const visibleOptions = matchingOptions.slice(0, MAX_VISIBLE_SCOPE_OPTIONS);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;

    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, listboxId]);

  function openOptions() {
    if (isUpdating) return;

    const selectedIndex = allOptions.findIndex(
      (option) => option.value === selectedValue
    );
    setSearchText("");
    setActiveIndex(
      selectedIndex >= 0 && selectedIndex < MAX_VISIBLE_SCOPE_OPTIONS
        ? selectedIndex
        : 0
    );
    setIsOpen(true);
  }

  function closeOptions() {
    const selectedOption =
      allOptions.find((option) => option.value === selectedValue) ??
      currentOption;

    setIsOpen(false);
    setSearchText(selectedOption.label);
  }

  async function updateScope(nextOption: AdminScopeOption) {
    const previousValue = currentValue;
    setSelectedValue(nextOption.value);
    setSearchText(nextOption.label);
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/scope", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: nextOption.value === "all" ? null : nextOption.value,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudo cambiar el alcance.");
      }

      router.refresh();
    } catch (cause) {
      setSelectedValue(previousValue);
      setSearchText(currentOption.label);
      setError(
        cause instanceof Error ? cause.message : "No se pudo cambiar el alcance."
      );
    } finally {
      setIsUpdating(false);
    }
  }

  function selectOption(option: AdminScopeOption) {
    setSelectedValue(option.value);
    setSearchText(option.label);
    setIsOpen(false);

    if (option.value !== currentValue) {
      void updateScope(option);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeOptions();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!isOpen) {
        openOptions();
        return;
      }

      if (visibleOptions.length === 0) return;

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((previousIndex) => {
        const nextIndex = previousIndex + direction;

        if (nextIndex < 0) return visibleOptions.length - 1;
        if (nextIndex >= visibleOptions.length) return 0;
        return nextIndex;
      });
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) selectOption(option);
    }
  }

  function handleComboboxBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    closeOptions();
  }

  const isGlobal = selectedValue === "all";
  const activeOptionId =
    isOpen && activeIndex >= 0 && visibleOptions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <section
      className="card admin-scope-bar"
      aria-label="Alcance administrativo"
    >
      <div className="admin-scope-identity">
        <span className="icon-surface admin-scope-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <div className="admin-scope-heading">
            <strong>Administración global</strong>
            <span className={isGlobal ? "pill assigned" : "pill"}>
              {isGlobal ? "Vista global" : "Comercio activo"}
            </span>
          </div>
          <span className="admin-scope-description">
            {isGlobal
              ? "Consultando registros de todos los comercios"
              : "Operando dentro de un comercio específico"}
          </span>
        </div>
      </div>

      <div className="field-group admin-scope-control">
        <label className="field-label" htmlFor="admin-merchant-scope">
          Alcance de datos
        </label>
        <div
          className="admin-scope-combobox"
          onBlur={handleComboboxBlur}
        >
          <div className="admin-scope-select-wrap">
            {isOpen ? (
              <Search aria-hidden="true" size={17} />
            ) : isGlobal ? (
              <Globe2 aria-hidden="true" size={17} />
            ) : (
              <Building2 aria-hidden="true" size={17} />
            )}
            <input
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              autoComplete="off"
              className="field-control"
              disabled={isUpdating}
              id="admin-merchant-scope"
              onChange={(event) => {
                setSearchText(event.target.value);
                setIsOpen(true);
                setActiveIndex(0);
              }}
              onClick={() => {
                if (!isOpen) openOptions();
              }}
              onFocus={() => {
                if (!isOpen) openOptions();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar por nombre, correo o ID"
              ref={inputRef}
              role="combobox"
              spellCheck={false}
              type="text"
              value={searchText}
            />
            {isUpdating ? (
              <LoaderCircle
                aria-label="Actualizando alcance"
                className="spin-icon admin-scope-loader"
                size={16}
              />
            ) : (
              <button
                aria-label={
                  isOpen ? "Cerrar lista de comercios" : "Abrir lista de comercios"
                }
                className="admin-scope-toggle"
                onClick={() => {
                  if (isOpen) {
                    closeOptions();
                  } else {
                    inputRef.current?.focus();
                    openOptions();
                  }
                }}
                onMouseDown={(event) => event.preventDefault()}
                tabIndex={-1}
                type="button"
              >
                <ChevronDown aria-hidden="true" size={17} />
              </button>
            )}
          </div>

          {isOpen ? (
            <div className="admin-scope-options-panel">
              {visibleOptions.length > 0 ? (
                <ul
                  aria-label="Comercios disponibles"
                  className="admin-scope-options"
                  id={listboxId}
                  role="listbox"
                >
                  {visibleOptions.map((option, index) => {
                    const isSelected = option.value === selectedValue;

                    return (
                      <li
                        aria-selected={isSelected}
                        className={`admin-scope-option${
                          index === activeIndex ? " is-active" : ""
                        }${isSelected ? " is-selected" : ""}`}
                        data-scope-value={option.value}
                        id={`${listboxId}-option-${index}`}
                        key={option.value}
                        onClick={() => selectOption(option)}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActiveIndex(index)}
                        role="option"
                      >
                        <span
                          className="admin-scope-option-icon"
                          aria-hidden="true"
                        >
                          {option.isGlobal ? (
                            <Globe2 size={15} />
                          ) : (
                            <Building2 size={15} />
                          )}
                        </span>
                        <span className="admin-scope-option-copy">
                          <strong>{option.label}</strong>
                          <span>{option.detail}</span>
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

              {matchingOptions.length > MAX_VISIBLE_SCOPE_OPTIONS ? (
                <span className="admin-scope-results-note" role="status">
                  Mostrando {MAX_VISIBLE_SCOPE_OPTIONS} de {matchingOptions.length}{" "}
                  resultados. Escribí para acotar la búsqueda.
                </span>
              ) : matchingOptions.length > 0 ? (
                <span className="admin-scope-results-note" role="status">
                  {matchingOptions.length}{" "}
                  {matchingOptions.length === 1 ? "resultado" : "resultados"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {error ? (
          <span className="error-box admin-scope-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}
