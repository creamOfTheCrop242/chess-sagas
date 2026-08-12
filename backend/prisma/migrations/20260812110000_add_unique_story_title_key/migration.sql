ALTER TABLE "GeneratedStory" ADD COLUMN "titleKey" TEXT;

WITH normalized AS (
  SELECT
    "id",
    lower(regexp_replace(trim("title"), '[^[:alnum:]]+', ' ', 'g')) AS key,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(trim("title"), '[^[:alnum:]]+', ' ', 'g'))
      ORDER BY "createdAt", "id"
    ) AS duplicate_number
  FROM "GeneratedStory"
)
UPDATE "GeneratedStory" AS story
SET "titleKey" = CASE
  WHEN normalized.duplicate_number = 1 THEN normalized.key
  ELSE normalized.key || '-legacy-' || story."id"
END
FROM normalized
WHERE normalized."id" = story."id";

CREATE UNIQUE INDEX "GeneratedStory_titleKey_key" ON "GeneratedStory"("titleKey");
