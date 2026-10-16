export const csvSections = [
  { id: "companies", label: "Empresas", filename: "empresas.csv" },
  { id: "offers", label: "Ofertas", filename: "ofertas.csv" },
  { id: "applications", label: "Candidaturas", filename: "candidaturas.csv" },
  { id: "history", label: "Historial", filename: "historial.csv" },
  { id: "contacts", label: "Contactos", filename: "contactos.csv" },
  { id: "networking", label: "Networking", filename: "networking.csv" },
  { id: "tasks", label: "Tareas del Kanban", filename: "tareas.csv" },
  {
    id: "completions",
    label: "Tareas completadas",
    filename: "finalizaciones.csv",
  },
] as const;
export type CsvSection = (typeof csvSections)[number]["id"];
