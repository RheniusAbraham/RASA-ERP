import { fileHref } from "@/lib/api";

/** Opens a file stored by the backend (e.g. an uploaded proof) in a new tab. */
export function openFile(url: string) {
  window.open(fileHref(url), "_blank", "noopener");
}
