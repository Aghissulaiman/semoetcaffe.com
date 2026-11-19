"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/cn";

import type { HomeBanner } from "@/types/api";

interface BannerCarouselProps {
  banners: HomeBanner[];
  onPressBanner?: (banner: HomeBanner) => void;
  className?: string;
}

/** Carousel banner beranda. */
export function BannerCarousel({ banners, onPressBanner, className }: BannerCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (banners.length === 0) return null;

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const first = track.firstElementChild as HTMLElement | null;
    if (!first) return;
    const slideWidth = first.offsetWidth + 12;
    setIndex(Math.round(track.scrollLeft / slideWidth));
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            onClick={() => onPressBanner?.(banner)}
            aria-label={banner.title ?? "Banner promo"}
            className="w-[84vw] max-w-[560px] shrink-0 snap-center overflow-hidden rounded-[20px] border border-line bg-primary-soft text-left focus-ring">
            {banner.imageUrl ? (
              <img
                src={banner.imageUrl}
                alt={banner.title ?? "Promo Semoet Cafe"}
                className="aspect-[16/7] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/7] w-full items-center justify-center text-sm font-semibold text-muted">
                {banner.title ?? "Semoet Cafe"}
              </div>
            )}
          </button>
        ))}
      </div>

      {banners.length > 1 ? (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {banners.map((banner, dotIndex) => (
            <span
              key={banner.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                dotIndex === index ? "w-[18px] bg-primary" : "w-1.5 bg-line",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
