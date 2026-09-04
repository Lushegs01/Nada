"use client";
import { motion } from "framer-motion";

export function Splash(): JSX.Element {
    return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-nada-bg">
      <div className="pointer-events-none absolute inset-0 nada-hero-gradient" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-60 blur-[110px] animate-aurora"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.45) 0%, rgba(37,99,235,0.20) 40%, rgba(16,217,138,0.10) 60%, transparent 75%)"
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-9 animate-fade-in">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-[28px] blur-2xl opacity-80 animate-logo-glow nada-logo-aura" />
          <div className="relative grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-[24px] nada-logo-aura">
            <img src="/logo.webp" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
        </motion.div>
        <div className="flex flex-col items-center gap-4">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.36em] text-nada-accent/85">
            NADA
          </span>
          <div className="flex items-center gap-1.5">
            <div className="nada-typing-dot" />
            <div className="nada-typing-dot" />
            <div className="nada-typing-dot" />
          </div>
        </div>
      </div>
    </main>
    );
}
