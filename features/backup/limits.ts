// Leave room under Vercel's 4.5 MB request/response limit, including envelopes.
export const backupMaxBytes = 3 * 1024 * 1024;
export const backupLimitMessage = "El archivo supera los 3 MB permitidos.";
