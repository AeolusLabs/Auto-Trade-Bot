"""
Alert sender: Discord, Telegram or a generic JSON webhook. Pure stdlib. Never raises, never blocks trading.

Secrets come from environment variables, not from files in the repo:
    ATB_ALERT_WEBHOOK_URL        https URL (Discord webhook or any endpoint that accepts {"content": ...} JSON)
    ATB_TELEGRAM_BOT_TOKEN       Telegram bot token
    ATB_TELEGRAM_CHAT_ID         Telegram chat id
Nothing is sent when none is set. Every message is passed through redact.py first. The same title is sent at most once per
DEDUPE_SECONDS so a flapping condition cannot spam. Idea ported from imikerussell/beebots src/alerts.ts (MIT).
"""
import json
import os
import time
import urllib.request
from urllib.parse import urlparse

from redact import redact_string

DEDUPE_SECONDS = 600
TIMEOUT_SECONDS = 5
_last = {}


def _post(url, body, headers):
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as r:   # noqa: S310 - https only, checked in targets()
        return r.status


def targets(env=None):
    """List of (url, body builder) for every channel that is configured and uses https."""
    env = os.environ if env is None else env
    out = []
    hook = env.get("ATB_ALERT_WEBHOOK_URL", "").strip()
    if hook and urlparse(hook).scheme == "https":
        out.append((hook, lambda text: json.dumps({"content": text[:1900], "text": text[:1900]}).encode()))
    tok, chat = env.get("ATB_TELEGRAM_BOT_TOKEN", "").strip(), env.get("ATB_TELEGRAM_CHAT_ID", "").strip()
    if tok and chat:
        out.append(("https://api.telegram.org/bot%s/sendMessage" % tok, lambda text: json.dumps({"chat_id": chat, "text": text[:3900]}).encode()))
    return out


def notify(title, message="", env=None, transport=None, now=None):
    """Send an alert. Returns the number of channels it was sent to (0 when none is configured or it was deduped)."""
    try:
        now = time.time() if now is None else now
        if now - _last.get(title, -1e18) < DEDUPE_SECONDS:
            return 0
        chans = targets(env)
        if not chans:
            return 0
        _last[title] = now
        text = redact_string("Auto Trade Bot: %s\n%s" % (title, message)).strip()
        sent = 0
        for url, build in chans:
            try:
                (transport or _post)(url, build(text), {"content-type": "application/json"})
                sent += 1
            except Exception:   # a dead webhook must never stop the runner
                pass
        return sent
    except Exception:
        return 0
