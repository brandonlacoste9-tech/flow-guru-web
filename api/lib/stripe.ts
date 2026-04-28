const LIVE_MONTHLY_PRICE_ENV_KEYS = [
  "FLOW_GURU_MONTHLY_PRICE_ID",
  "STRIPE_FLOW_GURU_MONTHLY_PRICE_ID",
  "STRIPE_PRICE_ID_MONTHLY",
] as const;

function isProductionEnvironment() {
  return process.env.VERCEL_ENV === "production";
}

function getEnvValue(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

export function resolveStripeSecretKey() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (isProductionEnvironment() && secret.startsWith("sk_test_")) {
    throw new Error("Stripe test secret keys cannot be used in production");
  }
  return secret;
}

export function resolveStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

export function resolveStripeMonthlyPriceId() {
  const liveConfiguredPrice = getEnvValue(LIVE_MONTHLY_PRICE_ENV_KEYS);
  if (liveConfiguredPrice) return liveConfiguredPrice;

  if (!isProductionEnvironment() && process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }

  throw new Error("FLOW_GURU_MONTHLY_PRICE_ID is not configured");
}
