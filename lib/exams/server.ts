import { ApiError } from "@/lib/api/errors";
import { daysBetween } from "./schedule";

/** The client sends its local calendar day; accept it only if it is within a day of the server's UTC date. */
export function assertPlausibleToday(today: string) {
  const utc = new Date().toISOString().slice(0, 10);
  if (Math.abs(daysBetween(utc, today)) > 1) throw new ApiError(400, "BAD_DATE", "Your device date looks wrong.");
}
