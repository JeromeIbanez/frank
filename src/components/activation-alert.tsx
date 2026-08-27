import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { outstandingActivationFailures } from "@/lib/activation-alerts";

/**
 * A non-dismissible office-level warning that scheduling is degraded.
 *
 * Rendered in the shell, so it follows the user rather than living on the
 * one page they were not looking at. There is deliberately no dismiss
 * control: it clears when the processes are actually activated, not when
 * someone clicks it away.
 */
export async function ActivationAlert() {
  const failures = await outstandingActivationFailures();
  if (failures.length === 0) return null;
  const t = await getTranslations("processes");

  return (
    <div
      role="alert"
      className="border-b border-hairline bg-surface-subtle px-8 py-2 print:hidden"
    >
      <p className="text-[12.5px] text-ink-900">
        <span className="font-semibold">{t("alert.title")}</span>{" "}
        {t("alert.body", {
          names: failures.map((f) => f.dossierName).join(", "),
        })}{" "}
        <Link href="/processes" className="underline">
          {t("alert.action")}
        </Link>
      </p>
    </div>
  );
}
