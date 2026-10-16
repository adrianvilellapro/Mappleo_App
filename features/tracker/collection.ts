import { z } from "zod";
import type { RecordRow } from "./types";
export const collectionPageSize = 50;
export const collectionFilterSchema = z.object({
  q: z.string().trim().max(100).default(""),
  filter: z.enum(["active", "archived", "all"]).default("active"),
  status: z.string().max(30).default(""),
  scope: z.enum(["all", "active", "interviews"]).default("all"),
  applications: z.enum(["all", "sent", "unsent"]).default("all"),
  sort: z.enum(["recent", "name", "interest"]).default("recent"),
  offset: z.coerce.number().int().min(0).max(6000).default(0),
});
export type CollectionFilters = z.infer<typeof collectionFilterSchema>;
export type CollectionSummary = {
  total: number;
  active: number;
  archived: number;
  statuses: Record<string, number>;
};
export type CollectionPage = {
  records: RecordRow[];
  summary: CollectionSummary;
  hasMore: boolean;
  offset: number;
  filters: CollectionFilters;
  matchedTotal: number;
};
export const defaultCollectionFilters = collectionFilterSchema.parse({});
