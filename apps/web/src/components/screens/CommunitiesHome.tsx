"use client";
/* eslint-disable */
import type { CommunityRecord, CommunityDraft, ChatListModel } from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import type { IdentityRecord, ChatRecord, ContactRecord } from "@nada/db";
import { cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Plus, Users, Flag, Trash2, Send, BarChart2, X, ShieldAlert } from "lucide-react";
import { Sheet } from "../panels/Sheet";
import { useState, useEffect } from "react";

const COMMUNITY_CATEGORY_OPTIONS = [
  "Tech",
  "Sports",
  "Music",
  "Gaming",
  "Business",
  "Education",
  "Lifestyle",
  "Local"
] as const;

export function CommunitiesHome({
      communities,
      identity,
      onCopyInvite,
      onCreateCommunity,
      onDeleteCommunity,
      onJoinCommunity,
      onLeaveCommunity,
      onPostCommunity,
      onReportCommunity
    }: {
          communities: CommunityRecord[];
          identity: IdentityRecord;
          onCopyInvite: (community: CommunityRecord) => void;
          onCreateCommunity: () => void;
          onDeleteCommunity: (communityId: string) => void;
          onJoinCommunity: (communityId: string) => void;
          onLeaveCommunity: (communityId: string) => void;
          onPostCommunity: (communityId: string, channelId: string, body: string) => void;
          onReportCommunity: (community: CommunityRecord) => void;
        }): JSX.Element {
    const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(communities[0]?.id ?? null);
    const [selectedChannelId, setSelectedChannelId] = useState("general");
    const [postDraft, setPostDraft] = useState("");
    const [pendingCommunityAction, setPendingCommunityAction] = useState<{
            action: "delete" | "leave";
            community: CommunityRecord;
          } | null>(null);
    const featured = [
            ["Tech Node", "Build, ship, and share anonymous product notes", "Tech"],
            ["Match Room", "Sports talk without handles or real names", "Sports"],
            ["Study Circle", "Quiet learning rooms for private progress", "Education"]
          ];
    const selectedCommunity = communities.find((community) => community.id === selectedCommunityId) ?? communities[0] ?? null;
    const selectedCommunityIsAdmin = Boolean(
            selectedCommunity?.admins.includes(identity.pubkeyHash)
          );
    const visiblePosts = selectedCommunity
            ? selectedCommunity.posts.filter((post) => post.channelId === selectedChannelId)
            : [];
    useEffect(() => {
    if (!selectedCommunity && communities[0]) {
      setSelectedCommunityId(communities[0].id);
    }
    }, [communities, selectedCommunity]);
    useEffect(() => {
    if (!selectedCommunity) return;
    const firstChannel = selectedCommunity.channels[0]?.id ?? "general";
    if (!selectedCommunity.channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(firstChannel);
    }
    }, [selectedChannelId, selectedCommunity]);
    return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <MessageCircle size={24} />
        </div>
        <p className="text-[11px] font-bold uppercase text-nada-accent">Communities</p>
        <h2 className="mt-1 text-[20px] font-bold text-nada-primary">Public interests. Private identity.</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Create interest spaces like tech, sports, music, or local circles while keeping NADA identity separate from real life.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="nada-privacy-chip">Topic-based</span>
          <span className="nada-privacy-chip">Anonymous profile</span>
          <span className="nada-privacy-chip">Local-first</span>
        </div>
        <button
          className="nada-btn-gold mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-bold"
          onClick={onCreateCommunity}
          type="button"
        >
          <Plus size={16} />
          Add community
        </button>
      </div>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase text-nada-text-muted">My Communities</p>
          <span className="rounded-full bg-nada-surface-elevated/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
            {communities.length}
          </span>
        </div>
        {communities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-8 text-center">
            <Users className="mx-auto mb-3 h-7 w-7 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">No communities yet</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Add a tech, sports, music, or local community to begin.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {communities.map((community) => (
              <button
                className={cn(
                  "nada-settings-card flex items-center gap-3 text-left",
                  selectedCommunity?.id === community.id && "ring-1 ring-nada-accent/25"
                )}
                key={community.id}
                onClick={() => {
                  setSelectedCommunityId(community.id);
                  setSelectedChannelId(community.channels[0]?.id ?? "general");
                }}
                type="button"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
                  <Users size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-nada-primary">{community.title}</span>
                  <span className="block truncate text-[12px] text-nada-text-muted">{community.description}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] font-bold text-nada-accent">
                      {community.category}
                    </span>
                    <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] font-bold text-nada-secondary/60">
                      {community.privacy === "invite-only" ? "Invite-only" : "Open"}
                    </span>
                  </span>
                </span>
                <span className="text-right text-[11px] font-semibold text-nada-secondary/55">
                  {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCommunity ? (
        <section className="mb-5 rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-nada-accent">
                {selectedCommunity.category} community
              </p>
              <h3 className="truncate text-lg font-bold text-nada-primary">{selectedCommunity.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-nada-text-muted">
                {selectedCommunity.description}
              </p>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-muted text-nada-secondary"
              onClick={() => onReportCommunity(selectedCommunity)}
              type="button"
            >
              <Flag size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedCommunity.topics.map((topic) => (
              <span className="nada-privacy-chip" key={topic}>{topic}</span>
            ))}
            {selectedCommunity.admins.includes(identity.pubkeyHash) ? (
              <span className="nada-privacy-chip border-nada-accent/20 bg-nada-accent/[0.08] text-nada-accent">
                Admin
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-2xl border border-nada-border/10 bg-nada-surface px-3 py-2.5 text-sm font-bold text-nada-primary"
              onClick={() => onCopyInvite(selectedCommunity)}
              type="button"
            >
              Copy invite
            </button>
            <button
              className={cn(
                "flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold",
                selectedCommunity.joined
                  ? "bg-nada-muted text-nada-secondary"
                  : "bg-nada-accent text-white"
              )}
              onClick={() => {
                if (selectedCommunity.joined) {
                  setPendingCommunityAction({
                    action: "leave",
                    community: selectedCommunity
                  });
                }
                else onJoinCommunity(selectedCommunity.id);
              }}
              type="button"
            >
              {selectedCommunity.joined ? "Leave" : "Join"}
            </button>
          </div>
          {selectedCommunityIsAdmin ? (
            <button
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 text-sm font-bold text-red-200 transition hover:bg-red-500/15"
              onClick={() => {
                setPendingCommunityAction({
                  action: "delete",
                  community: selectedCommunity
                });
              }}
              type="button"
            >
              <Trash2 size={16} />
              Delete community
            </button>
          ) : null}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {selectedCommunity.channels.map((channel) => (
              <button
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
                  selectedChannelId === channel.id
                    ? "bg-nada-accent text-black"
                    : "bg-nada-surface text-nada-secondary/70"
                )}
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                type="button"
              >
                {channel.title}
              </button>
            ))}
          </div>
          {selectedCommunity.joined ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = postDraft.trim();
                if (!body) return;
                onPostCommunity(selectedCommunity.id, selectedChannelId, body);
                setPostDraft("");
              }}
            >
              <input
                className="nada-input-dark h-11 min-w-0 flex-1 text-sm"
                maxLength={280}
                onChange={(event) => setPostDraft(event.target.value)}
                placeholder="Post to this channel..."
                value={postDraft}
              />
              <button
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nada-accent text-white disabled:opacity-40"
                disabled={!postDraft.trim()}
                type="submit"
              >
                <Send size={16} />
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-2xl bg-nada-surface/70 px-4 py-3 text-[12.5px] text-nada-text-muted">
              Join this community to post without exposing a real-world identity.
            </p>
          )}
          <div className="mt-4 grid gap-2">
            {visiblePosts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-nada-border/10 px-4 py-6 text-center text-[12.5px] text-nada-text-muted">
                No posts in this channel yet.
              </p>
            ) : (
              visiblePosts.map((post) => (
                <article className="rounded-2xl bg-nada-surface/70 px-4 py-3" key={post.id}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-nada-accent">{post.authorName}</span>
                    <span className="text-[10px] text-nada-secondary/45">
                      {formatRelativeTime(post.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-nada-primary/90">{post.body}</p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <AnimatePresence>
        {pendingCommunityAction ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1200] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPendingCommunityAction(null)}
          >
            <motion.div
              animate={{ y: 0, opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-3xl border border-nada-border/10 bg-nada-surface p-5 shadow-2xl"
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-2xl",
                    pendingCommunityAction.action === "delete"
                      ? "bg-red-500/12 text-red-300"
                      : "bg-nada-accent/12 text-nada-accent"
                  )}
                >
                  {pendingCommunityAction.action === "delete" ? (
                    <Trash2 size={20} />
                  ) : (
                    <Users size={20} />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-nada-primary">
                    {pendingCommunityAction.action === "delete"
                      ? "Delete community"
                      : "Leave community"}
                  </h3>
                  <p className="truncate text-xs text-nada-secondary/55">
                    {pendingCommunityAction.community.title}
                  </p>
                </div>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-nada-secondary/75">
                {pendingCommunityAction.action === "delete"
                  ? "This removes the community from your NADA space and deletes its local posts."
                  : "You can rejoin later with an invite, but posting will be disabled until then."}
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
                  onClick={() => setPendingCommunityAction(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={cn(
                    "flex-1 rounded-2xl px-4 py-3 text-sm font-bold",
                    pendingCommunityAction.action === "delete"
                      ? "bg-red-500 text-white"
                      : "bg-nada-accent text-white"
                  )}
                  onClick={() => {
                    if (pendingCommunityAction.action === "delete") {
                      onDeleteCommunity(pendingCommunityAction.community.id);
                    } else {
                      onLeaveCommunity(pendingCommunityAction.community.id);
                    }
                    setPendingCommunityAction(null);
                  }}
                  type="button"
                >
                  {pendingCommunityAction.action === "delete" ? "Delete" : "Leave"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="grid gap-2">
        <p className="px-1 text-[11px] font-bold uppercase text-nada-text-muted">Explore Templates</p>
        {featured.map(([name, meta, badge]) => (
          <div className="nada-settings-card flex items-center gap-3" key={name}>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
              <BarChart2 size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-nada-primary">{name}</span>
              <span className="block text-[12px] text-nada-text-muted">{meta}</span>
            </span>
            <span className="rounded-full bg-nada-surface/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
              {badge}
            </span>
          </div>
        ))}
      </section>
    </div>
    );
}

export function CommunityCreateSheet({
      onClose,
      onCreate
    }: {
          onClose: () => void;
          onCreate: (draft: CommunityDraft) => void;
        }): JSX.Element {
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState<string>("Tech");
    const [description, setDescription] = useState("");
    const [privacy, setPrivacy] = useState<"open" | "invite-only">("open");
    const canCreate = title.trim().length > 0 && description.trim().length > 0;
    useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-nada-accent">New community</p>
          <h2 className="text-lg font-semibold text-nada-primary">Add community</h2>
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-muted text-nada-secondary"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Community name</span>
          <input
            autoFocus
            className="nada-input-dark h-12 w-full text-[15px]"
            maxLength={54}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Tech community, Sports hub..."
            value={title}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Description</span>
          <textarea
            className="nada-input-dark min-h-[96px] w-full resize-none px-4 py-3 text-[14px]"
            maxLength={180}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What should people talk about here?"
            value={description}
          />
        </label>
        <div>
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Category</span>
          <div className="grid grid-cols-2 gap-2">
            {COMMUNITY_CATEGORY_OPTIONS.map((option) => (
              <button
                className={cn(
                  "rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                  category === option
                    ? "border-nada-accent/45 bg-nada-accent/12 text-nada-accent"
                    : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
                )}
                key={option}
                onClick={() => setCategory(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Access</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["open", "Open"],
              ["invite-only", "Invite-only"]
            ].map(([value, label]) => (
              <button
                className={cn(
                  "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                  privacy === value
                    ? "border-nada-accent/45 bg-nada-accent/12 text-nada-accent"
                    : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
                )}
                key={value}
                onClick={() => setPrivacy(value as "open" | "invite-only")}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          className="nada-btn-gold flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold disabled:opacity-45"
          disabled={!canCreate}
          onClick={() => onCreate({ category, description, privacy, title })}
          type="button"
        >
          <Plus size={16} />
          Create community
        </button>
      </div>
    </Sheet>
    );
}
