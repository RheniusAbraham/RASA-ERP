const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const API_ORIGIN = new URL(BASE_URL).origin;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** An uploaded file as described by the backend. `url` is relative to the API host. */
export type FileInfo = {
  kind: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};

/** Turns a backend file url (e.g. /api/v1/drivers/3/files/photo) into one a browser can open. */
export function fileHref(url: string): string {
  return `${API_ORIGIN}${url}`;
}

/** Turns FastAPI's error body into one readable sentence. */
function describeError(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // 422 validation errors: [{ loc: ["body", "phone"], msg: "..." }]
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => `${String(d.loc?.at(-1) ?? "field")}: ${d.msg ?? "invalid"}`)
      .join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // A FormData body needs the browser to set its own multipart Content-Type (with the boundary)
  const isForm = init?.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the server. Make sure the backend is running.", 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(describeError(body, `Request failed (${response.status})`), response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  /** POSTs a multipart form (fields and files together) */
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  /** Uploads one file (multipart field "file") to e.g. /drivers/3/files/photo */
  upload: (path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<FileInfo>(path, { method: "PUT", body: form });
  },
};

/**
 * Creates a record, then uploads its files one by one. If any upload fails the record is
 * deleted again, so the user never ends up with a half-saved driver / staff member / truck
 * and can simply fix the problem and submit again.
 *
 * @param labels  friendly names for the file kinds, used in the error message
 */
export async function createWithFiles<T extends { id: number }>(
  resource: string,
  body: unknown,
  files: Record<string, File | null | undefined>,
  labels: Record<string, string> = {},
): Promise<T> {
  const created = await api.post<T>(`/${resource}`, body);
  let current = "";
  try {
    for (const [kind, file] of Object.entries(files)) {
      if (!file) continue;
      current = kind;
      await api.upload(`/${resource}/${created.id}/files/${kind}`, file);
    }
  } catch (error) {
    await api.delete(`/${resource}/${created.id}`).catch(() => undefined);
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Couldn't upload the ${labels[current] ?? current}: ${reason} Nothing was saved.`);
  }
  return api.get<T>(`/${resource}/${created.id}`);
}

/**
 * Saves changes to a record, then uploads any files the user chose to replace.
 * The details are saved first and stay saved even if a file upload then fails, so the
 * result carries the fresh record plus `uploadError` for the caller to show.
 */
export async function updateWithFiles<T extends { id: number }>(
  resource: string,
  id: number,
  body: unknown,
  files: Record<string, File | null | undefined>,
  labels: Record<string, string> = {},
): Promise<{ record: T; uploadError: string | null }> {
  await api.put<T>(`/${resource}/${id}`, body);
  let uploadError: string | null = null;
  for (const [kind, file] of Object.entries(files)) {
    if (!file) continue;
    try {
      await api.upload(`/${resource}/${id}/files/${kind}`, file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      uploadError = `Your changes were saved, but the ${labels[kind] ?? kind} couldn't be uploaded: ${reason}`;
      break;
    }
  }
  return { record: await api.get<T>(`/${resource}/${id}`), uploadError };
}
