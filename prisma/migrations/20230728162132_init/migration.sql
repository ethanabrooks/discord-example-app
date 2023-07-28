-- CreateTable
CREATE TABLE "Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "turnId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL,
    CONSTRAINT "Fact_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "proposed" TEXT,
    "won" BOOLEAN NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channelId" TEXT NOT NULL,
    "proposition" TEXT NOT NULL,
    CONSTRAINT "Game_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY
);
