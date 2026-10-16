import { concatPdfChunks } from "../reports/pdf-runtime";
import { prettyDate, type Statistics } from "./model";
import { sources } from "@/features/tracker/config";
export function renderStatisticsPdf(
  PDFDocument: typeof import("pdfkit"),
  report: Statistics,
  companyLabel: string,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
      info: { Title: "Mappleo · Informe de estadísticas", Author: "Mappleo" },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (b: Uint8Array) => chunks.push(b));
    doc.on("end", () => {
      try {
        resolve(concatPdfChunks(chunks));
      } catch (error) {
        reject(error);
      }
    });
    doc.on("error", reject);
    const width = doc.page.width - 72,
      ink = "#111827",
      muted = "#64748B",
      teal = "#0F766E",
      colors = [teal, "#60A5FA", "#C084FC"];
    const text = (
      value: string,
      x: number,
      y: number,
      w: number = width,
      size = 10,
      bold = false,
      color = ink,
    ) =>
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(value, x, y, { width: w, height: 28, ellipsis: true });
    const heading = () => {
      doc.rect(0, 0, doc.page.width, 6).fill(teal);
      text("Mappleo", 36, 27, 130, 21, true, teal);
      text("Informe de estadísticas", 200, 29, 450, 19, true);
      text(
        prettyDate(report.filters.from) +
          " - " +
          prettyDate(report.filters.to) +
          " · Europe/Madrid",
        36,
        66,
        width,
        10,
      );
      text(
        "Fuente: " +
          (sources[report.filters.source as keyof typeof sources] ?? "Todas") +
          "   |   Empresa: " +
          companyLabel +
          "   |   Agrupación: " +
          (report.filters.group === "week" ? "semanal" : "mensual"),
        36,
        86,
        width,
        9,
        false,
        muted,
      );
      text(
        "Resultados hasta " + prettyDate(report.generatedAt),
        36,
        103,
        width,
        8,
        false,
        muted,
      );
    };
    const newPage = () => {
      doc.addPage();
      heading();
    };
    heading();
    const metrics = [
      ["Enviadas", String(report.sent)],
      [
        "Respuesta registrada",
        report.responseRate === null ? "Sin datos" : report.responseRate + " %",
      ],
      [
        "Llegaron a entrevista",
        report.interviewRate === null
          ? "Sin datos"
          : report.interviewRate + " %",
      ],
      [
        "Mediana hasta responder",
        report.medianDays === null
          ? "Sin datos"
          : report.medianDays.toFixed(1) + " días",
      ],
    ];
    metrics.forEach(([label, value], i) => {
      const x = 36 + i * (width / 4);
      doc.roundedRect(x, 136, width / 4 - 12, 68, 4).fill("#F3F7F6");
      text(label, x + 12, 146, width / 4 - 30, 9, false, muted);
      text(value, x + 12, 166, width / 4 - 30, 20, true, teal);
    });
    text(
      `${report.responses} respuestas de ${report.sent} · ${report.interviews} entrevistas de ${report.sent} · ${report.responseSample} tiempos medidos · ${report.withoutResponseDate} sin fecha de respuesta`,
      36,
      215,
      width,
      9,
      false,
      muted,
    );
    text("Actividad del periodo", 36, 247, 430, 12, true);
    const chartX = 58,
      chartY = 286,
      chartW = 435,
      chartH = 136,
      max =
        Math.ceil(
          Math.max(
            2,
            ...report.series.flatMap((s) => [
              s.sent,
              s.responses,
              s.interviews,
            ]),
          ) / 2,
        ) * 2,
      step = chartW / Math.max(report.series.length, 1),
      bar = Math.max(1, Math.min(12, step / 4));
    [0, 0.5, 1].forEach((f) => {
      const y = chartY + chartH - f * chartH;
      doc
        .strokeColor("#E5E7EB")
        .lineWidth(0.5)
        .moveTo(chartX, y)
        .lineTo(chartX + chartW, y)
        .stroke();
      text(String(Math.round(max * f)), 36, y - 4, 18, 8, false, muted);
    });
    report.series.forEach((s, i) => {
      [s.sent, s.responses, s.interviews].forEach((v, j) => {
        if (v)
          doc
            .rect(
              chartX + (i + 0.5) * step - (3 * bar + 2) / 2 + j * (bar + 1),
              chartY + chartH - (v / max) * chartH,
              bar,
              (v / max) * chartH,
            )
            .fill(colors[j]);
      });
      if (i % Math.ceil(report.series.length / 10) === 0)
        text(
          s.label,
          chartX + (i + 0.5) * step - 18,
          chartY + chartH + 8,
          55,
          7,
          false,
          muted,
        );
    });
    text(
      "Enviadas · Respuestas reales · Primera entrevista registrada",
      36,
      450,
      465,
      8,
      false,
      muted,
    );
    text("Hitos de candidaturas enviadas", 535, 247, 270, 12, true);
    [
      ["Enviadas", report.sent],
      ["Respuesta real", report.responses],
      ["Entrevista", report.interviews],
      ["Oferta recibida", report.offers],
      ["Aceptada", report.accepted],
    ].forEach(([label, n], i) => {
      const y = 285 + i * 32;
      text(String(label), 535, y, 110, 9);
      doc.rect(650, y + 2, 112, 10).fill("#E5E7EB");
      if (n && report.sent)
        doc.rect(650, y + 2, (112 * Number(n)) / report.sent, 10).fill(teal);
      text(String(n), 775, y, 30, 9, true);
    });
    text(
      "Periodo comparable anterior: " +
        report.previous +
        " enviadas (" +
        prettyDate(report.previousFrom) +
        " - " +
        prettyDate(report.previousTo) +
        ").",
      36,
      475,
      width,
      9,
      false,
      muted,
    );
    text(
      "Las pendientes no son fracasos. Respuestas: fecha explícita en la ficha. Hitos: estados e historial conservado, sin inventar etapas omitidas.",
      36,
      495,
      width,
      9,
      false,
      muted,
    );
    newPage();
    text("Resultados por fuente", 36, 140, width, 15, true);
    let y = 177;
    const tableHeader = (
      labels: string[],
      positions: number[],
      widths: number[],
    ) => {
      doc.rect(36, y, width, 25).fill("#F3F7F6");
      labels.forEach((l, i) =>
        text(l, positions[i], y + 7, widths[i], 9, true),
      );
      y += 30;
    };
    const positions = [44, 260, 335, 418, 511, 600],
      widths = [204, 65, 75, 85, 78, 155];
    tableHeader(
      [
        "Fuente",
        "Enviadas",
        "Respuestas",
        "Entrevistas",
        "Ofertas",
        "Tasa de respuesta",
      ],
      positions,
      widths,
    );
    for (const s of report.bySource) {
      if (y > 490) {
        newPage();
        y = 143;
        tableHeader(
          [
            "Fuente",
            "Enviadas",
            "Respuestas",
            "Entrevistas",
            "Ofertas",
            "Tasa de respuesta",
          ],
          positions,
          widths,
        );
      }
      const values = [
        s.label,
        String(s.sent),
        String(s.responses),
        String(s.interviews),
        String(s.offers),
        s.responses + " de " + s.sent + " (" + s.rate + " %)",
      ];
      values.forEach((v, i) => text(v, positions[i], y, widths[i], 9));
      y += 29;
    }
    if (!report.sent) {
      text(
        "Sin candidaturas para este periodo y filtros.",
        44,
        y,
        width,
        10,
        false,
        muted,
      );
      y += 30;
    }
    y += 12;
    if (y > 430) {
      newPage();
      y = 143;
    }
    text(
      "Foto actual (fuente y empresa elegidas; independiente del periodo)",
      36,
      y,
      width,
      12,
      true,
    );
    y += 25;
    text(
      report.current.active +
        " procesos activos · " +
        report.current.interviews +
        " en entrevista · " +
        report.current.pending +
        " próximas acciones · " +
        report.current.overdue +
        " vencidas",
      36,
      y,
      width,
      10,
    );
    y += 30;
    text(
      "Muestras menores de 10 candidaturas requieren cautela. Los tiempos excluyen registros sin fecha de respuesta. Los datos pueden variar al corregir o borrar el historial.",
      36,
      y,
      width,
      9,
      false,
      muted,
    );
    newPage();
    text("Networking, contactos y tareas", 36, 140, width, 15, true);
    const ext = report.extended;
    text(
      `${ext.events} eventos · ${ext.newContacts} contactos añadidos · ${ext.contacted} con último contacto en el periodo · ${ext.completed} tareas distintas completadas`,
      36,
      171,
      width,
      11,
      true,
    );
    text(
      "Periodo y empresa aplicados. La fuente filtra candidaturas/tecnologías y tareas vinculadas, no contactos ni networking. Eventos por inicio, no asistencia. Último contacto es la fecha actual de la ficha, no un histórico.",
      36,
      202,
      width,
      9,
      false,
      muted,
    );
    text("Tecnologías de las candidaturas enviadas", 36, 245, width, 12, true);
    y = 274;
    const techLabels = [
        "Tecnología",
        "Enviadas",
        "Respuestas",
        "Entrevistas",
        "Tasa de respuesta",
      ],
      techXs = [44, 285, 390, 510, 640],
      techWs = [225, 95, 110, 120, 150];
    tableHeader(techLabels, techXs, techWs);
    for (const t of ext.technologies) {
      if (y > 490) {
        newPage();
        y = 145;
        tableHeader(techLabels, techXs, techWs);
      }
      const values = [
        t.label,
        String(t.sent),
        String(t.responses),
        String(t.interviews),
        `${t.responses} de ${t.sent} (${t.rate} %)`,
      ];
      values.forEach((v, i) => text(v, techXs[i], y, techWs[i], 9));
      y += 29;
    }
    if (!ext.technologies.length)
      text(
        "Sin tecnologías para estos filtros.",
        44,
        y,
        width,
        10,
        false,
        muted,
      );
    if (ext.completionRows.length) {
      newPage();
      text("Tareas completadas en el periodo", 36, 140, width, 15, true);
      y = 176;
      for (const t of ext.completionRows) {
        if (y > 490) {
          newPage();
          y = 145;
        }
        text(prettyDate(t.date), 44, y, 110, 9);
        text(t.title, 165, y, width - 130, 9);
        y += 29;
      }
    }
    if (report.rows.length) {
      newPage();
      text("Detalle de candidaturas del periodo", 36, 140, width, 15, true);
      y = 174;
      const xs = [44, 226, 404, 494, 594, 682],
        ws = [174, 170, 83, 90, 80, 115],
        labels = [
          "Oferta",
          "Empresa",
          "Fuente",
          "Estado",
          "Enviada",
          "Respuesta real",
        ];
      tableHeader(labels, xs, ws);
      for (const r of report.rows) {
        if (y > 495) {
          newPage();
          y = 144;
          tableHeader(labels, xs, ws);
        }
        const values = [
          r.title,
          r.company,
          r.source,
          r.status,
          prettyDate(r.appliedAt),
          r.firstResponseAt ? prettyDate(r.firstResponseAt) : "Sin fecha",
        ];
        values.forEach((v, i) => text(v, xs[i], y, ws[i], 8));
        doc
          .strokeColor("#E5E7EB")
          .moveTo(36, y + 27)
          .lineTo(36 + width, y + 27)
          .stroke();
        y += 34;
      }
    }
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      text(
        "Mappleo · Informe privado   |   " + (index + 1) + " / " + pages.count,
        36,
        doc.page.height - 43,
        width,
        8,
        false,
        muted,
      );
    }
    doc.end();
  });
}
