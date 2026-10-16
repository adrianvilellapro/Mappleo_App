import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// Text and free-form content can contain personal data even in business records.
// IDs, dates, statuses, numbers and technology names remain queryable metadata.
export const protectedFields: Record<string, readonly string[]> = {
  User: ["name", "email"],
  Company: [
    "name",
    "websiteUrl",
    "faviconUrl",
    "domain",
    "careersUrl",
    "linkedinUrl",
    "location",
    "sector",
    "notes",
    "tags",
  ],
  JobOffer: ["title", "url", "location", "description", "notes"],
  Application: ["nextAction", "cvVersion", "notes"],
  ApplicationEvent: ["title", "description"],
  Contact: ["name", "role", "email", "linkedinUrl", "phone", "notes"],
  NetworkingEvent: ["name", "location", "url", "notes"],
  BoardColumn: ["name"],
  Task: ["title", "description"],
  TaskLink: ["label"],
  TaskCompletion: ["title"],
};
export const protectedDefaults: Record<string, readonly string[]> = {
  Company: protectedFields.Company.filter((f) => !["name", "tags"].includes(f)),
  JobOffer: ["url", "location", "description", "notes"],
  Application: protectedFields.Application,
  ApplicationEvent: ["description"],
  Contact: protectedFields.Contact.filter((f) => f !== "name"),
  NetworkingEvent: ["location", "url", "notes"],
  Task: ["description"],
};
export const relations: Record<string, Record<string, string>> = {
  User: {
    companies: "Company",
    offers: "JobOffer",
    applications: "Application",
    contacts: "Contact",
    networkingEvents: "NetworkingEvent",
    boardColumns: "BoardColumn",
    tasks: "Task",
    taskCompletions: "TaskCompletion",
    authSessions: "AuthSession",
  },
  AuthSession: { user: "User" },
  Company: {
    user: "User",
    offers: "JobOffer",
    contacts: "Contact",
    networkingEvents: "NetworkingEvent",
  },
  JobOffer: { user: "User", company: "Company", applications: "Application" },
  Application: {
    user: "User",
    jobOffer: "JobOffer",
    events: "ApplicationEvent",
  },
  ApplicationEvent: { application: "Application" },
  Contact: {
    user: "User",
    company: "Company",
    networkingEvents: "NetworkingEvent",
  },
  NetworkingEvent: { user: "User", companies: "Company", contacts: "Contact" },
  BoardColumn: { user: "User", tasks: "Task" },
  Task: {
    user: "User",
    column: "BoardColumn",
    links: "TaskLink",
    completions: "TaskCompletion",
  },
  TaskLink: { task: "Task" },
  TaskCompletion: { user: "User", task: "Task" },
};
export const cipherPrefix = "mappleo:enc:1:";

function decodeKey(value: unknown): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error("Field encryption requires a random 32-byte base64 key.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new Error("Invalid field encryption key.");
  return key;
}
export function fieldCipher(
  env: Record<string, string | undefined> = process.env,
) {
  let configured: Record<string, unknown>;
  try {
    configured = JSON.parse(env.FIELD_ENCRYPTION_KEYS ?? "");
  } catch {
    throw new Error(
      "Configure field encryption with npm run encryption:prepare. Never replace lost keys.",
    );
  }
  if (
    !configured ||
    Array.isArray(configured) ||
    typeof configured !== "object"
  )
    throw new Error("Invalid field encryption keyring.");
  const keys = new Map<string, Buffer>();
  for (const [id, key] of Object.entries(configured)) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id))
      throw new Error("Invalid encryption key identifier.");
    keys.set(id, decodeKey(key));
  }
  const active = env.FIELD_ENCRYPTION_ACTIVE_KEY;
  if (!active || !keys.has(active))
    throw new Error("Missing active encryption key.");
  const indexKey = decodeKey(env.FIELD_ENCRYPTION_INDEX_KEY);
  if ([...keys.values()].some((key) => key.equals(indexKey)))
    throw new Error("Email lookup and encryption must use independent keys.");
  const aad = (model: string, field: string, id: string) =>
    Buffer.from(JSON.stringify(["Mappleo", 1, model, field, id]));
  return {
    encrypt(value: string, model: string, field: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keys.get(active)!, iv);
      cipher.setAAD(aad(model, field, active));
      const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return `${cipherPrefix}${active}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
    },
    decrypt(value: string, model: string, field: string) {
      try {
        if (!value.startsWith(cipherPrefix)) throw new Error();
        const [id, encoded, ...extra] = value
          .slice(cipherPrefix.length)
          .split(":");
        const key = keys.get(id);
        if (
          !key ||
          !encoded ||
          extra.length ||
          !/^[A-Za-z0-9_-]+$/.test(encoded)
        )
          throw new Error();
        const payload = Buffer.from(encoded, "base64url");
        if (payload.length < 28 || payload.toString("base64url") !== encoded)
          throw new Error();
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          payload.subarray(0, 12),
        );
        decipher.setAAD(aad(model, field, id));
        decipher.setAuthTag(payload.subarray(12, 28));
        return Buffer.concat([
          decipher.update(payload.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // Do not disclose the value, key material, or cryptographic failure details.
        throw new Error(
          "Cannot authenticate encrypted database data. Check the server keyring.",
        );
      }
    },
    emailLookup(email: string) {
      return createHmac("sha256", indexKey)
        .update("Mappleo/User/email/v1\0")
        .update(email.trim().toLowerCase())
        .digest("hex");
    },
  };
}
export type FieldCipher = ReturnType<typeof fieldCipher>;
