"use client";

/**
 * Halaman QnA Reservasi Semoet Cafe.
 *
 * Menampilkan sapaan, tautan penting (foto area, pricelist, rute), template
 * form yang bisa disalin, lalu detail tiap topik dalam bentuk accordion.
 */
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Heart,
  Images,
  MapPin,
  Music,
  Navigation,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScreenHeader } from "@/components/ui/screen-header";
import {
  RESERVATION_FORM_TEMPLATE,
  RESERVATION_GREETING,
  RESERVATION_LINKS,
  RESERVATION_SECTIONS,
  RESERVATION_WHATSAPP,
} from "@/lib/reservation-content";

const SECTION_ICON: Record<string, LucideIcon> = {
  form: FileText,
  dp: Wallet,
  wedding: Heart,
  "sistem-event": Wallet,
  lokasi: MapPin,
  "live-music": Music,
  booked: CheckCircle2,
};

const LINK_ICON: Record<string, LucideIcon> = {
  maps: MapPin,
  area: Images,
  pricelist: Utensils,
};

interface ReservationQnaProps {
  /** Tampilkan tombol kembali (dipakai saat dibuka sebagai layar stack). */
  showBack?: boolean;
}

export function ReservationQna({ showBack = false }: ReservationQnaProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const copyForm = async () => {
    try {
      await navigator.clipboard.writeText(RESERVATION_FORM_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard bisa ditolak browser; biarkan pengguna menyalin manual.
    }
  };

  const mapsUrl = RESERVATION_LINKS.find((link) => link.id === "maps")?.url;

  return (
    <div className="flex flex-col">
      <ScreenHeader
        title="Reservasi & Event"
        subtitle="Tanya jawab seputar reservasi"
        hideBack={!showBack}
        onBack={showBack ? () => router.back() : undefined}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 px-4 py-4">
        <Card className="border-primary bg-primary">
          <p className="text-[15px] font-bold leading-[22px] text-white">{RESERVATION_GREETING}</p>
        </Card>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-extrabold text-ink">Link Penting</h2>
          {RESERVATION_LINKS.map((link) => {
            const Icon = LINK_ICON[link.id] ?? ExternalLink;
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition hover:border-primary/40 hover:bg-primary-soft/30 focus-ring">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-ink">{link.label}</span>
                  <span className="block text-xs text-muted">{link.hint}</span>
                </span>
                <ExternalLink size={17} className="shrink-0 text-muted" />
              </a>
            );
          })}
        </section>

        <Card>
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="text-[15px] font-extrabold text-ink">Format Reservasi Event</h2>
            {copied ? <Badge label="Tersalin!" tone="success" size="sm" /> : null}
          </div>
          <pre className="mt-2.5 whitespace-pre-wrap rounded-xl border border-line bg-primary-soft p-3 font-sans text-[13px] leading-[21px] text-ink">
            {RESERVATION_FORM_TEMPLATE}
          </pre>
          <Button
            title={copied ? "Form tersalin" : "Salin format form"}
            icon={copied ? ClipboardCheck : ClipboardCopy}
            variant="soft"
            size="sm"
            fullWidth={false}
            onClick={() => void copyForm()}
            className="mt-3"
          />
          <p className="mt-2.5 text-xs leading-[18px] text-muted">
            Kirimkan form yang sudah diisi ke kami lewat WhatsApp agar dicek ketersediaannya
            {RESERVATION_WHATSAPP ? ` (${RESERVATION_WHATSAPP})` : ""}.
          </p>
        </Card>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-extrabold text-ink">Tanya Jawab</h2>
          {RESERVATION_SECTIONS.map((section) => (
            <Accordion
              key={section.id}
              title={section.title}
              subtitle={section.subtitle}
              defaultOpen={section.id === "form"}
              icon={SECTION_ICON[section.id] ?? AlertCircle}>
              <div className="flex flex-col gap-2.5 pt-1">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${section.id}-p-${index}`} className="text-[13px] leading-[21px] text-ink">
                    {paragraph}
                  </p>
                ))}

                {section.bullets?.length ? (
                  <div className="flex flex-col gap-[7px]">
                    {section.bullets.map((bullet, index) => (
                      <div key={`${section.id}-b-${index}`} className="flex gap-2">
                        <span className="text-[13px] leading-[21px] text-primary">•</span>
                        <p className="flex-1 text-[13px] leading-[21px] text-ink">{bullet}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.note ? (
                  <div className="mt-0.5 rounded-[10px] bg-primary-soft p-2.5">
                    <p className="text-xs leading-[19px] text-muted">{section.note}</p>
                  </div>
                ) : null}

                {section.id === "lokasi" && mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3.5 py-2 text-[13px] font-bold text-primary transition hover:bg-cream">
                    <Navigation size={15} />
                    Buka rute di Maps
                  </a>
                ) : null}
              </div>
            </Accordion>
          ))}
        </section>
      </div>
    </div>
  );
}
