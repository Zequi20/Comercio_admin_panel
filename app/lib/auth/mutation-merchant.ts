import type { PortalScope } from "./types";

type MerchantMutationContext = {
  isAdmin: boolean;
  scope: PortalScope;
};

function positiveMerchantId(value: unknown) {
  const numeric = Number(value);

  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export function merchantIdFromMutation(
  context: MerchantMutationContext,
  requestedMerchantId: unknown
) {
  if (context.scope.mode === "merchant") {
    return context.scope.merchantId;
  }

  if (!context.isAdmin) {
    return null;
  }

  return positiveMerchantId(requestedMerchantId);
}
