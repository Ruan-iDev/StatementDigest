# Upload disclaimer & liability posture

**Last updated:** 2026-07-31  
**Not legal advice** — this is product/engineering practice for a local tool. For your jurisdiction, confirm with a lawyer if you commercialise.

---

## What we built

1. **Adding files** does nothing irreversible (queue only).  
2. Clicking **Upload** opens a **mandatory amber-bordered disclaimer** (Accept / Cancel).  
3. **Cancel** → no processing.  
4. **Accept** →  
   - acceptance is **written to SQLite** (`disclaimer_acceptances`)  
   - then import processing starts  
5. The **import API refuses** processing unless this profile accepted the **current disclaimer version** within the last **12 hours** (server-side gate — cannot be bypassed by skipping the UI alone).  
6. Full Terms remain at `/terms` (sidebar).

**Version key:** `upload-v1-2026-07-31` (bump when text changes → forces a new Accept).

---

## Where are records kept?

| Store | Contents | Who can see it |
|-------|----------|----------------|
| **SQLite `disclaimer_acceptances`** | profile id, disclaimer version, file count, timestamp, user-agent, context | Local machine (same as their books) |
| **Terms page** | Full legal text | Always available in-app |

Fields logged on each Accept:

- `user_profile_id`  
- `profile_public_id` — visible unique attestation ID (e.g. `LF-A1B2C3D4-E5F67890`)  
- `profile_attestation_seal` — HMAC snapshot of that ID for this install  
- `disclaimer_version`  
- `action` = `accept`  
- `context` = `statement_upload`  
- `file_count` (how many files they were about to process)  
- `accepted_at` (UTC)  
- `user_agent` (browser string)

### Profile attestation ID — what it is and is not

| Claim | True? |
|-------|--------|
| Each profile has a unique, user-visible ID | Yes |
| That ID is copied into every Accept row | Yes |
| A seal makes casual DB edits harder to hide | Partially (HMAC with install secret) |
| This proves “John Smith, ID 123456, accepted” | **No** |
| This eliminates “it wasn’t me” if the PC is shared | **No** |

**Honest model:** the ID is a **correlator**, not a biometric.  
If both the profile and the disclaimer table live on the user’s device, an adversary with full device access can still invent a story. What you gain is:

1. Accept events are tied to a **stable workspace code the user can see**.  
2. The same code appears on **Accept dialog + My Profile + audit row**.  
3. You can show: “Profile `LF-…` accepted version X at time T before import.”  

To go further toward “this is me” you need **out-of-band identity** (login/email, signed SaaS logs, IDV) — not more encryption of a local UUID.

There is **no cloud “court vault”** unless you later host a SaaS and log server-side yourself. For a **local-first** app, the defensible story is:

> Processing is **impossible** without Accept for this version; the product design leaves **no path** to reports from that batch without that click, and the event is **timestamped in the app database**.

---

## Best practical defence (not “beat humanity,” just good hygiene)

You cannot make humans unable to *claim* “I never saw it.” You can make that claim **implausible** and **hard to square with the product**:

### 1. Gate the action (done)
Disclaimer is not buried in Terms only. It is a **blocking modal on Upload**. Cancel = no process.

### 2. Version the text (done)
If wording changes, version bumps → new Accept required.

### 3. Log Accept with version + time (done)
Local audit trail: who (profile), what version, when, how many files.

### 4. Server-side enforce (done)
Even a modified UI cannot import without a recent acceptance of the current version (for this API).

### 5. Link Terms in the modal (done)
Modal points to full Terms so “only ever Terms in a sidebar” is weaker as a complaint.

### 6. What still won’t “win” automatically
- Local DB can be deleted by the user.  
- Screenshots of Accept are stronger if *you* also keep enterprise logs (SaaS).  
- Courts/consumer law vary; **mandatory rights may not be waivable**.  
- Saying “they must have clicked Accept” is a **design argument**, not a guaranteed legal shield.

### 7. Stronger options later (if you commercialise)
- First-run “I accept Terms” before any use + store acceptance.  
- Exportable audit PDF of acceptances.  
- Hosted auth + server-side immutable logs.  
- Professional legal review of Terms + disclaimer for your country.

---

## Recommended product stance

**Stand on process, not on “they must have read Terms once”:**

- Terms exist always.  
- **Upload processing requires explicit Accept of a short, visible warning.**  
- That Accept is **versioned and logged**.  
- Import **refuses** without it.

That is the best engineering defence available in a local app without claiming false absolute immunity.

---

## Native login (session lock)

| Feature | Behaviour |
|---------|------------|
| Register | First-time (or additional) local account |
| Password | scrypt hash only — never plain text |
| Suggest 15-key | Cryptographically random; refresh until happy |
| Forgot password | **None** — backup password or stay locked |
| Change password | Requires **current** password |
| Log out | Sidebar — recommended before leaving device |

Login is a **session lock** for the sensitive house of data. It does not replace Accept on Upload; both layers apply.
