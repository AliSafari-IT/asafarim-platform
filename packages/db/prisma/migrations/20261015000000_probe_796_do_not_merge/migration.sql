-- THROWAWAY (#796 acceptance): proves the Platform DB job fails when identity_ro
-- gets a table grant. This branch is never merged.
GRANT SELECT ON "User" TO identity_ro;
