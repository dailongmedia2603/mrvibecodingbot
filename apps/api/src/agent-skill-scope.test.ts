import type { Actor } from "@rakazo/contracts";
import { buildSkillMd } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createAgentSkillsService } from "./agent-skills.js";

const actor: Actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: true,
};

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
  createdAt: Date;
  updatedAt: Date;
};

function row(name: string, scope: string, botIds: string[]): Row {
  return {
    id: `id-${name}`,
    spaceId: actor.spaceId,
    userId: actor.userId,
    name,
    description: `About ${name}`,
    content: buildSkillMd({ name, description: `About ${name}`, body: "Body" }),
    source: "user",
    scope,
    botIds,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function setup(rows: Row[], botsInSpace = ["writer", "sales"]) {
  type Where = { id?: string; spaceId?: string; userId?: string };
  const matches = (entry: Row, where: Where) =>
    Object.entries(where).every(([key, value]) => entry[key as keyof Row] === value);
  const prisma = {
    agentSkill: {
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        rows.filter((entry) => matches(entry, where)),
      ),
      findFirst: vi.fn(async ({ where }: { where: Where }) =>
        rows.find((entry) => matches(entry, where)),
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt" | "updatedAt"> }) => {
        const created = {
          id: `id-${data.name}`,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          ...data,
        };
        rows.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const found = rows.find((entry) => entry.id === where.id);
        if (!found) throw new Error("missing");
        Object.assign(found, data);
        return found;
      }),
    },
    bot: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; spaceId: string } }) =>
        where.spaceId === actor.spaceId
          ? where.id.in.filter((id) => botsInSpace.includes(id)).map((id) => ({ id }))
          : [],
      ),
    },
  };
  return { rows, service: createAgentSkillsService(prisma as unknown as PrismaClient) };
}

describe("skill scope in the API", () => {
  it("assigns a skill to a bot and takes it back", async () => {
    const { rows, service } = setup([row("QT2", "bot", ["sales"])]);
    await expect(
      service.setBotAssignment(actor, { skillId: "id-QT2", botId: "writer", assigned: true }),
    ).resolves.toMatchObject({ botIds: ["sales", "writer"] });
    // Assigning twice keeps one entry.
    await service.setBotAssignment(actor, { skillId: "id-QT2", botId: "writer", assigned: true });
    expect(rows[0]?.botIds).toEqual(["sales", "writer"]);
    await expect(
      service.setBotAssignment(actor, { skillId: "id-QT2", botId: "sales", assigned: false }),
    ).resolves.toMatchObject({ botIds: ["writer"] });
  });

  it("refuses a bot from another space", async () => {
    const { service } = setup([row("QT2", "bot", [])]);
    await expect(
      service.setBotAssignment(actor, { skillId: "id-QT2", botId: "stranger", assigned: true }),
    ).rejects.toBeInstanceOf(IsolationError);
    await expect(
      service.create(actor, {
        content: buildSkillMd({ name: "New", description: "d", body: "b" }),
        botIds: ["stranger"],
      }),
    ).rejects.toBeInstanceOf(IsolationError);
  });

  it("creates company docs without bots and private skills for the chosen bots", async () => {
    const { service } = setup([]);
    await expect(
      service.create(actor, {
        content: buildSkillMd({ name: "KT1", description: "Profile", body: "b" }),
        scope: "company",
        botIds: ["writer"],
      }),
    ).resolves.toMatchObject({ scope: "company", botIds: [] });
    await expect(
      service.create(actor, {
        content: buildSkillMd({ name: "QT1", description: "Research", body: "b" }),
        botIds: ["writer"],
      }),
    ).resolves.toMatchObject({ scope: "bot", botIds: ["writer"] });
  });

  it("moves a skill into company docs and lists per bot for routines", async () => {
    const { service } = setup([row("KT1", "bot", []), row("QT2", "bot", ["writer"])]);
    await expect(
      service.setScope(actor, { skillId: "id-KT1", scope: "company" }),
    ).resolves.toMatchObject({ scope: "company" });
    const forSales = await service.listWithContent(actor, "sales");
    expect(forSales.filter((s) => s.source === "user").map((s) => s.name)).toEqual(["KT1"]);
    const forWriter = await service.listWithContent(actor, "writer");
    expect(forWriter.filter((s) => s.source === "user").map((s) => s.name)).toEqual(["KT1", "QT2"]);
  });
});
