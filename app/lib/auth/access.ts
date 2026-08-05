import type {
  AuthUser,
  CommerceAccessResult,
  MerchantReference,
  RoleName,
} from "./types";

const commerceManagementPermissions = new Set([
  "orders:manage",
  "orders:assign",
  "orders:update-items",
  "orders:update-status",
  "products:create",
  "products:update",
  "notifications:send",
]);

const acceptedRoles = new Set<RoleName>(["MERCHANT", "ADMIN"]);

type JwtPayload = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstValue(...values: unknown[]) {
  for (const value of values) {
    const resolved = nonEmptyString(value);
    if (resolved) return resolved;
  }

  return null;
}

function collectStrings(value: unknown, keys: string[] = []): string[] {
  if (value === undefined || value === null) return [];

  if (typeof value === "string" || typeof value === "number") {
    return String(value)
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, keys));
  }

  const record = asRecord(value);
  if (!record) return [];

  if (keys.length === 0) {
    return Object.values(record).flatMap((item) => collectStrings(item, keys));
  }

  return keys.flatMap((key) => collectStrings(record[key], keys));
}

function normalizeRole(value: string): RoleName | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized === "MERCHANT" || normalized.includes("MERCHANT")) {
    return "MERCHANT";
  }

  if (normalized === "ADMIN" || normalized.includes("ADMIN")) {
    return "ADMIN";
  }

  if (normalized === "COURIER" || normalized.includes("COURIER")) {
    return "COURIER";
  }

  if (
    normalized === "CUSTOMER" ||
    normalized.includes("CUSTOMER") ||
    normalized.includes("CLIENTE")
  ) {
    return "CUSTOMER";
  }

  if (normalized.includes("COMERCIO") || normalized.includes("COMMERCE")) {
    return "MERCHANT";
  }

  return null;
}

function uniqueRoles(values: string[]): RoleName[] {
  const roles: RoleName[] = [];

  for (const value of values) {
    const role = normalizeRole(value);
    if (role && !roles.includes(role)) {
      roles.push(role);
    }
  }

  return roles;
}

function uniquePermissions(values: string[]): string[] {
  const permissions: string[] = [];

  for (const value of values) {
    const permission = value.trim().toLowerCase();
    if (permission && !permissions.includes(permission)) {
      permissions.push(permission);
    }
  }

  return permissions;
}

function rolesFromUser(user?: AuthUser | null): string[] {
  if (!user) return [];

  return [
    ...collectStrings(user.role),
    ...collectStrings(user.userRole),
    ...collectStrings(user.userType),
    ...collectStrings(user.roles, ["name", "slug", "role", "value"]),
    ...collectStrings(user.roleNames, ["name", "slug", "role", "value"]),
    ...collectStrings(user.availableRoles, ["name", "slug", "role", "value"]),
    ...collectStrings(user.allowedRoles, ["name", "slug", "role", "value"]),
  ];
}

function rolesFromJwt(jwtPayload?: JwtPayload | null): string[] {
  if (!jwtPayload) return [];

  const realmAccess = asRecord(jwtPayload.realm_access);
  const resourceAccess = asRecord(jwtPayload.resource_access);
  const resourceRoles = resourceAccess
    ? Object.values(resourceAccess).flatMap((value) =>
        collectStrings(asRecord(value)?.roles)
      )
    : [];

  return [
    ...collectStrings(jwtPayload.role),
    ...collectStrings(jwtPayload.roles, ["name", "slug", "role", "value"]),
    ...collectStrings(jwtPayload.roleNames, ["name", "slug", "role", "value"]),
    ...collectStrings(realmAccess?.roles),
    ...resourceRoles,
  ];
}

function permissionsFromUser(user?: AuthUser | null): string[] {
  if (!user) return [];

  return [
    ...collectStrings(user.permissions, [
      "name",
      "slug",
      "permission",
      "scope",
      "value",
    ]),
    ...collectStrings(user.permission, [
      "name",
      "slug",
      "permission",
      "scope",
      "value",
    ]),
    ...collectStrings(user.perms, ["name", "slug", "permission", "scope", "value"]),
    ...collectStrings(user.scopes, ["name", "slug", "permission", "scope", "value"]),
    ...collectStrings(user.scope, ["name", "slug", "permission", "scope", "value"]),
    ...collectStrings(user.scp, ["name", "slug", "permission", "scope", "value"]),
    ...collectStrings(user.authorities, [
      "name",
      "slug",
      "permission",
      "scope",
      "value",
    ]),
  ];
}

function permissionsFromJwt(jwtPayload?: JwtPayload | null): string[] {
  if (!jwtPayload) return [];

  return [
    ...collectStrings(jwtPayload.perms),
    ...collectStrings(jwtPayload.permissions, [
      "name",
      "slug",
      "permission",
      "scope",
      "value",
    ]),
    ...collectStrings(jwtPayload.scope),
    ...collectStrings(jwtPayload.scp),
    ...collectStrings(jwtPayload.authorities),
  ];
}

function resolveMerchant(user?: AuthUser | null): MerchantReference | null {
  return user?.merchant ?? null;
}

function resolveMerchantId(
  user?: AuthUser | null,
  jwtPayload?: JwtPayload | null
) {
  const merchant = resolveMerchant(user);

  return firstValue(
    user?.merchantId,
    user?.merchant_id,
    user?.commerceId,
    user?.storeId,
    merchant?.id,
    merchant?.merchantId,
    jwtPayload?.merchantId,
    jwtPayload?.merchant_id,
    jwtPayload?.commerceId,
    jwtPayload?.storeId
  );
}

export function decodeJwtPayload(accessToken: string): JwtPayload | null {
  const [, rawPayload] = accessToken.split(".");
  if (!rawPayload) return null;

  try {
    const decoded = Buffer.from(rawPayload, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;
    return asRecord(payload);
  } catch {
    return null;
  }
}

export function resolveCommerceAccess({
  user,
  jwtPayload,
}: {
  user?: AuthUser | null;
  jwtPayload?: JwtPayload | null;
}): CommerceAccessResult {
  const roles = uniqueRoles([...rolesFromUser(user), ...rolesFromJwt(jwtPayload)]);
  const permissions = uniquePermissions([
    ...permissionsFromUser(user),
    ...permissionsFromJwt(jwtPayload),
  ]);
  const merchantId = resolveMerchantId(user, jwtPayload);
  const isAdmin = roles.includes("ADMIN");
  const hasAcceptedRole =
    roles.length === 0 || roles.some((role) => acceptedRoles.has(role));
  const hasManagementPermission =
    permissions.length === 0 ||
    permissions.some((permission) => commerceManagementPermissions.has(permission));

  if (!merchantId && !isAdmin) {
    return {
      ok: false,
      reason:
        "Tu cuenta no tiene un comercio asociado. Pedile al administrador que vincule tu usuario a un comercio.",
      roles,
      permissions,
    };
  }

  if (!hasAcceptedRole) {
    return {
      ok: false,
      reason:
        "Tu cuenta no tiene rol MERCHANT ni ADMIN para ingresar al portal comercio.",
      roles,
      permissions,
      ...(merchantId ? { merchantId } : {}),
    };
  }

  if (!hasManagementPermission) {
    return {
      ok: false,
      reason:
        "Tu cuenta no tiene permisos para gestionar pedidos o catálogo del comercio.",
      roles,
      permissions,
      ...(merchantId ? { merchantId } : {}),
    };
  }

  return {
    ok: true,
    roles,
    permissions,
    ...(merchantId ? { merchantId } : {}),
    merchant: resolveMerchant(user),
    userId: firstValue(user?.id, user?.sub, jwtPayload?.sub) ?? undefined,
    email: firstValue(user?.email, jwtPayload?.email),
    nickname: user?.nickname,
  };
}
