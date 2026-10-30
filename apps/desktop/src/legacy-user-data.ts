import { existsSync } from "node:fs";
import path from "node:path";
import { setupFilePath } from "./setup-store.js";

/** Product names this app shipped under before; their user data holds the stack and sign-in. */
export const LEGACY_USER_DATA_NAMES = ["Mr. Vibe Coding BOT"];

/**
 * Returns the user data directory to use after a product rename. Electron creates
 * the new folder before the app runs, so a legacy folder that was set up keeps
 * being used in place until the new one has a setup of its own.
 */
export function adoptLegacyUserData(
  userDataDir: string,
  exists: (file: string) => boolean = existsSync,
): string {
  if (exists(setupFilePath(userDataDir))) return userDataDir;
  for (const name of LEGACY_USER_DATA_NAMES) {
    const legacy = path.join(path.dirname(userDataDir), name);
    if (legacy !== userDataDir && exists(setupFilePath(legacy))) return legacy;
  }
  return userDataDir;
}
