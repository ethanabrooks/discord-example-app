-- CreateTable
CREATE TABLE "CustomCheck" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "check" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomCheck_username_key" ON "CustomCheck"("username");
