/** Wrap async route handlers so thrown errors reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Standard success envelope: { success, data, meta } */
export const ok = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = (res, data) => ok(res, data, undefined, 201);

/** Offset pagination helper for admin tables. */
export const parsePaging = (query, { maxLimit = 100, defaultLimit = 20 } = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

/** Escape user input before using it in a RegExp (prevents regex injection). */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);

export const pageMeta = ({ page, limit }, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
