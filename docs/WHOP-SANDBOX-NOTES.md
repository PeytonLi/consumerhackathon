# Whop sandbox notes (smoke test, 2026-11-15)

Live calls against https://sandbox-api.whop.com/api/v1 with the platform Account API key (business "Nickel"), Api-Version-Date 2026-11-13-1. Production returns 401 for this key.

## What worked
- Top-up checkout: `POST /checkout_configurations` with `account_id` = platform, inline `variant { initial_price, currency: "usd", billing_type: "one_time" }`, `metadata`, `redirect_url` returns a `purchase_url` on sandbox.whop.com. Metadata reads back as sent (numbers stay numbers).
- Subaccount: `POST /accounts { email, external_id, title }` creates a child of the platform. Repeating the same email + external_id returns the same account.
- Onboarding: `POST /account_links use_case=account_onboarding` returns `sandbox.whop.com/verify-identity/<biz>?token=...` (individual identity check). `payouts_portal` returns `sandbox.whop.com/payouts/<biz>/overview?token=...`. Links expire in about an hour.
- Embedded components: `POST /access_tokens { account_id: <subaccount> }` returns a JWT that expires in about an hour.
- Webhooks: a sandbox webhook created with `api_version_date` and `child_resource_events: true` delivered a test `payment.succeeded` with `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`. `verifyWhopWebhook` accepted it with the `ws_` secret and rejected a wrong secret. Creating a webhook with `api_version` is refused; use `api_version_date`.
- Deleting a subaccount with no balance: `DELETE /accounts/<biz>` returns `deleted: true`.

## Limits and blockers found
- Minimum checkout is $1.00 ("The plan must be at least $1.00").
- Subaccount email must accept mail; example.com is rejected with 400.
- Transfers are blocked until the platform business is verified: "Please verify your business before transferring funds." The platform shows `capabilities.transfer: inactive` and a `verify_identity` required action.
- Payouts to a bank are not available in the sandbox at all (Whop sandbox docs).
- `can_transfer_pending_balance_to_children: false`: top-up money that is still pending settlement cannot be transferred to a player's subaccount until it is available.
- Card fields in the hosted checkout are cross-origin PCI frames, so a test payment (4242 4242 4242 4242) has to be completed by a person.

## Open questions from the plan
- Platform pulling from a subaccount: a `POST /transfers` with origin = subaccount and destination = platform was accepted for authorization and failed only on funds ("would cause the account's balance to be -$1.00"). Likely allowed; confirm once the platform is verified and the subaccount holds money.
- Fees (platform fee schedule from `GET /accounts/<id>/fees`): cards 2.7% + $0.30, ACH 1.5%, PayPal 1.85% + $0.20, BNPL 15%, cross-border +1.5%, FX +1%, transfers 3%, payouts: next-day or same-day bank $2.50, wire $30, RTP/digital wallet/crypto $0. Disputes $15. Whether the 3% transfer fee is taken from the amount or charged to the sender is not confirmed yet; the transfer object reports `amount` (credited) and `fee` separately.
- Consumer vs business subaccounts: subaccounts are created with `business_type: null` and verification has separate `individual` (KYC) and `business` (KYB) profiles. The onboarding link goes to individual identity verification, so players can onboard as individuals.
- Holds: balances report `available`, `pending`, `reserve`, `in_transit`; payments carry `settlement_time_at`. Nickel's own hold wallet covers in-flight cash outs; Whop's pending balance is what limits how fast a top-up can be cashed out.
- Webhook signatures: Standard Webhooks, HMAC-SHA256 over `id.timestamp.body` keyed by the literal `ws_` secret bytes, 5 minute tolerance. Verified against a real delivery.
