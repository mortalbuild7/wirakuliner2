import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Pengirim resmi domain Zoho — identitas DMARC/SPF/DKIM terkonfigurasi di DNS.
 * Format RFC 5322: display name + angle-addr.
 */
export const WIRA_SECURITY_FROM =
  '"Wira Kuliner Keamanan" <admin@wirakuliner.web.id>';

/** Singleton transport — di-reuse antar pemanggilan sendMail (connection pooling). */
let pooledTransport: Transporter | null = null;

/**
 * Baca kredensial SMTP dari environment (server-only, tidak pernah ke klien).
 * Mendukung nama variabel baru (SMTP_*) dan legacy (ZOHO_SMTP_*).
 */
function readSmtpConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
} {
  // Host: prioritas SMTP_HOST → ZOHO_SMTP_HOST → default Zoho Mail
  const host =
    process.env.SMTP_HOST?.trim() ||
    process.env.ZOHO_SMTP_HOST?.trim() ||
    "smtp.zoho.com";

  // Port: prioritas SMTP_PORT → default 465 (SSL/TLS murni)
  const portRaw =
    process.env.SMTP_PORT?.trim() || process.env.ZOHO_SMTP_PORT?.trim() || "465";
  const port = Number(portRaw);

  // User: prioritas SMTP_USER → ZOHO_SMTP_USER
  const user =
    process.env.SMTP_USER?.trim() || process.env.ZOHO_SMTP_USER?.trim() || "";

  // Password: prioritas SMTP_PASSWORD → ZOHO_SMTP_PASS (jangan hardcode)
  const pass =
    process.env.SMTP_PASSWORD?.trim() ||
    process.env.ZOHO_SMTP_PASS?.trim() ||
    "";

  return { host, port, user, pass };
}

/**
 * Transport SMTP Zoho port 465 (SSL/TLS murni) dengan connection pooling.
 * Pooling mencegah handshake berulang saat burst email rekrutmen admin.
 */
export function getZohoSmtpPool(): Transporter {
  // Kembalikan instance yang sudah ada — hindari buka koneksi SMTP berulang
  if (pooledTransport) return pooledTransport;

  const { host, port, user, pass } = readSmtpConfig();

  // Validasi kredensial wajib — gagal cepat sebelum kirim email
  if (!user || !pass) {
    throw new Error(
      "SMTP_USER / SMTP_PASSWORD (atau ZOHO_SMTP_USER / ZOHO_SMTP_PASS) belum dikonfigurasi"
    );
  }

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("SMTP_PORT tidak valid — gunakan 465 untuk Zoho SSL/TLS");
  }

  // Buat transport dengan pool + TLS 1.2 minimum
  pooledTransport = nodemailer.createTransport({
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" },
  });

  return pooledTransport;
}
