CREATE TYPE "ContactMessageSubject" AS ENUM (
    'SUPPORT',
    'SUGGESTION',
    'COMPLAINT',
    'OTHER'
);

CREATE TYPE "ContactMessageStatus" AS ENUM (
    'NEW',
    'READ',
    'RESOLVED'
);

CREATE TABLE "ContactMessage" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(11) NOT NULL,
    "email" VARCHAR(254),
    "subject" "ContactMessageSubject" NOT NULL,
    "message" VARCHAR(250) NOT NULL,
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX
    "ContactMessage_status_createdAt_idx"
ON
    "ContactMessage"("status", "createdAt");

CREATE INDEX
    "ContactMessage_phone_createdAt_idx"
ON
    "ContactMessage"("phone", "createdAt");