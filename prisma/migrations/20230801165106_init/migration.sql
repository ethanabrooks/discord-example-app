/*
  Warnings:

  - Added the required column `concludingText` to the `CustomCheck` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomCheck" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "check" TEXT NOT NULL,
    "concludingText" TEXT NOT NULL
);
INSERT INTO "new_CustomCheck" ("check", "username") SELECT "check", "username" FROM "CustomCheck";
DROP TABLE "CustomCheck";
ALTER TABLE "new_CustomCheck" RENAME TO "CustomCheck";
CREATE UNIQUE INDEX "CustomCheck_username_key" ON "CustomCheck"("username");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
