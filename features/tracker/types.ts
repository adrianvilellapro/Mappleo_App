export type RecordRow = {
  id: string;
  name?: string;
  title?: string;
  domain?: string;
  faviconUrl?: string;
  location?: string;
  status?: string;
  workMode?: string;
  interestRating?: number;
  role?: string;
  archivedAt?: string | null;
  nextAction?: string;
  nextActionDueAt?: string | null;
  appliedAt?: string;
  startsAt?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  followUpAt?: string | null;
  lastContactAt?: string | null;
  url?: string;
  websiteUrl?: string;
  company?: {
    id: string;
    name: string;
    domain: string;
    websiteUrl: string;
    faviconUrl: string;
  } | null;
  jobOffer?: {
    id: string;
    title: string;
    company: {
      id: string;
      name: string;
      domain: string;
      websiteUrl: string;
      faviconUrl: string;
    };
  };
  applications?: { id: string; status: string; appliedAt: string }[];
  companies?: { id: string; name: string }[];
  contacts?: { id: string; name: string }[];
  offers?: { id: string; title: string }[];
  events?: {
    id: string;
    title: string;
    description: string;
    happenedAt: string;
    fromStatus?: string | null;
    toStatus?: string | null;
  }[];
  [key: string]: unknown;
};
export type SelectOptions = {
  companies: { id: string; label: string }[];
  offers: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
  technologies: string[];
};
export function rowTitle(row: RecordRow) {
  return row.name ?? row.title ?? row.jobOffer?.title ?? "Sin nombre";
}
