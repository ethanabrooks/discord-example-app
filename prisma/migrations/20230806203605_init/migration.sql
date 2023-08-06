/*
  Warnings:

  - The primary key for the `Spec` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `id` to the `Spec` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Spec" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL
);
INSERT INTO "new_Spec" ("channel", "messageId", "source") SELECT "channel", "messageId", "source" FROM "Spec";
DROP TABLE "Spec";
ALTER TABLE "new_Spec" RENAME TO "Spec";
CREATE UNIQUE INDEX "Spec_messageId_key" ON "Spec"("messageId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
