const crypto = require("node:crypto");
const { createRegistrationService } = require("./registration.service.factory");
const { AuthError } = require("../utils/auth-error");

const MEMBER_SESSION_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

const ADMIN_SESSION_TTL_MS =
  8 * 60 * 60 * 1000;

function sessionTtlMs(user) {
  return user.role === "ADMIN"
    ? ADMIN_SESSION_TTL_MS
    : MEMBER_SESSION_TTL_MS;
}
const USER_FIELDS = {
  id: true, phone: true, firstName: true, lastName: true,
  role: true, createdAt: true, updatedAt: true
};
const isToken = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const active = (session) => session && session.revokedAt === null && session.expiresAt > new Date();

function createSessionService(
  prisma,
  {
    tokens,
    adminMfaService,
  },
) {
  const registration = createRegistrationService(prisma);

  async function credentials(tx, session, user) {
    const refreshToken = crypto.randomBytes(32).toString("hex");
    await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: digest(refreshToken) } });
    // Signing is inside the caller's transaction. Any failure rolls all writes back.
    const access = tokens.issue(user.id, session.id, session.expiresAt);
    return { ...access, user, refreshToken, refreshExpiresAt: session.expiresAt.toISOString() };
  }

  async function issue(tx, user) {
    const now = new Date();

    if (user.role === "ADMIN") {
      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },

        data: {
          revokedAt: now,
          version: {
            increment: 1,
          },
        },
      });
    }

    const session =
      await tx.authSession.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,

          expiresAt: new Date(
            now.getTime() +
            sessionTtlMs(user),
          ),
        },
      });

    return credentials(
      tx,
      session,
      user,
    );
  }

  async function register(input) {
    return prisma.$transaction(async (tx) => {
      const user = await registration.register(input, tx);
      return issue(tx, user);
    });
  }

  async function login(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) =>
          key !== "verificationToken",
      ) ||
      !isToken(
        input.verificationToken,
      )
    ) {
      throw new AuthError(
        "Invalid or expired verification",
      );
    }

    const tokenHash =
      digest(
        input.verificationToken,
      );

    return prisma.$transaction(
      async (tx) => {
        const proof =
          await tx.phoneVerification.findUnique({
            where: {
              tokenHash,
            },
          });

        if (
          !proof ||
          proof.purpose !== "LOGIN" ||
          proof.usedAt !== null ||
          proof.expiresAt <= new Date()
        ) {
          throw new AuthError(
            "Invalid or expired verification",
          );
        }

        const claimed =
          await tx.phoneVerification.updateMany({
            where: {
              id: proof.id,
              purpose: "LOGIN",
              usedAt: null,
              expiresAt: {
                gt: new Date(),
              },
            },

            data: {
              usedAt: new Date(),
            },
          });

        if (claimed.count !== 1) {
          throw new AuthError(
            "Invalid or expired verification",
          );
        }

        const user =
          await tx.user.findUnique({
            where: {
              phone: proof.phone,
            },

            select: USER_FIELDS,
          });

        if (!user) {
          throw new AuthError(
            "Invalid or expired verification",
          );
        }

        if (user.role === "ADMIN") {
          if (
            !adminMfaService ||
            typeof adminMfaService.begin !==
            "function"
          ) {
            throw new Error(
              "Admin MFA service unavailable",
            );
          }

          const challenge =
            await adminMfaService.begin(
              user.id,
              tx,
            );

          return {
            mfaRequired: true,
            ...challenge,
          };
        }

        return issue(
          tx,
          user,
        );
      },
    );
  }

  async function completeAdminMfa(input) {
    if (
      !adminMfaService ||
      typeof adminMfaService.complete !==
      "function"
    ) {
      throw new Error(
        "Admin MFA service unavailable",
      );
    }

    const result =
      await prisma.$transaction(
        async (tx) => {
          const userId =
            await adminMfaService.complete(
              input,
              tx,
            );

          // Invalid MFA code:
          // let the transaction COMMIT
          // the failed-attempt increment.
          if (userId === null) {
            return null;
          }

          if (
            !Number.isSafeInteger(
              userId,
            ) ||
            userId < 1
          ) {
            throw new AuthError();
          }

          const user =
            await tx.user.findUnique({
              where: {
                id: userId,
              },

              select: USER_FIELDS,
            });

          if (
            !user ||
            user.role !== "ADMIN"
          ) {
            throw new AuthError();
          }

          return issue(
            tx,
            user,
          );
        },
      );

    // Transaction has committed at this point.
    if (result === null) {
      throw new AuthError();
    }

    return result;
  }

  async function revoke(tx, id) {
    await tx.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
  }

  async function refresh(rawToken) {
    if (!isToken(rawToken)) throw new AuthError();
    const tokenHash = digest(rawToken);
    const result = await prisma.$transaction(async (tx) => {
      const refresh = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!refresh) return null;
      const session = await tx.authSession.findUnique({ where: { id: refresh.sessionId } });
      if (!active(session)) return null;
      if (refresh.usedAt !== null) {
        // Returning rather than throwing commits the revocation before the 401.
        await revoke(tx, session.id);
        return null;
      }

      // Serialize refresh and logout on the session row, then claim the token.
      const claimedSession = await tx.authSession.updateMany({
        where: { id: session.id, version: session.version, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { version: { increment: 1 } },
      });
      if (claimedSession.count !== 1) {
        await revoke(tx, session.id);
        return null;
      }
      const claimedToken = await tx.refreshToken.updateMany({
        where: { id: refresh.id, usedAt: null }, data: { usedAt: new Date() },
      });
      if (claimedToken.count !== 1) {
        await revoke(tx, session.id);
        return null;
      }
      const user = await tx.user.findUnique({ where: { id: session.userId }, select: USER_FIELDS });
      if (!user) { await revoke(tx, session.id); return null; }
      return credentials(tx, session, user);
    });
    if (!result) throw new AuthError();
    return result;
  }

  async function logout(rawToken) {
    // Logout is idempotent; even an old, rotated credential can revoke its family.
    if (!isToken(rawToken)) return;
    await prisma.$transaction(async (tx) => {
      const refresh = await tx.refreshToken.findUnique({ where: { tokenHash: digest(rawToken) } });
      if (refresh) await revoke(tx, refresh.sessionId);
    });
  }

  async function authenticate(rawToken) {
    let claims;
    try { claims = tokens.verify(rawToken); }
    catch { throw new AuthError(); }
    const session = await prisma.authSession.findUnique({ where: { id: claims.sessionId } });
    if (!active(session) || session.userId !== claims.userId) throw new AuthError();
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: USER_FIELDS });
    if (!user) throw new AuthError();
    return { user, sessionId: session.id };
  }

  return {
    register,
    login,
    completeAdminMfa,
    refresh,
    logout,
    authenticate,
  };
}
module.exports = { createSessionService };
