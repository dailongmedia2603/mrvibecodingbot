// @vitest-environment jsdom
import type { RakazoDesktop } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TELEGRAM_CONNECT_COMMAND, TelegramBotCommandNote } from "./TelegramBotCommandNote";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete window.rakazoDesktop;
  vi.restoreAllMocks();
});

function desktop(platform: string) {
  window.rakazoDesktop = { platform } as unknown as RakazoDesktop;
}

it("is hidden outside the macOS desktop app", async () => {
  await act(async () => root.render(<TelegramBotCommandNote />));
  expect(host.querySelector('[data-testid="telegram-bot-command-note"]')).toBeNull();
  desktop("win32");
  await act(async () => root.render(<TelegramBotCommandNote key="win" />));
  expect(host.querySelector('[data-testid="telegram-bot-command-note"]')).toBeNull();
});

it("shows the connect command on macOS and copies it", async () => {
  desktop("darwin");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await act(async () => root.render(<TelegramBotCommandNote />));
  expect(host.querySelector("code")?.textContent).toBe(TELEGRAM_CONNECT_COMMAND);
  await act(async () => host.querySelector("button")?.click());
  expect(writeText).toHaveBeenCalledWith(TELEGRAM_CONNECT_COMMAND);
  expect(host.textContent).toContain("Đã chép");
});
