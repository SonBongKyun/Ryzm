"""
Ryzm Terminal — Email Utility
Sends verification and password reset emails via SMTP.
Falls back to logging when SMTP is not configured (dev mode).
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, BASE_URL
from app.core.logger import logger


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


def _send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP. Returns True on success."""
    if not _smtp_configured():
        logger.warning(f"[Email] SMTP not configured. Would send to={to}, subject={subject}")
        logger.info(f"[Email] Body preview: {html_body[:300]}...")
        return True  # Treat as success in dev

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to, msg.as_string())

        logger.info(f"[Email] Sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"[Email] Send failed to {to}: {e}")
        return False


def send_verification_email(to: str, token: str) -> bool:
    """Send email verification link."""
    verify_url = f"{BASE_URL}/verify-email?token={token}"
    html = f"""
    <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:30px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
            <span style="color:#06b6d4;font-size:24px;font-weight:bold;">⚡ Ryzm Terminal</span>
        </div>
        <h2 style="color:#06b6d4;font-size:16px;">Verify Your Email</h2>
        <p style="font-size:13px;line-height:1.6;">
            Welcome to Ryzm Terminal! Click the button below to verify your email address.
        </p>
        <div style="text-align:center;margin:24px 0;">
            <a href="{verify_url}" style="background:#06b6d4;color:#0a0a0f;padding:12px 32px;
               text-decoration:none;font-weight:bold;border-radius:4px;font-size:14px;">
                VERIFY EMAIL
            </a>
        </div>
        <p style="font-size:11px;color:#666;">
            Or copy this link: {verify_url}
        </p>
        <hr style="border-color:#333;margin:20px 0;">
        <p style="font-size:10px;color:#555;">
            If you didn't create an account, ignore this email.
        </p>
    </div>
    """
    return _send_email(to, "Verify your Ryzm Terminal account", html)


def send_password_reset_email(to: str, token: str) -> bool:
    """Send password reset link."""
    reset_url = f"{BASE_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:30px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
            <span style="color:#06b6d4;font-size:24px;font-weight:bold;">⚡ Ryzm Terminal</span>
        </div>
        <h2 style="color:#06b6d4;font-size:16px;">Password Reset</h2>
        <p style="font-size:13px;line-height:1.6;">
            You requested a password reset. Click the button below to set a new password.
            This link expires in 1 hour.
        </p>
        <div style="text-align:center;margin:24px 0;">
            <a href="{reset_url}" style="background:#f43f5e;color:#fff;padding:12px 32px;
               text-decoration:none;font-weight:bold;border-radius:4px;font-size:14px;">
                RESET PASSWORD
            </a>
        </div>
        <p style="font-size:11px;color:#666;">
            Or copy this link: {reset_url}
        </p>
        <hr style="border-color:#333;margin:20px 0;">
        <p style="font-size:10px;color:#555;">
            If you didn't request this, ignore this email. Your password will remain unchanged.
        </p>
    </div>
    """
    return _send_email(to, "Reset your Ryzm Terminal password", html)


def send_price_alert_email(to: str, symbol: str, direction: str, target_price: float, current_price: float) -> bool:
    """Send price alert trigger notification to user."""
    arrow = "⬆️" if direction == "above" else "⬇️"
    html = f"""
    <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:30px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
            <span style="color:#C9A96E;font-size:24px;font-weight:bold;">⚡ Ryzm Terminal</span>
        </div>
        <h2 style="color:#C9A96E;font-size:16px;">{arrow} Price Alert Triggered</h2>
        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:16px 0;">
            <div style="font-size:14px;font-weight:bold;color:#fff;">{symbol}</div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">
                Target: <strong style="color:#C9A96E;">${target_price:,.2f}</strong> ({direction})<br>
                Current: <strong style="color:#fff;">${current_price:,.2f}</strong>
            </div>
        </div>
        <div style="text-align:center;margin:20px 0;">
            <a href="{BASE_URL}/app" style="background:#C9A96E;color:#0a0a0f;padding:10px 24px;
               text-decoration:none;font-weight:bold;border-radius:4px;font-size:13px;">
                Open Dashboard
            </a>
        </div>
        <hr style="border-color:#333;margin:20px 0;">
        <p style="font-size:10px;color:#555;">
            You're receiving this because you set a price alert on Ryzm Terminal.
        </p>
    </div>
    """
    return _send_email(to, f"🔔 {symbol} hit ${target_price:,.2f} ({direction})", html)


def send_trial_welcome_email(to: str, display_name: str = "") -> bool:
    """Send welcome email when user starts Pro trial."""
    name = display_name or "Trader"
    html = f"""
    <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:30px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
            <span style="color:#C9A96E;font-size:24px;font-weight:bold;">⚡ Ryzm Terminal Pro</span>
        </div>
        <h2 style="color:#C9A96E;font-size:16px;">Welcome to your 7-day Pro Trial, {name}!</h2>
        <p style="font-size:13px;line-height:1.6;">
            You now have full access to all Pro features:
        </p>
        <ul style="font-size:12px;line-height:2;color:#ccc;">
            <li>Unlimited AI Council & Trade Validator</li>
            <li>All 20+ Professional Panels</li>
            <li>100 Price Alerts with Email Notifications</li>
            <li>90-day Council History</li>
            <li>500 Journal Entries</li>
        </ul>
        <div style="text-align:center;margin:20px 0;">
            <a href="{BASE_URL}/app" style="background:#C9A96E;color:#0a0a0f;padding:12px 32px;
               text-decoration:none;font-weight:bold;border-radius:4px;font-size:14px;">
                Start Trading
            </a>
        </div>
        <p style="font-size:11px;color:#666;">
            Your trial ends in 7 days. Subscribe anytime to keep Pro access.
        </p>
    </div>
    """
    return _send_email(to, "🎉 Your Ryzm Pro Trial has started!", html)
