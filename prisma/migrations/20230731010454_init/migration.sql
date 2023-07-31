/*
  Warnings:

  - You are about to drop the column `imageId` on the `Fact` table. All the data in the column will be lost.
  - Added the required column `factId` to the `Image` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Image" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT,
    "svg" TEXT NOT NULL,
    "factId" INTEGER NOT NULL,
    CONSTRAINT "Image_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Image" ("description", "id", "svg") SELECT "description", "id", "svg" FROM "Image";
DROP TABLE "Image";
ALTER TABLE "new_Image" RENAME TO "Image";
CREATE UNIQUE INDEX "Image_factId_key" ON "Image"("factId");
CREATE TABLE "new_Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "turnId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Fact_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fact" ("id", "text", "turnId") SELECT "id", "text", "turnId" FROM "Fact";
DROP TABLE "Fact";
ALTER TABLE "new_Fact" RENAME TO "Fact";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
