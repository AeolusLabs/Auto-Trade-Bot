"""Checks for redact.py and alerts.py (no network, no MT5):  python code/test_redact_alerts.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alerts  # noqa: E402
from redact import is_sensitive_key, mask_account, redact, redact_string  # noqa: E402


def test_prices_times_and_order_lines_are_left_alone():
    for s in ["PLACED sell limit 4172.31 sl 4176.80 lots 0.12 risk 52.10 ticket 4821907",
              "entry 1.08412 mark 1.08436 stop 1.08190", "2026-10-02 13:42:07  new candle  close 4179.50"]:
        assert redact_string(s) == s, s


def test_secrets_ips_emails_paths_and_blobs_are_masked():
    assert "hunter2" not in redact_string("password=hunter2 and Authorization: Bearer abcdef1234567890")
    assert "[ip]" in redact_string("connected to 203.0.113.45 ok")
    assert "[email]" in redact_string("sent by leigh@example.com")
    assert redact_string(r"C:\Users\Leigh\Downloads\x.csv").startswith("~")
    assert "[webhook-url]" in redact_string("posting to https://discord.com/api/webhooks/123/abcDEF")
    assert "[redacted]" in redact_string("sig " + "A" * 44)
    assert "[redacted]" in redact_string("key 123e4567-e89b-12d3-a456-426614174000")


def test_deep_redact_masks_sensitive_field_names_and_keeps_the_rest():
    out = redact({"symbol": "XAUUSDr", "investorPassword": "x", "nested": {"api_key": "y", "price": 4172.31}, "list": [{"masterPassword": "z"}]})
    assert out["symbol"] == "XAUUSDr" and out["investorPassword"] == "[redacted]"
    assert out["nested"]["api_key"] == "[redacted]" and out["nested"]["price"] == 4172.31
    assert out["list"][0]["masterPassword"] == "[redacted]"
    assert is_sensitive_key("webhook_url") and not is_sensitive_key("entry_price")


def test_account_numbers_keep_only_the_last_three_digits():
    assert mask_account(81234567) == "*****567"


def test_no_alert_is_sent_when_nothing_is_configured_or_the_url_is_not_https():
    sent = []
    assert alerts.notify("T1", "m", env={}, transport=lambda *a: sent.append(a)) == 0
    assert alerts.notify("T1b", "m", env={"ATB_ALERT_WEBHOOK_URL": "http://insecure.example/x"}, transport=lambda *a: sent.append(a)) == 0
    assert not sent


def test_alert_goes_to_each_channel_redacted_and_deduped():
    sent = []
    env = {"ATB_ALERT_WEBHOOK_URL": "https://hooks.example.com/abc", "ATB_TELEGRAM_BOT_TOKEN": "123:ABC", "ATB_TELEGRAM_CHAT_ID": "42"}
    n = alerts.notify("RISK HALT", "daily loss 5.1%, password=hunter2", env=env, transport=lambda u, b, h: sent.append((u, json.loads(b))), now=1000.0)
    assert n == 2 and len(sent) == 2
    assert all("hunter2" not in json.dumps(b) for _, b in sent)
    assert any("api.telegram.org" in u for u, _ in sent)
    assert alerts.notify("RISK HALT", "again", env=env, transport=lambda *a: sent.append(a), now=1100.0) == 0   # deduped
    assert alerts.notify("RISK HALT", "later", env=env, transport=lambda u, b, h: None, now=1000.0 + alerts.DEDUPE_SECONDS + 1) == 2


def test_a_dead_webhook_never_raises():
    def boom(*a):
        raise OSError("down")
    assert alerts.notify("T-dead", "m", env={"ATB_ALERT_WEBHOOK_URL": "https://x.example/h"}, transport=boom, now=5.0) == 0


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            n += 1
            print("ok ", name)
    print(f"{n} passed")
