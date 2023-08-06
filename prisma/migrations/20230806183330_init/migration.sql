-- CreateTable
CREATE TABLE "Analysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "completionId" INTEGER NOT NULL,
    CONSTRAINT "Analysis_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "Completion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
