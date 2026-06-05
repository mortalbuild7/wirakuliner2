import { POWERED_BY, POWERED_BY_INSPECT, POWERED_BY_URL } from "@/lib/brand";

/**
 * Kredit di root DOM — terlihat saat inspect element / view source
 */
export function BrandRootCredit() {
  return (
    <>
      {/* Powered by DAFFACELL — WIRA Kuliner platform */}
      <div
        id="daffacell-platform-credit"
        hidden
        data-powered-by={POWERED_BY}
        data-vendor={POWERED_BY_URL}
        data-copyright="DAFFACELL"
        aria-hidden
      >
        {POWERED_BY_INSPECT}
      </div>
    </>
  );
}
