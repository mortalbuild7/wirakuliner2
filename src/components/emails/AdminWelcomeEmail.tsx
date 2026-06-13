import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

/** Props template email aktivasi admin — di-render server-side via @react-email/render. */
export type AdminWelcomeEmailProps = {
  adminName: string;
  activationUrl: string;
  tierLabel: string;
  scopeLabel: string;
  expiresHours?: number;
};

/**
 * Template email selamat datang admin WIRA Kuliner.
 * Desain selaras UI aplikasi: rounded-2xl, latar teduh, kontras tinggi,
 * tombol kapsul emerald-500 dengan shadow lembut.
 * Inline style wajib — klien email (Gmail, Outlook, Zoho) tidak memuat Tailwind.
 */
export function AdminWelcomeEmail({
  adminName,
  activationUrl,
  tierLabel,
  scopeLabel,
  expiresHours = 24,
}: AdminWelcomeEmailProps) {
  return (
    <Html lang="id">
      <Head />
      {/* Teks pratinjau di inbox — tidak menampilkan URL mentah */}
      <Preview>
        {`Aktivasi akun admin WIRA Kuliner — tautan berlaku ${expiresHours} jam`}
      </Preview>
      {/* Latar belakang teduh di luar kartu */}
      <Body style={bodyStyle}>
        {/* Kartu utama — rounded-2xl, bayangan lembut */}
        <Container style={cardStyle}>
          <Section style={headerBadgeStyle}>
            <Text style={badgeTextStyle}>WIRA Kuliner · Panel Admin</Text>
          </Section>

          <Heading style={headingStyle}>Selamat datang, {adminName}!</Heading>

          <Text style={paragraphStyle}>
            Akun admin Anda sebagai <strong>{tierLabel}</strong> untuk wilayah{" "}
            <strong>{scopeLabel}</strong> telah dibuat. Aktifkan akun melalui
            tombol di bawah sebelum masa berlaku tautan habis.
          </Text>

          {/* Tombol aktivasi kapsul emerald-500 */}
          <Section style={ctaWrapStyle}>
            <Button href={activationUrl} style={buttonStyle}>
              Aktifkan Akun Admin
            </Button>
          </Section>

          <Text style={mutedStyle}>
            Tautan aktivasi berlaku <strong>{expiresHours} jam</strong> dan hanya
            dapat digunakan sekali. Jangan bagikan email ini kepada siapa pun.
          </Text>

          <Hr style={hrStyle} />

          {/* Kotak peringatan MFA — rounded-2xl amber */}
          <Section style={alertBoxStyle}>
            <Text style={alertTitleStyle}>Wajib: Aktifkan MFA saat login pertama</Text>
            <Text style={alertBodyStyle}>
              Demi keamanan operasional ojol dan data sensitif, Anda wajib
              mengaktifkan autentikasi dua faktor (Google Authenticator / TOTP)
              segera setelah login pertama. Tanpa MFA, akses panel admin akan
              diblokir oleh sistem.
            </Text>
          </Section>

          <Text style={footerStyle}>
            Jika Anda tidak merasa mendaftar, abaikan email ini — tautan akan
            kedaluwarsa otomatis. Hubungi SUPER_ADMIN jika ada aktivitas mencurigakan.
          </Text>

          {/* Fallback plain link jika tombol diblokir klien email */}
          <Text style={linkFallbackStyle}>
            Tombol tidak berfungsi? Salin tautan ini ke browser:
            <br />
            <span style={monoLinkStyle}>{activationUrl}</span>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default AdminWelcomeEmail;

/** Latar belakang teduh — slate-50 */
const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f1f5f9",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: "32px 16px",
};

/** Kartu putih rounded-2xl (16px) — kontras tinggi dengan teks slate-900 */
const cardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.06)",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px 28px",
  color: "#0f172a",
};

const headerBadgeStyle: React.CSSProperties = {
  marginBottom: "8px",
};

const badgeTextStyle: React.CSSProperties = {
  color: "#059669",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  margin: 0,
  textTransform: "uppercase",
};

const headingStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: "1.3",
  margin: "0 0 16px",
};

const paragraphStyle: React.CSSProperties = {
  color: "#1e293b",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 20px",
};

const ctaWrapStyle: React.CSSProperties = {
  textAlign: "center",
  margin: "28px 0",
};

/** Tombol kapsul emerald-500 (#10b981) + shadow lembut */
const buttonStyle: React.CSSProperties = {
  backgroundColor: "#10b981",
  borderRadius: "9999px",
  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  padding: "14px 32px",
  textDecoration: "none",
};

const mutedStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 20px",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#f1f5f9",
  margin: "24px 0",
};

const alertBoxStyle: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "16px",
  padding: "16px 18px",
  marginBottom: "20px",
};

const alertTitleStyle: React.CSSProperties = {
  color: "#92400e",
  fontSize: "14px",
  fontWeight: 700,
  margin: "0 0 8px",
};

const alertBodyStyle: React.CSSProperties = {
  color: "#78350f",
  fontSize: "13px",
  lineHeight: "1.55",
  margin: 0,
};

const footerStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0 0 16px",
};

const linkFallbackStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "11px",
  lineHeight: "1.5",
  margin: 0,
  wordBreak: "break-all",
};

const monoLinkStyle: React.CSSProperties = {
  color: "#475569",
};
