# Verified-phone registration

Scope: implement the user's approved phone-verification-to-registration milestone.
Keep JavaScript/CommonJS, Express routes/controllers/services, PostgreSQL, Prisma 7.
No frontend changes, JWT, SMS integration, new packages, existing-table deletion,
automatic migration, deployment, or writes to the user's database.

Design: successful OTP verification consumes the OTP and creates a five-minute
PhoneVerification in one interactive transaction. Generate 32 random bytes and
store only the SHA-256 hash of the opaque token. REGISTER and LOGIN purposes keep
account creation separate from future session issuance. Existing phones receive
LOGIN nextStep, not a session. Registration derives the phone solely from the
REGISTER proof, claims it conditionally, and creates MEMBER in one transaction.
Names are required, normalized/trimmed, length limited, and control characters
rejected. Reject extra request fields including phone, role, and verified flags.
Registration failure rolls back proof consumption. Use the existing unique User
phone constraint as the final duplicate guard. Responses carrying proof data are
not cacheable. Neither verification nor registration means authenticated=true.

Expiry is compared with the application timestamp supplied in each conditional
write; database wall-clock/row-lock expiry semantics need integration validation.
Do not claim production readiness: OTP rate limits, resend atomicity, OTP-at-rest
protection, sessions, SMS and real PostgreSQL concurrency checks remain outstanding.

Testing: service tests with a transactional in-memory substitute and controller
unit tests. The substitute is not evidence of real PostgreSQL locking semantics.
Apply/rehearse the additive migration in a dedicated test database before merge.
