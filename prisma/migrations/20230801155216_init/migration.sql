/*
  Warnings:

  - Added the required column `customCheck` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "coherenceCheck" BOOLEAN NOT NULL,
    "customCheck" TEXT NOT NULL,
    "factId" INTEGER,
    CONSTRAINT "Game_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("channel", "coherenceCheck", "factId", "id") SELECT "channel", "coherenceCheck", "factId", "id" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
