// GET /api/config -> { publishableKey } for the frontend to init Stripe.js.
// Publishable keys are not secret, but we read from env so nothing is hard-coded in the repo.
import { json } from "./_lib.js";

export async function onRequestGet(context) {
  const pk = context.env && context.env.STRIPE_PUBLISHABLE_KEY;
  if (!pk) return json({ error: "Stripe publishable key not configured." }, 503);
  return json({ publishableKey: pk });
}
