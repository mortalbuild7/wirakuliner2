/**
 * Mitigasi Inefficient Query / DoS di level database.
 * Semua endpoint list/search WAJIB memakai helper ini — jangan terima limit mentah dari client.
 */

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 50;
/** Offset terlalu besar memicu sequential scan mahal — batasi halaman dalam. */
export const PAGINATION_MAX_OFFSET = 5_000;

export type PaginationParams = {
  limit: number;
  offset: number;
  page: number;
};

export function parsePagination(
  searchParams: URLSearchParams,
  opts?: { defaultLimit?: number; maxLimit?: number }
): PaginationParams {
  const defaultLimit = opts?.defaultLimit ?? PAGINATION_DEFAULT_LIMIT;
  const maxLimit = opts?.maxLimit ?? PAGINATION_MAX_LIMIT;

  const rawLimit = Number(searchParams.get("limit"));
  const rawOffset = Number(searchParams.get("offset"));
  const rawPage = Number(searchParams.get("page"));

  let limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : defaultLimit;
  limit = Math.min(Math.max(limit, 1), maxLimit);

  let offset = 0;
  if (Number.isFinite(rawPage) && rawPage >= 1) {
    offset = Math.floor((rawPage - 1) * limit);
  } else if (Number.isFinite(rawOffset) && rawOffset >= 0) {
    offset = Math.floor(rawOffset);
  }

  offset = Math.min(offset, PAGINATION_MAX_OFFSET);

  const page = Math.floor(offset / limit) + 1;

  return { limit, offset, page };
}

/** Range Supabase .range(from, to) — inclusive. */
export function toSupabaseRange(p: PaginationParams): { from: number; to: number } {
  return { from: p.offset, to: p.offset + p.limit - 1 };
}
