import type { PrismaClient } from "../../generated/prisma/client";
import {
  fieldCipher,
  protectedFields,
  protectedDefaults,
  relations,
  type FieldCipher,
} from "./field-encryption";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
function mapValues(
  value: unknown,
  callback: (v: ObjectValue) => ObjectValue,
): unknown {
  return Array.isArray(value)
    ? value.map((v) => mapValues(v, callback))
    : object(value)
      ? callback(value)
      : value;
}
function lookupFilter(value: unknown, cipher: FieldCipher): unknown {
  if (typeof value === "string") return cipher.emailLookup(value);
  if (!object(value)) throw new Error("Unsupported encrypted email filter.");
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (!["equals", "in", "notIn", "not"].includes(key))
        throw new Error("Unsupported encrypted email filter.");
      return [
        key,
        Array.isArray(v)
          ? v.map((email) => lookupFilter(email, cipher))
          : lookupFilter(v, cipher),
      ];
    }),
  );
}
function where(model: string, value: unknown, cipher: FieldCipher): unknown {
  return mapValues(value, (input) =>
    Object.fromEntries(
      Object.entries(input).map(([key, v]) => {
        if (
          ["AND", "OR", "NOT", "some", "every", "none", "is", "isNot"].includes(
            key,
          )
        )
          return [key, where(model, v, cipher)];
        if (model === "User" && key === "email")
          return ["emailLookup", lookupFilter(v, cipher)];
        const related = relations[model]?.[key];
        if (related) return [key, where(related, v, cipher)];
        if (protectedFields[model]?.includes(key))
          throw new Error(
            "Filter encrypted fields after authorized decryption, not in SQL.",
          );
        return [key, v];
      }),
    ),
  );
}
function data(
  model: string,
  value: unknown,
  create: boolean,
  cipher: FieldCipher,
): unknown {
  return mapValues(value, (input) => {
    const result = { ...input };
    if (create && model === "User" && !("boardColumns" in result))
      result.boardColumns = {
        create: [
          { name: "Por hacer", position: 0, isDone: false, systemKey: "todo" },
          { name: "En curso", position: 1, isDone: false, systemKey: "doing" },
          { name: "Completadas", position: 2, isDone: true, systemKey: "done" },
        ],
      };
    if (create)
      for (const field of protectedDefaults[model] ?? []) result[field] ??= "";
    for (const [key, v] of Object.entries(result)) {
      if (protectedFields[model]?.includes(key)) {
        const plain = object(v) && "set" in v ? v.set : v;
        if (plain == null) continue;
        if (
          typeof plain !== "string" &&
          !(Array.isArray(plain) && plain.every((s) => typeof s === "string"))
        )
          throw new Error("Unsupported encrypted field update.");
        if (model === "User" && key === "email") {
          if (typeof plain !== "string") throw new Error("Invalid email.");
          result.emailLookup = cipher.emailLookup(plain);
        }
        const encrypted =
          typeof plain === "string"
            ? cipher.encrypt(plain, model, key)
            : plain.map((s) => cipher.encrypt(s, model, key));
        result[key] = object(v) ? { set: encrypted } : encrypted;
      } else if (relations[model]?.[key] && object(v)) {
        result[key] = nestedWrite(relations[model][key], v, cipher);
      }
    }
    return result;
  });
}
function nestedWrite(
  model: string,
  value: ObjectValue,
  cipher: FieldCipher,
): ObjectValue {
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (key === "create") return [key, data(model, v, true, cipher)];
      if (key === "createMany")
        return [
          key,
          object(v) ? { ...v, data: data(model, v.data, true, cipher) } : v,
        ];
      if (
        ["connect", "set", "disconnect", "delete", "deleteMany"].includes(key)
      )
        return [key, where(model, v, cipher)];
      if (["upsert", "connectOrCreate", "updateMany"].includes(key))
        return [key, mapValues(v, (item) => argumentsFor(model, item, cipher))];
      if (key === "update")
        return [
          key,
          mapValues(v, (item) =>
            "data" in item
              ? argumentsFor(model, item, cipher)
              : (data(model, item, false, cipher) as ObjectValue),
          ),
        ];
      throw new Error("Unsupported encrypted nested write.");
    }),
  );
}
function argumentsFor(
  model: string,
  args: ObjectValue,
  cipher: FieldCipher,
  operation?: string,
): ObjectValue {
  const result = { ...args };
  if (args.where) result.where = where(model, args.where, cipher);
  if (args.data)
    result.data = data(
      model,
      args.data,
      !!operation?.startsWith("create"),
      cipher,
    );
  if (args.create) result.create = data(model, args.create, true, cipher);
  if (args.update) result.update = data(model, args.update, false, cipher);
  for (const selection of ["select", "include"])
    if (object(args[selection]))
      result[selection] = Object.fromEntries(
        Object.entries(args[selection]).map(([key, v]) => [
          key,
          relations[model]?.[key] && object(v)
            ? argumentsFor(relations[model][key], v, cipher)
            : v,
        ]),
      );
  for (const kind of ["orderBy", "cursor", "distinct", "by", "having"]) {
    const value = args[kind];
    if (
      value &&
      JSON.stringify(value).match(
        new RegExp(`"(${(protectedFields[model] ?? []).join("|")})"`),
      )
    )
      throw new Error(
        "Encrypted fields cannot be ordered or aggregated in SQL.",
      );
  }
  return result;
}
function decode(model: string, value: unknown, cipher: FieldCipher): unknown {
  return mapValues(value, (input) =>
    Object.fromEntries(
      Object.entries(input).map(([key, v]) => {
        if (protectedFields[model]?.includes(key)) {
          if (typeof v === "string")
            return [key, cipher.decrypt(v, model, key)];
          if (Array.isArray(v))
            return [key, v.map((s) => cipher.decrypt(s, model, key))];
        }
        return [
          key,
          relations[model]?.[key]
            ? decode(relations[model][key], v, cipher)
            : v,
        ];
      }),
    ),
  );
}
export function encryptClient(
  client: PrismaClient,
  cipher = fieldCipher(),
): PrismaClient {
  return client.$extends({
    name: "mappleo-encrypted-fields",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const transformed = argumentsFor(
            model,
            args as ObjectValue,
            cipher,
            operation,
          );
          const result = await query(transformed as typeof args);
          if (
            [
              "count",
              "aggregate",
              "groupBy",
              "updateMany",
              "deleteMany",
              "createMany",
            ].includes(operation)
          )
            return result;
          return decode(model, result, cipher) as typeof result;
        },
      },
    },
  }) as unknown as PrismaClient;
}
