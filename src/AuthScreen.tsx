import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  ArrowRight,
  Package,
  Boxes,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { auth } from "./firebase";
import { Banner, Brand } from "./ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError("");
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
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Brand />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-14">
          <div className="mb-9">
            <span className="eyebrow">WELCOME TO STOCKSYNC</span>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-3 text-slate-500">
              {mode === "login"
                ? "Sign in to keep your inventory moving."
                : "Your inventory, organized and available anywhere."}
            </p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {error && <Banner>{error}</Banner>}
            <label className="field-label">
              Email address
              <input
                className="field mt-2"
                type="email"
                autoComplete="email"
                placeholder="you@yourshop.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field-label">
              Password
              <input
                className="field mt-2"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={6}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button
              className="primary-button w-full justify-center py-3.5"
              disabled={busy}
            >
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="mt-7 text-center text-sm text-slate-500">
            {mode === "login"
              ? "New to StockSync?"
              : "Already have an account?"}{" "}
            <button
              className="font-semibold text-indigo-600 hover:text-indigo-700"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <p className="text-xs text-slate-400">
          © 2026 StockSync. Inventory, in sync.
        </p>
      </div>
      <div className="hidden bg-indigo-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex justify-end">
          <span className="rounded-full border border-white/25 px-4 py-2 text-xs font-medium">
            Built for the way you work
          </span>
        </div>
        <div className="mx-auto max-w-lg">
          <div className="mb-8 inline-flex size-16 items-center justify-center rounded-2xl bg-white/15">
            <Package size={34} />
          </div>
          <h2 className="text-5xl font-bold leading-tight tracking-tight">
            A clearer view of every product on your shelf.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-indigo-100">
            Track stock, catch shortages early, and see every change update
            instantly across your devices.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-3">
            <div className="promo-tile">
              <Boxes />
              <span>
                All products
                <br />
                in one place
              </span>
            </div>
            <div className="promo-tile">
              <AlertCircle />
              <span>
                Low stock
                <br />
                at a glance
              </span>
            </div>
            <div className="promo-tile">
              <ShieldCheck />
              <span>
                Private and
                <br />
                secure
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-indigo-200">
          Simple stock management for small businesses.
        </p>
      </div>
    </div>
  );
}
