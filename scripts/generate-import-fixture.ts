import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { backupSchema } from "../features/backup/schema";

// Datos ficticios y deterministas: importar el mismo archivo dos veces no duplica registros.
const ownerId = "mappleo_import_demo_20260929";
const stamp = (day: number, hour = 10) =>
  new Date(Date.UTC(2026, 8, day, hour)).toISOString();
const id = (kind: string, index: number) =>
  `demo_import_${kind}_${String(index + 1).padStart(2, "0")}`;
const base = (kind: string, index: number) => ({
  id: id(kind, index),
  userId: ownerId,
  createdAt: stamp(1 + (index % 12)),
  updatedAt: stamp(24 + (index % 5)),
});

const companyNames = [
  "Aurora Producto",
  "Brújula Digital",
  "Nébula Salud",
  "Atlas Datos",
  "Marea Estudio",
  "Oliva Cloud",
  "Lumen Finanzas",
  "Faro Energía",
  "Horizonte Edu",
  "Río Abierto",
  "Punto Cero",
  "Verde Norte",
];
const cities = [
  "Madrid",
  "Valencia",
  "Barcelona",
  "Bilbao",
  "Málaga",
  "Sevilla",
  "Alicante",
  "Santander",
  "Zaragoza",
  "Granada",
  "Valladolid",
  "A Coruña",
];
const sectors = [
  "SaaS",
  "Movilidad",
  "Salud digital",
  "Analítica",
  "Diseño",
  "Infraestructura",
  "Fintech",
  "Energía",
  "Edtech",
  "Cultura",
  "E-commerce",
  "Sostenibilidad",
];
const modes = ["REMOTE", "HYBRID", "ONSITE", "FLEXIBLE"];
const companies = companyNames.map((name, index) => {
  const domain = `equipo-${String(index + 1).padStart(2, "0")}.example.com`;
  return {
    ...base("company", index),
    name,
    websiteUrl: `https://${domain}`,
    faviconUrl: "",
    domain,
    careersUrl: `https://${domain}/empleo`,
    linkedinUrl: "",
    location: cities[index],
    workMode: modes[index % modes.length],
    sector: sectors[index],
    interestRating: (index % 5) + 1,
    notes: `Empresa ficticia para probar la importación. Interés en ${sectors[index].toLowerCase()}.`,
    tags: ["demo", sectors[index].toLowerCase()],
    archivedAt: index === 11 ? stamp(26) : null,
  };
});

const roles = [
  "Frontend Engineer",
  "Product Designer",
  "Full Stack Developer",
  "Data Analyst",
  "Backend Engineer",
  "UX Researcher",
  "Cloud Engineer",
  "Product Manager",
  "UI Engineer",
  "Data Engineer",
  "DevOps Engineer",
  "Technical Writer",
];
const techSets = [
  ["React", "TypeScript", "CSS"],
  ["Figma", "Design Systems"],
  ["Node.js", "PostgreSQL"],
  ["Python", "SQL", "Power BI"],
];
const sources = [
  "LINKEDIN",
  "COMPANY_WEBSITE",
  "INFOJOBS",
  "INDEED",
  "RECRUITER",
  "REFERRAL",
  "NETWORKING",
  "OTHER",
];
const offers = Array.from({ length: 24 }, (_, index) => {
  const company = companies[Math.floor(index / 2)];
  return {
    ...base("offer", index),
    companyId: company.id,
    title: `${roles[index % roles.length]} ${index % 2 ? "Senior" : "Mid"}`,
    url: `${company.websiteUrl}/empleo/oferta-${index + 1}`,
    source: sources[index % sources.length],
    location: company.location,
    workMode: modes[index % modes.length],
    salaryMin: index % 4 === 0 ? null : 29000 + index * 1200,
    salaryMax: index % 4 === 0 ? null : 41000 + index * 1500,
    salaryCurrency: "EUR",
    description: `Oferta ficticia de ${company.name} para probar relaciones y filtros.`,
    notes: index % 3 === 0 ? "Preguntar por equipo, mentoría y horario." : "",
    technologies: techSets[index % techSets.length],
    interestRating: (index % 5) + 1,
    publishedAt: stamp(3 + (index % 15)),
    deadlineAt: index % 3 === 0 ? stamp(28) : null,
    savedAt: stamp(8 + (index % 12)),
    archivedAt: index === 23 ? stamp(27) : null,
  };
});

const statuses = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "FINAL_INTERVIEW",
  "OFFER_RECEIVED",
  "REJECTED",
  "GHOSTED",
  "WITHDRAWN",
  "ACCEPTED",
  "INTERVIEW",
  "APPLIED",
  "SCREENING",
  "TECHNICAL_TEST",
  "INTERVIEW",
  "REJECTED",
  "OFFER_RECEIVED",
  "APPLIED",
];
const closed = new Set(["REJECTED", "GHOSTED", "WITHDRAWN", "ACCEPTED"]);
const applications = statuses.map((status, index) => {
  const applicationId = id("application", index);
  const history = [
    {
      id: id("history", index * 3),
      applicationId,
      type: "OTHER",
      fromStatus: null,
      toStatus: "APPLIED",
      title: "Candidatura registrada",
      description: "Envío inicial de la candidatura de prueba.",
      happenedAt: stamp(9 + (index % 10)),
      createdAt: stamp(9 + (index % 10)),
    },
    {
      id: id("history", index * 3 + 1),
      applicationId,
      type: index % 2 ? "CALL" : "EMAIL_RECEIVED",
      fromStatus: null,
      toStatus: null,
      title: index % 2 ? "Llamada con talento" : "Respuesta del equipo",
      description:
        "Conversación ficticia sobre el proceso y los siguientes pasos.",
      happenedAt: stamp(19 + (index % 7)),
      createdAt: stamp(19 + (index % 7)),
    },
    {
      id: id("history", index * 3 + 2),
      applicationId,
      type: status === "INTERVIEW" ? "INTERVIEW" : "NOTE",
      fromStatus: status === "APPLIED" ? null : "APPLIED",
      toStatus: status === "APPLIED" ? null : status,
      title:
        status === "APPLIED"
          ? "Preparar seguimiento"
          : `Estado actualizado: ${status}`,
      description: "Nota de demostración editable desde el historial.",
      happenedAt: stamp(25 + (index % 4)),
      createdAt: stamp(25 + (index % 4)),
    },
  ];
  return {
    ...base("application", index),
    jobOfferId: offers[index].id,
    status,
    appliedAt: stamp(9 + (index % 10)),
    nextAction: closed.has(status)
      ? ""
      : `Preparar siguiente paso ${index + 1}`,
    nextActionDueAt: closed.has(status) ? null : stamp(30 + (index % 7)),
    cvVersion: index % 2 ? "CV producto 2026" : "CV técnico 2026",
    coverLetterUsed: index % 3 === 0,
    notes: "Candidatura de demostración; no corresponde a una oferta real.",
    closedAt: closed.has(status) ? stamp(28) : null,
    events: history,
  };
});

const contactNames = [
  "Lucía Vega",
  "Marcos Ríos",
  "Elena Soto",
  "Daniel Costa",
  "Nora Vidal",
  "Hugo León",
  "Irene Blanco",
  "Clara Soler",
  "Pablo Luna",
  "Marta Navarro",
  "Sofía Martín",
  "Leo Fuentes",
  "Vera Romero",
  "Raúl Pardo",
  "Álex Serrano",
  "Olga Torres",
  "Inés Molina",
  "Bruno Ferrer",
];
const contacts = contactNames.map((name, index) => ({
  ...base("contact", index),
  companyId: index < 15 ? companies[index % companies.length].id : null,
  name,
  role:
    index % 3 === 0
      ? "Recruiter"
      : index % 3 === 1
        ? "Tech Lead"
        : "People Partner",
  email: `contacto${String(index + 1).padStart(2, "0")}@example.com`,
  linkedinUrl: "",
  phone: index % 4 === 0 ? "+34 000 000 000" : "",
  notes: "Contacto ficticio creado para probar importación y seguimiento.",
  lastContactAt: index % 3 === 0 ? stamp(21) : null,
  followUpAt: index < 12 ? stamp(30 + index) : null,
}));

const eventTypes = [
  "JOB_FAIR",
  "MEETUP",
  "WORKSHOP",
  "CAREER_DAY",
  "HACKATHON",
  "CONFERENCE",
  "OPEN_DAY",
  "OTHER",
  "MEETUP",
  "CONFERENCE",
];
const networking = eventTypes.map((type, index) => ({
  ...base("networking", index),
  name: `${["Feria de talento", "Encuentro de producto", "Taller técnico", "Jornada profesional", "Hackathon de datos", "Conferencia digital", "Puertas abiertas", "Café de comunidad", "Meetup frontend", "Conferencia de diseño"][index]} ${index + 1}`,
  type,
  startsAt: stamp(30 + index * 2, 17),
  endsAt: stamp(30 + index * 2, 19),
  location: index % 3 === 0 ? "Online" : cities[index],
  url: `https://eventos.example.com/evento-${index + 1}`,
  notes: "Evento ficticio. Comprobar relaciones con empresas y contactos.",
  companies: [{ id: companies[index % companies.length].id }],
  contacts: [{ id: contacts[index].id }, { id: contacts[index + 1].id }],
}));

const fixture = {
  version: 1,
  exportedAt: stamp(29),
  ownerId,
  companies,
  offers,
  applications,
  contacts,
  networking,
};

backupSchema.parse(fixture);
const outputDirectory = resolve(process.cwd(), "DATOS_PRUEBA_IMPORTACION");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "mappleo-datos-prueba.json"),
  JSON.stringify(fixture, null, 2) + "\n",
  "utf8",
);
console.log(
  `Archivo validado: ${companies.length} empresas, ${offers.length} ofertas, ${applications.length} candidaturas, ${applications.reduce((sum, item) => sum + item.events.length, 0)} entradas de historial, ${contacts.length} contactos y ${networking.length} eventos.`,
);
