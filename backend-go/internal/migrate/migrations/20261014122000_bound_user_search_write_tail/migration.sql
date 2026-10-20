-- Controlled owned HTTP trial: identical 100k-user write burst produced
-- search p95 ~87ms with pending-list fastupdate vs ~3ms with direct updates.
-- Direct GIN maintenance costs more insertion time and WAL; see performance.md.
-- Changing this option does not flush a pre-existing pending list. The prior
-- index migration builds over existing rows without a pending list; existing
-- installations that applied it separately still need normal index maintenance.
ALTER INDEX "User_search_trgm_idx" SET (fastupdate = off);
