import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptClient } from "../lib/db/encrypted-client";

const mode = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();
if (mode !== "--check" && mode !== "--apply")
  throw new Error(
    "Uso: npm.cmd run demo:check -- email@ejemplo.com o npm.cmd run demo:seed -- email@ejemplo.com",
  );
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Indica el email exacto de una cuenta existente.");
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
if (
  !database ||
  database.pathname !== "/mappleo" ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.port !== "5433"
)
  throw new Error("Esta herramienta solo puede usar la base local mappleo.");

const db = encryptClient(
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  }),
);

const companyData = [
  ["Aurora Labs", "Producto digital", "Madrid", "HYBRID", "producto,saas"],
  [
    "Nébula Health",
    "Salud digital",
    "Barcelona",
    "REMOTE",
    "healthtech,impacto",
  ],
  ["Brújula Tech", "Movilidad", "Valencia", "FLEXIBLE", "movilidad,datos"],
  ["Verde Norte", "Sostenibilidad", "Bilbao", "HYBRID", "climate,producto"],
  ["Marea Studio", "Diseño de producto", "Málaga", "REMOTE", "diseño,startup"],
  ["Atlas Data", "Analítica", "Madrid", "ONSITE", "datos,b2b"],
  ["Lumen Finance", "Fintech", "Barcelona", "HYBRID", "fintech,escala"],
  ["Oliva Cloud", "Infraestructura", "Sevilla", "REMOTE", "cloud,devtools"],
  ["Horizonte Edu", "Educación", "Zaragoza", "FLEXIBLE", "edtech,impacto"],
  [
    "Punto Cero",
    "Comercio digital",
    "Alicante",
    "ONSITE",
    "ecommerce,producto",
  ],
  ["Faro Energy", "Energía", "Santander", "HYBRID", "energía,datos"],
  ["Río Abierto", "Cultura digital", "Granada", "REMOTE", "cultura,frontend"],
] as const;

const offerTitles = [
  ["Frontend Engineer", "Product Designer"],
  ["Full Stack Developer", "UX Researcher"],
  ["Data Analyst", "Frontend Developer"],
  ["Sustainability Data Engineer", "Product Manager"],
  ["UI Engineer", "Design Systems Specialist"],
  ["Analytics Engineer", "Backend Developer"],
  ["Software Engineer", "Data Product Analyst"],
  ["Cloud Platform Engineer", "Developer Advocate"],
  ["Learning Experience Designer", "Full Stack Engineer"],
  ["E-commerce Analyst", "Frontend Engineer"],
  ["Energy Data Scientist", "Product Designer"],
  ["Creative Developer", "Community Manager"],
] as const;

const contactNames = [
  ["Lucía Vega", "Talent Partner"],
  ["Marcos Ríos", "Engineering Manager"],
  ["Elena Soto", "Recruiter"],
  ["Sofía Martín", "Product Lead"],
  ["Daniel Costa", "CTO"],
  ["Nora Vidal", "People Ops"],
  ["Hugo León", "Tech Lead"],
  ["Irene Blanco", "Talent Acquisition"],
  ["Álex Serrano", "Data Lead"],
  ["Clara Soler", "Design Manager"],
  ["Pablo Luna", "Recruiter"],
  ["Marta Navarro", "Community Lead"],
  ["Raúl Pardo", "Hiring Manager"],
  ["Vera Romero", "Product Director"],
  ["Leo Fuentes", "Organizador de eventos"],
] as const;

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
] as const;
const sources = [
  "LINKEDIN",
  "COMPANY_WEBSITE",
  "INFOJOBS",
  "INDEED",
  "RECRUITER",
  "REFERRAL",
  "NETWORKING",
  "OTHER",
] as const;
const eventNames = [
  ["Feria de talento tecnológico", "JOB_FAIR", -7],
  ["Meetup de diseño de producto", "MEETUP", -3],
  ["Workshop de entrevistas técnicas", "WORKSHOP", 2],
  ["Café con equipos de producto", "MEETUP", 5],
  ["Career Day de startups", "CAREER_DAY", 8],
  ["Hackathon por el clima", "HACKATHON", 12],
  ["Conferencia de datos", "CONFERENCE", 17],
  ["Open Day de Aurora Labs", "OPEN_DAY", 23],
  ["Encuentro de comunidad frontend", "MEETUP", 30],
] as const;

function at(daysFromToday: number, hour = 10) {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysFromToday,
      hour,
    ),
  );
}

async function main() {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    console.log(
      "La cuenta indicada no existe. No se ha creado ni cambiado nada.",
    );
    return;
  }
  const ids = (kind: string, index: number) =>
    "demo_" +
    createHash("sha256")
      .update(JSON.stringify([user.id, kind, index]))
      .digest("hex")
      .slice(0, 28);
  const counts = async () => ({
    empresas: await db.company.count({ where: { userId: user.id } }),
    ofertas: await db.jobOffer.count({ where: { userId: user.id } }),
    candidaturas: await db.application.count({ where: { userId: user.id } }),
    historial: await db.applicationEvent.count({
      where: { application: { userId: user.id } },
    }),
    contactos: await db.contact.count({ where: { userId: user.id } }),
    eventos: await db.networkingEvent.count({ where: { userId: user.id } }),
  });
  const before = await counts();
  if (mode === "--check") {
    console.log(
      JSON.stringify(
        { cuenta: email, antes: before, acción: "solo lectura" },
        null,
        2,
      ),
    );
    return;
  }

  const note = "Datos ficticios de prueba para visualizar Mappleo.";
  await db.$transaction(
    async (tx) => {
      await tx.company.createMany({
        skipDuplicates: true,
        data: companyData.map(
          ([name, sector, location, workMode, tags], i) => ({
            id: ids("company", i),
            userId: user.id,
            name,
            sector,
            location,
            workMode,
            interestRating: (i % 5) + 1,
            tags: tags.split(","),
            websiteUrl: `https://example.com/empresas/${i + 1}`,
            faviconUrl: "https://example.com/favicon.ico",
            careersUrl:
              i % 2 === 0 ? `https://example.com/empleo/${i + 1}` : "",
            notes: `${note} Interés en su equipo de ${sector.toLowerCase()}.`,
            archivedAt: i === 11 ? at(-12) : null,
          }),
        ),
      });
      await tx.jobOffer.createMany({
        skipDuplicates: true,
        data: offerTitles.flatMap((pair, companyIndex) =>
          pair.map((title, j) => {
            const i = companyIndex * 2 + j;
            const salaryMin = i % 4 === 0 ? null : 30000 + (i % 8) * 3000;
            return {
              id: ids("offer", i),
              userId: user.id,
              companyId: ids("company", companyIndex),
              title,
              url: `https://example.com/ofertas/${i + 1}`,
              source: sources[i % sources.length],
              location: companyData[companyIndex][2],
              workMode: companyData[companyIndex][3],
              salaryMin,
              salaryMax: salaryMin === null ? null : salaryMin + 8000,
              salaryCurrency: "EUR",
              technologies:
                i % 3 === 0
                  ? ["React", "TypeScript", "Next.js"]
                  : i % 3 === 1
                    ? ["Figma", "Investigación", "Accesibilidad"]
                    : ["SQL", "Python", "PostgreSQL"],
              interestRating: (i % 5) + 1,
              description: `Vacante ficticia de ${title} en ${companyData[companyIndex][0]}.`,
              notes: `${note} Revisar cultura y condiciones del puesto.`,
              publishedAt: at(-(i + 3)),
              deadlineAt: i % 5 === 0 ? at(10 + i) : null,
              savedAt: at(-Math.min(i + 1, 25)),
              archivedAt: i === 23 ? at(-5) : null,
            };
          }),
        ),
      });
      await tx.application.createMany({
        skipDuplicates: true,
        data: statuses.map((status, i) => {
          const closed = [
            "REJECTED",
            "GHOSTED",
            "WITHDRAWN",
            "ACCEPTED",
          ].includes(status);
          return {
            id: ids("application", i),
            userId: user.id,
            jobOfferId: ids("offer", i),
            status,
            appliedAt: at(-(i * 2 + 4)),
            nextAction: closed
              ? ""
              : [
                  "Preparar entrevista",
                  "Enviar follow-up",
                  "Revisar portfolio",
                  "Completar prueba técnica",
                  "Confirmar disponibilidad",
                ][i % 5],
            nextActionDueAt: closed ? null : at((i % 9) - 2, 11),
            cvVersion: [
              "CV producto 2026",
              "CV desarrollo 2026",
              "CV datos 2026",
            ][i % 3],
            coverLetterUsed: i % 3 === 0,
            notes: `${note} Seguimiento del proceso y próximos pasos.`,
            closedAt: closed ? at(-i) : null,
          };
        }),
      });
      const demoApplications = new Set(
        (
          await tx.application.findMany({
            where: {
              userId: user.id,
              id: { in: statuses.map((_, i) => ids("application", i)) },
            },
            select: { id: true },
          })
        ).map((item) => item.id),
      );
      await tx.applicationEvent.createMany({
        skipDuplicates: true,
        data: statuses.flatMap((status, i) => {
          if (!demoApplications.has(ids("application", i))) return [];
          const events = [
            {
              id: ids("history", i * 3),
              applicationId: ids("application", i),
              type: "NOTE",
              title: "Candidatura registrada",
              description: "Oferta revisada y CV adaptado.",
              happenedAt: at(-(i * 2 + 4)),
            },
            {
              id: ids("history", i * 3 + 1),
              applicationId: ids("application", i),
              type: "EMAIL_RECEIVED",
              title: "Respuesta del equipo",
              description: "Confirmación de recepción y siguientes pasos.",
              happenedAt: at(-(i * 2 + 2)),
            },
          ];
          if (status !== "APPLIED")
            events.push({
              id: ids("history", i * 3 + 2),
              applicationId: ids("application", i),
              type: [
                "CALL",
                "INTERVIEW",
                "TECHNICAL_TEST",
                "FOLLOW_UP_SENT",
                "OFFER_RECEIVED",
                "REJECTION_RECEIVED",
              ][i % 6],
              title: [
                "Llamada inicial",
                "Entrevista con el equipo",
                "Prueba técnica",
                "Seguimiento enviado",
                "Propuesta recibida",
                "Cierre del proceso",
              ][i % 6],
              description:
                "Anotación ficticia para probar el historial del proceso.",
              happenedAt: at(-i),
            });
          return events;
        }),
      });
      await tx.contact.createMany({
        skipDuplicates: true,
        data: contactNames.map(([name, role], i) => ({
          id: ids("contact", i),
          userId: user.id,
          companyId: i < 12 ? ids("company", i) : null,
          name,
          role,
          email: `contacto${i + 1}@example.com`,
          phone: i % 3 === 0 ? "+34 600 000 000" : "",
          notes: `${note} Contacto de networking y selección.`,
          lastContactAt: i % 4 === 0 ? null : at(-(i + 2)),
          followUpAt: i % 3 === 0 ? null : at((i % 11) - 2),
        })),
      });
      for (let i = 0; i < eventNames.length; i++) {
        const [name, type, days] = eventNames[i];
        const id = ids("networking", i);
        if (
          await tx.networkingEvent.findUnique({
            where: { id },
            select: { id: true },
          })
        )
          continue;
        await tx.networkingEvent.create({
          data: {
            id,
            userId: user.id,
            name,
            type,
            startsAt: at(days, 17),
            endsAt: at(days, 19),
            location: ["Madrid", "Barcelona", "Online", "Valencia"][i % 4],
            url: `https://example.com/eventos/${i + 1}`,
            notes: `${note} Preparar preguntas y revisar asistentes.`,
            companies: {
              connect: [
                { id: ids("company", i % 12) },
                { id: ids("company", (i + 3) % 12) },
              ],
            },
            contacts: {
              connect: [
                { id: ids("contact", i) },
                { id: ids("contact", (i + 4) % 15) },
              ],
            },
          },
        });
      }
    },
    { maxWait: 10000, timeout: 120000 },
  );
  const after = await counts();
  console.log(
    JSON.stringify({ cuenta: email, antes: before, después: after }, null, 2),
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}
