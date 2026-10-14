-- The owned 100k-user trial reduced exact substring-count scans from ~32ms
-- to ~0.3ms. One multi-column GIN supports each existing OR branch.
-- pg_trgm is trusted, but the migration role needs CREATE on this database.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX "User_search_trgm_idx" ON "User" USING GIN
    ("phone" gin_trgm_ops, "firstName" gin_trgm_ops, "lastName" gin_trgm_ops);
