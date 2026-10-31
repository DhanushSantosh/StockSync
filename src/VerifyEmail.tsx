import { useCallback, useEffect, useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import { errorText } from "./display";
import { t } from "./i18n";
import { signOutOfDevice } from "./session";
import { Check } from "lucide-react";
import { Alert, AuthFrame } from "./ui";

const resendWait = 60;
const autoSendAfter = 600;
const checkEvery = 4000;
const lastSentKey = "stocksync-verification-sent";

function secondsSinceSent(email: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(lastSentKey) ?? "{}");
    return saved.email === email ? (Date.now() - saved.at) / 1000 : Infinity;
  } catch {
    return Infinity;
  }
}

function rememberSent(email: string) {
  try {
    localStorage.setItem(
      lastSentKey,
      JSON.stringify({ email, at: Date.now() }),
    );
  } catch {
    // Without storage the next visit just sends another email.
  }
}

function sendProblem(cause: unknown) {
  const code = (cause as { code?: string }).code;
  if (code === "auth/too-many-requests")
    return "Too many emails sent. Wait a few minutes, then send it again.";
  if (code === "auth/network-request-failed")
    return "Could not reach StockSync. Check your connection and try again.";
  return errorText(cause);
}

export function VerifyEmail({
  user,
  onVerified,
}: {
  user: User;
  onVerified: () => void;
}) {
  const [problem, setProblem] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);
  const email = user.email ?? "";

  const check = useCallback(async () => {
    await user.reload();
    if (!user.emailVerified) return false;
    // The rules read this from the token, so it needs a fresh one.
    await user.getIdToken(true);
    onVerified();
    return true;
  }, [user, onVerified]);

  const send = useCallback(async () => {
    setProblem("");
    setSent(false);
    setSending(true);
    try {
      await sendEmailVerification(user);
      rememberSent(email);
      setSent(true);
      setWait(resendWait);
    } catch (cause) {
      setProblem(sendProblem(cause));
    } finally {
      setSending(false);
    }
  }, [user, email]);

  // Covers new accounts and anyone returning to one they never confirmed.
  useEffect(() => {
    const since = secondsSinceSent(email);
    if (since >= autoSendAfter) {
      const timer = setTimeout(send, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setSent(true);
      setWait(Math.max(Math.ceil(resendWait - since), 0));
    }, 0);
    return () => clearTimeout(timer);
  }, [email, send]);

  // The link may be opened on another device, so this can't wait for a return.
  useEffect(() => {
    const look = () => {
      if (document.visibilityState === "visible") check().catch(() => {});
    };
    const timer = setInterval(look, checkEvery);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [check]);

  useEffect(() => {
    if (wait === 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const steps = [
    [sent, t("Link sent"), sent ? "" : t("Sending now")],
    [
      false,
      t("Open the link"),
      t(
        "Waiting. This page continues by itself, even if you open it on another device.",
      ),
    ],
    [false, t("Set up your shop"), t("Takes about two minutes")],
  ] as const;

  return (
    <AuthFrame>
      <h1 className="text-heading font-semibold">{t("Check your email")}</h1>
      <p className="mt-1 text-title font-semibold [overflow-wrap:anywhere]">
        {email}
      </p>
      <ol className="mt-5">
        {steps.map(([done, title, detail], index) => {
          const waiting = index === (sent ? 1 : 0);
          return (
            <li
              key={title}
              className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pb-4.5 last:pb-0"
            >
              {index < steps.length - 1 && (
                <span
                  className={`absolute top-7 bottom-0 left-[0.8125rem] w-0.5 ${done ? "bg-gain" : "bg-line"}`}
                />
              )}
              <span
                className={`flex size-7 items-center justify-center rounded-full border-2 ${done ? "border-gain bg-gain text-ink" : waiting ? "border-accent" : "border-outline"}`}
              >
                {done && <Check size={15} strokeWidth={3} />}
                {waiting && (
                  <span className="size-2.5 animate-pulse rounded-full bg-accent" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{title}</span>
                {detail && <span className="hint block">{detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="hint mt-5 rounded-control bg-panel px-3.5 py-3">
        <span className="font-semibold text-fg">{t("Not there?")}</span>{" "}
        {t("Check Spam. It comes from")}{" "}
        <span className="text-fg [overflow-wrap:anywhere]">
          noreply@stocksync-b43cd.firebaseapp.com
        </span>
      </p>
      <div className="min-h-4 flex-1" />
      {problem && <Alert>{problem}</Alert>}
      <p role="status" className="sr-only">
        {sent ? t("Email sent.") : ""}
      </p>
      <button
        className="btn-soft mt-3 w-full"
        disabled={wait > 0 || sending}
        onClick={send}
      >
        {wait > 0
          ? `${t("Send the email again")} (${wait})`
          : t("Send the email again")}
      </button>
      <p className="hint mt-3 text-center">
        {t("Wrong email?")}{" "}
        <button
          className="btn-link"
          onClick={() =>
            signOutOfDevice().catch((cause) => setProblem(errorText(cause)))
          }
        >
          {t("Use a different account")}
        </button>
      </p>
    </AuthFrame>
  );
}
