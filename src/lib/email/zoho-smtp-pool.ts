import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/** Pengirim resmi domain Zoho — identitas DMARC/SPF/DKIM terkonfigurasi di DNS. */
export const WIRA_SECURITY_FROM =
  '"Wira Kuliner Keamanan" <admin@wirakuliner.web.id>';

let pooledTransport: Transporter | null = null;

/**
 * Transport SMTP Zoho port 465 (SSL/TLS murni) dengan connection pooling.
 * Pooling mencegah handshake berulang saat burst email rekrutmen — mitigasi slowloris SMTP.
 */
export function getZohoSmtpPool(): Transporter {
  if (pooledTransport) return pooledTransport;

  const host = process.env.ZOHO_SMTP_HOST?.trim() || "smtppro.zoho.com";
  const user = process.env.ZOHO_SMTP_USER?.trim();
  const pass = process.env.ZOHO_SMTP_PASS?.trim();

  if (!user || !pass) {
    throw new Error(
      "ZOHO_SMTP_USER / ZOHO_SMTP_PASS belum dikonfigurasi — kredensial tidak boleh di-hardcode"
    );
  }

  pooledTransport = nodemailer.createTransport({
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    host,
    port: 465,
    secure: true,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" },
  });

  return pooledTransport;
}
