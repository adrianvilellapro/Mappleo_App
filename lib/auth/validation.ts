import { z } from "zod";
import commonPasswords from "./common-passwords.json";
const blockedPasswords = new Set(commonPasswords);
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("Introduce un email válido.")
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(8, "Usa al menos 8 caracteres.")
  .max(128, "La contraseña es demasiado larga.")
  .refine(
    (v) =>
      v.trim().length > 0 &&
      !/^([\s\S])\1+$/u.test(v) &&
      !blockedPasswords.has(v.normalize("NFKC").trim().toLowerCase()) &&
      !/^(password|contraseña|qwerty|letmein|welcome|iloveyou)\d{0,6}[!@#$%]{0,2}$/iu.test(
        v.normalize("NFKC").trim(),
      ) &&
      ![
        "123456789012345",
        "1234567890123456",
        "12345678",
        "password",
        "contraseña",
        "qwerty123",
        "passwordpassword",
        "contraseñacontraseña",
        "qwertyuiopasdfgh",
        "abcdefghijklmnop",
      ].includes(v.normalize("NFKC").trim().toLowerCase()),
    "Elige una contraseña menos predecible.",
  );
export const registrationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Escribe tu nombre (mínimo 2 caracteres).")
      .max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(128),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  })
  .refine(
    (v) =>
      !v.password.toLowerCase().includes(v.email.split("@")[0].toLowerCase()) ||
      v.email.split("@")[0].length < 4,
    { path: ["password"], message: "La contraseña no debe contener tu email." },
  );
export const registrationRequestSchema = registrationSchema.and(
  z.object({
    registrationCode: z
      .string()
      .trim()
      .min(1, "Introduce el código de registro.")
      .max(128),
  }),
);
