"use client";

/**
 * Voucher & Poin — voucher milik user, klaim kode, katalog hadiah + riwayat poin.
 */
import { Gift, History, RefreshCw, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { VoucherCard } from "@/components/voucher-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { TextField } from "@/components/ui/text-field";
import { formatDate } from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { getPoints, listPointsHistory, listRewards, redeemReward } from "@/services/loyalty.service";
import { claimVoucher, listVouchers } from "@/services/promo.service";
import { useAuthStore } from "@/store/auth-store";

import type { LoyaltyReward, PointHistoryEntry, PointsSummary, UserVoucher } from "@/types/api";

type Tab = "vouchers" | "rewards" | "points";

const TAB_LABELS: { value: Tab; label: string; icon: typeof Ticket }[] = [
  { value: "vouchers", label: "Voucher Saya", icon: Ticket },
  { value: "rewards", label: "Tukar Poin", icon: Gift },
  { value: "points", label: "Riwayat Poin", icon: History },
];

const MUTATION_LABEL: Record<string, string> = {
  earn: "Dapat poin",
  redeem: "Tukar poin",
  expire: "Poin kedaluwarsa",
  adjustment: "Penyesuaian",
};

export default function VouchersPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "authenticated";

  const [tab, setTab] = useState<Tab>("vouchers");
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const [voucherRes, rewardList, pointsSummary] = await Promise.all([
          listVouchers({ limit: 50 }),
          listRewards(),
          getPoints(),
        ]);
        setVouchers(voucherRes.items);
        setRewards(rewardList);
        setPoints(pointsSummary);
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat data loyalitas"));
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  };

  const claim = async () => {
    const code = claimCode.trim().toUpperCase();
    if (!code) return;
    setClaimBusy(true);
    setClaimMessage(null);
    try {
      await claimVoucher(code);
      setClaimMessage({ tone: "success", text: `Voucher ${code} berhasil diklaim!` });
      setClaimCode("");
      await load(false);
      setTab("vouchers");
    } catch (err) {
      setClaimMessage({ tone: "danger", text: apiErrorFrom(err, "Gagal klaim voucher") });
    } finally {
      setClaimBusy(false);
    }
  };

  const redeem = async (reward: LoyaltyReward) => {
    if (!points || points.balance < reward.pointsCost) return;
    setRedeeming(reward.id);
    setClaimMessage(null);
    try {
      await redeemReward(reward.id);
      setClaimMessage({ tone: "success", text: `Berhasil ditukar: ${reward.name}` });
      await load(false);
      setTab("vouchers");
    } catch (err) {
      setClaimMessage({ tone: "danger", text: apiErrorFrom(err, "Gagal menukar poin") });
    } finally {
      setRedeeming(null);
    }
  };

  if (status === "loading") return <Loader label="Memuat voucher…" />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Voucher & Poin" onBack={() => router.back()} className="mb-4" />
        <EmptyState
          icon={Ticket}
          title="Masuk untuk melihat voucher"
          description="Klaim voucher, kumpulkan poin, dan tukar hadiah dengan akun Semoet Cafe."
          actionLabel="Masuk / Daftar"
          onAction={() => router.push("/auth/login")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <ScreenHeading title="Voucher & Poin" onBack={() => router.back()} />
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Muat ulang"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
          <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
        </button>
      </div>

      {loading ? (
        <Loader label="Memuat voucher…" />
      ) : error && !points ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Saldo poin */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Saldo poin</p>
                <p className="text-[26px] font-black leading-tight text-primary">
                  {(points?.balance ?? 0).toLocaleString("id-ID")}
                </p>
              </div>
              {points?.tier ? <Badge label={points.tier.name} tone="gold" /> : null}
            </div>
            {points?.expiringSoon ? (
              <p className="mt-1.5 text-xs text-warning">
                {points.expiringSoon.toLocaleString("id-ID")} poin kedaluwarsa
                {points.nextExpiryAt ? ` ${formatDate(points.nextExpiryAt)}` : ""}
              </p>
            ) : null}
          </Card>

          {/* Klaim kode */}
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2.5">
              <div className="min-w-0 flex-1">
                <TextField
                  label="Punya kode promo?"
                  placeholder="MASUKKAN KODE"
                  value={claimCode}
                  onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
                  autoCapitalize="characters"
                />
              </div>
              <Button
                title="Klaim"
                size="sm"
                fullWidth={false}
                onClick={() => void claim()}
                loading={claimBusy}
                className="mb-0.5"
              />
            </div>
            {claimMessage ? (
              <Badge
                tone={claimMessage.tone === "success" ? "success" : "danger"}
                label={claimMessage.text}
              />
            ) : null}
          </div>

          {/* Tab */}
          <div className="flex flex-wrap gap-2">
            {TAB_LABELS.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                active={tab === item.value}
                onClick={() => setTab(item.value)}
              />
            ))}
          </div>

          {/* Konten tab */}
          {tab === "vouchers" ? (
            <div className="flex flex-col gap-3">
              {vouchers.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">
                  Belum ada voucher. Klaim kode promo di atas atau belanja untuk mendapat voucher.
                </p>
              ) : (
                vouchers.map((voucher) => (
                  <VoucherCard
                    key={voucher.id}
                    voucher={voucher}
                    onUse={() => router.push("/menu")}
                  />
                ))
              )}
            </div>
          ) : null}

          {tab === "rewards" ? (
            <div className="flex flex-col gap-3">
              {rewards.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">
                  Belum ada hadiah yang bisa ditukar.
                </p>
              ) : (
                rewards.map((reward) => {
                  const affordable = (points?.balance ?? 0) >= reward.pointsCost;
                  return (
                    <Card key={reward.id}>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 flex-1 text-[15px] font-extrabold text-ink">
                            {reward.name}
                          </p>
                          <p className="shrink-0 text-sm font-extrabold text-primary">
                            {reward.pointsCost.toLocaleString("id-ID")} poin
                          </p>
                        </div>
                        {reward.description ? (
                          <p className="text-xs text-muted">{reward.description}</p>
                        ) : null}
                        <Button
                          title={affordable ? "Tukar Sekarang" : "Poin Kurang"}
                          size="sm"
                          variant={affordable ? "soft" : "outline"}
                          disabled={!affordable}
                          loading={redeeming === reward.id}
                          onClick={() => void redeem(reward)}
                          className="mt-1 self-start"
                          fullWidth={false}
                        />
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          ) : null}

          {tab === "points" ? <PointsHistory /> : null}
        </div>
      )}
    </div>
  );
}

function PointsHistory() {
  const [entries, setEntries] = useState<PointHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPointsHistory(1, 30)
      .then((res) => setEntries(res.items))
      .catch((err) => setError(apiErrorFrom(err, "Gagal memuat riwayat poin")));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!entries) return <Loader label="Memuat riwayat…" fullscreen={false} />;

  if (entries.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted">Belum ada aktivitas poin.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">
                {entry.description ?? MUTATION_LABEL[entry.mutationType] ?? "Aktivitas"}
              </p>
              <p className="text-xs text-muted">{formatDate(entry.createdAt)}</p>
            </div>
            <p
              className={`shrink-0 text-[15px] font-extrabold ${
                entry.pointsDelta >= 0 ? "text-success" : "text-danger"
              }`}>
              {entry.pointsDelta >= 0 ? "+" : ""}
              {entry.pointsDelta.toLocaleString("id-ID")}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
