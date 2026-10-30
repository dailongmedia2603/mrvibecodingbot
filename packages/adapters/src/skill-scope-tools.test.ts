import { buildSkillMd, formatSkillsCatalogInstruction } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  listAgentSkillRecords,
  skillCreateFromTool,
  skillReadFromTool,
  skillUpdateFromTool,
} from "./skill-tools.js";

type Row = {
  id: string;
  spaceId: string;
  userId: string;
  name: string;
  description: string;
  content: string;
  source: string;
  scope: string;
  botIds: string[];
};
type Where = {
  spaceId?: string;
  userId?: string;
  OR?: Array<{ scope?: string; botIds?: { has: string } }>;
};

function skill(name: string, scope: string, botIds: string[] = []): Row {
  return {
    id: `id-${name}`,
    spaceId: "space-1",
    userId: "user-1",
    name,
    description: `When to use ${name}`,
    content: buildSkillMd({ name, description: `When to use ${name}`, body: `Steps of ${name}` }),
    source: "user",
    scope,
    botIds,
  };
}

function makePrisma(rows: Row[]) {
  const matches = (row: Row, where: Where) =>
    (!where.spaceId || row.spaceId === where.spaceId) &&
    (!where.userId || row.userId === where.userId) &&
    (!where.OR ||
      where.OR.some(
        (clause) =>
          (clause.scope !== undefined && row.scope === clause.scope) ||
          (clause.botIds !== undefined && row.botIds.includes(clause.botIds.has)),
      ));
  const agentSkill = {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(row, where)).map((row) => ({ ...row })),
    ),
    create: vi.fn(async ({ data }: { data: Omit<Row, "id"> }) => {
      const row = { id: `id-${data.name}`, ...data };
      rows.push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((entry) => entry.id === where.id);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  };
  return { agentSkill } as unknown as PrismaClient;
}

const owner = (botId: string) => ({ spaceId: "space-1", userId: "user-1", botId });

describe("skills scoped to bots", () => {
  const library = () => [
    skill("KT1 Company profile", "company"),
    skill("QT2 Monthly plan", "bot", ["writer"]),
    skill("Agency pricing", "bot", ["sales"]),
    skill("Unassigned draft", "bot"),
  ];

  it("lists company docs and assigned skills only, by name and description", async () => {
    const records = await listAgentSkillRecords(makePrisma(library()), owner("writer"));
    const names = records.filter((record) => record.source === "user").map((r) => r.name);
    expect(names).toEqual(["KT1 Company profile", "QT2 Monthly plan"]);

    const catalog = formatSkillsCatalogInstruction(records) ?? "";
    expect(catalog).toContain("- QT2 Monthly plan: When to use QT2 Monthly plan");
    expect(catalog).not.toContain("Agency pricing");
    // The full SKILL.md stays out of the prompt until skill_read loads it.
    expect(catalog).not.toContain("Steps of QT2 Monthly plan");
  });

  it("does not let a bot read or edit a skill assigned to another bot", async () => {
    const prisma = makePrisma(library());
    await expect(
      skillReadFromTool(prisma, owner("writer"), { name: "Agency pricing" }),
    ).resolves.toEqual({ error: "Skill not found." });
    await expect(
      skillUpdateFromTool(prisma, owner("writer"), { name: "Agency pricing", body: "x" }),
    ).resolves.toEqual({ error: "Skill not found." });
    await expect(
      skillReadFromTool(prisma, owner("sales"), { name: "Agency pricing" }),
    ).resolves.toMatchObject({ content: expect.stringContaining("Steps of Agency pricing") });
  });

  it("lets every bot update a company doc", async () => {
    const prisma = makePrisma(library());
    await expect(
      skillUpdateFromTool(prisma, owner("sales"), { name: "KT1 Company profile", body: "New" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("gives a skill a bot creates to that bot alone, keeping names unique", async () => {
    const rows = library();
    const prisma = makePrisma(rows);
    await expect(
      skillCreateFromTool(prisma, owner("writer"), {
        name: "KT8 Pain map",
        description: "Research results",
        body: "Map",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(rows.find((row) => row.name === "KT8 Pain map")).toMatchObject({
      scope: "bot",
      botIds: ["writer"],
    });
    await expect(
      skillCreateFromTool(prisma, owner("writer"), {
        name: "Agency pricing",
        description: "Copy",
        body: "Copy",
      }),
    ).resolves.toEqual({ error: 'A skill named "Agency pricing" already exists.' });
  });
});
