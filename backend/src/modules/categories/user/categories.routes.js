import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../core/middleware/common.js';
import { asyncHandler, ok } from '../../../core/utils/http.js';
import { userTree, userCategoryDetail } from '../category.service.js';

const router = Router();

/** Active categories as a nested tree, names in the reader's language. */
router.get('/tree', asyncHandler(async (req, res) => ok(res, await userTree(req.ctx.lang))));

/** One category with its form fields (translated). */
router.get(
  '/:id',
  validate({ params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }) }),
  asyncHandler(async (req, res) => ok(res, await userCategoryDetail(req.params.id, req.ctx.lang)))
);

export default router;
