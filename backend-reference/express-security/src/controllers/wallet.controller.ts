import type { Request, Response } from "express";
import { withdrawWallet } from "../services/wallet.service";

/**
 * Controller withdraw — ownerId dari JWT (req.auth), BUKAN req.body.
 *
 * Contoh serangan IDOR yang DITOLAK:
 *   Driver ID 10 login → kirim body { driver_id: 99, amount: 1000000 }
 *   Middleware rejectOwnerIdsInBody → 403
 */
export async function postWithdraw(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.auth!;
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount < 10_000 || amount > 50_000_000) {
      res.status(400).json({ error: "Nominal penarikan tidak valid" });
      return;
    }

    const result = await withdrawWallet({
      ownerType: auth.ownerType,
      ownerId: auth.ownerId,
      amount,
      note: "Withdraw via API",
    });

    res.json({ ok: true, balance: result.balance, txId: result.txId });
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "Gagal menarik saldo",
    });
  }
}
