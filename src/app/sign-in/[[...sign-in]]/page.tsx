import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { authMode } from "@/lib/identity";
import { LogoWordmark } from "@/components/logo";

/** Clerk-hosted sign-in. In dev mode there is nothing to sign into. */
export default function SignInPage() {
  if (authMode() === "dev") redirect("/");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-canvas">
      <LogoWordmark size={28} />
      <SignIn />
    </div>
  );
}
