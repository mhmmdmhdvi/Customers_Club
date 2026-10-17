CREATE TYPE "AdminAuditOutcome" AS ENUM (
    'SUCCESS',
    'FAILURE'
);

CREATE TABLE "AdminAuditEvent" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "outcome" "AdminAuditOutcome" NOT NULL,
    "requestId" VARCHAR(128),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX
    "AdminAuditEvent_createdAt_idx"
ON
    "AdminAuditEvent"("createdAt");

CREATE INDEX
    "AdminAuditEvent_actorUserId_createdAt_idx"
ON
    "AdminAuditEvent"("actorUserId", "createdAt");

CREATE INDEX
    "AdminAuditEvent_action_createdAt_idx"
ON
    "AdminAuditEvent"("action", "createdAt");

CREATE INDEX
    "AdminAuditEvent_targetType_targetId_createdAt_idx"
ON
    "AdminAuditEvent"(
        "targetType",
        "targetId",
        "createdAt"
    );