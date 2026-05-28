/* NADA components — sub-components used by the main App */

const { useState, useEffect, useRef, useMemo } = React;

/* ─────────────────────────────────────────────
   Avatar
   ──────────────────────────────────────────── */
const Avatar = ({ chat, size = 44, ring = false }) => {
  const fontSize = size <= 32 ? 11 : size <= 44 ? 14 : 18;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`${chat.avatar} flex items-center justify-center font-semibold text-white/95 rounded-full overflow-hidden`}
        style={{
          width: size, height: size, fontSize,
          letterSpacing: "0.02em",
          boxShadow: ring
            ? "inset 0 0 0 2px rgba(255,255,255,0.10), 0 0 0 2px #0C0D10, 0 0 0 4px var(--accent)"
            : "inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
      >
        {chat.initials}
      </div>
      {chat.online && (
        <span
          className="online-dot absolute"
          style={{ right: 0, bottom: 0 }}
        ></span>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Icon Rail (far-left global nav)
   ──────────────────────────────────────────── */
const IconRail = ({ active, onNavigate, unreadTotal }) => {
  const items = [
    { id: "chats",    Icon: IconChats,   label: "Chats",     badge: unreadTotal },
    { id: "calls",    Icon: IconCall,    label: "Calls" },
    { id: "vault",    Icon: IconVault,   label: "Vault" },
    { id: "archive",  Icon: IconArchive, label: "Archive" },
  ];

  return (
    <aside
      className="w-[68px] shrink-0 flex flex-col items-center py-4 border-r hairline relative z-10"
      style={{ background: "#08090B" }}
    >
      {/* Brand mark */}
      <div className="mb-6 relative">
        <div
          className="w-10 h-10 rounded-[12px] flex items-center justify-center font-bold text-[15px] tracking-tight"
          style={{
            background: "linear-gradient(145deg, var(--accent) 0%, var(--accent-deep) 100%)",
            color: "#051A11",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 22px var(--accent-glow)",
          }}
        >
          N
        </div>
      </div>

      <nav className="flex flex-col items-center gap-2 flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`rail-item ${active === item.id ? "active" : ""}`}
            aria-label={item.label}
          >
            <item.Icon size={20} strokeWidth={1.75} />
            {item.badge ? (
              <span
                className="absolute -top-0.5 -right-0.5 unread-badge"
                style={{ height: 16, minWidth: 16, fontSize: 10, padding: "0 4px" }}
              >
                {item.badge}
              </span>
            ) : null}
            <span className="tip">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => onNavigate("settings")}
          className={`rail-item ${active === "settings" ? "active" : ""}`}
          aria-label="Settings"
        >
          <IconSettings size={20} strokeWidth={1.75} />
          <span className="tip">Settings</span>
        </button>

        {/* Me avatar */}
        <div className="relative mt-1" title="You · @ghost.you">
          <div
            className="av-7 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold cursor-pointer"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10), 0 0 0 2px #08090B, 0 0 0 3px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.45)" }}
          >
            YO
          </div>
          <span className="online-dot absolute right-0 bottom-0" style={{ boxShadow: "0 0 0 2px #08090B, 0 0 10px var(--accent-glow)" }}></span>
        </div>
      </div>
    </aside>
  );
};

/* ─────────────────────────────────────────────
   Search field with secure indicator
   ──────────────────────────────────────────── */
const SearchField = ({ value, onChange }) => (
  <div className="px-3 pt-3">
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted/70 pointer-events-none">
        <IconSearch size={15} />
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search ghosts, chats, vault"
        className="w-full pl-9 pr-[110px] py-2.5 rounded-[12px] text-[13px] outline-none bg-[rgba(20,21,25,0.78)] border border-white/[0.06] focus:border-[hsl(var(--accent-h),var(--accent-s),var(--accent-l),0.55)] focus:bg-[rgba(20,21,25,0.96)] transition-all"
        style={{ color: "#F5F7FA" }}
      />
      {/* Inline secure handshake indicator */}
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[rgba(30,215,130,0.08)] border border-[rgba(30,215,130,0.20)]">
        <span className="secure-dot"></span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--accent)" }}>secure</span>
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Chat list row
   ──────────────────────────────────────────── */
const ChatRow = ({ chat, active, onClick }) => {
  const preview = (() => {
    if (chat.typing) {
      return (
        <span className="flex items-center gap-1" style={{ color: "var(--accent)" }}>
          <span className="inline-flex gap-[3px] mr-1">
            <span className="typing-dot" style={{ width: 4, height: 4 }}></span>
            <span className="typing-dot" style={{ width: 4, height: 4 }}></span>
            <span className="typing-dot" style={{ width: 4, height: 4 }}></span>
          </span>
          typing…
        </span>
      );
    }
    if (chat.previewKind === "self") {
      return <span className="text-fg-muted/80">{chat.preview}</span>;
    }
    if (chat.previewKind === "system") {
      return <span className="italic text-fg-faint">{chat.preview}</span>;
    }
    return <span className="text-fg-muted">{chat.preview}</span>;
  })();

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors rounded-[10px] mx-1.5 ${
        active ? "chat-item-active" : "hover:bg-white/[0.025]"
      }`}
    >
      <Avatar chat={chat} size={42} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14px] font-semibold text-fg truncate" style={{ letterSpacing: "-0.005em" }}>{chat.name}</span>
            {chat.securityLevel === "verified" && (
              <span style={{ color: "var(--accent)" }} title="Verified key">
                <IconShield size={11} strokeWidth={2.2} />
              </span>
            )}
            {chat.muted && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-faint">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <line x1="3" y1="3" x2="21" y2="21"/>
              </svg>
            )}
          </div>
          <span className={`text-[11px] font-mono shrink-0 ${active ? "text-fg" : "text-fg-faint"}`}>
            {chat.lastActivity}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="text-[12.5px] truncate">{preview}</div>
          {chat.unread > 0 && (
            <span className={chat.muted ? "unread-badge" : "unread-badge"} style={chat.muted ? { background: "rgba(168,176,188,0.35)", color: "#08090B", boxShadow: "none" } : {}}>
              {chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

/* ─────────────────────────────────────────────
   Chat List Pane
   ──────────────────────────────────────────── */
const ChatListPane = ({ chats, activeId, onSelect, search, setSearch }) => {
  const filtered = useMemo(() => {
    if (!search) return chats;
    const q = search.toLowerCase();
    return chats.filter((c) =>
      c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    );
  }, [chats, search]);

  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  return (
    <section
      className="w-[340px] shrink-0 border-r hairline flex flex-col relative z-[5]"
      style={{ background: "#101113" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-5 pb-2">
        <div>
          <h1 className="text-[20px] font-bold text-fg tracking-[-0.018em]">Chats</h1>
          <p className="text-[11px] text-fg-faint mt-0.5 font-mono">{chats.length} ghosts · all encrypted</p>
        </div>
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.05] transition-colors"
          aria-label="New chat"
        >
          <IconEdit size={17} />
        </button>
      </header>

      <SearchField value={search} onChange={setSearch} />

      {/* Filters */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
        {["All", "Unread", "Vanish", "Groups"].map((tab, i) => (
          <button
            key={tab}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors ${
              i === 0
                ? "text-[#051A11]"
                : "text-fg-muted hover:text-fg hover:bg-white/[0.04]"
            }`}
            style={i === 0 ? { background: "var(--accent)", boxShadow: "0 2px 10px var(--accent-glow)" } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pt-2 pb-3 no-scrollbar">
        {pinned.length > 0 && (
          <>
            <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
              <IconPin size={10} strokeWidth={2.4} className="text-fg-faint" />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-faint">Pinned</span>
            </div>
            <div className="flex flex-col">
              {pinned.map((c) => (
                <ChatRow key={c.id} chat={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
              ))}
            </div>
          </>
        )}

        {recent.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-faint">Recent</span>
            </div>
            <div className="flex flex-col">
              {recent.map((c) => (
                <ChatRow key={c.id} chat={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
              ))}
            </div>
          </>
        )}

        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-fg-faint text-[13px]">
            No ghosts matching "{search}"
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="px-4 py-3 border-t hairline flex items-center gap-2 text-[11px] font-mono text-fg-faint">
        <span className="secure-ring"></span>
        <span>relay: <span className="text-fg-muted">eu-04 · 2 hops</span></span>
        <span className="ml-auto" style={{ color: "var(--accent)" }}>↑ 42 KB/s</span>
      </div>
    </section>
  );
};

Object.assign(window, { Avatar, IconRail, SearchField, ChatRow, ChatListPane });
