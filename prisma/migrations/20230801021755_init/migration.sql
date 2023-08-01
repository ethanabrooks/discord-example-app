/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `FigmaData` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FigmaData_username_key" ON "FigmaData"("username");
