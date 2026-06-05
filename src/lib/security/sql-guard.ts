/** Pola umum SQL injection / command injection pada query string & body. */
const SQL_INJECTION_PATTERNS = [
  /(\b)(union)(\s+)(all\s+)?select\b/i,
  /\bselect\b.+\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\b.+\bset\b/i,
  /\bdelete\s+from\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\balter\s+table\b/i,
  /\bexec(\s|\+|\()/i,
  /\bexecute\s*\(/i,
  /;\s*--/,
  /'\s*or\s+'?1'?\s*=\s*'?1/i,
  /"\s*or\s+"?1"?\s*=\s*"?1/i,
  /\bor\s+1\s*=\s*1\b/i,
  /\bwaitfor\s+delay\b/i,
  /\bbenchmark\s*\(/i,
  /\bsleep\s*\(/i,
  /\binformation_schema\b/i,
  /\bpg_catalog\b/i,
  /@@version/i,
  /load_file\s*\(/i,
  /into\s+outfile\b/i,
  /xp_cmdshell/i,
];

const MAX_SCAN_LEN = 2048;

function normalizeForScan(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    decoded = value;
  }
  return decoded.slice(0, MAX_SCAN_LEN);
}

/** Deteksi pola SQL injection pada string bebas (URL, query param, dll). */
export function containsSqlInjection(value: string): boolean {
  const sample = normalizeForScan(value);
  if (!sample) return false;
  return SQL_INJECTION_PATTERNS.some((re) => re.test(sample));
}

/** Periksa seluruh nilai query string request. */
export function scanSearchParams(params: URLSearchParams): string | null {
  for (const [key, val] of params.entries()) {
    if (containsSqlInjection(key) || containsSqlInjection(val)) {
      return key;
    }
  }
  return null;
}

/** Periksa path — cegah encoded payload di URL. */
export function scanPathname(pathname: string): boolean {
  return containsSqlInjection(pathname);
}
