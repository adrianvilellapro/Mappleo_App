export const workModes = {
  UNKNOWN: "Sin especificar",
  ONSITE: "Presencial",
  HYBRID: "Híbrido",
  REMOTE: "Remoto",
  FLEXIBLE: "Flexible",
};
export const statuses = {
  APPLIED: "Enviada",
  SCREENING: "Primer contacto",
  TECHNICAL_TEST: "Prueba técnica",
  INTERVIEW: "Entrevista",
  FINAL_INTERVIEW: "Entrevista final",
  OFFER_RECEIVED: "Oferta recibida",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  WITHDRAWN: "Retirada",
  GHOSTED: "Sin respuesta",
};
export const sources = {
  OTHER: "Otra",
  LINKEDIN: "LinkedIn",
  COMPANY_WEBSITE: "Web de empresa",
  INFOJOBS: "InfoJobs",
  INDEED: "Indeed",
  RECRUITER: "Recruiter",
  REFERRAL: "Referencia",
  NETWORKING: "Networking",
};
export const eventTypes = {
  OTHER: "Otro",
  JOB_FAIR: "Feria de empleo",
  MEETUP: "Meetup",
  CAREER_DAY: "Career Day",
  HACKATHON: "Hackathon",
  CONFERENCE: "Conferencia",
  WORKSHOP: "Workshop",
  OPEN_DAY: "Open Day",
};
export const activityTypes = {
  NOTE: "Nota",
  EMAIL_RECEIVED: "Email recibido",
  CALL: "Llamada",
  INTERVIEW: "Entrevista",
  TECHNICAL_TEST: "Prueba técnica",
  FOLLOW_UP_SENT: "Follow-up enviado",
  OFFER_RECEIVED: "Oferta recibida",
  REJECTION_RECEIVED: "Rechazo recibido",
  OTHER: "Otro",
};
export const closedStatuses = ["ACCEPTED", "REJECTED", "WITHDRAWN", "GHOSTED"];
export type EntityKind =
  "companies" | "offers" | "applications" | "contacts" | "networking";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "url"
    | "email"
    | "textarea"
    | "number"
    | "datetime-local"
    | "select"
    | "rating"
    | "tagpicker"
    | "checkbox"
    | "multiselect";
  required?: boolean;
  options?: Record<string, string>;
  relation?: "companies" | "offers" | "contacts";
  defaultValue?: string;
  hint?: string;
};
export type EntityConfig = {
  title: string;
  singular: string;
  create: string;
  description: string;
  fields: Field[];
};
const notes: Field = { name: "notes", label: "Notas", type: "textarea" };
const location: Field = {
  name: "location",
  label: "Ubicación",
  hint: "Ciudad, país o remoto",
};
const mode: Field = {
  name: "workMode",
  label: "Modalidad",
  type: "select",
  options: workModes,
};
const interest: Field = {
  name: "interestRating",
  label: "Interés",
  type: "rating",
  options: {
    "1": "1 · Bajo",
    "2": "2 · Moderado",
    "3": "3 · Interesante",
    "4": "4 · Alto",
    "5": "5 · Prioritaria",
  },
  defaultValue: "3",
};
const company: Field = {
  name: "companyId",
  label: "Empresa",
  type: "select",
  relation: "companies",
  required: true,
};
export const entities: Record<EntityKind, EntityConfig> = {
  companies: {
    title: "Empresas",
    singular: "empresa",
    create: "Nueva empresa",
    description:
      "Tu mapa de oportunidades. Guarda las empresas en las que te gustaría trabajar.",
    fields: [
      { name: "name", label: "Nombre", required: true },
      { name: "websiteUrl", label: "Web", type: "url" },
      interest,
      location,
      mode,
      { name: "sector", label: "Sector" },
      { name: "careersUrl", label: "Página de empleo", type: "url" },
      { name: "linkedinUrl", label: "LinkedIn", type: "url" },
      {
        name: "tags",
        label: "Etiquetas",
        hint: "Separadas por comas: producto, startup...",
      },
      notes,
    ],
  },
  offers: {
    title: "Ofertas",
    singular: "oferta",
    create: "Nueva oferta",
    description:
      "Guarda lo que te interesa. Decide cuándo dar el siguiente paso.",
    fields: [
      { name: "title", label: "Puesto", required: true },
      company,
      { name: "url", label: "Enlace a la oferta", type: "url" },
      { name: "source", label: "Fuente", type: "select", options: sources },
      location,
      mode,
      interest,
      { name: "salaryMin", label: "Salario mínimo anual", type: "number" },
      { name: "salaryMax", label: "Salario máximo anual", type: "number" },
      {
        name: "salaryCurrency",
        label: "Moneda",
        type: "select",
        options: { EUR: "EUR", USD: "USD", GBP: "GBP" },
      },
      {
        name: "technologies",
        label: "Tecnologías",
        type: "tagpicker",
        hint: "Busca una tecnología o escribe una nueva y pulsa Añadir.",
      },
      { name: "publishedAt", label: "Publicada", type: "datetime-local" },
      { name: "deadlineAt", label: "Fecha límite", type: "datetime-local" },
      {
        name: "description",
        label: "Descripción de la oferta",
        type: "textarea",
      },
      notes,
    ],
  },
  applications: {
    title: "Candidaturas",
    singular: "candidatura",
    create: "Nueva candidatura",
    description: "Cada proceso, su historia y un siguiente paso claro.",
    fields: [
      {
        name: "jobOfferId",
        label: "Oferta",
        type: "select",
        relation: "offers",
        required: true,
      },
      { name: "status", label: "Estado", type: "select", options: statuses },
      {
        name: "appliedAt",
        label: "Fecha de candidatura",
        type: "datetime-local",
        required: true,
      },
      {
        name: "firstResponseAt",
        label: "Primera respuesta real",
        type: "datetime-local",
        hint: "Fecha del primer contacto del empleador; no incluyas confirmaciones automáticas. Opcional, para tus estadísticas.",
      },
      { name: "cvVersion", label: "Versión del CV" },
      {
        name: "coverLetterUsed",
        label: "Envié carta de presentación",
        type: "checkbox",
      },
      notes,
    ],
  },
  contacts: {
    title: "Contactos",
    singular: "contacto",
    create: "Nuevo contacto",
    description: "Las personas que forman parte de tu búsqueda.",
    fields: [
      { name: "name", label: "Nombre", required: true },
      { ...company, required: false },
      { name: "role", label: "Cargo" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Teléfono" },
      { name: "linkedinUrl", label: "LinkedIn", type: "url" },
      {
        name: "lastContactAt",
        label: "Último contacto",
        type: "datetime-local",
      },
      notes,
    ],
  },
  networking: {
    title: "Networking",
    singular: "evento",
    create: "Nuevo evento",
    description:
      "Conecta fuera de la pantalla. Prepara tus próximos encuentros.",
    fields: [
      { name: "name", label: "Nombre", required: true },
      { name: "type", label: "Tipo", type: "select", options: eventTypes },
      {
        name: "startsAt",
        label: "Empieza",
        type: "datetime-local",
        required: true,
      },
      { name: "endsAt", label: "Termina", type: "datetime-local" },
      location,
      { name: "url", label: "Web del evento", type: "url" },
      {
        name: "companyIds",
        label: "Empresas participantes",
        type: "multiselect",
        relation: "companies",
      },
      {
        name: "contactIds",
        label: "Contactos relacionados",
        type: "multiselect",
        relation: "contacts",
      },
      notes,
    ],
  },
};
export function isEntityKind(value: string): value is EntityKind {
  return Object.hasOwn(entities, value);
}
