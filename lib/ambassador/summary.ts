export interface CommissionRow {
  commissionNgn: number;
  status: string;
  payableAtMs: number;
}

/** Held = inside the 7-day safety hold, payable = ready to pay out, paid = already sent. */
export function summarise(rows: CommissionRow[], now = Date.now()) {
  let held = 0;
  let payable = 0;
  let paid = 0;
  for (const r of rows) {
    if (r.status === "paid") paid += r.commissionNgn;
    else if (r.status === "void") continue;
    else if (r.payableAtMs <= now) payable += r.commissionNgn;
    else held += r.commissionNgn;
  }
  return { held, payable, paid, lifetime: held + payable + paid };
}
