-- Preserve all existing rows, including legacy plaintext OTP history.
-- New application code does not authenticate legacy rows. No data backfill/reset.
ALTER TABLE "OTPCode"
    ALTER COLUMN "code" DROP NOT NULL,
    ADD COLUMN "codeHash" VARCHAR(64),
    ADD COLUMN "nonce" VARCHAR(64),
    ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "deliveryState" VARCHAR(12);
CREATE INDEX "OTPCode_phone_used_deliveryState_id_idx"
    ON "OTPCode"("phone", "used", "deliveryState", "id");
CREATE TABLE "OtpRateBucket" (
    "key" VARCHAR(64) NOT NULL,
    "events" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OtpRateBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "OtpRateBucket_expiresAt_idx" ON "OtpRateBucket"("expiresAt");
