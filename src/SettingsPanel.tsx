import { useEffect, useState, type FormEvent } from "react";
import { DeleteAccount } from "./DeleteAccount";
import { errorText } from "./display";
import { signOutOfDevice } from "./session";
import { auth, db } from "./firebase";
import {
  createInvite,
  joinShop,
  leaveShop,
  removeMember,
  shopId,
  subscribeToMembers,
  type Member,
} from "./inventory";
import { Alert } from "./ui";
import { currentLanguage, setLanguage, t, type Language } from "./i18n";

export function SettingsPanel({
  onDone,
  onNotice,
}: {
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const user = auth?.currentUser;
  const shop = shopId();
  const isOwner = shop === user?.uid;
  const [members, setMembers] = useState<Member[]>([]);
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!db || !isOwner) return;
    return subscribeToMembers(db, shop, setMembers);
  }, [isOwner, shop]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem("");
    try {
      await work();
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      if (!db || !user) return;
      await joinShop(db, user.uid, user.email ?? "", code);
      onNotice("You've joined the shop.");
      onDone();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pr-10 text-heading font-semibold">{t("Settings")}</h2>
        <p className="hint mt-0.5 truncate">{user?.email}</p>
      </div>
      {problem && <Alert>{problem}</Alert>}

      {isOwner ? (
        <>
          <section>
            <h3 className="heading">{t("Staff")}</h3>
            <p className="hint mt-0.5">
              Staff record sales, deliveries and counts. Only you can change
              products and prices.
            </p>
            {members.map((member) => (
              <div
                key={member.id}
                className="mt-2 flex items-center justify-between gap-3"
              >
                <span className="truncate">{member.email}</span>
                <button
                  className="btn-link"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (db) await removeMember(db, shop, member.id);
                      setInvite("");
                      onNotice("Staff member removed.");
                    })
                  }
                >
                  {t("Remove")}
                </button>
              </div>
            ))}
            {invite ? (
              <div className="mt-3">
                <p className="tabular text-heading font-semibold tracking-wider">
                  {invite}
                </p>
                <p className="hint mt-0.5">
                  Share this code. They sign in, open Settings and enter it.
                  Making a new code cancels this one.
                </p>
              </div>
            ) : null}
            <button
              className="btn-soft mt-3 w-full"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (db && user) setInvite(await createInvite(db, user.uid));
                })
              }
            >
              {invite ? t("Make a new code") : t("Invite staff")}
            </button>
          </section>
          <form onSubmit={join}>
            <label className="field-label">
              Have a code from another shop?
              <input
                className="field uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              className="btn-soft mt-2 w-full"
              disabled={busy || !code.trim()}
            >
              {t("Join shop")}
            </button>
          </form>
        </>
      ) : (
        <section>
          <h3 className="heading">{t("Staff account")}</h3>
          <p className="hint mt-0.5">You're working in another owner's shop.</p>
          <button
            className="btn-soft mt-3 w-full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (db && user) await leaveShop(db, user.uid, shop);
                onNotice("You've left the shop.");
                onDone();
              })
            }
          >
            {t("Leave this shop")}
          </button>
        </section>
      )}

      <label className="field-label">
        {t("Language")}
        <select
          className="field"
          value={currentLanguage()}
          onChange={(event) => setLanguage(event.target.value as Language)}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>

      <button className="btn-soft w-full" onClick={() => run(signOutOfDevice)}>
        {t("Sign out")}
      </button>
      <DeleteAccount isOwner={isOwner} />
    </div>
  );
}
