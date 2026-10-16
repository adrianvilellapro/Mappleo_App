import type { Statistics } from "./model";
export function ActivityChart({
  series,
  labels = ["Enviadas", "Respuestas reales", "Primera entrevista registrada"],
}: {
  series: Statistics["series"];
  labels?: [string, string, string];
}) {
  const max =
    Math.ceil(
      Math.max(
        2,
        ...series.flatMap((b) => [b.sent, b.responses, b.interviews]),
      ) / 2,
    ) * 2;
  const width = 760,
    height = 230,
    baseline = 190,
    step = 700 / Math.max(series.length, 1),
    bar = Math.min(16, step / 4);
  return (
    <div className="statistics-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={"Actividad por periodo: " + labels.join(", ")}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="40"
              x2="750"
              y1={baseline - f * 155}
              y2={baseline - f * 155}
              className="chart-grid"
            />
            <text
              x="32"
              y={baseline - f * 155 + 4}
              textAnchor="end"
              className="chart-label"
            >
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {series.map((b, i) => (
          <g key={b.key}>
            {[b.sent, b.responses, b.interviews].map((value, index) => (
              <rect
                key={index}
                x={
                  48 + (i + 0.5) * step - (3 * bar + 4) / 2 + index * (bar + 2)
                }
                y={baseline - (value / max) * 155}
                width={bar}
                height={(value / max) * 155}
                rx="2"
                className={"chart-series-" + index}
              >
                <title>{`${b.label}: ${value} ${labels[index]}`}</title>
              </rect>
            ))}
            {i % Math.ceil(series.length / 12) === 0 && (
              <text
                x={48 + (i + 0.5) * step}
                y="212"
                textAnchor="middle"
                className="chart-label"
              >
                {b.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="chart-series-0" />
          {labels[0]}
        </span>
        <span>
          <i className="chart-series-1" />
          {labels[1]}
        </span>
        <span>
          <i className="chart-series-2" />
          {labels[2]}
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Actividad del periodo</caption>
          <thead>
            <tr>
              <th>Periodo</th>
              <th>{labels[0]}</th>
              <th>{labels[1]}</th>
              <th>{labels[2]}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((b) => (
              <tr key={b.key}>
                <th>{b.label}</th>
                <td>{b.sent}</td>
                <td>{b.responses}</td>
                <td>{b.interviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function Milestones({ report }: { report: Statistics }) {
  return (
    <div className="milestone-chart">
      {[
        ["Enviadas", report.sent],
        ["Respuesta real", report.responses],
        ["Entrevista", report.interviews],
        ["Oferta recibida", report.offers],
        ["Aceptada", report.accepted],
      ].map(([label, count]) => (
        <div key={label}>
          <span>{label}</span>
          <div>
            <i
              style={{
                width: report.sent
                  ? `${(Number(count) / report.sent) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}
