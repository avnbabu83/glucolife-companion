"""Email adapter: Amazon SES in production, any SMTP server as a portable alternative,
and a console backend for development and tests."""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MIMEMessage
from typing import Protocol

from app.config import get_settings

log = logging.getLogger("diabeteasy.email")


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...


class ConsoleEmail:
    """Logs messages instead of sending them and keeps them in memory (used in tests)."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)
        log.info("Email (console backend) to=%s subject=%s\n%s", message.to, message.subject, message.body)


class SESEmail:
    def __init__(self, sender: str, region: str) -> None:
        import boto3

        self.sender = sender
        self.ses = boto3.client("ses", region_name=region)

    def send(self, message: EmailMessage) -> None:
        self.ses.send_email(
            Source=self.sender,
            Destination={"ToAddresses": [message.to]},
            Message={
                "Subject": {"Data": message.subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": message.body, "Charset": "UTF-8"}},
            },
        )


class SMTPEmail:
    def __init__(self, sender: str, host: str, port: int, user: str, password: str) -> None:
        if not host:
            raise RuntimeError("SMTP_HOST must be set when EMAIL_BACKEND=smtp")
        self.sender, self.host, self.port, self.user, self.password = sender, host, port, user, password

    def send(self, message: EmailMessage) -> None:
        mime = MIMEMessage()
        mime["From"] = self.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body)
        with smtplib.SMTP(self.host, self.port, timeout=30) as smtp:
            smtp.starttls()
            if self.user:
                smtp.login(self.user, self.password)
            smtp.send_message(mime)


_sender: EmailSender | None = None


def get_email_sender() -> EmailSender:
    global _sender
    if _sender is None:
        s = get_settings()
        if s.email_backend == "ses":
            _sender = SESEmail(s.email_from, s.aws_region)
        elif s.email_backend == "smtp":
            _sender = SMTPEmail(s.email_from, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_password)
        else:
            _sender = ConsoleEmail()
    return _sender


def set_email_sender(sender: EmailSender | None) -> None:
    global _sender
    _sender = sender
