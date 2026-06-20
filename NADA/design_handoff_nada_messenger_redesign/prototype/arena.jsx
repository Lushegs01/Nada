/* Chat arena components: header, messages, voice note, composer */

/* ─────────────────────────────────────────────
   Chat Arena Header
   ──────────────────────────────────────────── */
const ChatArenaHeader = ({ chat }) => {
  if (!chat) return null;
  return (
    <header
      className="flex items-center px-6 py-4 border-b hairline shrink-0 backdrop-blur-xl"
      style={{ background: "rgba(12,13,16,0.78)", minHeight: 72 }}
    >
      <Avatar chat={chat} size={40} />
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-fg tracking-[-0.01em] truncate">{chat.name}</h2>
          <span style={{ color: "var(--accent)" }} title="Verified key fingerprint">
            <IconShield size={12} strokeWidth={2.2} />
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] font-mono text-fg-faint">
          {chat.isGroup ? (
            <span>{chat.members} members · {chat.online ? <span style={{ color: "var(--accent)" }}>3 online</span> : "all offline"}</span>
          ) : chat.online ? (
            <span style={{ color: "var(--accent)" }}>online · end-to-end</span>
          ) : (
            <span>last seen recently · end-to-end</span>
          )}
        </div>
      </div>

      {/* Security pill */}
      <div className="hidden md:flex items-center gap-1.5 mr-3 px-2.5 py-1.5 rounded-full bg-[rgba(30,215,130,0.08)] border border-[rgba(30,215,130,0.20)]">
        <IconLock size={11} strokeWidth={2.2} style={{ color: "var(--accent)" }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.10em]" style={{ color: "var(--accent)" }}>
          E2E · Curve25519
        </span>
      </div>

      <div className="flex items-center gap-1">
        {[IconSearch, IconPhone, IconVideo, IconMore].map((I, i) => (
          <button
            key={i}
            className="w-9 h-9 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.05] transition-colors"
          >
            <I size={17} />
          </button>
        ))}
      </div>
    </header>
  );
};

/* ─────────────────────────────────────────────
   Vanish banner
   ──────────────────────────────────────────── */
const VanishBanner = () => (
  <div
    className="flex items-center gap-2 px-6 py-2 text-[11.5px] font-mono"
    style={{
      background: "linear-gradient(90deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.10) 0%, transparent 100%)",
      borderBottom: "1px solid hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.18)",
      color: "var(--accent)",
    }}
  >
    <IconGhost size={13} strokeWidth={2} />
    <span className="font-semibold">Vanish mode</span>
    <span className="text-fg-muted">· messages disappear 5m after read · screenshots blocked</span>
    <span className="ml-auto text-fg-muted">2 messages pending burn</span>
  </div>
);

/* ─────────────────────────────────────────────
   Reply quote (inside bubble)
   ──────────────────────────────────────────── */
const ReplyQuote = ({ reply }) => (
  <div className="reply-quote mb-1.5">
    <div className="text-[11.5px] font-semibold" style={{ color: "var(--accent)" }}>{reply.sender}</div>
    <div className="text-[12.5px] text-fg-muted truncate">{reply.preview}</div>
  </div>
);

/* ─────────────────────────────────────────────
   Status ticks
   ──────────────────────────────────────────── */
const StatusTick = ({ status }) => {
  if (status === "sending") return <IconClock size={12} className="opacity-65" />;
  if (status === "sent")     return <IconCheck size={13} className="opacity-65" />;
  if (status === "delivered")return <IconCheckDouble size={13} className="opacity-65" />;
  if (status === "read")     return <IconCheckDouble size={13} style={{ color: "#7DE5B6" }} />;
  return null;
};

/* ─────────────────────────────────────────────
   Reactions
   ──────────────────────────────────────────── */
const Reactions = ({ reactions, fromMe }) => (
  <div className={`flex flex-wrap gap-1 mt-1 ${fromMe ? "justify-end" : "justify-start"}`}>
    {reactions.map((r, i) => (
      <span key={i} className={`reaction-chip ${r.mine ? "mine" : ""}`}>
        <span>{r.emoji}</span>
        <span className="font-mono text-[10.5px]">{r.count}</span>
      </span>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   Voice Note bubble — premium audio player
   ──────────────────────────────────────────── */
const VoiceNote = ({ msg, fromMe }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(msg.played ?? 0);
  const [speed, setSpeed] = useState(1);
  const trackRef = useRef(null);
  const tickRef = useRef(null);

  // Simulated playback animation
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    const startProgress = progress >= 0.999 ? 0 : progress;
    if (progress >= 0.999) setProgress(0);

    const tick = (now) => {
      const elapsed = (now - t0) / 1000;
      const next = startProgress + (elapsed * speed) / msg.duration;
      if (next >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(next);
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => tickRef.current && cancelAnimationFrame(tickRef.current);
  }, [playing, speed]);

  const handleSeek = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setProgress(pct);
  };

  const elapsedTime = useMemo(() => {
    const total = playing || progress > 0 ? Math.floor(progress * msg.duration) : msg.duration;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [progress, playing, msg.duration]);

  return (
    <div className={`${fromMe ? "bubble-sent" : "bubble-recv"} px-3.5 py-2.5 rounded-[18px]`}
         style={{ borderBottomRightRadius: fromMe ? 6 : undefined, borderBottomLeftRadius: !fromMe ? 6 : undefined }}>
      <div className="flex items-center gap-3" style={{ minWidth: 260 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="voice-play w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Waveform */}
          <div
            ref={trackRef}
            onClick={handleSeek}
            className="relative h-8 flex items-center gap-[2.5px] cursor-pointer select-none"
          >
            {msg.waveform.map((h, i) => {
              const barFrac = (i + 0.5) / msg.waveform.length;
              const played = barFrac <= progress;
              const playedColor = fromMe ? "rgba(255,255,255,0.92)" : "var(--accent)";
              const unplayedColor = fromMe ? "rgba(255,255,255,0.30)" : "rgba(168,176,188,0.30)";
              return (
                <div
                  key={i}
                  style={{
                    width: 3,
                    height: `${Math.max(4, h * 28)}px`,
                    borderRadius: 2,
                    background: played ? playedColor : unplayedColor,
                    transition: "background 0.06s linear",
                  }}
                />
              );
            })}

            {/* Playhead dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `calc(${progress * 100}% - 5px)`,
                width: 10, height: 10,
                borderRadius: 999,
                background: fromMe ? "#FFFFFF" : "var(--accent)",
                boxShadow: fromMe
                  ? "0 0 0 2px hsl(var(--accent-h) calc(var(--accent-s) - 10%) 28%), 0 0 8px rgba(255,255,255,0.4)"
                  : "0 0 0 2px #0C0D10, 0 0 10px var(--accent-glow)",
              }}
            />
          </div>

          <div className={`flex items-center gap-2 mt-1 text-[10.5px] font-mono ${fromMe ? "text-white/70" : "text-fg-faint"}`}>
            <span>{elapsedTime}</span>
            <span className="opacity-60">·</span>
            <span>{Math.floor(msg.duration / 60)}:{String(msg.duration % 60).padStart(2, "0")}</span>
            <button
              onClick={() => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
              className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: fromMe ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.06)",
                color: fromMe ? "rgba(255,255,255,0.92)" : "var(--accent)",
              }}
            >
              {speed}×
            </button>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className={`flex items-center gap-1.5 mt-1.5 text-[10.5px] font-mono ${fromMe ? "text-white/70 justify-end" : "text-fg-faint"}`}>
        <span>{msg.time}</span>
        {fromMe && <StatusTick status={msg.status || "read"} />}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   File bubble
   ──────────────────────────────────────────── */
const FileBubble = ({ msg, fromMe }) => (
  <div className={`${fromMe ? "bubble-sent" : "bubble-recv"} px-3.5 py-3 rounded-[18px]`}
       style={{ borderBottomRightRadius: fromMe ? 6 : undefined, borderBottomLeftRadius: !fromMe ? 6 : undefined }}>
    <div className="flex items-center gap-3" style={{ minWidth: 240 }}>
      <div
        className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ background: fromMe ? "rgba(0,0,0,0.30)" : "rgba(30,215,130,0.10)", color: fromMe ? "#fff" : "var(--accent)" }}
      >
        <IconLock size={16} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13.5px] font-semibold truncate ${fromMe ? "" : "text-fg"}`}>{msg.fileName}</div>
        <div className={`text-[11px] font-mono mt-0.5 ${fromMe ? "text-white/65" : "text-fg-faint"}`}>
          {msg.fileSize} · encrypted vault
        </div>
      </div>
      <button
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: fromMe ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)", color: fromMe ? "#fff" : "var(--accent)" }}
        aria-label="Download"
      >
        <IconArrowDown size={14} strokeWidth={2.2} />
      </button>
    </div>
    <div className={`flex items-center gap-1.5 mt-2 text-[10.5px] font-mono ${fromMe ? "text-white/70 justify-end" : "text-fg-faint"}`}>
      {msg.ghost && <><IconGhost size={11} strokeWidth={2} /> <span>burns in {msg.vanishAt}</span><span className="opacity-50">·</span></>}
      <span>{msg.time}</span>
      {fromMe && <StatusTick status={msg.status || "read"} />}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Message wrapper (sent / received row)
   ──────────────────────────────────────────── */
const MessageRow = ({ msg, prevFromSame }) => {
  if (msg.kind === "date") {
    return (
      <div className="flex justify-center py-3">
        <span className="date-pill">{msg.text}</span>
      </div>
    );
  }
  const fromMe = msg.from === "me";

  return (
    <div className={`flex w-full ${fromMe ? "justify-end" : "justify-start"} ${prevFromSame ? "mt-1" : "mt-3"}`}>
      <div className={`flex flex-col ${fromMe ? "items-end" : "items-start"} max-w-[68%]`}>
        {msg.type === "voice" && <VoiceNote msg={msg} fromMe={fromMe} />}
        {msg.type === "file"  && <FileBubble msg={msg} fromMe={fromMe} />}
        {msg.type === "text"  && (
          <div
            className={`${fromMe ? "bubble-sent" : "bubble-recv"} px-3.5 py-2 rounded-[18px]`}
            style={{
              borderBottomRightRadius: fromMe ? 6 : undefined,
              borderBottomLeftRadius: !fromMe ? 6 : undefined,
            }}
          >
            {msg.replyTo && <ReplyQuote reply={msg.replyTo} />}
            <div className="text-[14px] leading-[1.45]" style={{ wordWrap: "break-word", color: fromMe ? "#F2FBF6" : "#F5F7FA" }}>
              {msg.text}
            </div>
            <div className={`flex items-center gap-1.5 mt-0.5 text-[10.5px] font-mono ${fromMe ? "text-white/70 justify-end" : "text-fg-faint"}`}>
              {msg.ghost && <><IconGhost size={10} strokeWidth={2} className="-mt-px" /><span>{msg.vanishAt}</span><span className="opacity-50">·</span></>}
              <span>{msg.time}</span>
              {fromMe && <StatusTick status={msg.status || "read"} />}
            </div>
          </div>
        )}
        {msg.reactions && msg.reactions.length > 0 && <Reactions reactions={msg.reactions} fromMe={fromMe} />}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Typing indicator
   ──────────────────────────────────────────── */
const TypingRow = ({ chat }) => (
  <div className="flex justify-start mt-2">
    <div className="bubble-recv px-3.5 py-2.5 rounded-[18px] flex items-center gap-2" style={{ borderBottomLeftRadius: 6 }}>
      <span className="text-[12px] font-mono text-fg-faint">{chat.name} typing</span>
      <span className="flex items-center gap-1">
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
      </span>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Composer
   ──────────────────────────────────────────── */
const Composer = ({ onSend, recording, setRecording }) => {
  const [text, setText] = useState("");
  const ref = useRef(null);
  const canSend = text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    ref.current?.focus();
  };

  return (
    <div
      className="px-6 pb-5 pt-3 shrink-0"
      style={{
        background: "linear-gradient(to top, rgba(8,9,11,0.98) 0%, rgba(12,13,16,0.85) 100%)",
        backdropFilter: "blur(22px)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="composer-input rounded-[18px] flex items-end gap-1 px-2 py-2">
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.06] transition-colors shrink-0" aria-label="Attach">
          <IconAttach size={17} />
        </button>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Send a ghost message…"
          className="flex-1 resize-none bg-transparent outline-none text-[14px] py-2 px-1 max-h-32"
          style={{ color: "#F5F7FA", lineHeight: 1.45, scrollbarWidth: "none" }}
        />

        <button className="w-9 h-9 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.06] transition-colors shrink-0" aria-label="Timer">
          <IconTimer size={16} />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.06] transition-colors shrink-0" aria-label="Emoji">
          <IconSmile size={17} />
        </button>

        {canSend ? (
          <button
            onClick={submit}
            className="send-btn w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            aria-label="Send"
          >
            <IconSend size={15} />
          </button>
        ) : (
          <button
            onClick={() => setRecording((r) => !r)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              recording ? "" : "text-fg-muted hover:text-fg hover:bg-white/[0.06]"
            }`}
            style={recording ? { background: "var(--accent)", color: "#051A11", boxShadow: "0 0 20px var(--accent-glow)" } : {}}
            aria-label="Voice"
          >
            <IconMic size={16} />
          </button>
        )}
      </div>

      {/* Hint row */}
      <div className="flex items-center justify-between mt-2 px-1 text-[10.5px] font-mono text-fg-faint">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><IconLock size={10} /> end-to-end</span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1.5"><IconGhost size={11} /> vanish 5m</span>
          <span className="opacity-60">·</span>
          <span>0 metadata stored</span>
        </div>
        <div>shift + ↵ for newline</div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Vault Pane
   ──────────────────────────────────────────── */
const VaultPane = () => (
  <div className="flex-1 flex flex-col" style={{ background: "#0C0D10" }}>
    <header className="px-8 py-6 border-b hairline">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[14px] flex items-center justify-center mesh-card border border-white/[0.06]">
          <IconVault size={20} style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.018em]">Vault</h1>
          <p className="text-[11.5px] font-mono text-fg-faint mt-0.5">5 encrypted artefacts · 8.2 MB · local only</p>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(30,215,130,0.08)] border border-[rgba(30,215,130,0.20)]">
          <IconKey size={12} style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent)" }}>vault unlocked</span>
        </div>
      </div>
    </header>

    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid gap-2 max-w-[720px] mx-auto">
        {VAULT_ITEMS.map((item) => {
          const Glyph = item.icon === "key" ? IconKey : item.icon === "image" ? IconImage : IconFile;
          return (
            <div key={item.id} className="vault-row flex items-center gap-3 px-3 py-2.5 rounded-[12px] border border-white/[0.04] bg-[rgba(18,18,21,0.5)] transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(30,215,130,0.10)", color: "var(--accent)" }}>
                <Glyph size={16} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">{item.name}</div>
                <div className="text-[11px] font-mono text-fg-faint mt-0.5">{item.size} · from {item.from}</div>
              </div>
              <span className="text-[11px] font-mono text-fg-faint">{item.time}</span>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.05]">
                <IconMore size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="max-w-[720px] mx-auto mt-6 p-4 rounded-[14px] border border-white/[0.06] mesh-card flex items-center gap-3">
        <IconGhost size={18} style={{ color: "var(--accent)" }} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold">Self-destruct timers active</div>
          <div className="text-[11.5px] font-mono text-fg-faint mt-0.5">
            2 of 5 items will burn within the next 24 hours. Keys never leave this device.
          </div>
        </div>
        <button className="text-[11.5px] font-semibold px-3 py-1.5 rounded-full" style={{ color: "var(--accent)", background: "rgba(30,215,130,0.10)" }}>
          Manage
        </button>
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Empty state
   ──────────────────────────────────────────── */
const EmptyArena = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-center px-6 chat-bg">
    <div
      className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-5"
      style={{
        background: "linear-gradient(145deg, var(--accent) 0%, var(--accent-deep) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 44px var(--accent-glow)",
      }}
    >
      <IconShield size={32} strokeWidth={1.8} style={{ color: "#051A11" }} />
    </div>
    <h2 className="text-[22px] font-bold tracking-[-0.018em]">Pick a ghost to begin</h2>
    <p className="text-[13px] text-fg-muted mt-2 max-w-[360px] leading-relaxed">
      Every message is encrypted on this device with a key only your recipient holds. The relay sees nothing.
    </p>
  </div>
);

Object.assign(window, {
  ChatArenaHeader, VanishBanner, ReplyQuote, StatusTick, Reactions,
  VoiceNote, FileBubble, MessageRow, TypingRow, Composer, VaultPane, EmptyArena,
});
