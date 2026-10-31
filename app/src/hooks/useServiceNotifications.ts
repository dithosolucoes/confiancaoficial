import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useServiceNotifications = () => {
  const { profile } = useAuth();
  const previousCountRef = useRef<number | null>(null);
  const permissionGrantedRef = useRef(false);
  const notifiedJobsRef = useRef<Set<string>>(new Set());

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      permissionGrantedRef.current = true;
      return;
    }
    if (Notification.permission !== "denied") {
      const result = await Notification.requestPermission();
      permissionGrantedRef.current = result === "granted";
    }
  }, []);

  const updateBadge = useCallback((count: number) => {
    if ("setAppBadge" in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  }, []);

  // Update browser tab title with pending count
  const updateTabTitle = useCallback((count: number) => {
    const baseTitle = "Confiança Repara";
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  }, []);

  // Update favicon — overlay a red dot when there are available services
  const updateFavicon = useCallback((count: number) => {
    const FAVICON_ID = "dynamic-favicon";
    const ORIGINAL_HREF = "/favicon.ico";

    // Remove existing dynamic favicon
    document.querySelectorAll(`link[rel~="icon"]`).forEach((el) => el.parentNode?.removeChild(el));

    if (count <= 0) {
      const link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = "icon";
      link.href = ORIGINAL_HREF;
      document.head.appendChild(link);
      return;
    }

    // Draw favicon with red dot overlay
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      // Red dot
      const r = size * 0.28;
      ctx.beginPath();
      ctx.arc(size - r, r, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      const link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = "icon";
      link.href = canvas.toDataURL("image/png");
      document.head.appendChild(link);
    };
    img.onerror = () => {
      // Fallback: just set the original favicon
      const link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = "icon";
      link.href = ORIGINAL_HREF;
      document.head.appendChild(link);
    };
    img.src = ORIGINAL_HREF;
  }, []);

  const showNotification = useCallback((title: string, body: string, tag: string = "new-services") => {
    if (!permissionGrantedRef.current) return;
    if (!("Notification" in window)) return;

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag,
        } as NotificationOptions);
      });
    } else {
      new Notification(title, {
        body,
        icon: "/pwa-192x192.png",
        tag,
      });
    }
  }, []);

  const showPendingNotification = useCallback((count: number) => {
    const title = "Confiança Repara";
    const body = count === 1
      ? "Tem 1 novo serviço recebido!"
      : `Tem ${count} serviços recebidos!`;
    showNotification(title, body, "new-services");
  }, [showNotification]);

  // Check for services starting in ~1 hour and notify
  const checkUpcomingServices = useCallback(async (userId: string) => {
    const { data: jobs } = await supabase
      .from("service_requests")
      .select("id, scheduled_date, scheduled_time, appliance_type, estimated_arrival_time")
      .eq("technician_id", userId)
      .in("status", ["accepted", "in_progress", "budgeting"]);

    if (!jobs) return;

    const now = new Date();

    for (const job of jobs) {
      // Parse scheduled_date + scheduled_time into a Date
      const [hours, minutes] = (job.scheduled_time || "").split(":").map(Number);
      if (isNaN(hours) || isNaN(minutes)) continue;

      const serviceDate = new Date(job.scheduled_date + "T00:00:00");
      serviceDate.setHours(hours, minutes, 0, 0);

      const diffMs = serviceDate.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      // Notify if service is between 55 and 65 minutes away (1 hour window)
      if (diffMinutes >= 55 && diffMinutes <= 65 && !notifiedJobsRef.current.has(job.id)) {
        notifiedJobsRef.current.add(job.id);
        const body = `Serviço "${job.appliance_type}" em 1 hora. Informe a hora estimada de chegada.`;
        showNotification("Confiança Repara", body, `eta-reminder-${job.id}`);
      }
    }
  }, [showNotification]);

  useEffect(() => {
    if (profile?.user_type !== "technician") return;

    requestPermission();

    const userId = (profile as any).user_id;

    // Initial fetch
    const checkPendingCount = async () => {
      const { count } = await supabase
        .from("service_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const currentCount = count ?? 0;
      updateBadge(currentCount);
      updateTabTitle(currentCount);
      updateFavicon(currentCount);

      if (previousCountRef.current !== null && currentCount > previousCountRef.current) {
        showPendingNotification(currentCount);
      }
      previousCountRef.current = currentCount;
    };

    checkPendingCount();
    if (userId) checkUpcomingServices(userId);

    // Listen for realtime changes on service_requests
    const channelId = `svc-notifs-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        () => {
          checkPendingCount();
        }
      )
      // Listen for new in-app notifications to trigger browser push
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "technician_notifications",
          filter: `technician_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new as any;
          if (notif?.title && notif?.message) {
            showNotification(notif.title, notif.message, `notif-${notif.id}`);
          }
        }
      )
      .subscribe();

    // Poll every 30 seconds for pending count AND upcoming service reminders
    const interval = setInterval(() => {
      checkPendingCount();
      if (userId) checkUpcomingServices(userId);
    }, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
      if ("clearAppBadge" in navigator) {
        (navigator as any).clearAppBadge();
      }
      document.title = "Confiança Repara";
      updateFavicon(0);
    };
  }, [profile?.user_type, requestPermission, updateBadge, updateTabTitle, updateFavicon, showPendingNotification, checkUpcomingServices]);
};
