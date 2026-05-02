export function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = firstString(item);
      if (resolved) return resolved;
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      firstString(record.message) ??
      firstString(record.detail) ??
      firstString(record.title) ??
      firstString(record.error) ??
      firstString(record.errors) ??
      firstString(record.violations)
    );
  }

  return null;
}

export function extractErrorMessage(payload: unknown, fallback: string) {
  return firstString(payload) ?? fallback;
}
