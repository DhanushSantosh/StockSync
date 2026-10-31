import { useState, type FormEvent } from "react";
import { errorText } from "./display";
import { t } from "./i18n";
import { deleteAccount, needsPassword } from "./session";
import { Alert } from "./ui";

export function DeleteAccount({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const usesPassword = needsPassword();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      await deleteAccount(password);
    } catch (cause) {
      setProblem(errorText(cause));
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        className="btn-link w-full justify-center !text-loss"
        onClick={() => setOpen(true)}
      >
        {t("Delete account")}
      </button>
    );

  return (
    <form
      onSubmit={submit}
      className="page space-y-3 border-t border-line pt-4"
    >
      <h3 className="heading">{t("Delete account")}</h3>
      <p className="hint">
        {isOwner
          ? "This permanently deletes your login, products, stock history, customers and credit records. Your staff lose access. It can't be undone."
          : "This permanently deletes your login and removes you from this shop. The owner keeps their records, including changes you made. It can't be undone."}
      </p>
      {problem && <Alert>{problem}</Alert>}
      <label className="field-label">
        Type DELETE to confirm
        <input
          className="field"
          autoComplete="off"
          autoCapitalize="characters"
          value={word}
          onChange={(event) => setWord(event.target.value)}
        />
      </label>
      {usesPassword && (
        <label className="field-label">
          Your password
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      <button
        className="btn-accent w-full !bg-loss"
        disabled={busy || word !== "DELETE" || (usesPassword && !password)}
      >
        {busy ? "Deleting…" : t("Delete my account")}
      </button>
      <button
        type="button"
        className="btn-soft w-full"
        disabled={busy}
        onClick={() => setOpen(false)}
      >
        {t("Cancel")}
      </button>
    </form>
  );
}
