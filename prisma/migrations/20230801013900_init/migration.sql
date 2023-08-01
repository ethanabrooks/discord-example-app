/*
  Warnings:

  - The primary key for the `FigmaData` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `FigmaData` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FigmaData" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenIV" TEXT NOT NULL
);
INSERT INTO "new_FigmaData" ("encryptedToken", "fileId", "tokenIV", "username") SELECT "encryptedToken", "fileId", "tokenIV", "username" FROM "FigmaData";
DROP TABLE "FigmaData";
ALTER TABLE "new_FigmaData" RENAME TO "FigmaData";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
