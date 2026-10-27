import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  appendBundledFiles,
  readSkillFiles,
  readSkillZip,
  SKILL_CONTENT_LIMIT,
} from "./skill-import";

const SKILL = "---\nname: Poster\ndescription: Find posters.\n---\n\nSteps.\n";

/** Minimal zip writer: deflates text entries and stores binary ones. */
function zip(entries: Record<string, string | Uint8Array>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = encoder.encode(path);
    const raw = typeof value === "string" ? encoder.encode(value) : value;
    const method = typeof value === "string" ? 8 : 0;
    const data = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

describe("readSkillZip", () => {
  it("inlines bundled text files and skips binary ones", async () => {
    const skills = await readSkillZip(
      "poster.zip",
      zip({
        "poster/SKILL.md": SKILL,
        "poster/references/brand.md": "Use ```ink``` tones.",
        "poster/scripts/run.sh": "echo hi",
        "poster/assets/logo.png": new Uint8Array([137, 80, 78, 71]),
        "__MACOSX/poster/._SKILL.md": "junk",
      }),
    );
    expect(skills).toHaveLength(1);
    const [skill] = skills;
    expect(skill?.origin).toBe("poster.zip/poster/SKILL.md");
    expect(skill?.content.startsWith(SKILL.trimEnd())).toBe(true);
    expect(skill?.content).toContain(
      "### references/brand.md\n\n````md\nUse ```ink``` tones.\n````",
    );
    expect(skill?.content).toContain("### scripts/run.sh\n\n```sh\necho hi\n```");
    expect(skill?.skipped).toEqual(["assets/logo.png"]);
  });

  it("reads every skill folder in one archive without mixing their files", async () => {
    const skills = await readSkillZip(
      "pack.zip",
      zip({
        "SKILL.md": SKILL,
        "notes.md": "root notes",
        "child/SKILL.md": SKILL.replace("Poster", "Child"),
        "child/notes.md": "child notes",
      }),
    );
    expect(skills.map((skill) => skill.origin)).toEqual([
      "pack.zip/SKILL.md",
      "pack.zip/child/SKILL.md",
    ]);
    expect(skills[0]?.content).toContain("root notes");
    expect(skills[0]?.content).not.toContain("child notes");
    expect(skills[1]?.content).toContain("child notes");
  });

  it("rejects files that are not zips", async () => {
    await expect(readSkillZip("bad.zip", new TextEncoder().encode("nope"))).rejects.toThrow(
      "not a valid zip file",
    );
  });
});

describe("readSkillFiles", () => {
  it("reads markdown directly and reports unsupported or empty uploads", async () => {
    const result = await readSkillFiles([
      new File([SKILL], "poster.md"),
      new File(["x"], "poster.pdf"),
      new File([zip({ "readme.md": "hi" })], "empty.zip"),
    ]);
    expect(result.skills).toEqual([{ origin: "poster.md", content: SKILL, skipped: [] }]);
    expect(result.errors).toEqual([
      "poster.pdf: only .md and .zip files are supported",
      "empty.zip: no SKILL.md found",
    ]);
  });
});

describe("appendBundledFiles", () => {
  it("keeps the skill under the size limit by skipping files that do not fit", () => {
    const skipped: string[] = [];
    const content = appendBundledFiles(
      SKILL,
      [
        { path: "small.md", text: "small" },
        { path: "huge.md", text: "x".repeat(SKILL_CONTENT_LIMIT) },
      ],
      skipped,
    );
    expect(content.length).toBeLessThanOrEqual(SKILL_CONTENT_LIMIT);
    expect(content).toContain("small");
    expect(skipped).toEqual(["huge.md"]);
  });
});
