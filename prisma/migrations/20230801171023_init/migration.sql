/*
  Warnings:

  - You are about to drop the column `proposition` on the `CustomCheck` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "check" TEXT NOT NULL
);
INSERT INTO "new_CustomCheck" ("check", "id", "username") SELECT "check", "id", "username" FROM "CustomCheck";
DROP TABLE "CustomCheck";
ALTER TABLE "new_CustomCheck" RENAME TO "CustomCheck";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
