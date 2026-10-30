# Support Tickets API (v1)

External REST API for the support tickets module, intended for the Gmail
automation agent. The system never sends email itself — drafts are stored
here, sending happens in Gmail, and the sent message is written back to the
email log.

## Auth

Every request needs a bearer token:

```
Authorization: Bearer <SUPPORT_API_TOKEN>
```

The token is the `SUPPORT_API_TOKEN` environment variable (set in `.env.local`
locally and in the Render dashboard for production). It grants read/write on
tickets, notes, emails, and drafts only.

Errors are always `{ "ok": false, "error": "..." }` with an appropriate HTTP
status (`401` bad token, `404` unknown ticket, `400` invalid input).

## Ticket fields

| Field | Type | Notes |
|---|---|---|
| `case_date` | date `YYYY-MM-DD` | |
| `customer_name` / `customer_email` / `customer_phone` | string | at least name or email required on create |
| `source` | string | how the case reached us: "Direct email", "Forwarded by Home Depot", ... |
| `channel` | string | purchase channel: "Home Depot", "Lowe's", "Shopify", ... |
| `issue_summary` | string | required on create |
| `case_type` | `shipping_damage` \| `warranty_claim` \| `parts_request` \| `refund_return` \| `technical_support` \| `order_status` \| `review_reward` \| `registration` \| `other` | omit on create to auto-classify from `issue_summary` (keyword rules) |
| `model_number` / `po_number` / `order_number` | string | used by search/dedup |
| `reply_status` | `not_replied` \| `in_progress` \| `replied` | auto-set to `replied` when an outbound email is logged |
| `progress` | `in_progress` \| `awaiting_customer` \| `awaiting_internal` \| `awaiting_third_party` \| `resolved` | |
| `stuck` | boolean | |
| `next_step` | string | |
| `assignee` | string | |
| `closed_at` | timestamp \| null | null = open; set via close/reopen |

## Endpoints

### `GET /api/v1/tickets` — list

Query params (all optional): `status=open|closed`, `case_type`, `progress`,
`reply_status`, `stuck=true|false`, `source`, `channel`, `assignee`, `date_from`, `date_to`
(on `case_date`), `q` (keyword across email / customer name / PO / order no /
model / summary), `page` (1-based), `per_page` (default 50, max 200).

Returns `{ ok, tickets, page, per_page, total }`.

### `GET /api/v1/tickets/search` — dedup lookup

`?q=<email | PO | order number | customer name>` and/or
`?thread_id=<gmail thread id>`. Call this before creating a ticket or sending
a reply. Email / PO / order number match exactly (case-insensitive), customer
name fuzzily, `thread_id` via the email log. Each result carries a `match`
array (`["email"]`, `["po_number"]`, `["thread_id"]`, ...) and `closed_at` so
you can tell open duplicates from closed history.

### `POST /api/v1/tickets` — create

Body: any ticket fields above. `issue_summary` plus `customer_name` or
`customer_email` are required. When `case_type` is omitted it is
auto-classified from the summary. Returns `201 { ok, ticket }`.

Invalid `case_type` / `reply_status` / `progress` values (on create or PATCH)
return `400` listing the accepted values.

### `GET /api/v1/tickets/:id` — detail

Returns `{ ok, ticket, notes, emails, drafts }`. `notes` is the timeline
(manual notes plus automatic `kind: "event"` entries for status changes,
close, reopen); `emails` carry their `attachments`; `drafts` newest first.

### `PATCH /api/v1/tickets/:id` — update

Body: any subset of the editable fields (status, progress, stuck, next_step,
assignee, customer/order info). Optional `author` labels the timeline event.
Changes are logged to the timeline automatically.

### `POST /api/v1/tickets/:id/close` / `POST /api/v1/tickets/:id/reopen`

Body (optional): `{ "reason": "...", "author": "..." }`. Close sets
`closed_at` and `progress: resolved`; reopen clears `closed_at` and sets
`progress: in_progress`. Both write a timeline event.

### `POST /api/v1/tickets/:id/notes`

Body: `{ "content": "...", "author"?: "...", "kind"?: "note" | "event" }`.
`GET` on the same path lists the timeline.

### `POST /api/v1/tickets/:id/emails` — log an email

```json
{
  "direction": "inbound",
  "from": "customer@example.com",
  "to": "support@besthouseware.com",
  "cc": "",
  "sent_at": "2026-10-30T10:00:00Z",
  "subject": "Compressor noise",
  "body": "full text...",
  "message_id": "<abc@mail.gmail.com>",
  "thread_id": "18f2c3...",
  "attachments": [{ "filename": "noise.mp4", "mime_type": "video/mp4", "size": 12345, "url": "" }]
}
```

`message_id` is deduplicated: logging the same id again returns the existing
row with `"duplicate": true` instead of creating another. Logging a
`direction: "outbound"` email marks the ticket `replied`. `GET` on the same
path lists the ticket's emails oldest-first.

### `POST /api/v1/tickets/:id/draft` — store a reply draft

Body: `{ "subject"?, "body", "created_by"? }`. After you send it via Gmail,
write the sent message back with `POST .../emails`
(`direction: "outbound"`, real `message_id`). `GET` lists drafts newest-first.

## Typical agent flow

1. New Gmail message → `GET /tickets/search?thread_id=...`; fall back to
   `?q=<sender email>` / `?q=<PO>`.
2. No match → `POST /tickets`; match → use that ticket.
3. `POST /tickets/:id/emails` with the inbound message (dedup by message_id).
4. Optionally `POST /tickets/:id/draft` for review.
5. After sending in Gmail → `POST /tickets/:id/emails` with
   `direction: "outbound"` and the sent `message_id` (auto-marks replied).
6. `PATCH /tickets/:id` to set progress / next step; `POST /tickets/:id/close`
   when done.
