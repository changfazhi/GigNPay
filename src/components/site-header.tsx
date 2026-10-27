import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { getActor } from "@/web/actor";

export async function SiteHeader() {
  const actor = await getActor();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-base font-semibold">
          Pay-When-Done
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {actor ? (
            <>
              <span className="max-w-[12rem] truncate text-sm text-muted-foreground">
                {actor.email}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                {actor.role}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Log in
              </Link>
              <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                Sign up
              </Link>
            </>
          )}
          {/* Right-hand slot reserved for the demo role switcher (plan 01-13). */}
          <div id="header-demo-slot" className="flex items-center" />
        </div>
      </div>
    </header>
  );
}
