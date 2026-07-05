import { nadaDb } from "@/lib/db";
import { buildGroupMigrationPayload, parseGroupMigrationPayload } from "@/lib/group-migration";
import { buildInviteUrl, parseInviteInput, parseGroupInviteInput } from "@/lib/invite";
import { buildShareCardPayload, shareInviteCard } from "@/lib/share-card";
import { upsertContact, upsertGroupFromInvite } from "@/utils/helpers";
import type { IdentityRecord, ContactRecord, ChatRecord } from "@nada/db";
import type { InvitePayload } from "@nada/types";
import { IconButton, cn, Button, Avatar } from "@nada/ui";
import { Sheet, X, Copy, QrCode, Download, Upload, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { useState, useMemo, useEffect } from "react";

export function ContactSheet({
      identity,
      onClose,
      onContactAdded,
      onNotify
    }: {
          identity: IdentityRecord;
          onClose: () => void;
          onContactAdded: (contact: ContactRecord) => void;
          onNotify?: (msg: string) => void;
        }): JSX.Element {
    const [inviteUrl, setInviteUrl] = useState("");
    const [pasteValue, setPasteValue] = useState("");
    const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
    const ownInvite = useMemo<InvitePayload>(
            () => ({
              version: 1,
              pubkeyHash: identity.pubkeyHash,
              publicKey: identity.pubkey
            }),
            [identity.pubkey, identity.pubkeyHash]
          );
    useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
    }, [ownInvite]);
    const addContact = async (): Promise<void> => {
            setFeedback(null);
            const payload = parseInviteInput(pasteValue);
            if (!payload) {
              setFeedback({ kind: "error", text: "That invite link doesn't look right. Paste the full URL." });
              return;
            }
            if (payload.pubkeyHash === identity.pubkeyHash) {
              setFeedback({ kind: "error", text: "That's your own invite link." });
              return;
            }

            try {
              const contact = await upsertContact(payload);
              onNotify?.(`Added ${contact.localDisplayName}.`);
              onContactAdded(contact);
            } catch {
              setFeedback({ kind: "error", text: "Couldn't save contact. Please try again." });
            }
          };
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Add Contact</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div
        className="mt-5 rounded-2xl border border-nada-accent/30 p-1.5"
        style={{
          background:
            "linear-gradient(135deg, rgb(var(--nada-accent) / 0.18), rgb(var(--nada-surface-elevated)))"
        }}
      >
        <div className="grid place-items-center rounded-xl bg-white p-5">
          {inviteUrl ? (
            <QRCodeSVG
              bgColor="#FFFFFF"
              fgColor="#0A0B12"
              level="M"
              size={184}
              value={inviteUrl}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="nada-input h-10 min-w-0 flex-1 px-3 text-xs"
          readOnly
          value={inviteUrl}
        />
        <IconButton
          label="Copy invite"
          onClick={() => {
            if (inviteUrl) {
              void navigator.clipboard.writeText(inviteUrl);
              onNotify?.("Invite link copied.");
            }
          }}
        >
          <Copy size={16} />
        </IconButton>
      </div>

      <div className="mt-6 border-t border-nada-border/10 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <QrCode size={14} />
          Paste an invite link to add a contact
        </div>
        <textarea
          className="nada-input mt-3 min-h-24 w-full resize-none p-3 text-sm"
          onChange={(event) => {
            setPasteValue(event.target.value);
            if (feedback) setFeedback(null);
          }}
          placeholder="Paste invite link..."
          value={pasteValue}
        />
        {feedback ? (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={cn(
              "mt-2 text-xs",
              feedback.kind === "error" ? "text-red-400" : "text-emerald-400"
            )}
          >
            {feedback.text}
          </p>
        ) : null}
        <Button className="mt-3 w-full" onClick={() => void addContact()}>
          Save contact
        </Button>
      </div>
    </Sheet>
    );
}

export function GroupSheet({
      contacts,
      onClose,
      onCreate
    }: {
          contacts: ContactRecord[];
          onClose: () => void;
          onCreate: (title: string, memberPubkeyHashes: string[]) => void;
        }): JSX.Element {
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [title, setTitle] = useState("");
    const canCreate = title.trim().length > 0 && selectedMembers.length > 0;
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">New Group</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <input
        className="nada-input mt-5 h-11 w-full px-4 text-sm"
        maxLength={80}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        placeholder="Group name"
        value={title}
      />

      <div className="mt-4 space-y-1.5">
        {contacts.map((contact) => {
          const checked = selectedMembers.includes(contact.pubkeyHash);
          return (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-nada-muted"
              key={contact.pubkeyHash}
            >
              <input
                checked={checked}
                className="h-4 w-4 rounded accent-sky-500"
                onChange={(event) => {
                  setSelectedMembers((current) =>
                    event.target.checked
                      ? [...current, contact.pubkeyHash]
                      : current.filter((member) => member !== contact.pubkeyHash)
                  );
                }}
                type="checkbox"
              />
              <Avatar label={contact.localDisplayName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-nada-primary">
                  {contact.localDisplayName}
                </span>
                <span className="block truncate text-xs text-nada-secondary">
                  {contact.pubkeyHash.slice(0, 20)}...
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary leading-relaxed">
        Group sender keys are a Phase 3 scaffold. Real production groups need
        audited Signal Sender Keys or MLS before launch.
      </div>

      <Button
        className="mt-5 w-full"
        disabled={!canCreate}
        onClick={() => {
          onCreate(title.trim(), selectedMembers);
        }}
      >
        Create group
      </Button>
    </Sheet>
    );
}

export function MigrationSheet({
      chats,
      identity,
      onClose,
      onImported
    }: {
          chats: ChatRecord[];
          identity: IdentityRecord;
          onClose: () => void;
          onImported: (chats: ChatRecord[]) => void;
        }): JSX.Element {
    const [importText, setImportText] = useState("");
    const [status, setStatus] = useState("Export group migration data locally.");
    const exportGroups = (): void => {
            if (typeof window === "undefined") {
              return;
            }

            const payload = buildGroupMigrationPayload({
              groups: chats,
              identity,
              origin: window.location.origin
            });
            void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setStatus(`${payload.groups.length} groups copied for migration.`);
          };
    const importGroups = async (): Promise<void> => {
            const payload = parseGroupMigrationPayload(importText);
            if (!payload) {
              setStatus("Migration payload is invalid.");
              return;
            }

            for (const group of payload.groups) {
              if (!group.inviteUrl) {
                continue;
              }

              const invite = parseGroupInviteInput(group.inviteUrl);
              if (invite) {
                await upsertGroupFromInvite(identity, invite);
              }
            }

            const records = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
            onImported(records.filter((record) => record.type === "group"));
            setStatus(`${payload.groups.length} group entries processed locally.`);
          };
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Group Migration</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-3 text-sm text-nada-secondary">
        {status}
      </div>

      <div className="mt-4 grid gap-2.5">
        <Button onClick={exportGroups} variant="secondary">
          <Download size={16} />
          Export groups
        </Button>
        <textarea
          className="nada-input min-h-36 resize-none p-3 text-sm"
          onChange={(event) => {
            setImportText(event.target.value);
          }}
          placeholder="Paste group migration JSON"
          value={importText}
        />
        <Button onClick={() => void importGroups()} variant="secondary">
          <Upload size={16} />
          Import groups
        </Button>
      </div>
    </Sheet>
    );
}

export function ShareSheet({
      displayName,
      identity,
      onClose
    }: {
          displayName: string;
          identity: IdentityRecord;
          onClose: () => void;
        }): JSX.Element {
    const [inviteUrl, setInviteUrl] = useState("");
    const [status, setStatus] = useState("Share without uploading contacts.");
    const ownInvite = useMemo<InvitePayload>(
            () => ({
              version: 1,
              pubkeyHash: identity.pubkeyHash,
              publicKey: identity.pubkey
            }),
            [identity.pubkey, identity.pubkeyHash]
          );
    useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
    }, [ownInvite]);
    const share = async (): Promise<void> => {
            if (!inviteUrl) {
              return;
            }

            const payload = buildShareCardPayload({
              version: 1,
              pubkeyHash: identity.pubkeyHash,
              displayName,
              inviteUrl
            });
            const usedNativeShare = await shareInviteCard(payload);
            setStatus(usedNativeShare ? "Native share sheet opened." : "Invite text copied.");
          };
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Share NADA</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-nada-accent/10 via-nada-surface to-nada-muted p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nada-secondary">
          NADA
        </p>
        <h3 className="mt-3 text-lg font-semibold text-nada-primary">{displayName}</h3>
        <p className="mt-1.5 text-sm text-nada-secondary">
          Anonymous messaging. No phone number. No email.
        </p>
        <p className="mt-4 break-all text-xs text-nada-secondary/70 font-mono">
          {identity.pubkeyHash}
        </p>
      </div>

      <p className="mt-4 text-xs text-nada-secondary">{status}</p>
      <Button className="mt-4 w-full" onClick={() => void share()}>
        <Share2 size={16} />
        Share invite card
      </Button>
    </Sheet>
    );
}
