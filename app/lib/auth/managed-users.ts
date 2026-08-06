export const MANAGED_USER_ROLES = [
  "ADMIN",
  "MERCHANT",
  "COURIER",
  "CUSTOMER",
] as const;

export type ManagedUserRole = (typeof MANAGED_USER_ROLES)[number];

export type ManagedRoleReference = {
  id?: number | string;
  name?: string | null;
  slug?: string | null;
  role?: string | null;
};

export type ManagedPermissionReference = {
  id?: number | string;
  name?: string | null;
  slug?: string | null;
  permission?: string | null;
  scope?: string | null;
};

export type ManagedUserEntityReference = {
  id?: number | string;
  email?: string | null;
  nickname?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type ManagedUser = {
  id: number | string;
  email?: string | null;
  nickname?: string | null;
  phone?: string | null;
  roles?:
    | Array<ManagedRoleReference | string>
    | ManagedRoleReference
    | string
    | null;
  role?: string | null;
  permissions?:
    | Array<ManagedPermissionReference | string>
    | ManagedPermissionReference
    | string
    | null;
  permission?: string | null;
  merchantId?: number | string | null;
  merchant?: ManagedUserEntityReference | null;
  courier?: {
    id?: number | string;
    name?: string | null;
    user?: ManagedUserEntityReference | null;
  } | null;
  isActive?: boolean;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ManagedUsersPage = {
  data?: ManagedUser[];
  users?: ManagedUser[];
  cursor?: number | string | null;
};

function referenceValue(
  value: ManagedRoleReference | ManagedPermissionReference | string
) {
  if (typeof value === "string") return value;

  return (
    value.slug ??
    ("role" in value ? value.role : null) ??
    ("permission" in value ? value.permission : null) ??
    value.name ??
    ("scope" in value ? value.scope : null) ??
    (value.id === undefined || value.id === null ? "" : String(value.id))
  );
}

function valuesFromContainer<T extends ManagedRoleReference | ManagedPermissionReference>(
  values: Array<T | string> | T | string | null | undefined,
  fallback?: string | null
) {
  const entries = Array.isArray(values) ? values : values ? [values] : [];
  const normalized = entries
    .map((entry) => referenceValue(entry))
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));

  if (normalized.length === 0 && fallback?.trim()) {
    normalized.push(fallback.trim());
  }

  return Array.from(new Set(normalized));
}

export function managedUserRoleNames(user: ManagedUser) {
  return valuesFromContainer(user.roles, user.role).map((role) =>
    role.toUpperCase()
  );
}

export function managedUserPermissionNames(user: ManagedUser) {
  return valuesFromContainer(user.permissions, user.permission);
}

export function isManagedUserRole(value: unknown): value is ManagedUserRole {
  return (
    typeof value === "string" &&
    MANAGED_USER_ROLES.includes(value.trim().toUpperCase() as ManagedUserRole)
  );
}
