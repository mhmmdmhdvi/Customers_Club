-- Additive migration. No rows/tables from existing member data are dropped.
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "sessionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
