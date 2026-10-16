export class ReportLimitError extends Error {
  readonly status = 413;
}
export function concatPdfChunks(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (size > 3 * 1024 * 1024)
    throw new ReportLimitError(
      "El informe supera los 3 MB permitidos. Reduce los datos o filtros.",
    );
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
