# OTP release safeguards — approved scope

Base: a26edfdeac0bb9f7a0e4f83c61fdf0350b0390ba. Target local branch:
feat/otp-release-safeguards. The user approved this behavior in chat.

Keep the two-minute OTP and five-minute proof lifetimes. Enforce rolling limits:
60-second resend cooldown; 5 requests/phone/15 minutes and 20/phone/24 hours;
30 requests/IP/15 minutes; 5 incorrect guesses/challenge; 10 incorrect guesses/
phone/15 minutes across resends; 100 verification submissions/IP/15 minutes.
Use 429 and Retry-After, not permanent account or session revocation.

Use PostgreSQL transaction-scoped per-phone locks for issuance and verification,
and separately committed per-IP budgets. Invalid-code counters commit on rejection;
successful consumption and proof creation remain one transaction. Use DB time after
locks and explicit ReadCommitted isolation. Quota rejection never extends its window.

Store new codes as HMAC-SHA-256(phone, nonce, code) using a separate mandatory
OTP_HMAC_SECRET, never a plain digest or JWT-secret fallback. Preserve old rows and
the nullable legacy code column; never authenticate legacy plaintext challenges.
Do not log codes, signing material, provider payloads, or raw database exceptions.

Delivery is an injected interface, not implemented SMS. Runtime without a provider
fails closed. Reserve a pending challenge before delivery; activate it after provider
acknowledgment. Failed delivery retains the previous active challenge. Count failed
send reservations toward request quotas. No network call runs under a database lock.
Provider timeouts are bounded; a late/failed/expired challenge cannot become active.

Keep Express's default untrusted proxy policy; take IP from req.ip, not request body
or raw forwarded headers. Canonicalize equivalent IPv4/mapped-IPv6 representations.

No new dependencies, frontend changes, session policy changes, automatic migrations,
.env writes, resets, destructive history edits, remote commits, or deployment.
