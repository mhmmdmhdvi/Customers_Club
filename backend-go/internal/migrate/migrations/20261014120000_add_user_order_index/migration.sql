-- Measured admin pagination previously scanned/sorted all users for each page.
-- A secondary id key also makes equal-createdAt page boundaries deterministic.
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt" DESC, "id" DESC);
