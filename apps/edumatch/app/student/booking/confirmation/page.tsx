"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

export default function BookingConfirmationPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quoteId");
  const [status, setStatus] = useState<"loading" | "success" | "pending" | "error">("loading");

  useEffect(() => {
    if (!quoteId) {
      setStatus("error");
      return;
    }

    // Poll for booking status
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/quotes/${quoteId}/booking-status`);
        const data = await res.json();

        if (data.status === "PAID" || data.status === "SCHEDULED") {
          setStatus("success");
        } else if (data.status === "PENDING_PAYMENT") {
          setStatus("pending");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [quoteId]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
            <p className="text-[var(--color-text-muted)]">{t("edumatch.booking.confirmation.confirming")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white text-2xl">
            ✕
          </div>
          <h1 className="text-xl font-bold text-red-800 mb-2">{t("edumatch.booking.confirmation.errorTitle")}</h1>
          <p className="text-red-700 mb-6">
            {t("edumatch.booking.confirmation.errorDesc")}
          </p>
          <Link
            href={quoteId ? `/student/checkout/${quoteId}` : "/student"}
            className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            {t("edumatch.booking.confirmation.tryAgain")}
          </Link>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white text-2xl">
            ⏳
          </div>
          <h1 className="text-xl font-bold text-amber-800 mb-2">{t("edumatch.booking.confirmation.pendingTitle")}</h1>
          <p className="text-amber-700 mb-6">
            {t("edumatch.booking.confirmation.pendingDesc")}
          </p>
          <div className="h-2 w-32 bg-amber-200 rounded-full mx-auto overflow-hidden">
            <div className="h-full w-1/2 bg-amber-500 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">{t("edumatch.booking.confirmation.successTitle")}</h1>
        <p className="text-green-700 mb-6">
          {t("edumatch.booking.confirmation.successDesc")}
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/student/bookings"
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition"
          >
            {t("edumatch.booking.confirmation.viewBookings")}
          </Link>
          <Link
            href="/student/inquiry/new"
            className="rounded-lg border border-green-300 px-6 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition"
          >
            {t("edumatch.booking.confirmation.askAnother")}
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
        <strong>{t("edumatch.booking.confirmation.nextTitle")}</strong>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>{t("edumatch.booking.confirmation.nextTutor")}</li>
          <li>{t("edumatch.booking.confirmation.nextCalendar")}</li>
          <li>{t("edumatch.booking.confirmation.nextPayment")}</li>
        </ul>
      </div>
    </div>
  );
}
