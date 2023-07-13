import { destination, pino } from "pino";
import path from "path";
import { existsSync, mkdirSync } from "fs";

export function createLogger(subdirectory: string, channelId: string) {
  const dirPath = path.join("logs", subdirectory);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return pino(
    { level: "debug" },
    destination(path.join(dirPath, `${channelId}.log`)),
  );
}
