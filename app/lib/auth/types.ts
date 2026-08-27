export type RoleName = "ADMIN" | "MERCHANT" | "COURIER" | "CUSTOMER";

export type RoleLike =
  | string
  | {
      id?: number | string;
      name?: string | null;
      slug?: string | null;
      role?: string | null;
      value?: string | null;
    };

export type PermissionLike =
  | string
  | {
      id?: number | string;
      name?: string | null;
      slug?: string | null;
      permission?: string | null;
      scope?: string | null;
      value?: string | null;
    };

export type MerchantReference = {
  id?: number | string;
  merchantId?: number | string;
  name?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
};

export type AuthUser = {
  id?: number | string;
  sub?: number | string;
  email?: string | null;
  nickname?: string | null;
  phone?: string | null;
  role?: string | null;
  userRole?: string | null;
  userType?: string | null;
  roles?: RoleLike[] | RoleLike | null;
  roleNames?: RoleLike[] | RoleLike | null;
  availableRoles?: RoleLike[] | RoleLike | null;
  allowedRoles?: RoleLike[] | RoleLike | null;
  permissions?: PermissionLike[] | PermissionLike | null;
  permission?: PermissionLike | null;
  perms?: PermissionLike[] | PermissionLike | null;
  scopes?: PermissionLike[] | PermissionLike | null;
  scope?: PermissionLike[] | PermissionLike | null;
  scp?: PermissionLike[] | PermissionLike | null;
  authorities?: PermissionLike[] | PermissionLike | null;
  merchantId?: number | string | null;
  merchant_id?: number | string | null;
  commerceId?: number | string | null;
  storeId?: number | string | null;
  merchant?: MerchantReference | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthTokens = {
  accessToken?: string;
  access_token?: string;
  token?: string;
  refreshToken?: string;
  refresh_token?: string;
};

export type AuthLoginResponse = {
  user?: AuthUser | null;
  tokens?: AuthTokens | null;
  accessToken?: string;
  access_token?: string;
  token?: string;
  refreshToken?: string;
  refresh_token?: string;
  message?: string;
};

export type MerchantDetails = {
  id: number | string;
  name?: string | null;
  contactEmail?: string | null;
  email?: string | null;
  deliveryCost?: number | string | null;
  isOpen?: boolean | null;
  autoConfirmOrders?: boolean | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CommerceSession = {
  user: {
    id?: number | string;
    email: string;
    nickname?: string | null;
    roles: RoleName[];
    permissions: string[];
  };
  merchant: {
    id: number | string;
    name: string;
    contactEmail?: string | null;
    deliveryCost?: number | string | null;
    isOpen?: boolean | null;
    autoConfirmOrders?: boolean | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

export type PortalScope =
  | {
      mode: "global";
      merchantId: null;
      merchant: null;
    }
  | {
      mode: "merchant";
      merchantId: number | string;
      merchant: MerchantDetails;
    };

export type CommerceAccessResult =
  | {
      ok: true;
      roles: RoleName[];
      permissions: string[];
      merchantId?: number | string;
      merchant?: MerchantReference | null;
      userId?: number | string;
      email?: string | null;
      nickname?: string | null;
    }
  | {
      ok: false;
      reason: string;
      roles: RoleName[];
      permissions: string[];
      merchantId?: number | string;
    };
