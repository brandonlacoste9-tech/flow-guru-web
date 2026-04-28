# Stripe Test-Mode Validation Harness

This branch is a preview-only harness for validating Flow Guru billing without a live card. Do not merge it into `main`.

## Vercel Preview Env Vars

Add these only to the Vercel Preview environment for this branch/deployment:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_... # recurring CA$4.99 test price for Flow Guru Monthly
```

Keep production using the live monthly price variables:

```bash
FLOW_GURU_MONTHLY_PRICE_ID=price_...
# or STRIPE_FLOW_GURU_MONTHLY_PRICE_ID / STRIPE_PRICE_ID_MONTHLY
```

The code rejects `sk_test_` keys when `VERCEL_ENV=production`. The generic `STRIPE_PRICE_ID` fallback is only used outside production, so this preview harness cannot accidentally replace the live price on production.

## Test Cards

Use any future expiry date and any CVC/postal code:

```text
4242 4242 4242 4242 - successful payment
4000 0027 6000 3184 - 3DS authentication succeeds
4000 0000 0000 9995 - card declined
```

## Preview Checkout Checklist

1. Deploy this branch to Vercel Preview.
2. Paste the preview-only env vars above into Vercel and redeploy the preview.
3. Sign into the preview app with a test account.
4. Open `/settings?tab=billing`.
5. Click `Upgrade to Monthly`.
6. Pay with `4242 4242 4242 4242`.
7. Confirm Stripe returns to `/settings?billing=success`.
8. Confirm Stripe sends 200s for these webhook events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.paid`
9. Refresh `/api/billing/status` and confirm it reports `authenticated: true`, `isPro: true`, and `status: "active"` or `status: "trialing"`.

## Stripe CLI Fallback

If Vercel webhook delivery is not configured yet, forward events from the Stripe CLI to the preview:

```bash
stripe listen --forward-to https://<preview-domain>/api/stripe-webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` for the preview deployment, then redeploy.

Trigger a synthetic checkout completion if needed:

```bash
stripe trigger checkout.session.completed
```

The canonical Vercel rewrite is also available at:

```bash
stripe listen --forward-to https://<preview-domain>/api/stripe/webhook
```
