#!/bin/bash
# Kết nối (thêm) bot Telegram cho app 1 Business Agent.
#
#   bash ket-noi-telegram.sh              # thêm 1 bot Telegram (dán token khi được hỏi)
#   bash ket-noi-telegram.sh --danh-sach  # xem các bot Telegram đã kết nối
#   bash ket-noi-telegram.sh --xoa TEN    # gỡ bot Telegram phụ có tên TEN
#
# Bot đầu tiên được ghi vào .env (TELEGRAM_BOT_TOKEN). Các bot sau được ghi vào
# telegram-bots.env (TELEGRAM_BOT_TOKEN_<TEN>), app hiện chúng là "Telegram (ten)".
# Sau khi chạy: Settings → Messaging → Connect a chat app → chọn Telegram tương ứng.
set -euo pipefail

STACK="${STACK_DIR:-$HOME/Library/Application Support/Mr. Vibe Coding BOT/stack}"
ENV="$STACK/.env"
EXTRA="$STACK/telegram-bots.env"
[ -f "$ENV" ] || { echo "Không thấy $ENV. Hãy mở app 1 Business Agent ít nhất một lần."; exit 1; }
touch "$EXTRA"; chmod 600 "$EXTRA"

env_value() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
bot_username() { curl -fsS "https://api.telegram.org/bot$1/getMe" 2>/dev/null | sed -n 's/.*"username":"\([^"]*\)".*/\1/p'; }

restart_services() {
  echo "Khởi động lại dịch vụ api và worker (khoảng 1 phút)..."
  (cd "$STACK" && RAKAZO_IMAGE_TAG=edge RAKAZO_COMPUTER_IMAGE_TAG=edge \
    docker compose --env-file .env -f docker-compose.images.yml -p rakazo-desktop up -d --no-deps api worker)
}

list_bots() {
  local main; main="$(env_value TELEGRAM_BOT_TOKEN "$ENV")"
  if [ -n "$main" ]; then echo "- Telegram (bot chính): @$(bot_username "$main")"; else echo "- (chưa có bot chính)"; fi
  grep -E '^TELEGRAM_BOT_TOKEN_[A-Z0-9]+=' "$EXTRA" 2>/dev/null | while IFS='=' read -r key token; do
    name="${key#TELEGRAM_BOT_TOKEN_}"
    echo "- Telegram ($(echo "$name" | tr 'A-Z' 'a-z')): @$(bot_username "$token")"
  done || true
}

case "${1:-}" in
  --danh-sach)
    echo "Các bot Telegram đã kết nối:"; list_bots; exit 0 ;;
  --xoa)
    NAME="$(echo "${2:-}" | tr 'a-z' 'A-Z' | tr -cd 'A-Z0-9')"
    [ -n "$NAME" ] || { echo "Dùng: bash ket-noi-telegram.sh --xoa TEN"; exit 1; }
    grep -qE "^TELEGRAM_BOT_TOKEN_${NAME}=" "$EXTRA" || { echo "Không có bot phụ tên $NAME."; exit 1; }
    cp "$EXTRA" "$EXTRA.backup-$(date +%Y%m%d-%H%M%S)"
    grep -vE "^TELEGRAM_(BOT_TOKEN|WEBHOOK_SECRET_TOKEN)_${NAME}=" "$EXTRA" > "$EXTRA.tmp" || true
    mv "$EXTRA.tmp" "$EXTRA"; chmod 600 "$EXTRA"
    restart_services; echo "Đã gỡ bot Telegram ($(echo "$NAME" | tr 'A-Z' 'a-z'))."; exit 0 ;;
  "") ;;
  *) echo "Lệnh không hợp lệ: $1"; exit 1 ;;
esac

echo "Bước 1: trên Telegram mở @BotFather → /newbot → đặt tên → copy token."
printf "Bước 2: dán token rồi nhấn Enter (token không hiện trên màn hình): "
read -rs TOKEN; echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || { echo "Token không đúng định dạng (dạng 123456789:ABC...)."; exit 1; }

echo "Kiểm tra token với Telegram..."
USERNAME="$(bot_username "$TOKEN")"
[ -n "$USERNAME" ] || { echo "Telegram từ chối token này. Kiểm tra lại với @BotFather."; exit 1; }
echo "Token hợp lệ: bot @$USERNAME"

if [ "$(env_value TELEGRAM_BOT_TOKEN "$ENV")" = "$TOKEN" ] || grep -qE "^TELEGRAM_BOT_TOKEN_[A-Z0-9]+=${TOKEN}$" "$EXTRA"; then
  echo "Bot @$USERNAME đã được kết nối trước đó. Không cần làm gì thêm."; exit 0
fi
# Bot chưa từng dùng webhook thì app tự nhận tin bằng long-polling (không cần địa chỉ công khai).
curl -fsS "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null || true
SECRET="$(openssl rand -hex 24)"

if [ -z "$(env_value TELEGRAM_BOT_TOKEN "$ENV")" ]; then
  cp "$ENV" "$ENV.backup-before-telegram-$(date +%Y%m%d-%H%M%S)"
  grep -v -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET_TOKEN)=' "$ENV" > "$ENV.tmp" || true
  { cat "$ENV.tmp"; echo "TELEGRAM_BOT_TOKEN=$TOKEN"; echo "TELEGRAM_WEBHOOK_SECRET_TOKEN=$SECRET"; } > "$ENV"
  rm -f "$ENV.tmp"; chmod 600 "$ENV"
  LABEL="Telegram"
else
  BASE="$(echo "${USERNAME%_bot}" | tr 'a-z' 'A-Z' | tr -cd 'A-Z0-9')"; [ -n "$BASE" ] || BASE="BOT"
  NAME="$BASE"; i=2
  while grep -qE "^TELEGRAM_BOT_TOKEN_${NAME}=" "$EXTRA"; do NAME="${BASE}${i}"; i=$((i + 1)); done
  cp "$EXTRA" "$EXTRA.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  { echo "TELEGRAM_BOT_TOKEN_${NAME}=$TOKEN"; echo "TELEGRAM_WEBHOOK_SECRET_TOKEN_${NAME}=$SECRET"; } >> "$EXTRA"
  chmod 600 "$EXTRA"
  LABEL="Telegram ($(echo "$NAME" | tr 'A-Z' 'a-z'))"
fi
echo "Đã lưu cấu hình (có bản sao lưu)."

restart_services
echo
echo "Xong. Bước tiếp theo:"
echo "  1. Trong app nhấn Cmd+R, vào Settings → Messaging."
echo "  2. Chọn bot cần nối ở ô bên trái, bấm Connect a chat app → \"$LABEL\". App hiện một mã."
echo "  3. Người dùng mở Telegram, tìm @$USERNAME, bấm Start, nhắn mã đó."
