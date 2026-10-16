import { describe, expect, it } from "vitest";
import { backupSchema } from "../../packages/domain/backup";

function fixture() {
  const now = new Date().toISOString();
  const base = { userId: "owner", createdAt: now, updatedAt: now };
  return {
    version: 1,
    exportedAt: now,
    ownerId: "owner",
    companies: [],
    offers: [],
    applications: [],
    networking: [],
    contacts: [
      {
        ...base,
        id: "contact",
        companyId: null,
        name: "Contacto",
        role: "",
        email: "",
        linkedinUrl: "",
        phone: "",
        notes: "",
        lastContactAt: null,
        followUpAt: null,
      },
    ],
    boardColumns: [
      {
        id: "column",
        userId: "owner",
        name: "Mi destino",
        position: 0,
        isDone: true,
        systemKey: "doing",
      },
    ],
    tasks: [
      {
        ...base,
        id: "task",
        columnId: "column",
        title: "Acción independiente",
        description: "",
        dueAt: now,
        position: 0,
        completedAt: null,
        sourceKind: "contacts",
        sourceId: "contact",
        links: [],
      },
    ],
  };
}

describe("Compatibilidad del tablero y sus relaciones", () => {
  it("admite un destino de finalización elegido y tareas antiguas independientes de su ficha", () => {
    expect(backupSchema.safeParse(fixture()).success).toBe(true);
  });
  it("sigue rechazando referencias antiguas inexistentes y registros ajenos", () => {
    const missing = fixture();
    missing.contacts = [];
    expect(backupSchema.safeParse(missing).success).toBe(false);
    const foreign = fixture();
    foreign.tasks[0].userId = "other-account";
    expect(backupSchema.safeParse(foreign).success).toBe(false);
  });
  it("rechaza varios destinos de finalización simultáneos", () => {
    const duplicate = fixture();
    duplicate.boardColumns.push({
      ...duplicate.boardColumns[0],
      id: "other",
      systemKey: "done",
    });
    expect(backupSchema.safeParse(duplicate).success).toBe(false);
  });
});
