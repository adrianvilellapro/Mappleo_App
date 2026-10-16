import { SecurityError } from "./controls";

export async function smallJson(request: Request, maxBytes = 4096) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new SecurityError("Formato no permitido.", 415);
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new SecurityError("Petición demasiado grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SecurityError("Petición inválida.", 400);
  const bytes = new Uint8Array(maxBytes);
  let size = 0,
    chunks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (++chunks > 1024 || size + value.length > maxBytes)
          throw new SecurityError("Petición demasiado grande.", 413);
        bytes.set(value, size);
        size += value.length;
      }
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, size),
        ),
      );
    };
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SecurityError("Petición agotada.", 408)),
          5000,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError("Petición inválida.", 400);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}
