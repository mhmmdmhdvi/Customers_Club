-- Additive migration: no changes to existing User or OTPCode tables.
CREATE TYPE "PhoneVerificationPurpose" AS ENUM ('REGISTER', 'LOGIN');

CREATE TABLE "PhoneVerification" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(11) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" "PhoneVerificationPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneVerification_tokenHash_key" ON "PhoneVerification"("tokenHash");
CREATE INDEX "PhoneVerification_phone_idx" ON "PhoneVerification"("phone");
CREATE INDEX "PhoneVerification_expiresAt_idx" ON "PhoneVerification"("expiresAt");
