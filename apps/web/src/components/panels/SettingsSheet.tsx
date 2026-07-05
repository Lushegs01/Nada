import Image from "next/image";
import { NotificationSettings, type NotificationTone, NOTIFICATION_SOUND_CHOICES, NOTIFICATION_RINGTONE_CHOICES } from "@/utils/dashboard-types";
import { notificationToneLabel, notificationRingtoneLabel } from "@/utils/helpers";
import type { IdentityRecord } from "@nada/db";
import type { IconButton, cn } from "@nada/ui";
import { X, Edit3, Ghost, Flame, Bell, EyeOff, Eye, MessageCircle, Download, Trash2, ShieldAlert, Upload, QrCode, WifiOff, CreditCard, ChevronDown, Share2, Settings, FileText } from "lucide-react";
import { Sheet } from "./Sheet";
import { useState, ReactNode } from "react";

export function SettingsSheet({
      identity,
      onOpenBilling,
      onOpenMigration,
      onOpenShare,
      onOpenGhostModal,
      onOpenMoodModal,
      ghostMode,
      mood,
      onClose,
      displayName,
      onDisplayNameChange,
      notificationSettings,
      onNotificationSettingsChange,
      onPreviewNotificationTone
    }: {
          identity: IdentityRecord;
          onOpenBilling: () => void;
          onOpenMigration: () => void;
          onOpenShare: () => void;
          onOpenGhostModal: () => void;
          onOpenMoodModal: () => void;
          ghostMode: boolean;
          mood: string;
          onClose: () => void;
          displayName: string;
          onDisplayNameChange: (name: string) => void;
          notificationSettings: NotificationSettings;
          onNotificationSettingsChange: (settings: NotificationSettings) => void;
          onPreviewNotificationTone: (tone: NotificationTone) => void;
        }): JSX.Element {
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState(displayName);
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-nada-primary" style={{ letterSpacing: "-0.3px" }}>Settings</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      {/* Appearance — Obsidian Gold theme card */}
      <div
        className="mt-5 rounded-2xl border border-nada-border/[.08] p-4"
        style={{ background: "linear-gradient(135deg, rgb(var(--nada-surface-elevated)), rgb(var(--nada-surface-3)))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}>
            <img src="/logo.webp" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-semibold text-nada-primary">Obsidian Gold</p>
            <p className="text-xs text-nada-secondary/[.60]">Dark mode · Premium theme</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-bg))", border: "1px solid rgb(var(--nada-border) / 0.1)" }} />
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-accent))" }} />
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-gold-dark))" }} />
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Profile</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3.5">
            <div className="flex flex-1 flex-col">
              <span className="text-xs text-nada-secondary/[.60]">Display Name</span>
              {isEditingName ? (
                <input
                  autoFocus
                  className="mt-1 w-full rounded-md border-b border-nada-accent/60 bg-transparent text-sm font-semibold text-nada-primary outline-none focus:border-nada-accent"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => {
                    setIsEditingName(false);
                    if (tempName.trim() && tempName !== displayName) {
                      onDisplayNameChange(tempName.trim());
                    } else if (!tempName.trim()) {
                      setTempName(displayName);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setTempName(displayName);
                      setIsEditingName(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTempName(displayName);
                    setIsEditingName(true);
                  }}
                  className="mt-0.5 cursor-text text-left text-sm font-semibold text-nada-primary hover:text-nada-accent transition-colors"
                >
                  {displayName}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label={isEditingName ? "Save display name" : "Edit display name"}
              onClick={() => {
                if (isEditingName) {
                  setIsEditingName(false);
                  if (tempName.trim() && tempName !== displayName) {
                    onDisplayNameChange(tempName.trim());
                  }
                } else {
                  setTempName(displayName);
                  setIsEditingName(true);
                }
              }}
              className="ml-2 p-2 text-nada-accent/70 hover:text-nada-accent transition-colors"
            >
              <Edit3 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Account</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Pubkey hash</span>
            <span className="max-w-[140px] truncate font-mono text-xs text-nada-secondary/[.80]">{identity.pubkeyHash.slice(0, 20)}…</span>
          </div>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Seed backup</span>
            <span className="text-xs text-nada-secondary/[.80]">{identity.seedBackupStatus}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Plan</span>
            <span className="text-xs text-nada-accent font-semibold">Free</span>
          </div>
        </div>
      </div>

      {/* Privacy section */}
      <div className="mt-5">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Privacy</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <button
            className="flex w-full items-center justify-between border-b border-nada-border/[.08] px-4 py-3.5 text-left hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenGhostModal}
          >
            <div className="flex items-center gap-3">
              <Ghost size={15} className="text-nada-accent/70" />
              <div>
                <p className="text-sm font-medium text-nada-primary">Ghost Mode</p>
                <p className="text-xs text-nada-secondary/[.50]">Hide typing &amp; online status</p>
              </div>
            </div>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
              ghostMode ? "bg-nada-accent/15 text-nada-accent" : "bg-nada-surface-elevated text-nada-secondary/[.50]"
            )}>
              {ghostMode ? "ON" : "OFF"}
            </span>
          </button>
          <button
            className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenMoodModal}
          >
            <div className="flex items-center gap-3">
              <Flame size={15} className="text-nada-accent/70" />
              <div>
                <p className="text-sm font-medium text-nada-primary">Mood Status</p>
                <p className="text-xs text-nada-secondary/[.50]">Visible to yourself</p>
              </div>
            </div>
            <span className="rounded-full bg-nada-surface-elevated px-2.5 py-0.5 text-[10px] font-medium text-nada-secondary/[.60]">
              {mood}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">
          Notifications
        </p>
        <div className="rounded-2xl border border-nada-border/[.08] p-4" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nada-accent/12 text-nada-accent">
              <Bell size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-nada-primary">Push notification settings</p>
              <p className="mt-0.5 text-xs text-nada-secondary/[.55]">
                Tune alerts without exposing message content.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-nada-secondary/[.72]">Message tone</span>
                <button
                  className="rounded-full bg-white/[.06] px-3 py-1 text-[11px] font-semibold text-nada-accent transition hover:bg-white/[.09]"
                  onClick={() => onPreviewNotificationTone("message")}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_SOUND_CHOICES.map((choice) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                      notificationSettings.notificationTone === choice
                        ? "border-nada-accent/45 bg-nada-accent/15 text-nada-primary"
                        : "border-white/10 bg-white/[.04] text-nada-secondary/[.72] hover:bg-white/[.07]"
                    )}
                    key={choice}
                    onClick={() =>
                      onNotificationSettingsChange({
                        ...notificationSettings,
                        notificationTone: choice
                      })
                    }
                    type="button"
                  >
                    {notificationToneLabel(choice)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-nada-secondary/[.72]">Call ringtone</span>
                <button
                  className="rounded-full bg-white/[.06] px-3 py-1 text-[11px] font-semibold text-nada-accent transition hover:bg-white/[.09]"
                  onClick={() => onPreviewNotificationTone("call")}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_RINGTONE_CHOICES.map((choice) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                      notificationSettings.ringtone === choice
                        ? "border-nada-accent/45 bg-nada-accent/15 text-nada-primary"
                        : "border-white/10 bg-white/[.04] text-nada-secondary/[.72] hover:bg-white/[.07]"
                    )}
                    key={choice}
                    onClick={() =>
                      onNotificationSettingsChange({
                        ...notificationSettings,
                        ringtone: choice
                      })
                    }
                    type="button"
                  >
                    {notificationRingtoneLabel(choice)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-3 text-left transition",
                  notificationSettings.vibration
                    ? "border-nada-accent/35 bg-nada-accent/12"
                    : "border-white/10 bg-white/[.04]"
                )}
                onClick={() =>
                  onNotificationSettingsChange({
                    ...notificationSettings,
                    vibration: !notificationSettings.vibration
                  })
                }
                type="button"
              >
                <span>
                  <span className="block text-xs font-semibold text-nada-primary">Vibration</span>
                  <span className="mt-0.5 block text-[11px] text-nada-secondary/[.52]">
                    {notificationSettings.vibration ? "On" : "Off"}
                  </span>
                </span>
                <span className={cn(
                  "h-5 w-9 rounded-full p-0.5 transition",
                  notificationSettings.vibration ? "bg-nada-accent" : "bg-white/12"
                )}>
                  <span className={cn(
                    "block h-4 w-4 rounded-full bg-white transition",
                    notificationSettings.vibration && "translate-x-4"
                  )} />
                </span>
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-left transition hover:bg-white/[.07]"
                onClick={() =>
                  onNotificationSettingsChange({
                    ...notificationSettings,
                    previewPrivacy:
                      notificationSettings.previewPrivacy === "private" ? "full" : "private"
                  })
                }
                type="button"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-nada-primary">
                  {notificationSettings.previewPrivacy === "private" ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                  Preview privacy
                </span>
                <span className="mt-1 block text-[11px] text-nada-secondary/[.52]">
                  {notificationSettings.previewPrivacy === "private"
                    ? "Hide sender and message text"
                    : "Show notification previews"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SettingsSheetSection
        items={[
          { icon: <Image size={15} />, label: "Theme", value: "Obsidian Gold", description: "Premium dark glass mode" },
          { icon: <Image size={15} />, label: "Chat wallpaper", value: "Per-chat", description: "Set from the chat menu" },
          { icon: <MessageCircle size={15} />, label: "Bubble style", value: "Soft glass", description: "Readable, compact, private" },
          { icon: <Flame size={15} />, label: "Accent color", value: "Purple + gold", description: "Primary actions and identity glow" }
        ]}
        title="Appearance"
      />

      <SettingsSheetSection
        items={[
          { icon: <Download size={15} />, label: "Media auto-download", value: "Manual", description: "Avoids unwanted traces" },
          { icon: <Trash2 size={15} />, label: "Clear cache", value: "Coming soon", description: "Remove local media previews" },
          { icon: <ShieldAlert size={15} />, label: "Encrypted local storage", value: "Active", description: "Messages stay on this device" }
        ]}
        title="Storage"
      />

      <SettingsSheetSection
        items={[
          { icon: <ShieldAlert size={15} />, label: "Verify contact key", value: "Manual", description: "Compare fingerprints with a contact" },
          { icon: <Upload size={15} />, label: "Export encrypted backup", value: "Coming soon", description: "Backup without plaintext export" },
          { icon: <QrCode size={15} />, label: "Recovery phrase", value: identity.seedBackupStatus, description: "Protect access to local identity" },
          { icon: <WifiOff size={15} />, label: "Active sessions", value: "This device", description: "No cloud account sessions" }
        ]}
        title="Security"
      />

      {/* Actions */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">More</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenBilling}
          >
            <CreditCard size={15} className="text-nada-accent/70" />
            Plans &amp; Billing
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenShare}
          >
            <Share2 size={15} className="text-nada-accent/70" />
            Share invite card
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenMigration}
          >
            <Download size={15} className="text-nada-accent/70" />
            Group migration
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-nada-border/[.08] p-4 text-sm text-nada-secondary/[.60]" style={{ background: "rgb(var(--nada-surface))" }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-nada-primary/80">
          <ShieldAlert size={15} className="text-nada-accent/60" />
          IP anonymity notice
        </div>
        A browser PWA cannot control network routing. Use Tor Browser, Orbot,
        VPN, or a future mixnet relay for IP-level anonymity.
      </div>

      <SettingsSheetSection
        items={[
          { icon: <Settings size={15} />, label: "App version", value: "Launch build", description: "NADA privacy-first messenger" },
          { icon: <ShieldAlert size={15} />, label: "Privacy principles", value: "Local-first", description: "No phone, no email, no identity graph" },
          { icon: <FileText size={15} />, label: "Terms/security notes", value: "Review", description: "Security docs and limitations" }
        ]}
        title="About NADA"
      />
    </Sheet>
    );
}

export function SettingsSheetSection({
      items,
      title
    }: {
          items: Array<{
            description: string;
            icon: ReactNode;
            label: string;
            value: string;
          }>;
          title: string;
        }): JSX.Element {
    return (
    <div className="mt-5">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase text-nada-text-muted">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-nada-border/[.08] bg-nada-surface/80">
        {items.map((item, index) => (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-3.5",
              index < items.length - 1 && "border-b border-nada-border/[.07]"
            )}
            key={`${title}-${item.label}`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nada-accent/12 text-nada-accent">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-nada-primary">{item.label}</span>
              <span className="block truncate text-[11.5px] text-nada-text-muted">{item.description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-nada-surface-elevated px-2.5 py-0.5 text-[10px] font-bold text-nada-secondary/[.65]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
    );
}

export function SettingsDashboardPreview({
      displayName,
      ghostMode,
      identity,
      mood,
      onOpenBilling,
      onOpenGhostModal,
      onOpenMigration,
      onOpenMoodModal,
      onOpenSettings,
      onOpenShare
    }: {
          displayName: string;
          ghostMode: boolean;
          identity: IdentityRecord;
          mood: string;
          onOpenBilling: () => void;
          onOpenGhostModal: () => void;
          onOpenMigration: () => void;
          onOpenMoodModal: () => void;
          onOpenSettings: () => void;
          onOpenShare: () => void;
        }): JSX.Element {
    return (
    <div className="nada-settings-dashboard animate-fade-in">
      <div className="nada-premium-card overflow-hidden p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl nada-logo-aura">
            <img src="/logo.webp" alt="NADA" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-nada-primary">{displayName}</p>
            <p className="truncate font-mono text-[11px] text-nada-text-muted">
              {identity.pubkeyHash.slice(0, 18)}...
            </p>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/60 text-nada-accent transition hover:border-nada-accent/35"
            onClick={onOpenSettings}
            type="button"
          >
            <Edit3 size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {["No name", "No number", "Local keys", "Encrypted"].map((label) => (
            <span className="nada-privacy-chip" key={label}>{label}</span>
          ))}
        </div>
      </div>

      <SettingsPreviewSection title="Privacy">
        <SettingsPreviewButton
          icon={<Ghost size={17} />}
          label="Ghost Mode"
          value={ghostMode ? "On" : "Off"}
          description="Hide typing and online traces."
          onClick={onOpenGhostModal}
        />
        <SettingsPreviewButton
          icon={<ShieldAlert size={17} />}
          label="Privacy Shield"
          value="Ready"
          description="Blur sensitive chat content on demand."
          onClick={onOpenSettings}
        />
        <SettingsPreviewButton
          icon={<Flame size={17} />}
          label="Mood Status"
          value={mood}
          description="Visible only inside your anonymous profile."
          onClick={onOpenMoodModal}
        />
      </SettingsPreviewSection>

      <SettingsPreviewSection title="Identity">
        <SettingsPreviewButton
          icon={<QrCode size={17} />}
          label="Share invite card"
          value="Private"
          description="Send an invite without exposing contacts."
          onClick={onOpenShare}
        />
        <SettingsPreviewButton
          icon={<Download size={17} />}
          label="Group migration"
          value="Local"
          description="Export invite-only rooms safely."
          onClick={onOpenMigration}
        />
      </SettingsPreviewSection>

      <SettingsPreviewSection title="Product">
        <SettingsPreviewButton
          icon={<CreditCard size={17} />}
          label="Plans & Billing"
          value="Free"
          description="Paid plans never touch message content."
          onClick={onOpenBilling}
        />
        <SettingsPreviewButton
          icon={<Settings size={17} />}
          label="Full settings"
          value="Open"
          description="Security, appearance, storage, and about."
          onClick={onOpenSettings}
        />
      </SettingsPreviewSection>

      <div className="rounded-2xl border border-nada-accent/15 bg-nada-accent/[0.08] p-4 text-[12.5px] leading-relaxed text-nada-secondary/78">
        <div className="mb-1 flex items-center gap-2 font-bold text-nada-accent">
          <ShieldAlert size={15} />
          IP anonymity notice
        </div>
        A browser PWA cannot control network routing. Use Tor Browser, Orbot, VPN, or a future mixnet relay for IP-level anonymity.
      </div>
    </div>
    );
}

export function SettingsPreviewSection({
      children,
      title
    }: {
          children: ReactNode;
          title: string;
        }): JSX.Element {
    return (
    <section>
      <p className="mb-2 px-1 text-[11px] font-bold uppercase text-nada-text-muted">{title}</p>
      <div className="grid gap-2">{children}</div>
    </section>
    );
}

export function SettingsPreviewButton({
      description,
      icon,
      label,
      onClick,
      value
    }: {
          description: string;
          icon: ReactNode;
          label: string;
          onClick: () => void;
          value: string;
        }): JSX.Element {
    return (
    <button
      className="nada-settings-card flex w-full items-center gap-3 text-left"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-nada-primary">{label}</span>
        <span className="block truncate text-[12px] text-nada-text-muted">{description}</span>
      </span>
      <span className="shrink-0 rounded-full bg-nada-surface/70 px-2.5 py-1 text-[10.5px] font-bold text-nada-secondary/70">
        {value}
      </span>
    </button>
    );
}
