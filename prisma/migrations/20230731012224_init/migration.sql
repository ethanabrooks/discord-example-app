/*
  Warnings:

  - You are about to drop the column `proposition` on the `Game` table. All the data in the column will be lost.
  - Added the required column `propositionId` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "coherenceCheck" BOOLEAN NOT NULL,
    "propositionId" INTEGER NOT NULL,
    CONSTRAINT "Game_propositionId_fkey" FOREIGN KEY ("propositionId") REFERENCES "Fact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("channel", "coherenceCheck", "id") SELECT "channel", "coherenceCheck", "id" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
