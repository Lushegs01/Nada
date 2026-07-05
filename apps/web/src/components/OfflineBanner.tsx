import type { motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useState, useEffect } from "react";

export function OfflineBanner({ isOnline }: { isOnline: boolean }): JSX.Element | null {
    if (isOnline) {
    return null;
    }

    return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 top-0 z-toast flex items-center justify-center gap-2 bg-nada-danger px-4 py-2.5 text-xs font-medium text-white shadow-md"
      initial={{ y: -40, opacity: 0 }}
    >
      <WifiOff size={14} />
      You are offline — messages will sync when reconnected
    </motion.div>
    );
}

export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(() =>
            typeof navigator === "undefined" ? true : navigator.onLine
          );
    useEffect(() => {
    const handleOnline = (): void => {
      setIsOnline(true);
    };
    const handleOffline = (): void => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    }, []);
    return isOnline;
}
