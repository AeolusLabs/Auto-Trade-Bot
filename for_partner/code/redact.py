"""
Secret and personal-data scrubber. Pure Python (no MT5). Every line the runner prints or logs passes through here.

Ported in spirit from imikerussell/beebots src/redact.ts (MIT, (c) 2026 Mike Russell): a field is sensitive when any word of
its name is in SENSITIVE_WORDS, and free text is pattern-scrubbed. Prices such as 4172.31 and ISO times are left intact.
"""
import re

SENSITIVE_WORDS = {
    "key", "apikey", "secret", "passphrase", "password", "pass", "pwd", "token", "authorization", "auth", "signature", "sign",
    "cookie", "bearer", "uid", "ip", "ipv4", "ipv6", "host", "hostname", "email", "addr", "address", "phone", "wallet",
    "login", "investor", "master", "webhook",
}
MASK = "[redacted]"

_PATTERNS = [
    # Authorization headers and bearer tokens
    (re.compile(r"\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}", re.I), r"\1 " + MASK),
    # key=value or "key": "value" pairs with a sensitive name
    (re.compile(r"""(["']?(?:api[_-]?key|secret[_-]?key|secret|passphrase|password|passwd|pwd|token|access[_-]?token|authorization|investor[_-]?password|master[_-]?password)["']?\s*[:=]\s*["']?)[^\s"',}]+""", re.I), r"\1" + MASK),
    # webhook and bot URLs carry their secret in the path
    (re.compile(r"https://(?:discord(?:app)?\.com/api/webhooks|api\.telegram\.org/bot)[^\s\"']*", re.I), "[webhook-url]"),
    # email addresses
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
    # IPv4, not preceded or followed by a digit or dot, so prices like 1.2345 or 4172.31 stay intact
    (re.compile(r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])"), "[ip]"),
    # IPv6
    (re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b"), "[ip6]"),
    # home-directory paths that name a user
    (re.compile(r"(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s\"']+"), "~"),
    # UUID-shaped keys
    (re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"), MASK),
    # long hex and base64 blobs
    (re.compile(r"\b[0-9a-fA-F]{32,}\b"), MASK),
    (re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/])"), MASK),
]


def is_sensitive_key(name):
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(name)).lower()
    return any(w in SENSITIVE_WORDS for w in re.split(r"[\s_\-.]+", words)) or str(name).lower() in SENSITIVE_WORDS


def redact_string(s):
    out = str(s)
    for rx, rep in _PATTERNS:
        out = rx.sub(rep, out)
    return out


def mask_account(login):
    """Account numbers identify a person at the broker: keep only the last 3 digits."""
    s = str(login)
    return ("*" * max(0, len(s) - 3)) + s[-3:]


def redact(value):
    """Deep-redact any value: sensitive field names are masked wholesale, strings are pattern-scrubbed."""
    if isinstance(value, str):
        return redact_string(value)
    if isinstance(value, dict):
        return {k: (MASK if is_sensitive_key(k) else redact(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return value
