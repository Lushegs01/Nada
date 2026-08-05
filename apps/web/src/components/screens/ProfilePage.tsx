"use client";
/* eslint-disable */
// Full-page ghost profile — the central hub for a user's identity and
// activity. Self-fetching: give it a target (hash + fallback name) and it
// loads the profile card, timelines and social graph from the relay, falling
// back to the locally cached feed when no relay is configured.
import {
  whispersRelayConfigured,
  queryWhisperProfile,
  queryWhisperFeed,
  FEED_UNCHANGED,
  queryAuthorReflections,
  queryLikedEchoes,
  queryFollowList,
  setFollowRemote,
  updateWhisperProfileRemote
} from "@/lib/whispers";
import type {
  WhisperAuthorReflection,
  WhisperDmPrivacy,
  WhisperEcho,
  WhisperFollowEntry,
  WhisperProfile
} from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import type { IdentityRecord } from "@nada/db";
import { cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Ghost,
  UserPlus,
  UserCheck,
  Share2,
  Pencil,
  Check,
  CalendarDays,
  Building2,
  Radio,
  MessageCircle,
  Heart,
  Loader2,
  EyeOff,
  Waves,
  MessageSquareText,
  ShieldBan,
  Flag,
  Camera,
  CornerDownRight,
  Image as ImageIcon,
  Lock,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authorGradient } from "./WhispersFeed";

export type WhisperProfileDraft = {
  avatar: string;
  bio: string;
  displayName: string;
  dmPrivacy: WhisperDmPrivacy;
  institution: string;
  showActivity: boolean;
  showLikes: boolean;
};

type ProfileTab = "echoes" | "reflects" | "likes" | "media";
type FollowPanel = "followers" | "following" | null;

const PROFILE_PAGE_SIZE = 20;

function joinedLabel(joinedAt: number | null): string {
  if (!joinedAt) return "New ghost";
  return `Joined ${new Date(joinedAt).toLocaleDateString([], {
    month: "long",
    year: "numeric"
  })}`;
}

function formatStat(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

// Downscale any picked image into a small square data URL that fits the
// relay's avatar budget. Center-cropped, JPEG-compressed.
async function fileToAvatarDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = objectUrl;
    });
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return dataUrl.length <= 120_000 ? dataUrl : canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProfileAvatar({
  avatar,
  name,
  size = 96
}: {
  avatar: string;
  name: string;
  size?: number;
}): JSX.Element {
  const radius = Math.round(size * 0.31);
  if (avatar) {
    return (
      <img
        alt={`${name}'s avatar`}
        className="object-cover"
        src={avatar}
        style={{ borderRadius: radius, height: size, width: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid place-items-center font-extrabold text-white shadow-inner"
      style={{
        backgroundImage: authorGradient(name),
        borderRadius: radius,
        fontSize: size * 0.36,
        height: size,
        width: size
      }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function StatBlock({
  label,
  value,
  onClick
}: {
  label: string;
  value: number;
  onClick?: (() => void) | undefined;
}): JSX.Element {
  const inner = (
    <>
      <span className="text-[16px] font-extrabold tabular-nums text-nada-primary">
        {formatStat(value)}
      </span>
      <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-nada-secondary/50">
        {label}
      </span>
    </>
  );
  if (!onClick) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-nada-surface/60 px-1.5 py-2.5">
        {inner}
      </div>
    );
  }
  return (
    <button
      className="flex flex-col items-center rounded-2xl bg-nada-surface/60 px-1.5 py-2.5 transition hover:bg-nada-accent/10"
      onClick={onClick}
      type="button"
    >
      {inner}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body
}: {
  icon: typeof Ghost;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-dashed border-nada-border/10 px-4 py-8 text-center">
      <Icon className="mx-auto mb-2 h-6 w-6 text-nada-secondary/35" />
      <p className="text-[13px] font-bold text-nada-primary">{title}</p>
      <p className="mt-1 text-[12px] text-nada-text-muted">{body}</p>
    </div>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="h-20 rounded-2xl nada-skeleton" key={index} />
      ))}
    </div>
  );
}

function LoadMoreButton({
  loading,
  onClick
}: {
  loading: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-nada-border/10 px-3 py-2.5 text-[12px] font-bold text-nada-accent transition hover:bg-nada-accent/10 disabled:opacity-50"
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      Show more
    </button>
  );
}

function EchoRow({
  echo,
  onOpen
}: {
  echo: WhisperEcho;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      className="w-full rounded-2xl border border-nada-border/10 bg-nada-surface/60 px-3.5 py-3 text-left transition hover:border-nada-accent/25 hover:bg-nada-surface"
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-center gap-2 text-[11px] text-nada-secondary/50">
        <span className="font-bold text-nada-primary/80">{echo.authorName}</span>
        <span>· {formatRelativeTime(echo.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-primary/90 line-clamp-3">
        {echo.body || (echo.rippleOf ? `↻ ${echo.rippleOf.body}` : "")}
      </p>
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-nada-secondary/50">
        <span className="inline-flex items-center gap-1">
          <Radio size={10} /> {echo.echoCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={10} /> {echo.reflectionCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart size={10} /> {echo.rippleCount}
        </span>
      </div>
    </button>
  );
}

export function ProfilePage({
  identity,
  isBlocked,
  localEchoes,
  onBack,
  onMessage,
  onOpenEcho,
  onOpenProfile,
  onProfileSaved,
  onReport,
  onToast,
  onToggleBlock,
  target,
  viewerName
}: {
  identity: IdentityRecord;
  isBlocked: boolean;
  /** Locally cached feed — powers a best-effort profile with no relay. */
  localEchoes: WhisperEcho[];
  onBack?: (() => void) | undefined;
  onMessage: (profile: WhisperProfile) => void;
  onOpenEcho: (echoId: string, echo?: WhisperEcho) => void;
  onOpenProfile: (hash: string, name: string) => void;
  onProfileSaved?: ((draft: WhisperProfileDraft) => void) | undefined;
  onReport: (profile: WhisperProfile) => void;
  onToast: (message: string) => void;
  onToggleBlock: (hash: string, block: boolean) => void;
  target: { hash: string; name: string };
  viewerName: string;
}): JSX.Element {
  const isSelf = target.hash === identity.pubkeyHash;
  const relayConfigured = whispersRelayConfigured();

  const [profile, setProfile] = useState<WhisperProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WhisperProfileDraft | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("echoes");
  const [followPanel, setFollowPanel] = useState<FollowPanel>(null);
  const [followEntries, setFollowEntries] = useState<WhisperFollowEntry[]>([]);
  const [followLoading, setFollowLoading] = useState(false);

  const [echoes, setEchoes] = useState<WhisperEcho[]>([]);
  const [echoesLoading, setEchoesLoading] = useState(false);
  const [echoesHasMore, setEchoesHasMore] = useState(false);
  const [reflections, setReflections] = useState<WhisperAuthorReflection[]>([]);
  const [reflectionsLoading, setReflectionsLoading] = useState(false);
  const [reflectionsHasMore, setReflectionsHasMore] = useState(false);
  const [likes, setLikes] = useState<WhisperEcho[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesHasMore, setLikesHasMore] = useState(false);
  const [likesDenied, setLikesDenied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Best-effort profile assembled from the locally cached feed — used when no
  // relay is configured, or as a fallback when it can't be reached.
  const localProfile = useCallback((): WhisperProfile => {
    const authored = localEchoes.filter((echo) => echo.authorHash === target.hash);
    const authoredReflections = localEchoes.flatMap((echo) =>
      echo.reflections.filter(
        (reflection) => reflection.authorHash === target.hash && !reflection.deleted
      )
    );
    return {
      avatar: "",
      bio: "",
      displayName: target.name,
      dmPrivacy: "everyone",
      echoCount: authored.length,
      followedByMe: false,
      followerCount: 0,
      followingCount: 0,
      institution: "",
      joinedAt:
        authored.length > 0 ? Math.min(...authored.map((echo) => echo.createdAt)) : null,
      likesReceived:
        authored.reduce((sum, echo) => sum + echo.echoCount, 0) +
        authoredReflections.reduce((sum, reflection) => sum + reflection.likeCount, 0),
      pubkey: "",
      pubkeyHash: target.hash,
      reflectionCount: authoredReflections.length,
      showActivity: true,
      showLikes: true
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localEchoes, target.hash, target.name]);

  // ── Profile card ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    setEditing(false);
    setFollowPanel(null);
    setActiveTab("echoes");
    if (!relayConfigured) {
      setProfile(localProfile());
      setProfileLoading(false);
      return;
    }
    void queryWhisperProfile(target.hash, identity.pubkeyHash).then((remote) => {
      if (!active) return;
      const resolved = remote ?? localProfile();
      // A ghost that never saved a profile still gets their feed handle.
      if (!resolved.displayName) resolved.displayName = target.name;
      setProfile(resolved);
      setProfileLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.hash, identity.pubkeyHash]);

  useEffect(() => {
    if (profile && isSelf) {
      setDraft({
        avatar: profile.avatar,
        bio: profile.bio,
        displayName: profile.displayName || viewerName,
        dmPrivacy: profile.dmPrivacy,
        institution: profile.institution,
        showActivity: profile.showActivity,
        showLikes: profile.showLikes
      });
    }
  }, [profile, isSelf, viewerName]);

  const activityVisible = isSelf || (profile?.showActivity ?? true);

  // ── Tab data (lazy, paged) ────────────────────────────────────────────────
  const loadEchoes = useCallback(
    (before?: number): void => {
      if (!relayConfigured) {
        setEchoes(
          localEchoes
            .filter((echo) => echo.authorHash === target.hash)
            .sort((a, b) => b.createdAt - a.createdAt)
        );
        setEchoesHasMore(false);
        return;
      }
      setEchoesLoading(true);
      void queryWhisperFeed(identity.pubkeyHash, PROFILE_PAGE_SIZE, {
        authorPubkeyHash: target.hash,
        ...(before ? { before } : {})
      }).then((page) => {
        setEchoesLoading(false);
        if (!page || page === FEED_UNCHANGED) return;
        setEchoesHasMore(page.length >= PROFILE_PAGE_SIZE);
        setEchoes((current) => {
          if (!before) return page;
          const known = new Set(current.map((echo) => echo.id));
          return [...current, ...page.filter((echo) => !known.has(echo.id))];
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity.pubkeyHash, localEchoes, target.hash]
  );

  const loadReflections = useCallback(
    (before?: number): void => {
      if (!relayConfigured) {
        setReflections(
          localEchoes
            .flatMap((echo) =>
              echo.reflections
                .filter((r) => r.authorHash === target.hash && !r.deleted)
                .map((r) => ({
                  ...r,
                  echoAuthorName: echo.authorName,
                  echoBody: echo.body,
                  echoId: echo.id
                }))
            )
            .sort((a, b) => b.createdAt - a.createdAt)
        );
        setReflectionsHasMore(false);
        return;
      }
      setReflectionsLoading(true);
      void queryAuthorReflections(
        target.hash,
        identity.pubkeyHash,
        PROFILE_PAGE_SIZE,
        before
      ).then((page) => {
        setReflectionsLoading(false);
        if (!page) return;
        setReflectionsHasMore(page.length >= PROFILE_PAGE_SIZE);
        setReflections((current) => {
          if (!before) return page;
          const known = new Set(current.map((r) => r.id));
          return [...current, ...page.filter((r) => !known.has(r.id))];
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity.pubkeyHash, localEchoes, target.hash]
  );

  const loadLikes = useCallback(
    (before?: number): void => {
      setLikesDenied(false);
      if (!relayConfigured) {
        setLikes(
          isSelf
            ? localEchoes
                .filter((echo) => echo.echoedByMe)
                .sort((a, b) => b.createdAt - a.createdAt)
            : []
        );
        setLikesHasMore(false);
        return;
      }
      setLikesLoading(true);
      void queryLikedEchoes(target.hash, identity.pubkeyHash, PROFILE_PAGE_SIZE, before).then(
        (page) => {
          setLikesLoading(false);
          if (!page) {
            // Unreachable relay and privacy denials both land here; only show
            // the privacy state when the owner actually hides likes.
            if (!isSelf && profile && !profile.showLikes) setLikesDenied(true);
            return;
          }
          setLikesHasMore(page.length >= PROFILE_PAGE_SIZE);
          setLikes((current) => {
            if (!before) return page;
            const known = new Set(current.map((echo) => echo.id));
            return [...current, ...page.filter((echo) => !known.has(echo.id))];
          });
        }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity.pubkeyHash, isSelf, localEchoes, profile?.showLikes, target.hash]
  );

  useEffect(() => {
    setEchoes([]);
    setReflections([]);
    setLikes([]);
    loadEchoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.hash]);

  useEffect(() => {
    if (activeTab === "reflects" && reflections.length === 0) loadReflections();
    if (activeTab === "likes" && likes.length === 0) loadLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const openFollowPanel = (panel: Exclude<FollowPanel, null>): void => {
    if (followPanel === panel) {
      setFollowPanel(null);
      return;
    }
    setFollowPanel(panel);
    setFollowEntries([]);
    if (!relayConfigured) return;
    setFollowLoading(true);
    void queryFollowList(target.hash, panel).then((entries) => {
      setFollowLoading(false);
      if (entries) setFollowEntries(entries);
    });
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleFollow = (): void => {
    if (!profile) return;
    const nextOn = !profile.followedByMe;
    setProfile({
      ...profile,
      followedByMe: nextOn,
      followerCount: Math.max(0, profile.followerCount + (nextOn ? 1 : -1))
    });
    onToast(nextOn ? "You're now haunting this ghost." : "Unfollowed.");
    if (relayConfigured) {
      void setFollowRemote({
        followee: target.hash,
        follower: identity.pubkeyHash,
        followerName: viewerName,
        on: nextOn,
        timestamp: Date.now()
      });
    }
  };

  const shareProfile = (): void => {
    const url = `${window.location.origin}/?ghost=${target.hash}`;
    const title = `${profile?.displayName || target.name} on NADA Whispers`;
    if (navigator.share) {
      void navigator.share({ title, url }).catch(() => {});
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => onToast("Profile link copied."))
      .catch(() => onToast("Couldn't copy the profile link."));
  };

  const saveProfile = (): void => {
    if (!draft || !profile) return;
    const cleaned: WhisperProfileDraft = {
      ...draft,
      displayName: draft.displayName.trim()
    };
    if (!cleaned.displayName) return;
    setProfile({ ...profile, ...cleaned });
    setEditing(false);
    onToast("Profile saved.");
    if (relayConfigured) {
      void updateWhisperProfileRemote({
        author: identity.pubkeyHash,
        timestamp: Date.now(),
        ...cleaned
      });
    }
    onProfileSaved?.(cleaned);
  };

  const pickAvatar = async (file: File | undefined): Promise<void> => {
    if (!file || !draft) return;
    const dataUrl = await fileToAvatarDataUrl(file);
    if (!dataUrl) {
      onToast("Couldn't read that image.");
      return;
    }
    setDraft({ ...draft, avatar: dataUrl });
  };

  // "Message" availability respects the recipient's DM privacy and requires
  // their relay-verified messaging key.
  const messageState = useMemo((): { enabled: boolean; reason?: string } => {
    if (!profile || isSelf) return { enabled: false };
    if (!profile.pubkey) {
      return {
        enabled: false,
        reason: "This ghost hasn't published a messaging key yet."
      };
    }
    if (profile.dmPrivacy === "none") {
      return { enabled: false, reason: "Not accepting messages." };
    }
    if (profile.dmPrivacy === "ghosts" && !profile.followedByMe) {
      return { enabled: false, reason: "Only their Ghosts can message them." };
    }
    return { enabled: true };
  }, [profile, isSelf]);

  const name = profile?.displayName || target.name;
  const anonymousHandle = `ghost·${target.hash.slice(0, 10)}`;

  const TABS: Array<{ id: ProfileTab; label: string }> = [
    { id: "echoes", label: "Echoes" },
    { id: "reflects", label: "Reflects" },
    { id: "likes", label: "Likes" },
    { id: "media", label: "Media" }
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      {/* Top bar */}
      <div className="mb-3 flex items-center gap-2">
        {onBack ? (
          <button
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-primary"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={16} />
          </button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-nada-primary">
          {isSelf ? "Your profile" : name}
        </h2>
        <button
          aria-label="Share profile link"
          className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-accent"
          onClick={shareProfile}
          title="Share profile link"
          type="button"
        >
          <Share2 size={15} />
        </button>
        {isSelf && !editing ? (
          <button
            aria-label="Edit profile"
            className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-accent"
            onClick={() => setEditing(true)}
            title="Edit profile"
            type="button"
          >
            <Pencil size={15} />
          </button>
        ) : null}
      </div>

      {profileLoading && !profile ? (
        <div className="space-y-4 py-4" aria-hidden>
          <div className="mx-auto h-24 w-24 rounded-[30px] nada-skeleton" />
          <div className="mx-auto h-4 w-1/2 rounded nada-skeleton" />
          <div className="mx-auto h-3 w-1/3 rounded nada-skeleton" />
          <div className="grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div className="h-16 rounded-2xl nada-skeleton" key={index} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Identity header */}
          <div className="flex flex-col items-center px-2 pb-5 pt-2 text-center">
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="relative mb-4"
              initial={{ opacity: 0, scale: 0.9 }}
            >
              <div
                aria-hidden
                className="absolute inset-0 rounded-[30px] opacity-45 blur-2xl"
                style={{ backgroundImage: authorGradient(name) }}
              />
              <div className="relative">
                <ProfileAvatar
                  avatar={(editing ? draft?.avatar : profile?.avatar) ?? ""}
                  name={name}
                />
                {editing ? (
                  <>
                    <button
                      aria-label="Change avatar"
                      className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-nada-surface bg-nada-accent text-white shadow-lg transition hover:scale-105"
                      onClick={() => avatarInputRef.current?.click()}
                      type="button"
                    >
                      <Camera size={14} />
                    </button>
                    {draft?.avatar ? (
                      <button
                        aria-label="Remove avatar"
                        className="absolute -bottom-1 -left-1 grid h-7 w-7 place-items-center rounded-full border-2 border-nada-surface bg-nada-muted text-nada-secondary transition hover:text-red-300"
                        onClick={() => draft && setDraft({ ...draft, avatar: "" })}
                        type="button"
                      >
                        <X size={11} />
                      </button>
                    ) : null}
                    <input
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void pickAvatar(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                      ref={avatarInputRef}
                      type="file"
                    />
                  </>
                ) : null}
              </div>
            </motion.div>
            <p className="mb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-nada-accent/80">
              Ghost ID
            </p>

            {editing && draft ? (
              <input
                aria-label="Display name"
                className="nada-input-dark h-10 w-full max-w-[240px] text-center text-[15px] font-bold"
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                value={draft.displayName}
              />
            ) : (
              <h3 className="text-[20px] font-extrabold tracking-tight text-nada-primary">
                {name}
              </h3>
            )}
            <p className="mt-1 font-mono text-[11.5px] text-nada-secondary/60">
              {anonymousHandle}
            </p>

            {editing && draft ? (
              <textarea
                aria-label="Bio"
                className="nada-input-dark mt-3 min-h-[64px] w-full resize-none px-3 py-2 text-[13px]"
                maxLength={280}
                onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                placeholder="Say something without saying who you are..."
                value={draft.bio}
              />
            ) : profile?.bio ? (
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-nada-secondary/80">
                {profile.bio}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-nada-secondary/55">
              {editing && draft ? (
                <input
                  aria-label="Institution"
                  className="nada-input-dark h-9 w-44 text-center text-[12px]"
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({ ...draft, institution: event.target.value })
                  }
                  placeholder="Institution (optional)"
                  value={draft.institution}
                />
              ) : profile?.institution ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 size={11} />
                  {profile.institution}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} />
                {joinedLabel(profile?.joinedAt ?? null)}
              </span>
            </div>

            {/* Privacy + save controls (edit mode) */}
            {editing && draft ? (
              <div className="mt-4 w-full space-y-2.5 text-left">
                <label className="flex items-center justify-between rounded-2xl bg-nada-surface/60 px-3.5 py-3">
                  <span className="flex items-center gap-2 text-[12.5px] font-semibold text-nada-primary">
                    <EyeOff size={13} className="text-nada-secondary/60" />
                    Show recent activity on profile
                  </span>
                  <input
                    checked={draft.showActivity}
                    className="h-4 w-4 accent-[rgb(var(--nada-accent))]"
                    onChange={(event) =>
                      setDraft({ ...draft, showActivity: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl bg-nada-surface/60 px-3.5 py-3">
                  <span className="flex items-center gap-2 text-[12.5px] font-semibold text-nada-primary">
                    <Heart size={13} className="text-nada-secondary/60" />
                    Show liked Echoes publicly
                  </span>
                  <input
                    checked={draft.showLikes}
                    className="h-4 w-4 accent-[rgb(var(--nada-accent))]"
                    onChange={(event) =>
                      setDraft({ ...draft, showLikes: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>
                <div className="rounded-2xl bg-nada-surface/60 px-3.5 py-3">
                  <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-nada-primary">
                    <MessageSquareText size={13} className="text-nada-secondary/60" />
                    Who can message you
                  </p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { id: "everyone", label: "Everyone" },
                        { id: "ghosts", label: "Ghosts only" },
                        { id: "none", label: "No one" }
                      ] as Array<{ id: WhisperDmPrivacy; label: string }>
                    ).map((option) => (
                      <button
                        className={cn(
                          "flex-1 rounded-xl px-2 py-2 text-[11.5px] font-bold transition",
                          draft.dmPrivacy === option.id
                            ? "bg-nada-accent/15 text-nada-accent"
                            : "bg-nada-muted text-nada-secondary/70 hover:text-nada-primary"
                        )}
                        key={option.id}
                        onClick={() => setDraft({ ...draft, dmPrivacy: option.id })}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    className="flex-1 rounded-2xl bg-nada-muted px-4 py-2.5 text-[13px] font-semibold text-nada-secondary"
                    onClick={() => setEditing(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-nada-accent px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-45"
                    disabled={!draft.displayName.trim()}
                    onClick={saveProfile}
                    type="button"
                  >
                    <Check size={14} />
                    Save profile
                  </button>
                </div>
              </div>
            ) : !isSelf && profile ? (
              <>
                {/* Primary actions: Message + Follow */}
                <div className="mt-4 flex w-full gap-2">
                  <button
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-nada-accent text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-45"
                    disabled={!messageState.enabled}
                    onClick={() => onMessage(profile)}
                    title={messageState.reason}
                    type="button"
                  >
                    <MessageSquareText size={15} />
                    Message
                  </button>
                  <button
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-bold transition disabled:opacity-45",
                      profile.followedByMe
                        ? "bg-nada-muted text-nada-primary hover:bg-red-500/10 hover:text-red-300"
                        : "nada-btn-gold"
                    )}
                    disabled={!relayConfigured}
                    onClick={toggleFollow}
                    type="button"
                  >
                    {profile.followedByMe ? (
                      <>
                        <UserCheck size={15} />
                        Haunting
                      </>
                    ) : (
                      <>
                        <UserPlus size={15} />
                        Follow
                      </>
                    )}
                  </button>
                </div>
                {messageState.reason ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-nada-secondary/55">
                    <Lock size={10} />
                    {messageState.reason}
                  </p>
                ) : null}
                {/* Secondary actions: Block / Report */}
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition",
                      isBlocked
                        ? "bg-red-500/12 text-red-300"
                        : "bg-nada-muted text-nada-secondary/70 hover:text-red-300"
                    )}
                    onClick={() => onToggleBlock(target.hash, !isBlocked)}
                    type="button"
                  >
                    <ShieldBan size={12} />
                    {isBlocked ? "Unblock" : "Block"}
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full bg-nada-muted px-3 py-1.5 text-[11.5px] font-bold text-nada-secondary/70 transition hover:text-red-300"
                    onClick={() => onReport(profile)}
                    type="button"
                  >
                    <Flag size={12} />
                    Report
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-1.5">
            <StatBlock label="Echoes" value={profile?.echoCount ?? 0} />
            <StatBlock label="Reflects" value={profile?.reflectionCount ?? 0} />
            <StatBlock label="Likes" value={profile?.likesReceived ?? 0} />
            <StatBlock
              label="Ghosts"
              onClick={relayConfigured ? () => openFollowPanel("followers") : undefined}
              value={profile?.followerCount ?? 0}
            />
            <StatBlock
              label="Following"
              onClick={relayConfigured ? () => openFollowPanel("following") : undefined}
              value={profile?.followingCount ?? 0}
            />
          </div>

          {/* Followers / following list */}
          <AnimatePresence initial={false}>
            {followPanel ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
              >
                <div className="mt-3 rounded-2xl border border-nada-border/10 bg-nada-surface/40 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-nada-secondary/50">
                    <Ghost size={12} />
                    {followPanel === "followers" ? "Ghosts" : "Following"}
                  </p>
                  {followLoading ? (
                    <ListSkeleton rows={2} />
                  ) : followEntries.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[12px] text-nada-text-muted">
                      {followPanel === "followers"
                        ? "No Ghosts yet."
                        : "Not following anyone yet."}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {followEntries.map((entry) => {
                        const entryName = entry.displayName || "Ghost";
                        return (
                          <button
                            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-nada-surface/70"
                            key={entry.pubkeyHash}
                            onClick={() => onOpenProfile(entry.pubkeyHash, entryName)}
                            type="button"
                          >
                            <ProfileAvatar avatar={entry.avatar} name={entryName} size={34} />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-nada-primary">
                              {entryName}
                            </span>
                            <span className="font-mono text-[10px] text-nada-secondary/45">
                              ghost·{entry.pubkeyHash.slice(0, 6)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Activity tabs */}
          <div className="mt-5">
            <div className="mb-3 flex rounded-2xl bg-nada-surface/50 p-1">
              {TABS.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={cn(
                    "relative flex-1 rounded-xl px-2 py-2 text-[12px] font-bold transition",
                    activeTab === tab.id
                      ? "text-nada-primary"
                      : "text-nada-secondary/55 hover:text-nada-primary"
                  )}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {activeTab === tab.id ? (
                    <motion.span
                      className="absolute inset-0 rounded-xl bg-nada-surface-elevated shadow-sm"
                      layoutId="profile-tab-indicator"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative">{tab.label}</span>
                </button>
              ))}
            </div>

            {!activityVisible && activeTab !== "media" ? (
              <EmptyState
                body="Their whispers still appear in the global feed."
                icon={EyeOff}
                title="This ghost keeps their activity private"
              />
            ) : activeTab === "echoes" ? (
              echoesLoading && echoes.length === 0 ? (
                <ListSkeleton />
              ) : echoes.length === 0 ? (
                <EmptyState
                  body={
                    isSelf
                      ? "Whisper something to the feed and it will appear here."
                      : "This ghost hasn't whispered anything yet."
                  }
                  icon={Waves}
                  title="No Echoes yet"
                />
              ) : (
                <div className="space-y-2">
                  {echoes.map((echo) => (
                    <EchoRow echo={echo} key={echo.id} onOpen={() => onOpenEcho(echo.id, echo)} />
                  ))}
                  {echoesHasMore ? (
                    <LoadMoreButton
                      loading={echoesLoading}
                      onClick={() =>
                        loadEchoes(Math.min(...echoes.map((echo) => echo.createdAt)))
                      }
                    />
                  ) : null}
                </div>
              )
            ) : activeTab === "reflects" ? (
              reflectionsLoading && reflections.length === 0 ? (
                <ListSkeleton />
              ) : reflections.length === 0 ? (
                <EmptyState
                  body={
                    isSelf
                      ? "Reflections you leave on Echoes will appear here."
                      : "This ghost hasn't reflected on anything yet."
                  }
                  icon={CornerDownRight}
                  title="No Reflects yet"
                />
              ) : (
                <div className="space-y-2">
                  {reflections.map((reflection) => (
                    <button
                      className="w-full rounded-2xl border border-nada-border/10 bg-nada-surface/60 px-3.5 py-3 text-left transition hover:border-nada-accent/25 hover:bg-nada-surface"
                      key={reflection.id}
                      onClick={() => onOpenEcho(reflection.echoId)}
                      type="button"
                    >
                      <p className="truncate text-[11px] text-nada-secondary/50">
                        Reflecting on{" "}
                        <span className="font-bold text-nada-primary/70">
                          {reflection.echoAuthorName}
                        </span>
                        : {reflection.echoBody.slice(0, 60)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-primary/90 line-clamp-3">
                        {reflection.body}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-nada-secondary/50">
                        <span>{formatRelativeTime(reflection.createdAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Heart size={10} /> {reflection.likeCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CornerDownRight size={10} /> {reflection.replyCount}
                        </span>
                      </div>
                    </button>
                  ))}
                  {reflectionsHasMore ? (
                    <LoadMoreButton
                      loading={reflectionsLoading}
                      onClick={() =>
                        loadReflections(
                          Math.min(...reflections.map((r) => r.createdAt))
                        )
                      }
                    />
                  ) : null}
                </div>
              )
            ) : activeTab === "likes" ? (
              likesDenied || (!isSelf && profile && !profile.showLikes) ? (
                <EmptyState
                  body="Liked Echoes are only visible to them."
                  icon={Lock}
                  title="This ghost keeps their likes private"
                />
              ) : likesLoading && likes.length === 0 ? (
                <ListSkeleton />
              ) : likes.length === 0 ? (
                <EmptyState
                  body={
                    isSelf
                      ? "Echoes you like will be collected here."
                      : "No public likes yet."
                  }
                  icon={Heart}
                  title="No likes yet"
                />
              ) : (
                <div className="space-y-2">
                  {likes.map((echo) => (
                    <EchoRow echo={echo} key={echo.id} onOpen={() => onOpenEcho(echo.id, echo)} />
                  ))}
                  {likesHasMore ? (
                    <LoadMoreButton
                      loading={likesLoading}
                      onClick={() =>
                        loadLikes(Math.min(...likes.map((echo) => echo.createdAt)))
                      }
                    />
                  ) : null}
                </div>
              )
            ) : (
              <EmptyState
                body="Photos and clips shared in whispers will live here soon."
                icon={ImageIcon}
                title="Media is coming soon"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
