-- Skills stop being visible to every bot: company docs ("company") reach every bot, every other
-- skill ("bot") only the bots it is assigned to. Additive, so the previous release keeps working.
ALTER TABLE "agent_skills"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'bot',
  ADD COLUMN "botIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing skills keep reaching the bots that could read them before: every bot in their space.
UPDATE "agent_skills" AS skill
SET "botIds" = COALESCE(
  (SELECT array_agg(bot."id" ORDER BY bot."id") FROM "bots" AS bot WHERE bot."spaceId" = skill."spaceId"),
  ARRAY[]::TEXT[]
);
