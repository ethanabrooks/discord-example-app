/*
  Warnings:

  - You are about to drop the column `customCheck` on the `Game` table. All the data in the column will be lost.
  - The primary key for the `CustomCheck` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `id` to the `CustomCheck` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "coherenceCheck" BOOLEAN NOT NULL,
    "customCheckId" INTEGER,
    "factId" INTEGER,
    CONSTRAINT "Game_customCheckId_fkey" FOREIGN KEY ("customCheckId") REFERENCES "CustomCheck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Game_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("channel", "coherenceCheck", "factId", "id") SELECT "channel", "coherenceCheck", "factId", "id" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE TABLE "new_CustomCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "proposition" TEXT NOT NULL
);
INSERT INTO "new_CustomCheck" ("check", "proposition", "username") SELECT "check", "proposition", "username" FROM "CustomCheck";
DROP TABLE "CustomCheck";
ALTER TABLE "new_CustomCheck" RENAME TO "CustomCheck";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
