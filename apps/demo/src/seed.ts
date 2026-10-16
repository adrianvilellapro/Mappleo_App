import { backupSchema } from "../../../packages/domain/backup";
import type { Workspace } from "../../../packages/domain/workspace";

/** Entirely synthetic portfolio fixture. Never read an account, export or .env. */
export function createDemoWorkspace(
  language: "es" | "en" = "es",
  now = new Date(),
): Workspace {
  const en = language === "en";
  const ownerId = "demo-john-miller";
  const id = (kind: string, i: number) => `demo_${kind}_${i}`;
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 86400000).toISOString();
  const month = (m: number, d: number) =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 5 + m,
        Math.min(d, m === 5 ? now.getUTCDate() : 27),
        10,
      ),
    ).toISOString();
  const base = (kind: string, i: number, date: string) => ({
    id: id(kind, i),
    userId: ownerId,
    createdAt: date,
    updatedAt: date,
  });
  const names = [
    "Aurora Product",
    "Compass Digital",
    "Nebula Health",
    "Atlas Data",
    "Tide Studio",
    "Olive Cloud",
    "Lumen Finance",
    "Lighthouse Energy",
    "Horizon Learning",
    "Open River",
    "Zero Commerce",
    "Green North",
    "Boreal Systems",
    "Cobalt Apps",
    "Dune Travel",
    "Oak Solutions",
    "Prism Retail",
    "Vertex Labs",
    "Nexus Logistics",
    "Agora Technology",
    "Meridian Software",
    "Sage Digital",
    "Orbit Learning",
    "Altea Experiences",
  ];
  const companies: Workspace["companies"] = names.map((name, i) => ({
    ...base("company", i, month(Math.floor(i / 4), 1 + (i % 4))),
    name,
    location: [
      "Madrid",
      "Valencia",
      "Barcelona",
      "Bilbao",
      "Málaga",
      "Sevilla",
    ][i % 6],
    sector: [
      "SaaS",
      "Fintech",
      "Edtech",
      "Healthtech",
      "E-commerce",
      "Design systems",
    ][i % 6],
    websiteUrl: `https://company-${i + 1}.example.com`,
    careersUrl: "",
    linkedinUrl: "",
    domain: `company-${i + 1}.example.com`,
    faviconUrl: "",
    workMode: i % 3 ? "REMOTE" : "HYBRID",
    interestRating: [5, 4, 3, 4][i % 4],
    tags: ["product", "frontend"],
    notes: en
      ? "Product team focused on accessible interfaces. Ask about autonomy, growth and engineering practices during the first conversation."
      : "Equipo de producto centrado en interfaces accesibles. Preguntar por autonomía, crecimiento y prácticas de ingeniería en la primera conversación.",
    archivedAt: i === 5 || i === 10 ? day(-40) : null,
  }));
  const stacks = [
    ["React", "TypeScript", "Next.js", "Tailwind CSS"],
    ["Angular", "TypeScript", "RxJS", "SCSS"],
    ["Vue.js", "TypeScript", "Vitest"],
    ["React", "Node.js", "PostgreSQL", "Docker"],
    ["HTML", "CSS", "JavaScript", "WCAG"],
    ["React", "Storybook", "Figma"],
  ];
  const channels = [
    "LINKEDIN",
    "COMPANY_WEBSITE",
    "INFOJOBS",
    "INDEED",
    "RECRUITER",
    "REFERRAL",
    "NETWORKING",
    "OTHER",
  ] as const;
  const offers: Workspace["offers"] = Array.from({ length: 64 }, (_, i) => {
    const company = companies[i % 24],
      date = month(Math.min(5, Math.floor(i / 11)), 1 + (i % 20));
    return {
      ...base("offer", i, date),
      companyId: company.id,
      title: [
        "Frontend Developer",
        "Frontend Engineer",
        "Angular Developer",
        "Full Stack Developer",
        "Accessibility Engineer",
        "UI Engineer · Design Systems",
      ][i % 6],
      url: `https://company-${(i % 24) + 1}.example.com/careers/${i}`,
      source: channels[i % 8],
      location: company.location,
      workMode: company.workMode,
      salaryMin: 30000 + (i % 7) * 2500,
      salaryMax: 38000 + (i % 7) * 3000,
      salaryCurrency: "EUR",
      description: en
        ? "Build accessible product interfaces, collaborate with design and backend, and improve automated testing and performance.\n\nA multidisciplinary team with flexible hours, a training budget and thoughtful code reviews. Experience with APIs and reusable components is welcome."
        : "Construir interfaces de producto accesibles, colaborar con diseño y backend y mejorar las pruebas automatizadas y el rendimiento.\n\nEquipo multidisciplinar con horario flexible, presupuesto de formación y revisiones de código. Se valora experiencia con APIs y componentes reutilizables.",
      notes: en
        ? "Adapt my CV with performance metrics and examples of collaboration with design. Confirm the salary range and remote policy."
        : "Adaptar el CV con métricas de rendimiento y ejemplos de colaboración con diseño. Confirmar el rango salarial y la política de trabajo remoto.",
      technologies: stacks[i % 6],
      interestRating: 3 + (i % 3),
      publishedAt: date,
      deadlineAt: i >= 55 ? day(8 + (i % 14)) : null,
      savedAt: date,
      archivedAt: i < 40 && i % 5 === 0 ? day(-20) : null,
    };
  });
  const applications: Workspace["applications"] = [];
  for (let m = 0; m < 6; m++)
    for (let k = 0; k < [6, 8, 9, 10, 11, 10][m]; k++) {
      const i = applications.length,
        appliedAt = month(m, 2 + k * 2);
      const pool = offers.filter((o) => o.createdAt <= appliedAt);
      const offer = pool[(i * 7) % pool.length];
      const active = [
        "APPLIED",
        "SCREENING",
        "TECHNICAL_TEST",
        "INTERVIEW",
        "FINAL_INTERVIEW",
        "OFFER_RECEIVED",
        "APPLIED",
        "INTERVIEW",
        "SCREENING",
        "TECHNICAL_TEST",
      ] as const;
      const status =
        m === 5
          ? active[k]
          : i === 31
            ? "ACCEPTED"
            : (["REJECTED", "GHOSTED", "WITHDRAWN"] as const)[i % 3];
      const stages = [
        "APPLIED",
        "SCREENING",
        "TECHNICAL_TEST",
        "INTERVIEW",
        "FINAL_INTERVIEW",
        "OFFER_RECEIVED",
        "ACCEPTED",
      ] as const;
      const stageCount =
        m === 5
          ? stages.indexOf(status as (typeof stages)[number])
          : status === "ACCEPTED"
            ? 6
            : status === "GHOSTED"
              ? 0
              : 1 + (i % 3);
      const events: Workspace["applications"][number]["events"] = [
        {
          id: id("history", i * 10),
          applicationId: id("application", i),
          type: "APPLICATION_SENT",
          title: en ? "Application sent" : "Candidatura enviada",
          description: en
            ? "Tailored CV and portfolio shared with the team."
            : "CV adaptado y portfolio compartidos con el equipo.",
          fromStatus: null,
          toStatus: "APPLIED",
          happenedAt: appliedAt,
          createdAt: appliedAt,
        },
      ];
      for (let s = 1; s <= stageCount; s++)
        events.push({
          id: id("history", i * 10 + s),
          applicationId: id("application", i),
          type: "STATUS_CHANGED",
          title: en ? "Selection process update" : "Actualización del proceso",
          description: en
            ? "Discussed experience, team expectations and next steps. Prepared concrete examples of accessibility and frontend architecture."
            : "Hablamos de experiencia, expectativas del equipo y siguientes pasos. Preparados ejemplos concretos de accesibilidad y arquitectura frontend.",
          fromStatus: stages[s - 1],
          toStatus: stages[s],
          happenedAt: appliedAt,
          createdAt: appliedAt,
        });
      if (m < 5 && status !== "ACCEPTED")
        events.push({
          id: id("history", i * 10 + 9),
          applicationId: id("application", i),
          type: "STATUS_CHANGED",
          title: en ? "Process closed" : "Proceso cerrado",
          description: en
            ? "Recorded lessons learned for future interviews."
            : "Anotados los aprendizajes para futuras entrevistas.",
          fromStatus: stages[stageCount],
          toStatus: status,
          happenedAt: appliedAt,
          createdAt: appliedAt,
        });
      applications.push({
        ...base("application", i, appliedAt),
        jobOfferId: offer.id,
        status,
        appliedAt,
        firstResponseAt: stageCount ? appliedAt : null,
        nextAction: "",
        nextActionDueAt: null,
        cvVersion: `CV Frontend · ${new Date(appliedAt).getUTCFullYear()}`,
        coverLetterUsed: i % 3 !== 0,
        notes: en
          ? "Highlight my work with TypeScript, accessible components and product teams. Prepare examples of testing and performance. Ask about onboarding and ownership."
          : "Destacar mi trabajo con TypeScript, componentes accesibles y equipos de producto. Preparar ejemplos de pruebas y rendimiento. Preguntar por el onboarding y la autonomía.",
        closedAt: m < 5 ? appliedAt : null,
        events,
      });
    }
  const people = [
    "Emma Brooks",
    "Alex Turner",
    "Sofia Bennett",
    "Daniel Reed",
    "Nora Hayes",
    "Hugo Clark",
    "Irene Parker",
    "Clara Woods",
    "Pablo West",
    "Marta Ellis",
    "Leo Grant",
    "Sara Moore",
  ];
  const contacts: Workspace["contacts"] = Array.from(
    { length: 36 },
    (_, i) => ({
      ...base("contact", i, month(Math.floor(i / 6), 3 + (i % 5))),
      companyId: companies[i % 24].id,
      name:
        people[i % people.length] +
        (i >= 12 ? ` ${String.fromCharCode(65 + Math.floor(i / 12))}.` : ""),
      role: [
        "Talent Partner",
        "Engineering Manager",
        "Frontend Lead",
        "Recruiter IT",
      ][i % 4],
      email: `contact-${i + 1}@example.test`,
      linkedinUrl: "",
      phone: "",
      notes: en
        ? "Met at a frontend community event. Send an updated portfolio and a short personalised message."
        : "Nos conocimos en un evento de la comunidad frontend. Enviar el portfolio actualizado y un mensaje breve y personalizado.",
      lastContactAt: month(Math.floor(i / 6), 9),
      followUpAt: null,
    }),
  );
  const eventNames = en
    ? [
        "Frontend meetup",
        "Accessibility workshop",
        "Product coffee",
        "React & TypeScript community",
        "Technical interview workshop",
        "Startup career day",
      ]
    : [
        "Meetup frontend",
        "Taller de accesibilidad",
        "Café de producto",
        "Comunidad React y TypeScript",
        "Taller de entrevistas técnicas",
        "Career day de startups",
      ];
  const networking: Workspace["networking"] = Array.from(
    { length: 18 },
    (_, i) => {
      const startsAt =
        i >= 14
          ? day(2 + (i - 14) * 5)
          : month(Math.floor(i / 3), 5 + (i % 3) * 7);
      return {
        ...base("networking", i, month(Math.min(5, Math.floor(i / 3)), 1)),
        name: `${eventNames[i % 6]} · ${["Valencia", "Madrid", "Online"][i % 3]}`,
        type: (["MEETUP", "WORKSHOP", "CONFERENCE", "CAREER_DAY"] as const)[
          i % 4
        ],
        startsAt,
        endsAt: new Date(new Date(startsAt).getTime() + 10800000).toISOString(),
        location: ["Valencia", "Madrid", "Online"][i % 3],
        url: "",
        notes: en
          ? "Review participating companies and prepare a short introduction. Aim to connect with two product teams."
          : "Revisar las empresas participantes y preparar una presentación breve. Objetivo: conversar con dos equipos de producto.",
        companies: [{ id: companies[i % 24].id }],
        contacts: [{ id: contacts[i % 36].id }],
      };
    },
  );
  const columnNames = en
    ? ["To do", "This week", "In progress", "Waiting for a reply", "Completed"]
    : [
        "Por hacer",
        "Esta semana",
        "En curso",
        "Esperando respuesta",
        "Completadas",
      ];
  const boardColumns: NonNullable<Workspace["boardColumns"]> = columnNames.map(
    (name, i) => ({
      id: id("column", i),
      userId: ownerId,
      name,
      position: i,
      isDone: i === 4,
      systemKey: i === 0 ? "todo" : i === 2 ? "doing" : i === 4 ? "done" : null,
    }),
  );
  const taskNames = en
    ? [
        "Prepare technical interview",
        "Update portfolio case study",
        "Send tailored CV",
        "Review component exercise",
        "Follow up with the team",
        "Rehearse project presentation",
        "Prepare questions about the team",
        "Review offer conditions",
      ]
    : [
        "Preparar entrevista técnica",
        "Actualizar caso de estudio del portfolio",
        "Enviar CV adaptado",
        "Revisar prueba de componentes",
        "Consultar novedades al equipo",
        "Ensayar presentación del proyecto",
        "Preparar preguntas sobre el equipo",
        "Revisar condiciones de la oferta",
      ];
  const tasks: NonNullable<Workspace["tasks"]> = Array.from(
    { length: 34 },
    (_, i) => ({
      ...base("task", i, day(-6 + (i % 4))),
      columnId: boardColumns[i < 26 ? i % 4 : 4].id,
      title: `${taskNames[i % 8]} · ${companies[i % 24].name}`,
      description: en
        ? "Set aside 45 minutes. Review the linked record, prepare concrete examples and note what can be reused for future applications."
        : "Reservar 45 minutos. Revisar la ficha vinculada, preparar ejemplos concretos y anotar lo que se puede reutilizar en próximas candidaturas.",
      dueAt: day((i % 12) - 1),
      position: i,
      completedAt: i < 26 ? null : day(-i % 8),
      sourceKind: null,
      sourceId: null,
      links: [
        {
          kind: "companies",
          recordId: companies[i % 24].id,
          label: companies[i % 24].name,
        },
        ...(i < 10
          ? [
              {
                kind: "applications" as const,
                recordId: applications[applications.length - 1 - i].id,
                label: en ? "Selection process" : "Proceso de selección",
              },
            ]
          : []),
      ],
    }),
  );
  const taskCompletions: NonNullable<Workspace["taskCompletions"]> = Array.from(
    { length: 64 },
    (_, i) => ({
      id: id("completion", i),
      userId: ownerId,
      taskId: i >= 56 ? tasks[26 + i - 56].id : null,
      taskIdentity: i >= 56 ? tasks[26 + i - 56].id : id("historic_task", i),
      title: taskNames[i % 8],
      companyIds: [companies[i % 24].id],
      sources: [channels[i % 8]],
      sourceKind: null,
      sourceId: null,
      completedAt:
        i >= 56
          ? tasks[26 + i - 56].completedAt!
          : month(Math.floor(i / 11), 2 + (i % 20)),
    }),
  );
  return JSON.parse(
    JSON.stringify(
      backupSchema.parse({
        version: 1,
        exportedAt: now.toISOString(),
        ownerId,
        companies,
        offers,
        applications,
        contacts,
        networking,
        technologyTags: [...new Set(stacks.flat())],
        boardColumns,
        tasks,
        taskCompletions,
      }),
    ),
  ) as Workspace;
}
