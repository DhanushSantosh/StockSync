import { useCallback, useEffect, useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import { errorText } from "./display";
import { t } from "./i18n";
import { signOutOfDevice } from "./session";
import { Alert } from "./ui";

const resendWait = 60;

export function VerifyEmail({
  user,
  onVerified,
}: {
  user: User;
  onVerified: () => void;
}) {
  const [problem, setProblem] = useState("");
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);

  const check = useCallback(async () => {
    await user.reload();
    if (!user.emailVerified) return false;
    // The rules read this from the token, so it needs a fresh one.
    await user.getIdToken(true);
    onVerified();
    return true;
  }, [user, onVerified]);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") check().catch(() => {});
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [check]);

  useEffect(() => {
    if (wait === 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-gutter">
      <section className="panel page w-full max-w-sm">
        <h1 className="text-heading font-semibold">{t("Check your email")}</h1>
        <p className="hint mt-2">
          We sent a link to {user.email}. Open it to finish setting up your
          account, then come back here.
        </p>
        <div className="mt-4 space-y-3">
          {problem && <Alert>{problem}</Alert>}
          {sent && !problem && (
            <p role="status" className="text-caption text-gain">
              Email sent.
            </p>
          )}
          <button
            className="btn-accent w-full"
            onClick={async () => {
              setProblem("");
              try {
                if (!(await check()))
                  setProblem("That email isn't confirmed yet.");
              } catch (cause) {
                setProblem(errorText(cause));
              }
            }}
          >
            {t("I've confirmed my email")}
          </button>
          <button
            className="btn-soft w-full"
            disabled={wait > 0}
            onClick={async () => {
              setProblem("");
              setSent(false);
              try {
                await sendEmailVerification(user);
                setSent(true);
                setWait(resendWait);
              } catch {
                setProblem("Too many attempts. Try again later.");
              }
            }}
          >
            {wait > 0
              ? `${t("Send the email again")} (${wait})`
              : t("Send the email again")}
          </button>
          <button
            className="btn-link w-full justify-center"
            onClick={() =>
              signOutOfDevice().catch((cause) => setProblem(errorText(cause)))
            }
          >
            {t("Sign out")}
          </button>
        </div>
      </section>
    </main>
  );
}
