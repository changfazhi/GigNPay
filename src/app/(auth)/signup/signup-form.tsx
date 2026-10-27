"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { signUp } from "@/lib/auth-client";

type FormRole = "customer" | "worker" | "judge";

const ROLE_CHOICES: { value: FormRole; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "worker", label: "Worker" },
  { value: "judge", label: "Judge" },
];

export function SignupForm({ judgeCodeRequired }: { judgeCodeRequired: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<FormRole>("customer");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [judgeCode, setJudgeCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const code = judgeCode.trim();
    const { error: signUpError } = await signUp.email(
      {
        name,
        email,
        password,
        role,
        paypalEmail: role === "worker" ? paypalEmail : undefined,
      },
      role === "judge" && code ? { headers: { "x-judge-signup-code": code } } : undefined,
    );
    if (signUpError) {
      setError(signUpError.message ?? "Sign-up failed. Please try again.");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password (at least 8 characters)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">I am a</legend>
        <RadioGroup
          value={role}
          onValueChange={(value) => setRole(value as FormRole)}
          aria-label="Role"
        >
          {ROLE_CHOICES.map((choice) => (
            <div key={choice.value} className="flex items-center gap-2">
              <RadioGroupItem value={choice.value} id={`role-${choice.value}`} />
              <Label htmlFor={`role-${choice.value}`}>{choice.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      {role === "worker" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="paypalEmail">PayPal email for payouts</Label>
          <Input
            id="paypalEmail"
            name="paypalEmail"
            type="email"
            required
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
          />
        </div>
      )}
      {role === "judge" && judgeCodeRequired && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="judgeCode">Judge sign-up code</Label>
          <Input
            id="judgeCode"
            name="judgeCode"
            type="password"
            autoComplete="off"
            required
            value={judgeCode}
            onChange={(e) => setJudgeCode(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
