import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSelect } from "@/components/form-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDossier } from "@/lib/actions/dossiers";

export default async function NewDossierPage() {
  const t = await getTranslations("newDossier");
  const td = await getTranslations("dossiers");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="type-page-title text-ink-900">{t("title")}</h1>
        <p className="text-[13px] text-ink-600 mt-1">{t("subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={createDossier} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field id="firstName" label={t("firstName")}>
                <Input id="firstName" name="firstName" required />
              </Field>
              <Field id="lastName" label={t("lastName")}>
                <Input id="lastName" name="lastName" required />
              </Field>
              <Field id="dateOfBirth" label={t("dateOfBirth")}>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" />
              </Field>
              <Field id="gemeente" label={t("gemeente")}>
                <Input id="gemeente" name="gemeente" placeholder="Amsterdam" />
              </Field>
              <Field id="addressStreet" label={t("addressStreet")}>
                <Input id="addressStreet" name="addressStreet" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field id="addressPostcode" label={t("addressPostcode")}>
                  <Input id="addressPostcode" name="addressPostcode" placeholder="1234 AB" />
                </Field>
                <Field id="addressCity" label={t("addressCity")}>
                  <Input id="addressCity" name="addressCity" />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field id="regime" label={t("regimeLabel")}>
                <FormSelect
                  id="regime"
                  name="regime"
                  defaultValue="bewind"
                  options={(
                    ["bewind", "curatele", "mentorschap", "bewind_mentorschap"] as const
                  ).map((r) => ({ value: r, label: td(`regime.${r}`) }))}
                />
              </Field>
              <Field id="grondslag" label={t("grondslagLabel")}>
                <FormSelect
                  id="grondslag"
                  name="grondslag"
                  defaultValue="geestelijk_lichamelijk"
                  options={(
                    ["geestelijk_lichamelijk", "schulden", "verkwisting"] as const
                  ).map((g) => ({ value: g, label: t(`grondslag.${g}`) }))}
                />
              </Field>
              <Field id="rechtbank" label={t("rechtbank")}>
                <Input id="rechtbank" name="rechtbank" placeholder="Rechtbank Amsterdam" />
              </Field>
              <Field id="zaaknummer" label={t("zaaknummer")}>
                <Input id="zaaknummer" name="zaaknummer" placeholder="C/13/000000" />
              </Field>
              <Field id="beschikkingDate" label={t("beschikkingDate")}>
                <Input id="beschikkingDate" name="beschikkingDate" type="date" />
              </Field>
              <Field id="startDate" label={t("startDate")}>
                <Input id="startDate" name="startDate" type="date" />
              </Field>
            </div>

            <p className="text-xs text-ink-400">{t("syntheticNote")}</p>

            <Button type="submit">{t("create")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[12.5px] font-medium text-ink-600">
        {label}
      </Label>
      {children}
    </div>
  );
}
