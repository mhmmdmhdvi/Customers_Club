-- CreateTable
CREATE TABLE "AdminMfaCredential" (
    "userId" INTEGER NOT NULL,
    "secretCiphertext" VARCHAR(256) NOT NULL,
    "secretIv" VARCHAR(32) NOT NULL,
    "secretTag" VARCHAR(32) NOT NULL,
    "lastUsedCounter" INTEGER,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMfaCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdminMfaChallenge" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminMfaChallenge_tokenHash_key" ON "AdminMfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_userId_expiresAt_idx" ON "AdminMfaChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_expiresAt_idx" ON "AdminMfaChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminMfaCredential" ADD CONSTRAINT "AdminMfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMfaChallenge" ADD CONSTRAINT "AdminMfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
