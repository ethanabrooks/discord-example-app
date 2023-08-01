/*
  Warnings:

  - You are about to drop the column `text` on the `CustomCheck` table. All the data in the column will be lost.
  - Added the required column `check` to the `CustomCheck` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomCheck" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "check" TEXT NOT NULL,
    "proposition" TEXT NOT NULL
);
INSERT INTO "new_CustomCheck" ("proposition", "username") SELECT "proposition", "username" FROM "CustomCheck";
DROP TABLE "CustomCheck";
ALTER TABLE "new_CustomCheck" RENAME TO "CustomCheck";
CREATE UNIQUE INDEX "CustomCheck_username_key" ON "CustomCheck"("username");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
