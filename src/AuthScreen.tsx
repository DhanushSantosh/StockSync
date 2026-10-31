import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { Check, Eye, EyeOff } from "lucide-react";
import { auth } from "./firebase";
import { t } from "./i18n";
import { Alert, AuthFrame } from "./ui";

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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

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
        // The next screen sends the confirmation email, where a failure shows.
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  const chooseMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setMessage("");
  };

  return (
    <AuthFrame>
      <h1 className="sr-only">
        {mode === "login" ? t("Sign in") : t("Create account")}
      </h1>
      <div className="grid grid-cols-2 rounded-control bg-raised p-1">
        {(
          [
            ["login", "Sign in"],
            ["register", "Create account"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`min-h-10 rounded-[0.625rem] font-medium transition-colors ${mode === value ? "bg-ink text-fg" : "text-muted"}`}
            aria-pressed={mode === value}
            onClick={() => chooseMode(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 flex min-h-control w-full items-center justify-center gap-2.5 rounded-full bg-fg font-semibold text-ink transition active:scale-[0.98] disabled:opacity-60"
        disabled={busy}
        onClick={google}
      >
        <GoogleMark />
        {t("Continue with Google")}
      </button>
      <p className="hint my-3.5 flex items-center gap-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        {t("or use your email")}
      </p>
      <form onSubmit={submit} className="flex flex-1 flex-col md:flex-none">
        <div className="space-y-3">
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
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="password" className="field-label">
                {t("Password")}
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={resetPassword}
                  disabled={busy}
                >
                  {t("Forgot it?")}
                </button>
              )}
            </div>
            <span className="relative mt-1.5 block">
              <input
                id="password"
                className="field !mt-0 !pr-12"
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
            {mode === "register" && (
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-caption ${password.length >= minimumPassword ? "text-gain" : "text-muted"}`}
              >
                {password.length >= minimumPassword && <Check size={14} />}
                {t("8 characters or more")}
              </p>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <button className="btn-accent mt-4 w-full" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? t("Sign in")
              : t("Create account")}
        </button>
        {mode === "register" && (
          <p className="hint mt-3 text-center">
            {t("We'll email you a link to confirm it's you.")}
          </p>
        )}
      </form>
    </AuthFrame>
  );
}
