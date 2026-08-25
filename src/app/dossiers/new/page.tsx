import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDossier } from "@/lib/actions/dossiers";

export default async function NewDossierPage() {
  const t = await getTranslations("newDossier");
  const td = await getTranslations("dossiers");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-neutral-500 mt-1">{t("subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={createDossier} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("firstName")}>
                <Input name="firstName" required />
              </Field>
              <Field label={t("lastName")}>
                <Input name="lastName" required />
              </Field>
              <Field label={t("dateOfBirth")}>
                <Input name="dateOfBirth" type="date" />
              </Field>
              <Field label={t("gemeente")}>
                <Input name="gemeente" placeholder="Amsterdam" />
              </Field>
              <Field label={t("addressStreet")}>
                <Input name="addressStreet" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("addressPostcode")}>
                  <Input name="addressPostcode" placeholder="1234 AB" />
                </Field>
                <Field label={t("addressCity")}>
                  <Input name="addressCity" />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("regimeLabel")}>
                <select
                  name="regime"
                  className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
                  defaultValue="bewind"
                >
                  {(["bewind", "curatele", "mentorschap", "bewind_mentorschap"] as const).map(
                    (r) => (
                      <option key={r} value={r}>
                        {td(`regime.${r}`)}
                      </option>
                    )
                  )}
                </select>
              </Field>
              <Field label={t("grondslagLabel")}>
                <select
                  name="grondslag"
                  className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
                  defaultValue="geestelijk_lichamelijk"
                >
                  {(["geestelijk_lichamelijk", "schulden", "verkwisting"] as const).map(
                    (g) => (
                      <option key={g} value={g}>
                        {t(`grondslag.${g}`)}
                      </option>
                    )
                  )}
                </select>
              </Field>
              <Field label={t("rechtbank")}>
                <Input name="rechtbank" placeholder="Rechtbank Amsterdam" />
              </Field>
              <Field label={t("zaaknummer")}>
                <Input name="zaaknummer" placeholder="C/13/000000" />
              </Field>
              <Field label={t("beschikkingDate")}>
                <Input name="beschikkingDate" type="date" />
              </Field>
              <Field label={t("startDate")}>
                <Input name="startDate" type="date" />
              </Field>
            </div>

            <p className="text-xs text-neutral-500">{t("syntheticNote")}</p>

            <Button type="submit">{t("create")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
