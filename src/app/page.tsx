import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getActor } from "@/web/actor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const actor = await getActor();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Pay-When-Done</h1>
      <p className="text-lg text-muted-foreground">
        Money is held by PayPal and released only when the work is proven.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {actor ? (
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Sign up
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
