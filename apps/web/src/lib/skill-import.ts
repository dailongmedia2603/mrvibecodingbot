/**
 * Turn uploaded `.md` or `.zip` skill packages into SKILL.md documents.
 * A zip may hold one or more skill folders; each folder's text files are inlined
 * under "Bundled files" because a stored skill is a single SKILL.md document.
 */

export const SKILL_IMPORT_ACCEPT = ".md,.markdown,.zip,text/markdown,application/zip";

/** Mirrors the server's SKILL.md size limit. */
export const SKILL_CONTENT_LIMIT = 100_000;
const ZIP_SIZE_LIMIT = 20 * 1024 * 1024;
const ENTRY_SIZE_LIMIT = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "json",
  "yaml",
  "yml",
  "toml",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "sh",
  "bash",
  "zsh",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "php",
  "sql",
  "ini",
  "cfg",
  "conf",
  "env",
]);

export type ImportedSkill = {
  /** Where the SKILL.md came from, for messages ("file.zip/folder/SKILL.md"). */
  origin: string;
  content: string;
  /** Bundled files left out because they are binary or exceed the size limit. */
  skipped: string[];
};

export type SkillImportResult = { skills: ImportedSkill[]; errors: string[] };

export async function readSkillFiles(files: Iterable<File>): Promise<SkillImportResult> {
  const result: SkillImportResult = { skills: [], errors: [] };
  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".zip")) {
        const skills = await readSkillZip(file.name, new Uint8Array(await file.arrayBuffer()));
        if (skills.length === 0) result.errors.push(`${file.name}: no SKILL.md found`);
        result.skills.push(...skills);
      } else if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
        result.skills.push({ origin: file.name, content: await file.text(), skipped: [] });
      } else {
        result.errors.push(`${file.name}: only .md and .zip files are supported`);
      }
    } catch (error) {
      result.errors.push(`${file.name}: ${error instanceof Error ? error.message : "unreadable"}`);
    }
  }
  return result;
}

export async function readSkillZip(name: string, bytes: Uint8Array): Promise<ImportedSkill[]> {
  if (bytes.byteLength > ZIP_SIZE_LIMIT) throw new Error("zip is larger than 20 MB");
  const entries = listZipEntries(bytes).filter(
    (entry) => !entry.path.endsWith("/") && !isJunkPath(entry.path),
  );
  const roots = entries
    .filter((entry) => basename(entry.path).toLowerCase() === "skill.md")
    .map((entry) => ({ entry, dir: dirname(entry.path) }));
  const skills: ImportedSkill[] = [];
  for (const root of roots) {
    const skillMd = await readEntryText(bytes, root.entry);
    // Files under a nested skill folder belong to that skill, not this one.
    const bundled = entries.filter(
      (entry) =>
        entry !== root.entry &&
        isInside(entry.path, root.dir) &&
        !roots.some(
          (other) =>
            other.dir !== root.dir &&
            other.dir.length > root.dir.length &&
            isInside(entry.path, other.dir),
        ),
    );
    const files: { path: string; text: string }[] = [];
    const skipped: string[] = [];
    for (const entry of bundled.sort((a, b) => a.path.localeCompare(b.path))) {
      const relative = root.dir ? entry.path.slice(root.dir.length + 1) : entry.path;
      if (!isTextPath(entry.path) || entry.encrypted || entry.size > ENTRY_SIZE_LIMIT) {
        skipped.push(relative);
        continue;
      }
      const text = await readEntryText(bytes, entry);
      if (text.includes("\u0000")) skipped.push(relative);
      else files.push({ path: relative, text });
    }
    const content = appendBundledFiles(skillMd, files, skipped);
    skills.push({ origin: [name, root.entry.path].join("/"), content, skipped });
  }
  return skills;
}

/** Inline bundled text files after the SKILL.md body while staying under the size limit. */
export function appendBundledFiles(
  skillMd: string,
  files: { path: string; text: string }[],
  skipped: string[],
): string {
  if (files.length === 0) return skillMd;
  const header =
    "\n\n## Bundled files\n\nThese files came with the skill package. Paths are relative to the skill folder.\n";
  let content = skillMd.trimEnd() + header;
  let added = 0;
  for (const file of files) {
    const fence = "`".repeat(Math.max(3, longestBacktickRun(file.text) + 1));
    const section = `\n### ${file.path}\n\n${fence}${extension(file.path)}\n${file.text.trimEnd()}\n${fence}\n`;
    if (content.length + section.length > SKILL_CONTENT_LIMIT) {
      skipped.push(file.path);
      continue;
    }
    content += section;
    added += 1;
  }
  return added === 0 ? skillMd : content;
}

type ZipEntry = {
  path: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  localOffset: number;
};

function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a valid zip file");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff)
    throw new Error("ZIP64 archives are not supported");
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("corrupt zip directory");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      path: decoder
        .decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
        .replace(/\\/g, "/"),
      method: view.getUint16(offset + 10, true),
      encrypted: (view.getUint16(offset + 8, true) & 1) === 1,
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntryText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.encrypted) throw new Error(`${entry.path} is encrypted`);
  if (entry.size > ENTRY_SIZE_LIMIT) throw new Error(`${entry.path} is too large`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localOffset;
  if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== 0x04034b50) {
    throw new Error(`corrupt zip entry ${entry.path}`);
  }
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) raw = await inflateRaw(data, entry.size);
  else throw new Error(`${entry.path} uses an unsupported compression method`);
  return new TextDecoder().decode(raw).replace(/^﻿/, "");
}

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.byteLength > Math.max(expected, ENTRY_SIZE_LIMIT))
    throw new Error("zip entry is too large");
  return out;
}

function isJunkPath(path: string): boolean {
  return path
    .split("/")
    .some((part) => part === "__MACOSX" || part === ".DS_Store" || part === ".git");
}

function isTextPath(path: string): boolean {
  const name = basename(path).toLowerCase();
  return TEXT_EXTENSIONS.has(extension(name)) || !name.includes(".");
}

function isInside(path: string, dir: string): boolean {
  return dir === "" || path.startsWith(`${dir}/`);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function extension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}
