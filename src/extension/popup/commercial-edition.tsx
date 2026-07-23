import type { ExtensionErrorCode } from "../state-machine.js";

export const COMMERCIAL_EDITION_URL = "https://web2ui.lynavo.io/";

const MANAGED_RECOVERY_ERROR_CODES: ReadonlySet<ExtensionErrorCode> = new Set([
  "capture-failed",
  "invalid-capture",
  "conversion-failed",
  "plan-too-large",
]);

export function canSuggestManagedRecovery(code: ExtensionErrorCode): boolean {
  return MANAGED_RECOVERY_ERROR_CODES.has(code);
}

export function CommercialEditionLink({
  className,
  label,
  ariaLabel,
}: {
  className: string;
  label: string;
  ariaLabel: string;
}) {
  return (
    <a
      className={`commercial-edition-link ${className}`}
      href={COMMERCIAL_EDITION_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
    >
      <span>{label}</span>
      <span className="commercial-link-arrow" aria-hidden="true">↗</span>
    </a>
  );
}
