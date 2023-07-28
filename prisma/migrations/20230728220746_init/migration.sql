-- CreateTable
CREATE TABLE "Completion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "turnId" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    CONSTRAINT "Completion_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "turnId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Fact_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "newFact" TEXT,
    "status" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "coherenceCheck" BOOLEAN NOT NULL,
    "proposition" TEXT NOT NULL
);
