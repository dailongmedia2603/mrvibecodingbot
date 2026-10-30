/**
 * Which bots see a skill. Company docs reach every bot; any other user skill reaches only the
 * bots it is assigned to. Built-in and plugin skills ship with the app and reach every bot.
 */

export const SKILL_SCOPES = ["company", "bot"] as const;
export type SkillScope = (typeof SKILL_SCOPES)[number];

export type ScopedSkill = {
  source: string;
  scope?: string;
  botIds?: readonly string[];
};

export function asSkillScope(value: string | undefined): SkillScope {
  return value === "company" ? "company" : "bot";
}

export function isSkillVisibleToBot(skill: ScopedSkill, botId: string): boolean {
  if (skill.source !== "user") return true;
  if (asSkillScope(skill.scope) === "company") return true;
  return skill.botIds?.includes(botId) ?? false;
}

/** Visible to at least one of `botIds`: a group chat offers what any member can use. */
export function isSkillVisibleToAnyBot(skill: ScopedSkill, botIds: readonly string[]): boolean {
  return botIds.some((botId) => isSkillVisibleToBot(skill, botId));
}

/** The Prisma `where` fragment for user skills a bot sees. */
export function skillVisibleToBotWhere(botId: string) {
  return { OR: [{ scope: "company" }, { botIds: { has: botId } }] };
}
