/*
  Warnings:

  - You are about to drop the column `coherenceCheck` on the `Game` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "customCheckId" INTEGER,
    CONSTRAINT "Game_customCheckId_fkey" FOREIGN KEY ("customCheckId") REFERENCES "CustomCheck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("channel", "customCheckId", "difficulty", "id") SELECT "channel", "customCheckId", "difficulty", "id" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
