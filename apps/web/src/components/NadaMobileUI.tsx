"use client";

import React, { useState } from "react";
import { 
  Search, 
  Camera, 
  MoreVertical, 
  Archive, 
  MessageSquare, 
  CircleDot, 
  Users, 
  Phone, 
  Pin, 
  VolumeX, 
  Plus,
  Check,
  CheckCheck
} from "lucide-react";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";

/**
 * Premium Rounded Search Bar
 */
export const SearchBar = ({ 
  value, 
  onChange, 
  placeholder = "Search chats" 
}: { 
  value: string; 
  onChange: (val: string) => void;
  placeholder?: string;
}) => (
  <div className="px-4 py-2">
    <div className="relative flex items-center group">
      <Search className="absolute left-4 w-4 h-4 text-nada-secondary/60 group-focus-within:text-nada-accent transition-colors" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-11 pr-4 bg-nada-muted/50 border-none rounded-full text-sm text-nada-primary placeholder:text-nada-secondary/50 focus:ring-2 focus:ring-nada-accent/20 transition-all outline-none"
      />
    </div>
  </div>
);

/**
 * Filter Chips for Chat List
 */
export const FilterChips = ({ 
  activeFilter, 
  onFilterChange,
  unreadCount = 0
}: { 
  activeFilter: string; 
  onFilterChange: (filter: string) => void;
  unreadCount?: number;
}) => {
  const filters = [
    { id: "all", label: "All" },
    { id: "favorites", label: "Favorites" },
    { id: "unread", label: "Unread", count: unreadCount },
    { id: "groups", label: "Groups" }
  ];

  return (
    <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onFilterChange(filter.id)}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
            activeFilter === filter.id 
              ? "bg-nada-accent/15 text-nada-accent border border-nada-accent/20" 
              : "bg-nada-muted/50 text-nada-secondary border border-transparent hover:bg-nada-muted"
          )}
        >
          {filter.label}
          {filter.count !== undefined && filter.count > 0 && (
            <span className={cn(
              "flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px]",
              activeFilter === filter.id ? "bg-nada-accent text-white" : "bg-nada-secondary/20 text-nada-secondary"
            )}>
              {filter.count > 99 ? "99+" : filter.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

/**
 * Archived Row
 */
export const ArchivedRow = ({ count = 0 }: { count?: number }) => (
  <button className="flex items-center justify-between w-full px-5 py-3 hover:bg-nada-muted/30 transition-colors">
    <div className="flex items-center gap-4">
      <Archive className="w-5 h-5 text-nada-accent" />
      <span className="text-sm font-semibold text-nada-primary">Archived</span>
    </div>
    {count > 0 && (
      <span className="text-xs font-bold text-nada-accent">{count}</span>
    )}
  </button>
);

/**
 * Premium Chat List Item
 */
export const ChatListItem = ({
  name,
  preview,
  timestamp,
  unreadCount,
  avatar,
  initials,
  isPinned,
  isMuted,
  isOnline,
  status, // 'sent', 'delivered', 'read'
  isSelected,
  onClick
}: {
  name: string;
  preview: string;
  timestamp: string;
  unreadCount: number;
  avatar?: string;
  initials?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isOnline?: boolean;
  status?: "sent" | "delivered" | "read";
  isSelected?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-4 w-full px-4 py-3.5 text-left transition-all border-b border-nada-border/10",
      isSelected ? "bg-nada-accent/5" : "hover:bg-nada-muted/30 active:scale-[0.99]"
    )}
  >
    {/* Avatar Section */}
    <div className="relative shrink-0">
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-nada-muted flex items-center justify-center ring-2 ring-nada-border/10">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg font-bold text-nada-secondary/60">{initials}</span>
        )}
      </div>
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-nada-success border-2 border-nada-bg shadow-sm" />
      )}
    </div>

    {/* Content Section */}
    <div className="flex-1 min-w-0 py-0.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-bold text-[15px] text-nada-primary truncate">{name}</h3>
        <span className={cn(
          "text-[11px] whitespace-nowrap",
          unreadCount > 0 ? "text-nada-accent font-bold" : "text-nada-secondary/60"
        )}>
          {timestamp}
        </span>
      </div>
      
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/40"
            )}>
              {status === "sent" ? <Check size={14} /> : <CheckCheck size={14} />}
            </span>
          )}
          <p className={cn(
            "text-sm truncate leading-tight",
            unreadCount > 0 ? "text-nada-primary font-medium" : "text-nada-secondary/70"
          )}>
            {preview}
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {isMuted && <VolumeX size={14} text-nada-secondary/30 />}
          {isPinned && <Pin size={14} className="text-nada-secondary/40 -rotate-45" />}
          {unreadCount > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-nada-accent text-[10px] font-black text-white shadow-sm shadow-nada-accent/20">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  </button>
);

/**
 * Mobile Bottom Navigation
 */
export const BottomNavigation = ({ 
  activeTab, 
  onTabChange,
  unreadCount = 0
}: { 
  activeTab: string; 
  onTabChange: (tab: string) => void;
  unreadCount?: number;
}) => {
  const tabs = [
    { id: "chats", label: "Chats", icon: MessageSquare, badge: unreadCount },
    { id: "updates", label: "Updates", icon: CircleDot },
    { id: "communities", label: "Communities", icon: Users },
    { id: "calls", label: "Calls", icon: Phone },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-nada-surface/80 backdrop-blur-xl border-t border-nada-border/30 pb-safe-area">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center w-full h-full transition-all active:scale-95"
            >
              <div className={cn(
                "relative flex items-center justify-center px-5 py-1 rounded-2xl transition-all",
                isActive ? "bg-nada-accent/10" : ""
              )}>
                <Icon className={cn(
                  "w-6 h-6 transition-colors",
                  isActive ? "text-nada-accent" : "text-nada-secondary/50"
                )} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-nada-accent text-[10px] font-black text-white border-2 border-nada-surface shadow-sm">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-bold mt-1.5 tracking-tight transition-colors",
                isActive ? "text-nada-primary" : "text-nada-secondary/50"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Floating Action Button
 */
export const FloatingComposeButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="fixed right-6 bottom-24 z-[90] w-14 h-14 rounded-2xl bg-nada-accent text-white shadow-lg shadow-nada-accent/30 flex items-center justify-center active:scale-90 transition-all hover:brightness-110"
  >
    <Plus size={28} />
  </button>
);

/**
 * Mobile Chats Header
 */
export const MobileHeader = ({ 
  displayName, 
  onCameraClick, 
  onMoreClick 
}: { 
  displayName: string;
  onCameraClick: () => void;
  onMoreClick: () => void;
}) => (
  <header className="flex items-center justify-between px-5 pt-safe-area pb-2 bg-nada-bg sticky top-0 z-[80]">
    <div className="pt-4 flex items-center justify-between w-full">
      <h1 className="text-2xl font-black tracking-tight text-nada-primary">NADA</h1>
      <div className="flex items-center gap-2">
        <button 
          onClick={onCameraClick}
          className="p-2 text-nada-secondary hover:bg-nada-muted/50 rounded-full transition-colors"
        >
          <Camera size={22} />
        </button>
        <button 
          onClick={onMoreClick}
          className="p-2 text-nada-secondary hover:bg-nada-muted/50 rounded-full transition-colors"
        >
          <MoreVertical size={22} />
        </button>
      </div>
    </div>
  </header>
);

/**
 * Main Mobile Chats Home Container
 */
export const MobileChatsHome = ({
  children,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  unreadTotal,
  onComposeClick,
  activeTab,
  onTabChange,
  headerProps
}: {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  unreadTotal: number;
  onComposeClick: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  headerProps: {
    displayName: string;
    onCameraClick: () => void;
    onMoreClick: () => void;
  };
}) => (
  <div className="flex flex-col h-full bg-nada-bg overflow-hidden">
    <MobileHeader {...headerProps} />
    <SearchBar value={searchQuery} onChange={onSearchChange} />
    <FilterChips 
      activeFilter={activeFilter} 
      onFilterChange={onFilterChange} 
      unreadCount={unreadTotal}
    />
    
    <div className="flex-1 overflow-y-auto">
      {children}
    </div>

    <FloatingComposeButton onClick={onComposeClick} />
    <BottomNavigation 
      activeTab={activeTab} 
      onTabChange={onTabChange} 
      unreadCount={unreadTotal} 
    />
  </div>
);

/**
 * Empty Chat List State
 */
export const EmptyChatListState = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-20 px-10 text-center animate-fade-in">
    <div className="w-20 h-20 rounded-3xl bg-nada-muted flex items-center justify-center text-nada-secondary/30 mb-6">
      <MessageSquare size={40} />
    </div>
    <h3 className="text-lg font-bold text-nada-primary mb-2">No conversations yet</h3>
    <p className="text-sm text-nada-secondary mb-8 leading-relaxed">
      Start an anonymous chat by adding a contact or creating a group.
    </p>
    <button
      onClick={onAdd}
      className="px-6 py-3 rounded-xl bg-nada-accent text-white font-bold text-sm shadow-lg shadow-nada-accent/20 active:scale-95 transition-all"
    >
      Add your first contact
    </button>
  </div>
);

/**
 * Chat List Item Skeleton
 */
export const ChatListSkeleton = () => (
  <div className="space-y-1">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-center gap-4 px-4 py-3.5">
        <div className="w-14 h-14 rounded-2xl bg-nada-muted animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex justify-between items-center">
            <div className="h-4 w-1/3 bg-nada-muted animate-pulse rounded-md" />
            <div className="h-3 w-10 bg-nada-muted animate-pulse rounded-md" />
          </div>
          <div className="h-3.5 w-2/3 bg-nada-muted animate-pulse rounded-md" />
        </div>
      </div>
    ))}
  </div>
);
