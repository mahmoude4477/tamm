"use client";
import { Input } from "@/components/ui/input";

import { AuthHeader } from "@/components/auth-header";
import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/components/locale-provider";
export default function Login() {
  const en = useMessages();

  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const input = {
        email: String(f.get("email")),
        password: String(f.get("password")),
      };
      const result = signup
        ? await authClient.signUp.email({
            ...input,
            name: String(f.get("name")),
          })
        : await authClient.signIn.email(input);
      if (result.error)
        setError(signup ? en.auth.signupFailed : en.auth.failed);
      else if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      )
        window.location.assign("/verify-2fa");
      else if (
        signup &&
        result.data &&
        "token" in result.data &&
        !result.data.token
      )
        setError(en.account.verificationSent);
      else window.location.assign("/workspace");
    } catch {
      setError(en.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <AuthHeader />
      <div className="auth-grid">
        <section className="auth-intro">
          <span className="eyebrow">{en.brand.tagline}</span>
          <h1>{en.auth.title}</h1>
          <p>{en.auth.subtitle}</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-heading">
              <span className="brand-mark">
                <Check size={18} />
              </span>
              <strong>{en.nav.myTasks}</strong>
              <span>{en.demo.tasks.length}</span>
            </div>
            {en.demo.tasks.slice(0, 3).map((task, index) => (
              <div className="auth-preview-row" key={task}>
                <span className={`preview-status preview-status-${index}`}>
                  <Check size={12} />
                </span>
                <span>{task}</span>
                <small>{en.demo.statuses[index + 1]}</small>
              </div>
            ))}
          </div>
        </section>
        <form className="auth-form" onSubmit={submit}>
          <h2>{signup ? en.auth.signUp : en.auth.signIn}</h2>
          {signup && (
            <label>
              {en.auth.name}
              <Input name="name" autoComplete="name" required maxLength={100} />
            </label>
          )}
          <label>
            {en.auth.email}
            <Input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            {en.auth.password}
            <Input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 12 : 1}
              required
            />
          </label>
          {signup && <small>{en.auth.passwordHint}</small>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy
              ? en.common.loading
              : signup
                ? en.auth.signUp
                : en.auth.signIn}
            <ArrowRight size={16} />
          </Button>
          <Link href="/forgot-password">{en.account.forgot}</Link>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await authClient.signIn.passkey();
                if (r.error) setError(en.auth.failed);
                else window.location.assign("/workspace");
              } catch {
                setError(en.common.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            {en.account.signInPasskey}
          </Button>
          <p>
            {signup ? en.auth.haveAccount : en.auth.noAccount}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => setSignup(!signup)}
            >
              {signup ? en.auth.signIn : en.auth.signUp}
            </button>
          </p>
          <Link className="text-link" href="/">
            {en.auth.demo}
          </Link>
        </form>
      </div>
    </main>
  );
}
