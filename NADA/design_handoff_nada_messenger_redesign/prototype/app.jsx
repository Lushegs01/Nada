/* NADA — encrypted desktop messenger
   Main app shell + state */

const { useState, useEffect, useMemo, useRef } = React;

/* ── Tweak defaults ───────────────────────────────────────── */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "mint",
  "vanishBanner": true,
  "density": "comfy"
}/*EDITMODE-END*/;

/* Accent palette (hue, sat, light) */
const ACCENT_MAP = {
  mint:   { h: 152, s: 75, l: 50, label: "Mint" },       // NADA default
  teal:   { h: 174, s: 70, l: 48, label: "Cyber teal" },
  violet: { h: 262, s: 60, l: 62, label: "Deep violet" },
  amber:  { h: 38,  s: 85, l: 58, label: "Signal amber"},
};

const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply accent to CSS vars
  useEffect(() => {
    const a = ACCENT_MAP[tweaks.accent] || ACCENT_MAP.mint;
    const root = document.documentElement;
    root.style.setProperty("--accent-h", a.h);
    root.style.setProperty("--accent-s", a.s + "%");
    root.style.setProperty("--accent-l", a.l + "%");
  }, [tweaks.accent]);

  const [nav, setNav] = useState("chats");
  const [activeChat, setActiveChat] = useState("c1");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);

  // Conversations: editable so "send" works
  const [conversations, setConversations] = useState(() =>
    JSON.parse(JSON.stringify(CONVERSATIONS))
  );

  const chat = CHATS.find((c) => c.id === activeChat);
  const messages = conversations[activeChat] || [];

  const unreadTotal = useMemo(
    () => CHATS.reduce((acc, c) => acc + (c.unread || 0), 0),
    []
  );

  const handleSend = (text) => {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setConversations((prev) => {
      const list = prev[activeChat] ? [...prev[activeChat]] : [];
      list.push({
        id: "m" + Math.random().toString(36).slice(2, 8),
        from: "me", type: "text", text, time, status: "sending",
      });
      return { ...prev, [activeChat]: list };
    });
    // Simulate delivery
    setTimeout(() => {
      setConversations((prev) => {
        const list = [...(prev[activeChat] || [])];
        const last = list[list.length - 1];
        if (last && last.from === "me") {
          list[list.length - 1] = { ...last, status: "delivered" };
        }
        return { ...prev, [activeChat]: list };
      });
    }, 700);
    setTimeout(() => {
      setConversations((prev) => {
        const list = [...(prev[activeChat] || [])];
        const last = list[list.length - 1];
        if (last && last.from === "me") {
          list[list.length - 1] = { ...last, status: "read" };
        }
        return { ...prev, [activeChat]: list };
      });
    }, 1600);
  };

  // Auto-scroll to bottom
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeChat]);

  /* Main pane content by nav */
  const renderMain = () => {
    if (nav === "vault") return <VaultPane />;
    if (nav === "calls") return <PlaceholderPane title="Calls" subtitle="Encrypted voice & video, peer-to-peer." Icon={IconPhone} />;
    if (nav === "archive") return <PlaceholderPane title="Archive" subtitle="Chats you've put to rest. Still end-to-end." Icon={IconArchive} />;
    if (nav === "settings") return <PlaceholderPane title="Settings" subtitle="Identity, devices, key rotation, relays." Icon={IconSettings} />;

    // Default: chats
    if (!chat) return <EmptyArena />;
    return (
      <div className="flex-1 flex flex-col min-w-0 chat-bg">
        <ChatArenaHeader chat={chat} />
        {tweaks.vanishBanner && <VanishBanner />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-2">
          <div className="max-w-[760px] mx-auto w-full">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const prevFromSame = prev && prev.from === m.from && m.kind !== "date" && prev.kind !== "date";
              return <MessageRow key={m.id} msg={m} prevFromSame={prevFromSame} />;
            })}
            {chat.typing && <TypingRow chat={chat} />}
          </div>
        </div>

        <Composer onSend={handleSend} recording={recording} setRecording={setRecording} />
      </div>
    );
  };

  /* Show chat list pane only when nav is chats */
  const showChatList = nav === "chats";

  return (
    <div className="h-full w-full flex relative" style={{ background: "#08090B" }}>
      <IconRail active={nav} onNavigate={setNav} unreadTotal={unreadTotal} />

      {showChatList && (
        <ChatListPane
          chats={CHATS}
          activeId={activeChat}
          onSelect={(id) => { setActiveChat(id); setNav("chats"); }}
          search={search}
          setSearch={setSearch}
        />
      )}

      {renderMain()}

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Accent" />
        <AccentSwatches
          value={tweaks.accent}
          onChange={(v) => setTweak("accent", v)}
        />

        <TweakSection label="Layout" />
        <TweakToggle
          label="Vanish banner"
          value={tweaks.vanishBanner}
          onChange={(v) => setTweak("vanishBanner", v)}
        />
        <TweakRadio
          label="Density"
          value={tweaks.density}
          options={["cosy", "comfy", "airy"]}
          onChange={(v) => setTweak("density", v)}
        />
      </TweaksPanel>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Accent swatch picker — custom control for paired-color swatches
   ──────────────────────────────────────────── */
const ACCENT_SWATCHES = [
  { key: "mint",   colors: ["#1ED782", "#11A765"], label: "Mint" },
  { key: "teal",   colors: ["#2EDFC4", "#1F9B86"], label: "Teal" },
  { key: "violet", colors: ["#9F7BFF", "#6A48E0"], label: "Violet" },
  { key: "amber",  colors: ["#F5A05A", "#D9774C"], label: "Amber" },
];

const AccentSwatches = ({ value, onChange }) => (
  <div style={{ padding: "6px 14px 14px" }}>
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
      {ACCENT_SWATCHES.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            title={s.label}
            style={{
              position: "relative",
              width: 40, height: 40,
              borderRadius: 999,
              cursor: "pointer",
              border: "none",
              background: `linear-gradient(135deg, ${s.colors[0]} 0%, ${s.colors[1]} 100%)`,
              transform: active ? "scale(1.08)" : "scale(1)",
              transition: "transform 0.18s ease, box-shadow 0.18s ease",
              boxShadow: active
                ? `0 0 0 2px #08090B, 0 0 0 4px ${s.colors[0]}, 0 0 16px ${s.colors[0]}CC`
                : "inset 0 0 0 1px rgba(255,255,255,0.10), 0 1px 4px rgba(0,0,0,0.4)",
            }}
            aria-label={s.label}
          />
        );
      })}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Placeholder pane for non-implemented nav items
   ──────────────────────────────────────────── */
const PlaceholderPane = ({ title, subtitle, Icon }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center px-6 chat-bg">
    <div
      className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-5"
      style={{
        background: "rgba(26,27,31,0.85)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Icon size={30} strokeWidth={1.6} style={{ color: "var(--accent)" }} />
    </div>
    <h2 className="text-[22px] font-bold tracking-[-0.018em]">{title}</h2>
    <p className="text-[13px] text-fg-muted mt-2 max-w-[360px] leading-relaxed">{subtitle}</p>
    <span className="mt-5 text-[10.5px] font-mono uppercase tracking-[0.12em] text-fg-faint">demo · view only</span>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
