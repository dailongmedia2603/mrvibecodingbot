import { describe, expect, it } from "vitest";
import { asSkillScope, isSkillVisibleToAnyBot, isSkillVisibleToBot } from "./skill-scope.js";

describe("skill visibility", () => {
  it("shows company docs and built-ins to every bot", () => {
    expect(isSkillVisibleToBot({ source: "user", scope: "company", botIds: [] }, "bot-a")).toBe(
      true,
    );
    expect(isSkillVisibleToBot({ source: "builtin" }, "bot-a")).toBe(true);
    expect(isSkillVisibleToBot({ source: "plugin" }, "bot-a")).toBe(true);
  });

  it("shows a private skill only to the bots it is assigned to", () => {
    const skill = { source: "user", scope: "bot", botIds: ["bot-a"] };
    expect(isSkillVisibleToBot(skill, "bot-a")).toBe(true);
    expect(isSkillVisibleToBot(skill, "bot-b")).toBe(false);
    expect(isSkillVisibleToBot({ source: "user" }, "bot-a")).toBe(false);
  });

  it("offers a group what any member can use", () => {
    const skill = { source: "user", scope: "bot", botIds: ["bot-b"] };
    expect(isSkillVisibleToAnyBot(skill, ["bot-a", "bot-b"])).toBe(true);
    expect(isSkillVisibleToAnyBot(skill, ["bot-a"])).toBe(false);
  });

  it("treats anything but company as private", () => {
    expect(asSkillScope("company")).toBe("company");
    expect(asSkillScope(undefined)).toBe("bot");
    expect(asSkillScope("everyone")).toBe("bot");
  });
});
