from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER

_SEVERITY_RANK: dict[str, int] = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}


def is_escalation(previous: str, current: str) -> bool:
    return _SEVERITY_RANK.get(current, 0) > _SEVERITY_RANK.get(previous, 0)


def send_sms(to_number: str, message: str) -> None:
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]):
        return
    try:
        from twilio.rest import Client  # type: ignore[import]

        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(body=message, from_=TWILIO_FROM_NUMBER, to=to_number)
    except Exception:  # noqa: BLE001
        pass  # Best-effort — never interrupt the simulation loop


def send_email(to_address: str, subject: str, body: str) -> None:
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASS]):
        return
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_address
        msg.set_content(body)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    except Exception:  # noqa: BLE001
        pass  # Best-effort — never interrupt the simulation loop


def dispatch_alerts(
    subscribers: list[dict],
    severity: str,
    alerts: list[str],
) -> None:
    if not subscribers or not alerts:
        return

    alert_text = "; ".join(alerts)
    sms_body = f"[Ghost HVAC] {severity}: {alert_text}"
    email_subject = f"[Ghost HVAC] {severity} — HVAC Alert Detected"
    email_body = (
        "Ghost HVAC has detected an issue with your system.\n\n"
        f"Severity: {severity}\n\n"
        "Alerts:\n"
        + "\n".join(f"  • {a}" for a in alerts)
        + "\n\nLog in to your dashboard for live telemetry."
    )

    for subscriber in subscribers:
        if phone := subscriber.get("phone"):
            send_sms(phone, sms_body)
        if email := subscriber.get("email"):
            send_email(email, email_subject, email_body)
