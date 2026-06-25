import { z } from 'zod';

/**
 * Uniform response envelopes and pagination so every endpoint speaks the same
 * shape — predictable clients, easy SDK generation.
 */
export interface Meta {
  requestId?: string;
  [k: string]: unknown;
}

export function ok<T>(data: T, meta?: Meta) {
  return { data, meta };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function page<T>(items: T[], total: number, p: number, pageSize: number): Page<T> {
  return {
    items,
    page: p,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export function paginate(q: PaginationQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}
