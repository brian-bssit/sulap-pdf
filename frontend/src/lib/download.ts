// Trigger browser download from a blob response, honoring the server's
// Content-Disposition filename (fallback kalau header tak ada).
export function filenameFromDisposition(disposition?: string, fallback = "download.pdf"): string {
  if (!disposition) return fallback;
  // filename* (RFC 5987, URL-encoded) menang — dipakai backend utk nama non-ASCII.
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fallthrough */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1] || fallback;
}

export function downloadBlob(data: Blob, disposition?: string, fallback = "download.pdf"): void {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromDisposition(disposition, fallback);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
