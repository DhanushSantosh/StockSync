import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "./firebase";
import { Alert } from "./ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function resetPassword() {
    if (!auth) return;
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage(
        "If this address has an account, a reset email is on its way.",
      );
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setError(
        code === "auth/invalid-email"
          ? "Enter a valid email address."
          : "Could not send the reset email. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "register")
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/email-already-in-use":
          "This email already has an account. Please sign in.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/invalid-credential": "The email or password is incorrect.",
        "auth/weak-password":
          "Use a stronger password with at least 6 characters.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed":
          "Could not reach Firebase. Check your connection and try again.",
      };
      setError(
        messages[code ?? ""] ??
          `Could not connect to your account (${code ?? "unknown error"}). Please try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <section key={mode} className="panel page w-full max-w-sm !p-6">
        <p className="text-lg font-semibold tracking-tight">StockSync</p>
        <h1 className="mt-6 text-[28px] leading-tight font-semibold">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <Alert>{error}</Alert>}
          {message && <p className="text-gain">{message}</p>}
          <label className="field-label">
            Email
            <input
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              className="field"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="btn-accent w-full !py-3" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <div className="mt-4 flex justify-between">
          <button
            className="btn-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create account" : "Sign in instead"}
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="btn-link"
              onClick={resetPassword}
              disabled={busy}
            >
              Reset password
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
