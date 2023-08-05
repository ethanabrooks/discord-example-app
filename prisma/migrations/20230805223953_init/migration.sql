-- CreateTable
CREATE TABLE "CustomCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "check" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FigmaData" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenIV" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channel" TEXT NOT NULL,
    "coherenceCheck" BOOLEAN NOT NULL,
    "customCheckId" INTEGER,
    CONSTRAINT "Game_customCheckId_fkey" FOREIGN KEY ("customCheckId") REFERENCES "CustomCheck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL,
    "playerInput" TEXT,
    "player" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "imageId" INTEGER,
    CONSTRAINT "Fact_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fact_id_fkey" FOREIGN KEY ("id") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Completion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "turnId" INTEGER NOT NULL,
    CONSTRAINT "Completion_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Image" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT,
    "svg" TEXT NOT NULL,
    "factId" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FigmaData_username_key" ON "FigmaData"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Fact_imageId_key" ON "Fact"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "Image_factId_key" ON "Image"("factId");
