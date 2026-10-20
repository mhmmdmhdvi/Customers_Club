CREATE TYPE "SecurityEventOutcome" AS ENUM (
    'SUCCESS',
    'FAILURE'
);

CREATE TABLE "SecurityEvent" (
    "id" SERIAL NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "outcome" "SecurityEventOutcome" NOT NULL,
    "actorUserId" INTEGER,
    "requestId" VARCHAR(128),
    "route" VARCHAR(255) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX
    "SecurityEvent_createdAt_idx"
ON
    "SecurityEvent"("createdAt");

CREATE INDEX
    "SecurityEvent_eventType_createdAt_idx"
ON
    "SecurityEvent"("eventType", "createdAt");

CREATE INDEX
    "SecurityEvent_outcome_createdAt_idx"
ON
    "SecurityEvent"("outcome", "createdAt");

CREATE INDEX
    "SecurityEvent_actorUserId_createdAt_idx"
ON
    "SecurityEvent"("actorUserId", "createdAt");

CREATE INDEX
    "SecurityEvent_statusCode_createdAt_idx"
ON
    "SecurityEvent"("statusCode", "createdAt");