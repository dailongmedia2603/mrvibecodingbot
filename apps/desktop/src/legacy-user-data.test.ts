import path from "node:path";
import { describe, expect, it } from "vitest";
import { adoptLegacyUserData } from "./legacy-user-data.js";
import { setupFilePath } from "./setup-store.js";

const root = path.join("/Users", "me", "Library", "Application Support");
const current = path.join(root, "1 Business Agent");
const legacy = path.join(root, "Mr. Vibe Coding BOT");

function existing(...dirs: string[]) {
  const files = new Set(dirs.map(setupFilePath));
  return (file: string) => files.has(file);
}

describe("adoptLegacyUserData", () => {
  it("keeps using the legacy folder that was set up", () => {
    expect(adoptLegacyUserData(current, existing(legacy))).toBe(legacy);
  });

  it("prefers the new folder once it has a setup", () => {
    expect(adoptLegacyUserData(current, existing(legacy, current))).toBe(current);
  });

  it("leaves fresh installs alone", () => {
    expect(adoptLegacyUserData(current, existing())).toBe(current);
  });
});
