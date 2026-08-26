import { getTranslations } from "next-intl/server";
import { AppSidebar } from "@/components/app-sidebar";
import { IdentityControl } from "@/components/identity-control";
import { Topbar } from "@/components/topbar";
import { currentActor } from "@/lib/identity";

/** Authenticated app shell. Sign-in renders outside this group. */
export default async function ShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const actor = await currentActor();

  // Deactivated accounts keep their session but lose the office.
  if (!actor.active) {
    const t = await getTranslations("shell");
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-[13px] text-ink-600">{t("deactivated")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-[1280px]">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar identitySlot={<IdentityControl />} />
        <main className="flex-1 px-8 py-6 max-w-[1180px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
