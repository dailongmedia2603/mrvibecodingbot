import { Trans } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { desktopBridge } from "../lib/desktop";

/** Script bundled with the macOS desktop app (see apps/desktop extraResources). */
export const TELEGRAM_CONNECT_COMMAND =
  'bash "/Applications/1 Business Agent.app/Contents/Resources/stack/ket-noi-telegram.sh"';

/**
 * Extra Telegram bots are read from the local stack's env files, so adding one runs a
 * host script. Shown only in the macOS desktop app, where that script exists.
 */
export function TelegramBotCommandNote() {
  const [copied, setCopied] = useState(false);
  if (desktopBridge()?.platform !== "darwin") return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(TELEGRAM_CONNECT_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-muted/40 px-4 py-4"
      data-testid="telegram-bot-command-note"
    >
      <h3 className="text-[13px] font-medium text-foreground">
        <Trans>Thêm bot Telegram mới</Trans>
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        <Trans>
          Mỗi tài khoản Telegram chỉ nhắn được với một bot trong app qua cùng một bot Telegram. Muốn
          thêm: tạo bot ở @BotFather, chạy lệnh dưới trong Terminal của máy đang chạy app, dán token
          khi được hỏi, rồi nhấn Cmd+R. Bot mới sẽ có trong Connect a chat app.
        </Trans>
      </p>
      <div className="mt-3 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground">
          {TELEGRAM_CONNECT_COMMAND}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? <Trans>Đã chép</Trans> : <Trans>Chép lệnh</Trans>}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        <Trans>
          Thêm <span className="font-mono">--danh-sach</span> để xem các bot đã kết nối, hoặc{" "}
          <span className="font-mono">--xoa TÊN</span> để gỡ một bot phụ.
        </Trans>
      </p>
    </section>
  );
}
