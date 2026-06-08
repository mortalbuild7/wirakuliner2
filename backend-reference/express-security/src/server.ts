import express from "express";
import rateLimit from "express-rate-limit";
import {
  rejectOwnerIdsInBody,
  requireAuth,
  requireDriver,
} from "./middleware/auth.middleware";
import { enforcePagination } from "./middleware/pagination.middleware";
import {
  handleValidationErrors,
  validateSearchQuery,
} from "./middleware/validate.middleware";
import { postWithdraw } from "./controllers/wallet.controller";
import { searchProducts } from "./services/wallet.service";

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/** Withdraw — race condition safe + IDOR safe */
app.post(
  "/api/wallet/withdraw",
  requireAuth,
  requireDriver,
  rejectOwnerIdsInBody,
  postWithdraw
);

/** Pencarian menu — pagination wajib */
app.get(
  "/api/catalog/search",
  enforcePagination,
  validateSearchQuery,
  handleValidationErrors,
  async (req, res) => {
    const { limit, offset } = req.pagination!;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const items = await searchProducts({ q, limit, offset });
    res.json({ ok: true, items, limit, offset });
  }
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Express security reference listening on :${port}`);
});
