-- M5: embedding cache (JM-041).
--
-- Hand-written rather than `prisma migrate dev`-generated: no live Postgres
-- was reachable in the sandbox this was authored in (Docker Desktop was not
-- running). Written to match Prisma's own generated SQL shape and naming
-- convention exactly, so `prisma migrate deploy` applies it identically to
-- one Prisma would have produced itself.
--
-- The `pgvector/pgvector:pg16` image (docker-compose.yml's jobmatch-postgres
-- service, and its production counterpart) ships the extension's shared
-- library already; this statement only needs to register it in this
-- database, which it has not been until now.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingKind" AS ENUM ('PROFILE', 'POSTING');

-- CreateTable
CREATE TABLE "match_embeddings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "EmbeddingKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "embeddingModelVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "vector" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_embeddings_workspaceId_kind_sourceId_embeddingModelVe_key" ON "match_embeddings"("workspaceId", "kind", "sourceId", "embeddingModelVersion");

-- CreateIndex
CREATE INDEX "match_embeddings_workspaceId_kind_idx" ON "match_embeddings"("workspaceId", "kind");
