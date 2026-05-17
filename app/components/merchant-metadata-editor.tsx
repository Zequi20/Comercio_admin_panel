"use client";

import {
  CircleAlert,
  CircleCheck,
  Image as ImageIcon,
  Loader2,
  Save,
  Tags,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type MerchantMetadataEditorProps = {
  initialMetadata?: Record<string, unknown> | null;
  merchantId: number | string;
};

type MerchantResponse = {
  metadata?: Record<string, unknown> | null;
  message?: string;
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

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : "";
}

function isImageUrl(value: string) {
  if (!value) return true;

  if (value.startsWith("/") || value.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildMetadata(
  baseMetadata: Record<string, unknown>,
  form: { imageUrl: string; category: string }
) {
  const metadata = { ...baseMetadata };
  const imageUrl = form.imageUrl.trim();
  const category = form.category.trim();

  if (imageUrl) {
    metadata.imageUrl = imageUrl;
  } else {
    delete metadata.imageUrl;
  }

  if (category) {
    metadata.category = category;
  } else {
    delete metadata.category;
  }

  return metadata;
}

export function MerchantMetadataEditor({
  initialMetadata = null,
  merchantId,
}: MerchantMetadataEditorProps) {
  const router = useRouter();
  const [metadata, setMetadata] = useState<Record<string, unknown>>(
    initialMetadata ?? {}
  );
  const [form, setForm] = useState({
    imageUrl: metadataText(initialMetadata, "imageUrl"),
    category: metadataText(initialMetadata, "category"),
  });
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const previewImageUrl = form.imageUrl.trim();
  const hasPreviewImage =
    previewImageUrl &&
    isImageUrl(previewImageUrl) &&
    failedImageUrl !== previewImageUrl;
  const hasChanges = useMemo(() => {
    return (
      form.imageUrl.trim() !== metadataText(metadata, "imageUrl") ||
      form.category.trim() !== metadataText(metadata, "category")
    );
  }, [form.category, form.imageUrl, metadata]);

  function updateField(key: "imageUrl" | "category", value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccess(null);

    if (key === "imageUrl") {
      setFailedImageUrl(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isImageUrl(form.imageUrl.trim())) {
      setError("Ingresá una URL de imagen válida.");
      return;
    }

    const nextMetadata = buildMetadata(metadata, form);
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/merchants/${encodeURIComponent(String(merchantId))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ metadata: nextMetadata }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | MerchantResponse
        | null;

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar el comercio.")
        );
      }

      const savedMetadata = payload?.metadata ?? nextMetadata;
      setMetadata(savedMetadata);
      setForm({
        imageUrl: metadataText(savedMetadata, "imageUrl"),
        category: metadataText(savedMetadata, "category"),
      });
      setSuccess("Metadata actualizada correctamente.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el comercio."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="merchant-metadata-editor" onSubmit={handleSubmit}>
      <div className="merchant-metadata-preview">
        <span className="merchant-image-preview" aria-hidden="true">
          {hasPreviewImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              referrerPolicy="no-referrer"
              src={previewImageUrl}
              onError={() => setFailedImageUrl(previewImageUrl)}
            />
          ) : (
            <ImageIcon size={20} />
          )}
        </span>
        <div>
          <strong>{form.category.trim() || "Sin categoría"}</strong>
          <span>{previewImageUrl ? "Imagen configurada" : "Sin imagen"}</span>
        </div>
      </div>

      <label className="field-label" htmlFor="merchant-image-url">
        Imagen del comercio
      </label>
      <input
        className="field-control"
        disabled={isSaving}
        id="merchant-image-url"
        inputMode="url"
        placeholder="https://..."
        value={form.imageUrl}
        onChange={(event) => updateField("imageUrl", event.target.value)}
      />

      <label className="field-label" htmlFor="merchant-category">
        Categoría
      </label>
      <div className="merchant-category-field">
        <Tags aria-hidden="true" size={16} />
        <input
          className="field-control"
          disabled={isSaving}
          id="merchant-category"
          placeholder="Restaurante, farmacia, market..."
          value={form.category}
          onChange={(event) => updateField("category", event.target.value)}
        />
      </div>

      {error ? (
        <div className="error-box merchant-metadata-status" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="success-box merchant-metadata-status" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      <button
        className="button-primary merchant-metadata-save"
        disabled={isSaving || !hasChanges}
        type="submit"
      >
        {isSaving ? (
          <Loader2
            aria-hidden="true"
            className="merchant-switch-spinner"
            size={16}
          />
        ) : (
          <Save aria-hidden="true" size={16} />
        )}
        Guardar metadata
      </button>
    </form>
  );
}
