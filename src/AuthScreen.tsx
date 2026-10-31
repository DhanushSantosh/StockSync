import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { auth } from "./firebase";
import { t } from "./i18n";
import { Alert } from "./ui";

const minimumPassword = 8;

const authMessages: Record<string, string> = {
  "auth/email-already-in-use":
    "This email already has an account. Sign in, or reset your password.",
  "auth/invalid-email": "Enter a valid email address.",
  // The same message for all of these, so nobody can test which emails exist.
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/wrong-password": "The email or password is incorrect.",
  "auth/user-not-found": "The email or password is incorrect.",
  "auth/user-disabled": "The email or password is incorrect.",
  "auth/weak-password": `Use a password of at least ${minimumPassword} characters.`,
  "auth/too-many-requests": "Too many attempts. Try again later.",
  "auth/network-request-failed":
    "Could not reach StockSync. Check your connection and try again.",
  "auth/account-exists-with-different-credential":
    "This email already uses a password. Sign in with it instead.",
  "auth/popup-blocked":
    "Your browser blocked the Google window. Allow it and try again.",
  "auth/unauthorized-domain":
    "Google sign-in isn't set up for this address yet.",
};
const quietCodes = [
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
];

function messageFor(cause: unknown) {
  const code = (cause as { code?: string }).code ?? "";
  if (quietCodes.includes(code)) return "";
  return authMessages[code] ?? "Sign-in failed. Please try again.";
}

// Popups can't return to an installed iPhone app, so that signs in by redirect.
const usesRedirect = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((cause) => setError(messageFor(cause)));
  }, []);

  async function google() {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (usesRedirect()) await signInWithRedirect(auth, provider);
      else await signInWithPopup(auth, provider);
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!auth) return;
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const sent = "If this address has an account, a reset email is on its way.";
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage(sent);
    } catch (cause) {
      // Same reply either way, so this can't reveal whether an account exists.
      if ((cause as { code?: string }).code === "auth/user-not-found")
        setMessage(sent);
      else setError(messageFor(cause));
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
      if (mode === "register") {
        if (password.length < minimumPassword)
          throw { code: "auth/weak-password" };
        const { user } = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await sendEmailVerification(user);
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-gutter">
      <section key={mode} className="panel page w-full max-w-sm">
        <p className="text-title font-semibold tracking-tight">StockSync</p>
        <h1 className="mt-6 text-heading leading-tight font-semibold">
          {mode === "login" ? t("Sign in") : t("Create account")}
        </h1>
        <button
          type="button"
          className="btn-soft mt-5 w-full"
          disabled={busy}
          onClick={google}
        >
          {t("Continue with Google")}
        </button>
        <p className="hint mt-3 text-center">{t("or use your email")}</p>
        <form onSubmit={submit} className="mt-3 space-y-4">
          {error && <Alert>{error}</Alert>}
          {message && (
            <p role="status" className="text-gain">
              {message}
            </p>
          )}
          <label className="field-label">
            {t("Email")}
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
            {t("Password")}
            <span className="relative block">
              <input
                className="field !pr-12"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? minimumPassword : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute top-0 right-0 flex size-12 items-center justify-center text-muted"
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <button className="btn-accent w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? t("Sign in")
                : t("Create account")}
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
            {mode === "login" ? t("Create account") : t("Sign in instead")}
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="btn-link"
              onClick={resetPassword}
              disabled={busy}
            >
              {t("Reset password")}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
