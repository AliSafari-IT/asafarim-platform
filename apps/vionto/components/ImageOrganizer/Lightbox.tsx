"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  Download,
  Heart,
  Sliders,
  ImageIcon,
} from "lucide-react";
import type { ImageAsset } from "./types";
import { useEditReducer } from "./useEditReducer";
import { EditToolbar } from "./EditToolbar";
import { MetadataPanel } from "./MetadataPanel";

type LightboxProps = {
  images: ImageAsset[];
  initialIndex: number;
  onClose: () => void;
  onUpdateAsset: (id: string, updates: Partial<ImageAsset>) => void;
};

export function Lightbox({ images, initialIndex, onClose, onUpdateAsset }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const { editState, canUndo, canRedo, dispatch, reset } = useEditReducer();

  const current = images[currentIndex];
  const total = images.length;

  useEffect(() => {
    requestAnimationFrame(() => setIsEntering(false));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % total);
    reset();
  }, [total, reset]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + total) % total);
    reset();
  }, [total, reset]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "i":
        case "I":
          if (!e.ctrlKey && !e.metaKey) setShowInfo((v) => !v);
          break;
        case "f":
        case "F":
          if (!e.ctrlKey && !e.metaKey) {
            const newFav = !current.isFavorite;
            onUpdateAsset(current.id, { isFavorite: newFav });
          }
          break;
        case "r":
        case "R":
          if (!e.ctrlKey && !e.metaKey) dispatch({ type: "ROTATE_CW" });
          break;
        case "e":
        case "E":
          if (!e.ctrlKey && !e.metaKey) setShowEdit((v) => !v);
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) dispatch({ type: "REDO" });
            else dispatch({ type: "UNDO" });
          }
          break;
      }
    },
    [onClose, goNext, goPrev, current, onUpdateAsset, dispatch]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goPrev();
      else goNext();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) onClose();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      dispatch({ type: "SET_ZOOM", value: Math.max(0.5, Math.min(3, editState.zoom + delta)) });
    }
  };

  const imageTransform = `rotate(${editState.rotation}deg) scaleX(${editState.flipH ? -1 : 1}) scaleY(${editState.flipV ? -1 : 1}) scale(${editState.zoom})`;
  const imageFilter = `brightness(${editState.brightness}%) contrast(${editState.contrast}%) saturate(${editState.saturation}%)`;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = current.url;
    link.download = current.originalFilename;
    link.click();
  };

  return (
    <div
      ref={containerRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-300 ${
        isEntering ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Top Bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
            {currentIndex + 1} / {total}
          </span>
          <span className="hidden text-sm text-white/60 sm:block">{current.originalFilename}</span>
        </div>
        <div className="flex items-center gap-1">
          <TopButton icon={<Heart size={18} className={current.isFavorite ? "fill-[var(--coral)] text-[var(--coral)]" : ""} />} label="Favorite (F)" onClick={() => onUpdateAsset(current.id, { isFavorite: !current.isFavorite })} />
          <TopButton icon={<Sliders size={18} />} label="Edit (E)" onClick={() => setShowEdit((v) => !v)} active={showEdit} />
          <TopButton icon={<Info size={18} />} label="Info (I)" onClick={() => setShowInfo((v) => !v)} active={showInfo} />
          <TopButton icon={<Download size={18} />} label="Download" onClick={handleDownload} />
          <div className="mx-2 h-5 w-px bg-white/20" />
          <TopButton icon={<X size={20} />} label="Close (Esc)" onClick={onClose} />
        </div>
      </div>

      {/* Navigation Arrows */}
      {total > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white/80 backdrop-blur-sm transition hover:bg-white/20 hover:text-white sm:left-6 sm:p-3"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={goNext}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white/80 backdrop-blur-sm transition hover:bg-white/20 hover:text-white sm:right-6 sm:p-3"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Main Image */}
      <div className="flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-4rem)] items-center justify-center sm:max-w-[calc(100vw-8rem)]">
        <img
          src={current.url}
          alt={current.caption || current.originalFilename}
          className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg object-contain shadow-2xl transition-transform duration-200"
          style={{ transform: imageTransform, filter: imageFilter }}
          draggable={false}
        />
      </div>

      {/* Edit Toolbar */}
      {showEdit && (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
          <EditToolbar
            editState={editState}
            canUndo={canUndo}
            canRedo={canRedo}
            dispatch={dispatch}
            onReset={reset}
          />
        </div>
      )}

      {/* Filmstrip */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 overflow-x-auto bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => {
              setCurrentIndex(idx);
              reset();
            }}
            className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border-2 transition sm:h-14 sm:w-14 ${
              idx === currentIndex
                ? "border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/30"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {img.thumbnailUrl ? (
              <img
                src={img.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/10">
                <ImageIcon size={16} className="text-white/40" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Metadata Panel */}
      <MetadataPanel
        asset={current}
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        onUpdate={(updates) => onUpdateAsset(current.id, updates)}
      />
    </div>
  );
}

function TopButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`rounded-full p-2 transition ${
        active
          ? "bg-white/20 text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}
