"use client";

import { memo, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Phone, Video, MoreVertical } from "lucide-react";

interface ChatHeaderProps {
  avatar?: string;
  initials: string;
  title: string;
  subtitle: string;
  isOnline?: boolean;
  isGroup?: boolean;
  onBack?: () => void;
  onSearch?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
  onMenu?: () => void;
}

const ActionButton = memo(function ActionButton({
  icon: Icon,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  onClick?: (() => void) | undefined;
  label: string;
}) {
  return (
    <motion.button
      className="nada-icon-btn"
      onClick={onClick}
      aria-label={label}
      whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.08)" }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <Icon size={20} />
    </motion.button>
  );
});

export function ChatHeader({
  avatar,
  initials,
  title,
  subtitle,
  isOnline = false,
  onBack,
  onSearch,
  onVoiceCall,
  onVideoCall,
  onMenu,
}: ChatHeaderProps) {
  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  return (
    <header className="nada-chat-header" role="banner" aria-label="Chat header">
      {/* Back button — visible on mobile only via CSS */}
      <button
        className="nada-back-btn nada-icon-btn"
        onClick={handleBack}
        aria-label="Go back"
      >
        <ArrowLeft size={20} />
      </button>

      {/* Avatar */}
      <div className="nada-avatar nada-avatar-sm" aria-hidden="true">
        {avatar ? (
          <img src={avatar} alt={title} draggable={false} />
        ) : (
          <span className="nada-avatar-initials">{initials}</span>
        )}
        {isOnline && <span className="nada-online-dot" />}
      </div>

      {/* Info */}
      <div className="nada-chat-header-info">
        <span className="nada-chat-header-name">{title}</span>
        <span
          className={`nada-chat-header-status${isOnline ? " online" : ""}`}
        >
          {subtitle}
        </span>
      </div>

      {/* Action buttons */}
      <div className="nada-chat-header-actions" role="toolbar" aria-label="Chat actions">
        <ActionButton icon={Search} onClick={onSearch} label="Search messages" />
        <ActionButton icon={Phone} onClick={onVoiceCall} label="Voice call" />
        <ActionButton icon={Video} onClick={onVideoCall} label="Video call" />
        <ActionButton icon={MoreVertical} onClick={onMenu} label="More options" />
      </div>
    </header>
  );
}

export default ChatHeader;
