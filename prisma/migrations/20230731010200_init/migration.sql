/*
  Warnings:

  - You are about to drop the column `svgDataId` on the `Turn` table. All the data in the column will be lost.
  - Added the required column `imageId` to the `Fact` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Turn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "newFact" TEXT,
    "player" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "imageId" INTEGER,
    CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Turn_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Turn" ("gameId", "id", "newFact", "player", "status", "turn") SELECT "gameId", "id", "newFact", "player", "status", "turn" FROM "Turn";
DROP TABLE "Turn";
ALTER TABLE "new_Turn" RENAME TO "Turn";
CREATE TABLE "new_Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageId" INTEGER NOT NULL,
    "turnId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Fact_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fact_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fact" ("id", "text", "turnId") SELECT "id", "text", "turnId" FROM "Fact";
DROP TABLE "Fact";
ALTER TABLE "new_Fact" RENAME TO "Fact";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
