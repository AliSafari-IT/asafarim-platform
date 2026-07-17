"use client";

import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { NormalizedTrackMetadata } from "@/lib/server/pixabay-music";
import {
  makeSpacesTrackMetadata,
  makeCommonTrackMetadata,
  type AudioLibraryItem,
} from "@/lib/music-library";
import type { SubtitleConfig as SubtitleConfigType } from "@/lib/server/render-manifest";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  ArrowRight,
  ArrowUpDown,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  CloudUpload,
  Copy,
  Download,
  EyeOff,
  FileAudio,
  Globe,
  ImagePlus,
  ListChecks,
  Lock,
  MapPin,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { ScriptEditor, type ScriptVersion } from "./ScriptEditor";
import { SubtitleConfig } from "./SubtitleConfig";
import { GooglePhotosImportPanel } from "./GooglePhotosImportPanel";
import { ViontoTopbarControls } from "./ViontoNav";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import {
  DEFAULT_VISUAL_STYLE,
  VISUAL_STYLE_OPTIONS,
  normalizeVisualStyle,
  type VisualStyle,
} from "@/lib/visual-styles";
import {
  PRIVACY_LEVELS,
  OCCASION_SUGGESTIONS,
  MOOD_SUGGESTIONS,
} from "@/lib/album-constants";
import {
  VIDEO_TEMPLATES,
  getVideoTemplate,
  type VideoTemplateId,
} from "@/lib/video-templates";

function ViontoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f36f56" />
          <stop offset="100%" stopColor="#e8b45d" />
        </linearGradient>
      </defs>
      <rect
        x="4"
        y="9"
        width="28"
        height="19"
        rx="3"
        stroke="url(#vm-g)"
        strokeWidth="1.8"
      />
      <rect
        x="4"
        y="11"
        width="3"
        height="2.5"
        rx="0.5"
        fill="url(#vm-g)"
        opacity="0.65"
      />
      <rect
        x="4"
        y="15.5"
        width="3"
        height="2.5"
        rx="0.5"
        fill="url(#vm-g)"
        opacity="0.65"
      />
      <rect
        x="29"
        y="11"
        width="3"
        height="2.5"
        rx="0.5"
        fill="url(#vm-g)"
        opacity="0.65"
      />
      <rect
        x="29"
        y="15.5"
        width="3"
        height="2.5"
        rx="0.5"
        fill="url(#vm-g)"
        opacity="0.65"
      />
      <path
        d="M14 14.5 L14 22 M18 12 L18 24 M22 14.5 L22 22"
        stroke="url(#vm-g)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "#create", labelKey: "vionto.nav.create", Icon: Wand2 },
  { href: "#uploads", labelKey: "vionto.nav.uploads", Icon: CloudUpload },
  { href: "#script", labelKey: "vionto.nav.script", Icon: Captions },
  { href: "#audio", labelKey: "vionto.nav.audio", Icon: FileAudio },
  { href: "#export", labelKey: "vionto.nav.export", Icon: Download },
] as const;

const UI_MODE_TO_API_MODE: Record<
  string,
  "story" | "slideshow" | "documentary"
> = {
  cinematic: "story",
  slideshow: "slideshow",
  social: "documentary",
};

const API_MODE_TO_UI_MODE: Record<
  string,
  "cinematic" | "slideshow" | "social"
> = {
  story: "cinematic",
  slideshow: "slideshow",
  documentary: "social",
};

const ASPECT_OPTIONS = [
  { labelKey: "vionto.aspect.landscape", value: "16:9", key: "landscape" },
  { labelKey: "vionto.aspect.portrait", value: "9:16", key: "portrait" },
  { labelKey: "vionto.aspect.square", value: "1:1", key: "1by1" },
] as const;

const STORY_MODE_OPTIONS = [
  {
    labelKey: "vionto.storyMode.memory_film",
    descriptionKey: "vionto.storyMode.memory_film.description",
    value: "memory_film",
  },
  {
    labelKey: "vionto.storyMode.travel_recap",
    descriptionKey: "vionto.storyMode.travel_recap.description",
    value: "travel_recap",
  },
  {
    labelKey: "vionto.storyMode.family_archive",
    descriptionKey: "vionto.storyMode.family_archive.description",
    value: "family_archive",
  },
  {
    labelKey: "vionto.storyMode.event_recap",
    descriptionKey: "vionto.storyMode.event_recap.description",
    value: "event_recap",
  },
  {
    labelKey: "vionto.storyMode.social_reel",
    descriptionKey: "vionto.storyMode.social_reel.description",
    value: "social_reel",
  },
  {
    labelKey: "vionto.storyMode.documentary",
    descriptionKey: "vionto.storyMode.documentary.description",
    value: "documentary",
  },
] as const;

const EMOTIONAL_TONE_OPTIONS = [
  {
    labelKey: "vionto.emotionalTone.nostalgic",
    descriptionKey: "vionto.emotionalTone.nostalgic.description",
    value: "nostalgic",
  },
  {
    labelKey: "vionto.emotionalTone.joyful",
    descriptionKey: "vionto.emotionalTone.joyful.description",
    value: "joyful",
  },
  {
    labelKey: "vionto.emotionalTone.calm",
    descriptionKey: "vionto.emotionalTone.calm.description",
    value: "calm",
  },
  {
    labelKey: "vionto.emotionalTone.epic",
    descriptionKey: "vionto.emotionalTone.epic.description",
    value: "epic",
  },
  {
    labelKey: "vionto.emotionalTone.funny",
    descriptionKey: "vionto.emotionalTone.funny.description",
    value: "funny",
  },
  {
    labelKey: "vionto.emotionalTone.romantic",
    descriptionKey: "vionto.emotionalTone.romantic.description",
    value: "romantic",
  },
  {
    labelKey: "vionto.emotionalTone.reflective",
    descriptionKey: "vionto.emotionalTone.reflective.description",
    value: "reflective",
  },
] as const;

const COLLECTION_OPTIONS = [
  "family",
  "travel",
  "events",
  "work",
  "archive",
  "favorites",
] as const;

const LIFECYCLE_LABELS: Record<string, { label: string; next: string }> = {
  draft: { label: "Draft", next: "Upload photos" },
  photos_uploaded: { label: "Photos uploaded", next: "Generate story" },
  story_generated: { label: "Story generated", next: "Choose audio" },
  audio_ready: { label: "Audio ready", next: "Render video" },
  video_rendered: { label: "Video rendered", next: "Publish/export" },
  published_exported: { label: "Published/exported", next: "Ready" },
};

type AspectRatio = (typeof ASPECT_OPTIONS)[number]["value"];
type UiMode = "cinematic" | "slideshow" | "social";

type ProjectSummary = {
  id: string;
  title: string;
  status: string;
  mode: string;
  storyMode?: string | null;
  emotionalTone?: string | null;
  visualStyle?: string | null;
  musicOption?: string | null;
  musicTrackId?: string | null;
  musicMetadata?: unknown;
  aspectRatio: AspectRatio | "4:3";
  targetDurationSeconds?: number | null;
  createdAt: string;
};

function normalizeProjectMusicMetadata(
  metadata: unknown
): NormalizedTrackMetadata[] {
  if (Array.isArray(metadata)) {
    return metadata.filter(
      (track): track is NormalizedTrackMetadata =>
        !!track &&
        typeof track === "object" &&
        "trackId" in track &&
        "title" in track &&
        "artist" in track &&
        "downloadUrl" in track
    );
  }

  if (
    metadata &&
    typeof metadata === "object" &&
    "trackId" in metadata &&
    "title" in metadata &&
    "artist" in metadata &&
    "downloadUrl" in metadata
  ) {
    return [metadata as NormalizedTrackMetadata];
  }

  return [];
}

type LibraryExport = {
  id: string;
  projectId: string;
  projectTitle: string;
  filename: string | null;
  mode: UiMode | null;
  storyMode: string | null;
  emotionalTone: string | null;
  visualStyle: string | null;
  aspectRatio: string | null;
  aspectLabel: string | null;
  keywords: string[];
  previewTitle: string | null;
  previewSubtitle: string | null;
  previewUrl: string;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
};

function cssAspectRatio(aspectRatio: string | null | undefined) {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  if (aspectRatio === "4:3") return "4 / 3";
  return "16 / 9";
}

function previewFrameStyle(aspectRatio: string | null | undefined) {
  if (aspectRatio === "9:16") {
    return {
      aspectRatio: cssAspectRatio(aspectRatio),
      width: "min(100%, 320px)",
      marginInline: "auto",
    };
  }

  if (aspectRatio === "1:1") {
    return {
      aspectRatio: cssAspectRatio(aspectRatio),
      width: "min(100%, 460px)",
      marginInline: "auto",
    };
  }

  return { aspectRatio: cssAspectRatio(aspectRatio), width: "100%" };
}

export function ViontoPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryProjectId = searchParams?.get("projectId") ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subtitlesCollapsed, setSubtitlesCollapsed] = useState(false);
  const [subtitleConfig, setSubtitleConfig] =
    useState<SubtitleConfigType | null>(null);

  useEffect(() => {
    const applyCollapsed = () => {
      const w = window.innerWidth;
      if (w < 1024) {
        // Always collapse on tablet/mobile — user toggle only applies on desktop
        setCollapsed(true);
      } else {
        const saved = window.localStorage.getItem("vionto:sidebar");
        setCollapsed(saved === "collapsed");
      }
    };

    applyCollapsed();
    window.addEventListener("resize", applyCollapsed);
    const closeMobileMenu = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", closeMobileMenu);
    return () => {
      window.removeEventListener("resize", applyCollapsed);
      window.removeEventListener("resize", closeMobileMenu);
    };
  }, []);

  useEffect(() => {
    return () => {
      musicPreviewAudioRef.current?.pause();
      musicPreviewAudioRef.current = null;
    };
  }, []);

  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userNotes, setUserNotes] = useState("");

  // ─── Story structure state (#102) ──────────────────────────────────
  const [storyStructureOpen, setStoryStructureOpen] = useState(false);
  const [openingTitle, setOpeningTitle] = useState("");
  const [introNarration, setIntroNarration] = useState("");
  const [chapters, setChapters] = useState<
    { title: string; description: string }[]
  >([]);
  const [climaxDescription, setClimaxDescription] = useState("");
  const [closingMessage, setClosingMessage] = useState("");
  const [dedicationText, setDedicationText] = useState("");

  // ─── Caption overlay state (#102) ──────────────────────────────────
  const [captionOverlaysOpen, setCaptionOverlaysOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [showSceneCaptions, setShowSceneCaptions] = useState(true);
  const [showDateCaptions, setShowDateCaptions] = useState(true);
  const [showLocationCaptions, setShowLocationCaptions] = useState(true);
  const [showPeopleLabels, setShowPeopleLabels] = useState(false);
  const [captionPlacement, setCaptionPlacement] = useState<
    "top" | "bottom" | "lower_third" | "corner"
  >("lower_third");
  const [captionStylePreset, setCaptionStylePreset] = useState<
    "minimal" | "memory" | "social" | "documentary"
  >("minimal");

  const [selectedStoryMode, setSelectedStoryMode] =
    useState<string>("memory_film");
  const [selectedEmotionalTone, setSelectedEmotionalTone] =
    useState<string>("nostalgic");
  const [selectedVisualStyle, setSelectedVisualStyle] =
    useState<VisualStyle>(DEFAULT_VISUAL_STYLE);
  const [selectedMusicTracks, setSelectedMusicTracks] = useState<
    NormalizedTrackMetadata[]
  >([]);
  const [musicBlobUrls, setMusicBlobUrls] = useState<Set<string>>(new Set());
  const [musicTracks, setMusicTracks] = useState<NormalizedTrackMetadata[]>([]);
  const [isMusicLoading, setIsMusicLoading] = useState(false);
  const [isMusicUploading, setIsMusicUploading] = useState(false);
  const [musicFilterQuery, setMusicFilterQuery] = useState("");
  const [musicFilterMinDuration, setMusicFilterMinDuration] = useState("");
  const [musicFilterMaxDuration, setMusicFilterMaxDuration] = useState("");
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [musicSelectorTab, setMusicSelectorTab] = useState<
    "royaltyFree" | "library" | "upload"
  >("royaltyFree");
  const [musicLibrary, setMusicLibrary] = useState<AudioLibraryItem[]>([]);
  const [isLoadingMusicLibrary, setIsLoadingMusicLibrary] = useState(false);
  const [musicLibraryError, setMusicLibraryError] = useState<string | null>(
    null
  );
  const [musicPreviewTrackId, setMusicPreviewTrackId] = useState<string | null>(
    null
  );
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<
    Array<{ id: string; name: string; locale: string; gender?: string }>
  >([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicUploadInputRef = useRef<HTMLInputElement>(null);
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Render state
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<string>("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [latestExport, setLatestExport] = useState<LibraryExport | null>(null);
  const [libraryExports, setLibraryExports] = useState<LibraryExport[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryModeFilter, setLibraryModeFilter] = useState<"" | UiMode>("");
  const [libraryCreatedFrom, setLibraryCreatedFrom] = useState("");
  const [libraryCreatedTo, setLibraryCreatedTo] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryCursors, setLibraryCursors] = useState<(string | null)[]>([
    null,
  ]);
  const [libraryHasNext, setLibraryHasNext] = useState(false);
  const LIBRARY_PAGE_SIZE = 6;

  // Project state — pre-select from ?projectId= URL param if present
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => queryProjectId
  );
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Upload state
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<
    Array<{
      file: File;
      key: string;
      status: "pending" | "uploading" | "complete" | "error";
      progress: number;
      error?: string;
    }>
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Assets state (persisted)
  const [projectAssets, setProjectAssets] = useState<
    Array<{
      id: string;
      originalUrl: string;
      thumbnailUrl: string | null;
      width: number | null;
      height: number | null;
      orderIndex: number;
    }>
  >([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
  const dragAssetId = useRef<string | null>(null);
  const dragOverAssetId = useRef<string | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ─── Album management state ─────────────────────────────────────────────
  type Album = {
    id: string;
    name: string;
    description: string | null;
    isBase: boolean;
    coverAssetId: string | null;
    lifecycleStage: string;
    collections: string[];
    isFavorite: boolean;
    dateFrom: string | null;
    dateTo: string | null;
    location: string | null;
    people: string[];
    occasion: string | null;
    mood: string | null;
    privacyLevel: string;
    _count: { items: number };
  };
  type AlbumItem = {
    id: string;
    assetId: string;
    orderIndex: number;
    metadata: Record<string, unknown> | null;
    hidden: boolean;
    favorite: boolean;
    asset: {
      id: string;
      originalUrl: string | null;
      thumbnailUrl: string | null;
      width: number | null;
      height: number | null;
      caption: string | null;
      orderIndex: number;
    };
  };

  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [isLoadingAlbumItems, setIsLoadingAlbumItems] = useState(false);

  // Create album modal
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");
  const [newAlbumFromBase, setNewAlbumFromBase] = useState(true);
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [showCreateAlbumDetails, setShowCreateAlbumDetails] = useState(false);
  const [newAlbumDateFrom, setNewAlbumDateFrom] = useState("");
  const [newAlbumDateTo, setNewAlbumDateTo] = useState("");
  const [newAlbumLocation, setNewAlbumLocation] = useState("");
  const [newAlbumPeople, setNewAlbumPeople] = useState("");
  const [newAlbumOccasion, setNewAlbumOccasion] = useState("");
  const [newAlbumMood, setNewAlbumMood] = useState("");
  const [newAlbumPrivacy, setNewAlbumPrivacy] = useState("private");
  const [newAlbumCollections, setNewAlbumCollections] = useState<string[]>([]);
  const [newAlbumFavorite, setNewAlbumFavorite] = useState(false);

  // Edit album details panel
  const [showAlbumDetails, setShowAlbumDetails] = useState(false);
  const [editDateFrom, setEditDateFrom] = useState("");
  const [editDateTo, setEditDateTo] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPeople, setEditPeople] = useState("");
  const [editOccasion, setEditOccasion] = useState("");
  const [editMood, setEditMood] = useState("");
  const [editPrivacy, setEditPrivacy] = useState("private");
  const [editDescription, setEditDescription] = useState("");
  const [editCollections, setEditCollections] = useState<string[]>([]);
  const [editFavorite, setEditFavorite] = useState(false);
  const [isSavingAlbumDetails, setIsSavingAlbumDetails] = useState(false);
  const [albumDetailsError, setAlbumDetailsError] = useState<string | null>(
    null
  );

  // Rename album inline
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null);
  const [renameAlbumValue, setRenameAlbumValue] = useState("");

  // Per-image metadata editor
  const [metaEditorItemId, setMetaEditorItemId] = useState<string | null>(null);
  const [metaEditorValue, setMetaEditorValue] = useState("");
  const [metaEditorError, setMetaEditorError] = useState<string | null>(null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Add images to derived album panel
  const [showAddImages, setShowAddImages] = useState(false);
  const [addImageSelection, setAddImageSelection] = useState<Set<string>>(
    new Set()
  );

  // Auto-sort / auto-group
  type LocationGroup = {
    label: string;
    latitude: number | null;
    longitude: number | null;
    startIndex: number;
    count: number;
  };
  const [isSorting, setIsSorting] = useState(false);
  const [locationGroups, setLocationGroups] = useState<LocationGroup[] | null>(
    null
  );

  // Drag-reorder inside album
  const dragAlbumItemId = useRef<string | null>(null);
  const dragOverAlbumItemId = useRef<string | null>(null);
  const [dragAlbumActiveId, setDragAlbumActiveId] = useState<string | null>(
    null
  );
  const [dragAlbumOverId, setDragAlbumOverId] = useState<string | null>(null);

  // ─── Video version state ───────────────────────────────────────────────
  type VideoVersion = {
    id: string;
    name: string;
    albumId: string | null;
    mode: string;
    storyMode: string | null;
    emotionalTone: string | null;
    visualStyle: string | null;
    musicOption: string | null;
    aspectRatio: string;
    targetDurationSeconds: number | null;
    templateId: string | null;
    templateSettings: unknown;
    storyStructure: {
      openingTitle?: string;
      introNarration?: string;
      chapters?: { title: string; description: string }[];
      climaxDescription?: string;
      closingMessage?: string;
      dedicationText?: string;
    } | null;
    captionOverlaySettings: {
      enabled?: boolean;
      showSceneCaptions?: boolean;
      showDateCaptions?: boolean;
      showLocationCaptions?: boolean;
      showPeopleLabels?: boolean;
      placement?: "top" | "bottom" | "lower_third" | "corner";
      stylePreset?: "minimal" | "memory" | "social" | "documentary";
    } | null;
    _count: { scripts: number; renderJobs: number; exports: number };
  };
  const [videoVersions, setVideoVersions] = useState<VideoVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );
  const lastAppliedVersionId = useRef<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [renamingVersionId, setRenamingVersionId] = useState<string | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    VideoTemplateId | ""
  >("");
  const [versionTemplateId, setVersionTemplateId] = useState<
    VideoTemplateId | ""
  >("");
  const [albumCollectionFilter, setAlbumCollectionFilter] = useState("");

  const ACCEPTED = [".jpg", ".jpeg", ".png", ".heic", ".webp", ".zip"];
  const acceptedMime =
    "image/jpeg,image/png,image/heic,image/webp,application/zip,.heic,.zip";

  function applyTemplateToDraft(templateId: VideoTemplateId | "") {
    setSelectedTemplateId(templateId);
    const template = getVideoTemplate(templateId);
    if (!template) return;

    const { settings } = template;
    setActiveMode(API_MODE_TO_UI_MODE[settings.mode] ?? "cinematic");
    setSelectedStoryMode(settings.storyMode);
    setSelectedEmotionalTone(settings.emotionalTone);
    setSelectedVisualStyle(settings.visualStyle);
    setActiveAspectRatio(
      settings.aspectRatio === "4:3" ? "16:9" : settings.aspectRatio
    );
    setTargetDurationSeconds(settings.targetDurationSeconds);
    setSubtitleConfig(
      (settings.subtitleSettings as SubtitleConfigType | null) ?? null
    );
    if (settings.captionOverlaySettings) {
      setCaptionsEnabled(settings.captionOverlaySettings.enabled);
      setShowSceneCaptions(settings.captionOverlaySettings.showSceneCaptions);
      setShowDateCaptions(settings.captionOverlaySettings.showDateCaptions);
      setShowLocationCaptions(
        settings.captionOverlaySettings.showLocationCaptions
      );
      setShowPeopleLabels(settings.captionOverlaySettings.showPeopleLabels);
      setCaptionPlacement(settings.captionOverlaySettings.placement);
      setCaptionStylePreset(settings.captionOverlaySettings.stylePreset);
    }
  }

  function toggleCollection(
    value: string,
    current: string[],
    setter: (next: string[]) => void
  ) {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  // Load projects on mount
  useEffect(() => {
    loadProjects();
    loadExportLibrary();
  }, []);

  useEffect(() => {
    setSelectedProjectId((current) =>
      current === queryProjectId ? current : queryProjectId
    );
  }, [queryProjectId]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      projects.some((project) => project.id === selectedProjectId)
    )
      return;

    let cancelled = false;
    loadProject(selectedProjectId).then((project) => {
      if (cancelled || !project) return;
      setProjects((current) =>
        current.some((item) => item.id === project.id)
          ? current
          : [project, ...current]
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, projects]);

  // Load assets when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      const selected = projects.find(
        (project) => project.id === selectedProjectId
      );
      if (selected) {
        // Settings are now loaded from the video version (via useEffect above),
        // but we still set music tracks from the project as a fallback until
        // versions load.
        setSelectedMusicTracks(
          normalizeProjectMusicMetadata(selected.musicMetadata)
        );
        setScriptStale(false);
      }
      loadProjectAssets(selectedProjectId);
      loadProjectScripts(selectedProjectId);
      loadProjectAudioSettings(selectedProjectId);
      loadVoices(locale.split("-")[0] ?? "en");
      loadProjectExports(selectedProjectId);
      loadExportLibrary({ projectId: selectedProjectId });
      loadProjectAlbums(selectedProjectId);
      loadVideoVersions(selectedProjectId);
    } else {
      setProjectAssets([]);
      setVersions([]);
      setSelectedVoice(null);
      setSelectedMusicTracks([]);
      setSelectedVisualStyle(DEFAULT_VISUAL_STYLE);
      setTargetDurationSeconds(20);
      setScriptStale(false);
      setRenderJobId(null);
      setRenderState("idle");
      setRenderProgress(0);
      setRenderError(null);
      setExportId(null);
      setDownloadUrl(null);
      setAlbums([]);
      setSelectedAlbumId(null);
      setAlbumItems([]);
      setVideoVersions([]);
      setSelectedVersionId(null);
      // Reset story structure & caption overlay state
      setOpeningTitle("");
      setIntroNarration("");
      setChapters([]);
      setClimaxDescription("");
      setClosingMessage("");
      setDedicationText("");
      setCaptionsEnabled(false);
      setShowSceneCaptions(true);
      setShowDateCaptions(true);
      setShowLocationCaptions(true);
      setShowPeopleLabels(false);
      setCaptionPlacement("lower_third");
      setCaptionStylePreset("minimal");
      loadExportLibrary();
    }
  }, [selectedProjectId, locale, projects]);

  useEffect(() => {
    setLibraryPage(1);
    setLibraryCursors([null]);
    loadExportLibrary({ projectId: selectedProjectId, cursor: null });
  }, [libraryModeFilter, libraryCreatedFrom, libraryCreatedTo, librarySearch]);

  async function loadProjects() {
    setIsLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.data || []);
    } catch (error) {
      console.error("Failed to load projects", error);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadProject(
    projectId: string
  ): Promise<ProjectSummary | null> {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.error("Failed to load project", error);
      return null;
    }
  }

  function selectProject(projectId: string | null) {
    setSelectedProjectId(projectId);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (projectId) params.set("projectId", projectId);
    else params.delete("projectId");

    const query = params.toString();
    router.replace(query ? `/create?${query}` : "/create", { scroll: false });
  }

  async function reorderAssets(newOrder: typeof projectAssets) {
    if (!selectedProjectId) return;
    setProjectAssets(newOrder);
    try {
      await fetch(`/api/projects/${selectedProjectId}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newOrder.map((a) => a.id) }),
      });
    } catch (error) {
      console.error("Failed to persist asset order", error);
    }
  }

  async function loadProjectAssets(projectId: string) {
    setIsLoadingAssets(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`);
      if (!res.ok) return;
      const data = await res.json();
      setProjectAssets(data.assets || []);
    } catch (error) {
      console.error("Failed to load assets", error);
    } finally {
      setIsLoadingAssets(false);
    }
  }

  // ─── Album management functions ────────────────────────────────────────────

  async function loadProjectAlbums(projectId: string) {
    setIsLoadingAlbums(true);
    try {
      const params = new URLSearchParams();
      if (albumCollectionFilter === "favorites") params.set("favorite", "true");
      else if (albumCollectionFilter)
        params.set("collection", albumCollectionFilter);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/projects/${projectId}/albums${suffix}`);
      if (!res.ok) return;
      const data = await res.json();
      const loadedAlbums: Album[] = data.albums || [];
      setAlbums(loadedAlbums);
      // Auto-select base album on first load, or keep existing selection.
      setSelectedAlbumId((current) => {
        if (current && loadedAlbums.some((a) => a.id === current))
          return current;
        return (
          loadedAlbums.find((a) => a.isBase)?.id ?? loadedAlbums[0]?.id ?? null
        );
      });
    } catch (error) {
      console.error("Failed to load albums", error);
    } finally {
      setIsLoadingAlbums(false);
    }
  }

  async function loadAlbumItems(projectId: string, albumId: string) {
    setIsLoadingAlbumItems(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/albums/${albumId}`);
      if (!res.ok) return;
      const data = await res.json();
      setAlbumItems(data.items || []);
    } catch (error) {
      console.error("Failed to load album items", error);
    } finally {
      setIsLoadingAlbumItems(false);
    }
  }

  useEffect(() => {
    setLocationGroups(null); // Clear auto-groups when switching albums
    if (selectedProjectId && selectedAlbumId) {
      loadAlbumItems(selectedProjectId, selectedAlbumId);
    } else {
      setAlbumItems([]);
    }
  }, [selectedProjectId, selectedAlbumId]);

  async function handleCreateAlbum() {
    if (!selectedProjectId || !newAlbumName.trim() || isCreatingAlbum) return;
    setIsCreatingAlbum(true);
    try {
      const peopleParsed = newAlbumPeople.trim()
        ? newAlbumPeople
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const res = await fetch(`/api/projects/${selectedProjectId}/albums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAlbumName.trim(),
          description: newAlbumDesc.trim() || undefined,
          fromBase: newAlbumFromBase,
          dateFrom: newAlbumDateFrom || undefined,
          dateTo: newAlbumDateTo || undefined,
          location: newAlbumLocation.trim() || undefined,
          people: peopleParsed,
          occasion: newAlbumOccasion.trim() || undefined,
          mood: newAlbumMood.trim() || undefined,
          privacyLevel: newAlbumPrivacy,
          collections: newAlbumFavorite
            ? Array.from(new Set([...newAlbumCollections, "favorites"]))
            : newAlbumCollections,
          isFavorite: newAlbumFavorite,
        }),
      });
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to create album" }));
        alert(data.error ?? "Failed to create album");
        return;
      }
      const created = await res.json();
      setShowCreateAlbum(false);
      setNewAlbumName("");
      setNewAlbumDesc("");
      setNewAlbumFromBase(true);
      setShowCreateAlbumDetails(false);
      setNewAlbumDateFrom("");
      setNewAlbumDateTo("");
      setNewAlbumLocation("");
      setNewAlbumPeople("");
      setNewAlbumOccasion("");
      setNewAlbumMood("");
      setNewAlbumPrivacy("private");
      setNewAlbumCollections([]);
      setNewAlbumFavorite(false);
      await loadProjectAlbums(selectedProjectId);
      await selectAlbumForActiveVersion(created.id);
    } catch (error) {
      console.error("Failed to create album", error);
      alert("Failed to create album");
    } finally {
      setIsCreatingAlbum(false);
    }
  }

  async function handleDeleteAlbum(albumId: string, albumName: string) {
    if (!selectedProjectId) return;
    if (!confirm(`Delete album "${albumName}"? Images will not be deleted.`))
      return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${albumId}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to delete album" }));
        alert(data.error ?? "Failed to delete album");
        return;
      }
      await loadProjectAlbums(selectedProjectId);
    } catch (error) {
      console.error("Failed to delete album", error);
      alert("Failed to delete album");
    }
  }

  async function handleRenameAlbum(albumId: string) {
    if (!selectedProjectId || !renameAlbumValue.trim()) {
      setRenamingAlbumId(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${albumId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: renameAlbumValue.trim() }),
        }
      );
      if (!res.ok) {
        alert("Failed to rename album");
        return;
      }
      setAlbums((prev) =>
        prev.map((a) =>
          a.id === albumId ? { ...a, name: renameAlbumValue.trim() } : a
        )
      );
    } catch (error) {
      console.error("Failed to rename album", error);
    } finally {
      setRenamingAlbumId(null);
      setRenameAlbumValue("");
    }
  }

  function openAlbumDetails(album: Album) {
    setEditDateFrom(album.dateFrom ? album.dateFrom.split("T")[0] : "");
    setEditDateTo(album.dateTo ? album.dateTo.split("T")[0] : "");
    setEditLocation(album.location ?? "");
    setEditPeople(album.people.join(", "));
    setEditOccasion(album.occasion ?? "");
    setEditMood(album.mood ?? "");
    setEditPrivacy(album.privacyLevel);
    setEditDescription(album.description ?? "");
    setEditCollections(album.collections ?? []);
    setEditFavorite(album.isFavorite ?? false);
    setAlbumDetailsError(null);
    setShowAlbumDetails(true);
  }

  async function handleSaveAlbumDetails() {
    if (!selectedProjectId || !selectedAlbumId) return;
    setIsSavingAlbumDetails(true);
    setAlbumDetailsError(null);
    try {
      const peopleParsed = editPeople.trim()
        ? editPeople
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: editDescription.trim() || null,
            dateFrom: editDateFrom || null,
            dateTo: editDateTo || null,
            location: editLocation.trim() || null,
            people: peopleParsed,
            occasion: editOccasion.trim() || null,
            mood: editMood.trim() || null,
            privacyLevel: editPrivacy,
            collections: editFavorite
              ? Array.from(new Set([...editCollections, "favorites"]))
              : editCollections,
            isFavorite: editFavorite,
          }),
        }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to save" }));
        setAlbumDetailsError(data.error ?? "Failed to save album details");
        return;
      }
      const updated = await res.json();
      setAlbums((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      );
      setShowAlbumDetails(false);
    } catch (error) {
      console.error("Failed to save album details", error);
      setAlbumDetailsError("Failed to save album details");
    } finally {
      setIsSavingAlbumDetails(false);
    }
  }

  async function handleRemoveFromAlbum(itemId: string) {
    if (!selectedProjectId || !selectedAlbumId) return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}/items/${itemId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to remove image" }));
        alert(data.error ?? "Failed to remove image");
        return;
      }
      setAlbumItems((prev) => prev.filter((i) => i.id !== itemId));
      setAlbums((prev) =>
        prev.map((a) =>
          a.id === selectedAlbumId
            ? { ...a, _count: { items: a._count.items - 1 } }
            : a
        )
      );
    } catch (error) {
      console.error("Failed to remove from album", error);
    }
  }

  async function handleAddImagesToAlbum() {
    if (!selectedProjectId || !selectedAlbumId || addImageSelection.size === 0)
      return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetIds: Array.from(addImageSelection) }),
        }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to add images" }));
        alert(data.error ?? "Failed to add images");
        return;
      }
      setShowAddImages(false);
      setAddImageSelection(new Set());
      await loadAlbumItems(selectedProjectId, selectedAlbumId);
      await loadProjectAlbums(selectedProjectId);
    } catch (error) {
      console.error("Failed to add images", error);
    }
  }

  async function reorderAlbumItems(newItems: AlbumItem[]) {
    if (!selectedProjectId || !selectedAlbumId) return;
    setLocationGroups(null); // Clear auto-groups on manual reorder
    setAlbumItems(newItems);
    try {
      await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}/items/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedItemIds: newItems.map((i) => i.id) }),
        }
      );
    } catch (error) {
      console.error("Failed to persist album item order", error);
    }
  }

  async function handleSortAlbum(mode: "date_asc" | "date_desc" | "location") {
    if (!selectedProjectId || !selectedAlbumId || isSorting) return;
    setIsSorting(true);
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}/items/sort`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to sort" }));
        alert(data.error ?? "Failed to sort album");
        return;
      }
      const data = await res.json();
      if (mode === "location" && data.groups) {
        setLocationGroups(data.groups);
      } else {
        setLocationGroups(null);
      }
      // Reload items to get the new order with presigned URLs.
      await loadAlbumItems(selectedProjectId, selectedAlbumId);
    } catch (error) {
      console.error("Failed to sort album", error);
      alert("Failed to sort album");
    } finally {
      setIsSorting(false);
    }
  }

  function openMetaEditor(item: AlbumItem) {
    setMetaEditorItemId(item.id);
    setMetaEditorValue(
      item.metadata ? JSON.stringify(item.metadata, null, 2) : ""
    );
    setMetaEditorError(null);
  }

  async function saveItemMetadata() {
    if (!selectedProjectId || !selectedAlbumId || !metaEditorItemId) return;
    let parsed: Record<string, unknown> | null = null;
    if (metaEditorValue.trim()) {
      try {
        parsed = JSON.parse(metaEditorValue) as Record<string, unknown>;
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          setMetaEditorError("Metadata must be a JSON object { ... }");
          return;
        }
      } catch {
        setMetaEditorError(
          "Invalid JSON — please fix the syntax before saving."
        );
        return;
      }
    }
    setIsSavingMeta(true);
    setMetaEditorError(null);
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/albums/${selectedAlbumId}/items/${metaEditorItemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: parsed }),
        }
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to save metadata" }));
        setMetaEditorError(data.error ?? "Failed to save metadata");
        return;
      }
      setAlbumItems((prev) =>
        prev.map((i) =>
          i.id === metaEditorItemId ? { ...i, metadata: parsed } : i
        )
      );
      setMetaEditorItemId(null);
    } catch (error) {
      console.error("Failed to save metadata", error);
      setMetaEditorError("Unexpected error — please try again.");
    } finally {
      setIsSavingMeta(false);
    }
  }

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId) ?? null;
  const activeVersion =
    videoVersions.find((v) => v.id === selectedVersionId) ?? null;
  const activeVersionAlbumId =
    activeVersion?.albumId ??
    albums.find((album) => album.isBase)?.id ??
    albums[0]?.id ??
    null;
  const isBaseAlbumSelected = selectedAlbum?.isBase ?? true;
  const metaEditorItem =
    albumItems.find((i) => i.id === metaEditorItemId) ?? null;
  const metaEditorAssetUrl =
    metaEditorItem?.asset.thumbnailUrl ??
    metaEditorItem?.asset.originalUrl ??
    null;

  async function selectAlbumForActiveVersion(albumId: string) {
    setSelectedAlbumId(albumId);

    if (!selectedProjectId || !selectedVersionId) return;
    const previousAlbumId = activeVersion?.albumId ?? null;
    if (previousAlbumId === albumId) return;

    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/versions/${selectedVersionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        }
      );
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || "Failed to link album to version");
      }
      setVideoVersions((prev) =>
        prev.map((version) =>
          version.id === selectedVersionId ? { ...version, albumId } : version
        )
      );
      setScriptStale(true);
    } catch (error) {
      console.error("Failed to link album to version", error);
      setSelectedAlbumId(previousAlbumId ?? activeVersionAlbumId);
      alert("Could not link this album to the active version.");
    }
  }

  // ─── End album management functions ────────────────────────────────────────

  // ─── Video version management functions ──────────────────────────────────

  async function loadVideoVersions(projectId: string) {
    setIsLoadingVersions(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`);
      if (!res.ok) return;
      const data = await res.json();
      const loaded: VideoVersion[] = data.data || [];
      setVideoVersions(loaded);
      // Auto-select the first version if none is selected
      setSelectedVersionId((current) => {
        if (current && loaded.some((v) => v.id === current)) return current;
        return loaded[0]?.id ?? null;
      });
    } catch (error) {
      console.error("Failed to load video versions", error);
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function createVideoVersion(name?: string, albumId?: string | null) {
    if (!selectedProjectId) return;
    const template = getVideoTemplate(versionTemplateId);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || `Version ${videoVersions.length + 1}`,
          ...(template
            ? {
                ...template.settings,
                templateId: template.id,
                templateSettings: template.settings,
              }
            : {}),
          ...(albumId && { albumId }),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadVideoVersions(selectedProjectId);
      if (data.data?.id) setSelectedVersionId(data.data.id);
      setVersionTemplateId("");
    } catch (error) {
      console.error("Failed to create video version", error);
    }
  }

  useEffect(() => {
    if (selectedProjectId) loadProjectAlbums(selectedProjectId);
  }, [albumCollectionFilter]);

  async function duplicateVideoVersion(versionId: string) {
    if (!selectedProjectId) return;
    const source = videoVersions.find((v) => v.id === versionId);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${source?.name ?? "Version"} (copy)`,
          cloneFromVersionId: versionId,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadVideoVersions(selectedProjectId);
      if (data.data?.id) setSelectedVersionId(data.data.id);
    } catch (error) {
      console.error("Failed to duplicate video version", error);
    }
  }

  async function renameVideoVersion(versionId: string, newName: string) {
    if (!selectedProjectId || !newName.trim()) return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      if (!res.ok) return;
      setVideoVersions((prev) =>
        prev.map((v) =>
          v.id === versionId ? { ...v, name: newName.trim() } : v
        )
      );
    } catch (error) {
      console.error("Failed to rename video version", error);
    }
  }

  async function deleteVideoVersion(versionId: string) {
    if (!selectedProjectId) return;
    if (videoVersions.length <= 1) return; // prevent deleting the last version
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/versions/${versionId}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) return;
      await loadVideoVersions(selectedProjectId);
    } catch (error) {
      console.error("Failed to delete video version", error);
    }
  }

  // Apply settings from the selected version when it changes
  useEffect(() => {
    if (!selectedVersionId) return;
    const version = videoVersions.find((v) => v.id === selectedVersionId);
    if (!version) return;

    const shouldApplySettings =
      lastAppliedVersionId.current !== selectedVersionId;
    if (shouldApplySettings) {
      setActiveMode(API_MODE_TO_UI_MODE[version.mode] ?? "cinematic");
      setSelectedStoryMode(version.storyMode ?? "memory_film");
      setSelectedEmotionalTone(version.emotionalTone ?? "nostalgic");
      setSelectedVisualStyle(normalizeVisualStyle(version.visualStyle));
      const supportedAspect = ASPECT_OPTIONS.some(
        (o) => o.value === version.aspectRatio
      );
      setActiveAspectRatio(
        supportedAspect ? (version.aspectRatio as AspectRatio) : "16:9"
      );
      setTargetDurationSeconds(version.targetDurationSeconds ?? 20);
    }
    setSelectedAlbumId(
      version.albumId ??
        albums.find((album) => album.isBase)?.id ??
        albums[0]?.id ??
        null
    );

    if (shouldApplySettings) {
      // Apply story structure (#102)
      const ss = version.storyStructure;
      setOpeningTitle(ss?.openingTitle ?? "");
      setIntroNarration(ss?.introNarration ?? "");
      setChapters(ss?.chapters ?? []);
      setClimaxDescription(ss?.climaxDescription ?? "");
      setClosingMessage(ss?.closingMessage ?? "");
      setDedicationText(ss?.dedicationText ?? "");
      // Apply caption overlay settings (#102)
      const cos = version.captionOverlaySettings;
      setCaptionsEnabled(cos?.enabled ?? false);
      setShowSceneCaptions(cos?.showSceneCaptions ?? true);
      setShowDateCaptions(cos?.showDateCaptions ?? true);
      setShowLocationCaptions(cos?.showLocationCaptions ?? true);
      setShowPeopleLabels(cos?.showPeopleLabels ?? false);
      setCaptionPlacement(cos?.placement ?? "lower_third");
      setCaptionStylePreset(cos?.stylePreset ?? "minimal");
      setScriptStale(false);
      lastAppliedVersionId.current = selectedVersionId;
    }
  }, [selectedVersionId, videoVersions, albums]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── End video version management functions ─────────────────────────────

  async function loadProjectScripts(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/scripts`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.scripts || []);
    } catch (error) {
      console.error("Failed to load scripts", error);
    }
  }

  async function loadProjectAudioSettings(projectId: string) {
    try {
      const res = await fetch(`/api/audio/tracks?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      const tracks = data.tracks || data.data || [];
      const narrationTrack = tracks
        .filter((t: any) => t.type === "narration" && t.voiceId)
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime()
        )[0];
      setSelectedVoice(narrationTrack?.voiceId ?? null);
    } catch (error) {
      console.error("Failed to load audio settings", error);
    }
  }

  async function loadProjectExports(projectId: string) {
    try {
      const res = await fetch(`/api/exports?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      const latestCompletedExport = (data.data || []).find(
        (item: any) => item.renderJob?.state === "completed"
      );
      if (latestCompletedExport) {
        setRenderJobId(latestCompletedExport.renderJobId ?? null);
        // Never clobber an in-progress render triggered by the user
        setRenderState((current) =>
          current === "queued" || current === "running" ? current : "completed"
        );
        setRenderProgress(100);
        setRenderError(null);
        setExportId(latestCompletedExport.id);
        setDownloadUrl(null);
      } else {
        setRenderJobId(null);
        setRenderState((current) =>
          current === "queued" || current === "running" ? current : "idle"
        );
        setRenderProgress(0);
        setRenderError(null);
        setExportId(null);
        setDownloadUrl(null);
      }
    } catch (error) {
      console.error("Failed to load exports", error);
    }
  }

  async function removeLibraryExport(exportId: string) {
    if (!confirm(t("vionto.library.removeConfirm"))) return;
    try {
      const res = await fetch(`/api/exports/${exportId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setLibraryExports((prev) => prev.filter((e) => e.id !== exportId));
      if (exportId === latestExport?.id) setLatestExport(null);
    } catch (error) {
      console.error("Failed to remove export", error);
    }
  }

  async function loadExportLibrary(
    overrides: { projectId?: string | null; cursor?: string | null } = {}
  ) {
    setIsLoadingLibrary(true);
    try {
      const params = new URLSearchParams();
      const projectId =
        overrides.projectId === undefined
          ? selectedProjectId
          : overrides.projectId;
      if (projectId) params.set("projectId", projectId);
      if (libraryModeFilter) params.set("mode", libraryModeFilter);
      if (libraryCreatedFrom) params.set("createdFrom", libraryCreatedFrom);
      if (libraryCreatedTo) params.set("createdTo", libraryCreatedTo);
      if (librarySearch.trim()) params.set("search", librarySearch.trim());
      const cursor = overrides.cursor !== undefined ? overrides.cursor : null;
      if (cursor) params.set("cursor", cursor);
      params.set("limit", String(LIBRARY_PAGE_SIZE));
      const res = await fetch(`/api/exports/library?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.data || []) as LibraryExport[];
      setLibraryExports(items);
      setLibraryHasNext(!!data.nextCursor);
      if (items[0]) setLatestExport(items[0]);
      else if (!projectId) setLatestExport(null);
    } catch (error) {
      console.error("Failed to load export library", error);
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  async function saveProjectSettings(): Promise<boolean> {
    if (!selectedProjectId) return false;
    const apiMode = UI_MODE_TO_API_MODE[activeMode] ?? "story";
    // Gather story structure — only include if any field is non-empty
    const storyStructure = {
      openingTitle: openingTitle.trim(),
      introNarration: introNarration.trim(),
      chapters: chapters.filter((c) => c.title.trim() || c.description.trim()),
      climaxDescription: climaxDescription.trim(),
      closingMessage: closingMessage.trim(),
      dedicationText: dedicationText.trim(),
    };
    const hasStoryStructure =
      storyStructure.openingTitle ||
      storyStructure.introNarration ||
      storyStructure.chapters.length > 0 ||
      storyStructure.climaxDescription ||
      storyStructure.closingMessage ||
      storyStructure.dedicationText;

    const settingsData = {
      mode: apiMode,
      storyMode: selectedStoryMode,
      emotionalTone: selectedEmotionalTone,
      visualStyle: selectedVisualStyle,
      musicOption: selectedMusicTracks.length > 0 ? "upload_own" : "no_music",
      musicTrackId:
        selectedMusicTracks.map((track) => track.trackId).join(",") || null,
      musicMetadata:
        selectedMusicTracks.length > 0 ? selectedMusicTracks : null,
      aspectRatio: activeAspectRatio,
      targetDurationSeconds,
      storyStructure: hasStoryStructure ? storyStructure : null,
      captionOverlaySettings: {
        enabled: captionsEnabled,
        showSceneCaptions,
        showDateCaptions,
        showLocationCaptions,
        showPeopleLabels,
        placement: captionPlacement,
        stylePreset: captionStylePreset,
      },
    };
    try {
      // Save to the video version if one is selected (preferred).
      // The version PATCH endpoint also syncs back to the project.
      if (selectedVersionId) {
        const res = await fetch(
          `/api/projects/${selectedProjectId}/versions/${selectedVersionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...settingsData,
              albumId: selectedAlbumId ?? null,
            }),
          }
        );
        if (!res.ok) {
          const message = await res.text().catch(() => "");
          throw new Error(message || "Failed to save version settings");
        }
      } else {
        // Fallback: save directly to project
        const res = await fetch(`/api/projects/${selectedProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settingsData),
        });
        if (!res.ok) {
          const message = await res.text().catch(() => "");
          throw new Error(message || "Failed to save project settings");
        }
      }
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProjectId
            ? {
                ...project,
                mode: apiMode,
                storyMode: selectedStoryMode,
                emotionalTone: selectedEmotionalTone,
                visualStyle: selectedVisualStyle,
                musicOption:
                  selectedMusicTracks.length > 0 ? "upload_own" : "no_music",
                aspectRatio: activeAspectRatio,
                targetDurationSeconds,
              }
            : project
        )
      );
      return true;
    } catch (error) {
      console.error("Failed to save settings", error);
      return false;
    }
  }

  async function saveSubtitleSettingsNow(): Promise<boolean> {
    if (!selectedProjectId || !subtitleConfig) return true;

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/subtitles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...subtitleConfig,
          versionId: selectedVersionId ?? undefined,
        }),
      });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || "Failed to save subtitle settings");
      }
      return true;
    } catch (error) {
      console.error("Failed to save subtitle settings", error);
      return false;
    }
  }

  async function loadVoices(locale: string) {
    try {
      const res = await fetch(`/api/audio/voices?locale=${locale}`);
      if (!res.ok) return;
      const data = await res.json();
      const loadedVoices = data.voices || [];
      setVoices(loadedVoices);
      setSelectedVoice((current) => current ?? loadedVoices[0]?.id ?? null);
    } catch (error) {
      console.error("Failed to load voices", error);
    }
  }

  async function saveVoiceSelection(voiceId: string) {
    if (!selectedProjectId) return;
    const voice = voices.find((item) => item.id === voiceId);
    try {
      const res = await fetch("/api/audio/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          versionId: selectedVersionId ?? undefined,
          type: "narration",
          source: "tts",
          voiceId,
          voiceName: voice?.name,
        }),
      });
      if (!res.ok) {
        console.error("Failed to save voice selection");
      }
    } catch (error) {
      console.error("Failed to save voice selection", error);
    }
  }

  function getVoicePreviewText() {
    const selectedVoiceLocale = voices.find(
      (voice) => voice.id === selectedVoice
    )?.locale;
    const language = (selectedVoiceLocale ?? locale).split("-")[0] ?? "en";
    if (language === "nl")
      return "Dit is een voorbeeld van de gekozen vertelstem voor je Vionto verhaal.";
    if (language === "fr")
      return "Voici un aperçu de la voix choisie pour votre histoire Vionto.";
    if (language === "de")
      return "Dies ist eine Vorschau der ausgewaehlten Stimme fuer deine Vionto Geschichte.";
    if (language === "es")
      return "Esta es una vista previa de la voz narradora elegida para tu historia de Vionto.";
    if (language === "it")
      return "Questa è un'anteprima della voce narrante scelta per la tua storia Vionto.";
    if (language === "pt")
      return "Esta é uma prévia da voz de narração escolhida para a sua história Vionto.";
    return t("vionto.audio.previewText");
  }

  async function previewSelectedVoice() {
    if (!selectedVoice) return;
    setIsPreviewing(true);
    try {
      const res = await fetch("/api/audio/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: getVoicePreviewText(),
          voiceId: selectedVoice,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.audioBase64) {
        alert(data.error ?? t("vionto.alert.previewAudioFailed"));
        return;
      }
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      await audio.play();
    } catch (error) {
      console.error("Failed to preview audio", error);
      alert(t("vionto.alert.previewAudioFailed"));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function deleteAsset(assetId: string) {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProjectId}/assets?assetId=${assetId}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        alert(t("vionto.alert.deleteAssetFailed"));
        return;
      }
      await loadProjectAssets(selectedProjectId);
    } catch (error) {
      console.error("Failed to delete asset", error);
      alert(t("vionto.alert.deleteAssetFailed"));
    }
  }

  async function startRender() {
    if (!selectedProjectId) {
      alert(t("vionto.alert.selectProjectFirst"));
      return;
    }
    if (projectAssets.length === 0) {
      alert(t("vionto.alert.uploadImagesFirst"));
      return;
    }
    if (!hasRenderableScript) {
      alert(t("vionto.alert.generateScriptFirst"));
      setRenderError(t("vionto.render.error.noScript"));
      return;
    }

    // Lock the UI immediately so any async side-effects (e.g. saveProjectSettings
    // triggering the projects useEffect → loadProjectExports) cannot flash "completed".
    setRenderState("queued");
    setRenderProgress(0);
    setRenderError(null);
    setExportId(null);
    setDownloadUrl(null);

    const savedSettings = await saveProjectSettings();
    if (!savedSettings) {
      alert(t("vionto.alert.saveSettingsFailed"));
      setRenderError(t("vionto.render.error.saveSettingsFailed"));
      setRenderState("idle");
      return;
    }
    const savedSubtitleSettings = await saveSubtitleSettingsNow();
    if (!savedSubtitleSettings) {
      alert(t("vionto.alert.saveSubtitlesFailed"));
      setRenderError(t("vionto.render.error.saveSubtitlesFailed"));
      setRenderState("idle");
      return;
    }

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          versionId: selectedVersionId ?? undefined,
          ...(!selectedVersionId && selectedAlbumId
            ? { albumId: selectedAlbumId }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: t("vionto.alert.startRenderFailed") }));
        const message = data.error ?? t("vionto.alert.startRenderFailed");
        alert(message);
        setRenderError(message);
        setRenderState("idle");
        return;
      }
      const data = await res.json();
      setRenderJobId(data.jobId);
      pollRenderStatus(data.jobId);
    } catch (error) {
      console.error("Failed to start render", error);
      alert(t("vionto.alert.startRenderFailed"));
      setRenderError(t("vionto.render.error.startFailed"));
      setRenderState("idle");
    }
  }

  async function pollRenderStatus(jobId: string) {
    try {
      const res = await fetch(`/api/render/${jobId}`);
      if (!res.ok) {
        setRenderState("failed");
        setRenderError(t("vionto.render.error.pollFailed"));
        return;
      }
      const data = await res.json();
      setRenderState(data.state);
      setRenderProgress(data.progressPercent ?? 0);

      if (data.state === "completed") {
        setRenderError(null);
        // Load export record
        const exportRes = await fetch(
          `/api/exports?projectId=${selectedProjectId}`
        );
        if (exportRes.ok) {
          const exportData = await exportRes.json();
          if (exportData.data && exportData.data.length > 0) {
            const latestExport = exportData.data[0];
            setExportId(latestExport.id);
          }
        }
        await loadExportLibrary({ projectId: selectedProjectId });
      } else if (data.state === "failed") {
        const message = data.errorSummary || t("vionto.alert.unknownError");
        setRenderError(message);
        alert(`${t("vionto.alert.renderFailed")}: ${message}`);
      } else if (data.state === "cancelled") {
        setRenderState("idle");
        setRenderProgress(0);
        setRenderJobId(null);
      } else if (data.state === "queued" || data.state === "running") {
        // Continue polling
        setTimeout(() => pollRenderStatus(jobId), 2000);
      }
    } catch (error) {
      console.error("Failed to poll render status", error);
      setRenderError(t("vionto.render.error.pollFailed"));
      setRenderState("failed");
    }
  }

  async function cancelRender() {
    if (!renderJobId) return;
    try {
      const res = await fetch(`/api/render/${renderJobId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to cancel render");
        return;
      }
      setRenderState("idle");
      setRenderProgress(0);
      setRenderJobId(null);
    } catch (error) {
      console.error("Failed to cancel render", error);
    }
  }

  async function getDownloadUrl() {
    if (!exportId) return;
    try {
      const res = await fetch(`/api/exports/${exportId}/download`);
      if (!res.ok) {
        alert(t("vionto.alert.getDownloadUrlFailed"));
        return;
      }
      const data = await res.json();
      setDownloadUrl(data.downloadUrl);
      setShowDownloadDialog(true);
    } catch (error) {
      console.error("Failed to get download URL", error);
      alert(t("vionto.alert.getDownloadUrlFailed"));
    }
  }

  function copyToClipboard() {
    if (!downloadUrl) return;
    navigator.clipboard.writeText(downloadUrl);
    alert(t("vionto.downloadDialog.copied"));
  }

  async function createProject() {
    if (!newProjectTitle.trim() || isSubmittingProject) return;
    setIsSubmittingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProjectTitle.trim(),
          templateId: selectedTemplateId || undefined,
          mode: UI_MODE_TO_API_MODE[activeMode] ?? "story",
          storyMode: selectedStoryMode,
          emotionalTone: selectedEmotionalTone,
          visualStyle: selectedVisualStyle,
          musicOption:
            selectedMusicTracks.length > 0 ? "upload_own" : "no_music",
          musicTrackId:
            selectedMusicTracks.map((track) => track.trackId).join(",") || null,
          musicMetadata:
            selectedMusicTracks.length > 0 ? selectedMusicTracks : null,
          aspectRatio: activeAspectRatio,
          targetDurationSeconds,
          locale: locale.split("-")[0] ?? "en",
        }),
      });
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: t("vionto.alert.createProjectFailed") }));
        alert(data.error);
        return;
      }
      const project = await res.json();
      await loadProjects();
      selectProject(project.id);
      setNewProjectTitle("");
      setSelectedTemplateId("");
      setIsCreatingProject(false);
    } catch (error) {
      console.error("Failed to create project", error);
      alert(t("vionto.alert.createProjectFailed"));
    } finally {
      setIsSubmittingProject(false);
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const valid = Array.from(files).filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ACCEPTED.includes(ext);
    });
    setUploadingFiles((prev) => {
      const names = new Set(prev.map((f) => f.file.name));
      return [
        ...prev,
        ...valid
          .filter((f) => !names.has(f.name))
          .map((f) => ({
            file: f,
            key: "",
            status: "pending" as const,
            progress: 0,
          })),
      ];
    });
  }

  function handleDropzoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  const pipelineSteps = [
    {
      icon: ImagePlus,
      titleKey: "vionto.pipeline.ingest",
      detailKey: "vionto.pipeline.ingestDetail",
    },
    {
      icon: Sparkles,
      titleKey: "vionto.pipeline.write",
      detailKey: "vionto.pipeline.writeDetail",
    },
    {
      icon: Mic,
      titleKey: "vionto.pipeline.narrate",
      detailKey: "vionto.pipeline.narrateDetail",
    },
    {
      icon: Clapperboard,
      titleKey: "vionto.pipeline.render",
      detailKey: "vionto.pipeline.renderDetail",
    },
  ];

  const modes = ["cinematic", "slideshow", "social"] as const;
  const [activeMode, setActiveMode] = useState<UiMode>("cinematic");
  const [activeAspectRatio, setActiveAspectRatio] =
    useState<AspectRatio>("16:9");
  const [targetDurationSeconds, setTargetDurationSeconds] =
    useState<number>(20);
  const [scriptStale, setScriptStale] = useState(false);
  const currentPreviewAspectRatio =
    latestExport?.aspectRatio ?? activeAspectRatio;

  const queueItems = [
    [
      t("vionto.queue.captioning"),
      t("vionto.queue.captioningDetail", { count: 12 }),
    ],
    [t("vionto.queue.script"), t("vionto.queue.scriptDetail")],
    [t("vionto.queue.voice"), t("vionto.queue.voiceDetail")],
    [t("vionto.queue.render"), t("vionto.queue.renderDetail")],
  ];
  const hasRenderableScript = versions.some((version) =>
    version.narrationText?.trim()
  );

  async function startUploads() {
    if (!selectedProjectId) {
      alert(t("vionto.alert.selectProjectFirst"));
      return;
    }
    if (uploadingFiles.length === 0) return;

    setIsUploading(true);

    // Create upload session
    try {
      const sessionRes = await fetch("/api/uploads/session", {
        method: "POST",
      });
      if (!sessionRes.ok) {
        alert(t("vionto.alert.uploadSessionFailed"));
        setIsUploading(false);
        return;
      }
      const sessionData = await sessionRes.json();
      setUploadSessionId(sessionData.sessionId);
      let completedUploads = 0;

      // Upload each file
      for (let i = 0; i < uploadingFiles.length; i++) {
        const fileUpload = uploadingFiles[i];
        if (fileUpload.status === "complete") {
          completedUploads += 1;
          continue;
        }

        setUploadingFiles((prev) => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: "uploading", progress: 0 };
          return updated;
        });

        try {
          // Presign
          const presignRes = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: fileUpload.file.name,
              contentType: fileUpload.file.type || "image/jpeg",
              sizeBytes: fileUpload.file.size,
              sessionId: sessionData.sessionId,
            }),
          });
          if (!presignRes.ok) {
            throw new Error("Presign failed");
          }
          const presignData = await presignRes.json();

          // Upload to storage via proxy to handle authentication properly
          const form = new FormData();
          form.append("key", presignData.key);
          form.append("file", fileUpload.file);
          const uploadRes = await fetch("/api/uploads/proxy", {
            method: "POST",
            body: form,
          });
          if (!uploadRes.ok) {
            const message = await uploadRes.text().catch(() => "");
            throw new Error(message || "Storage upload failed");
          }

          // Complete
          const completeRes = await fetch("/api/uploads/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: presignData.key,
              sessionId: sessionData.sessionId,
              metadata: {
                filename: fileUpload.file.name,
                contentType: fileUpload.file.type || "image/jpeg",
                sizeBytes: fileUpload.file.size,
              },
            }),
          });
          if (!completeRes.ok) {
            const message = await completeRes.text().catch(() => "");
            throw new Error(message || "Upload completion failed");
          }

          setUploadingFiles((prev) => {
            const updated = [...prev];
            updated[i] = {
              ...updated[i],
              status: "complete",
              progress: 100,
              key: presignData.key,
            };
            return updated;
          });
          completedUploads += 1;
        } catch (error) {
          console.error("Upload failed", error);
          setUploadingFiles((prev) => {
            const updated = [...prev];
            updated[i] = {
              ...updated[i],
              status: "error",
              error:
                error instanceof Error
                  ? error.message
                  : t("vionto.alert.uploadFailed"),
            };
            return updated;
          });
        }
      }

      if (completedUploads === 0) {
        alert(t("vionto.alert.noFilesUploaded"));
        return;
      }

      // Promote session to project assets
      const promoteRes = await fetch(
        `/api/projects/${selectedProjectId}/assets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionData.sessionId,
            clearSession: true,
          }),
        }
      );
      if (promoteRes.ok) {
        await loadProjectAssets(selectedProjectId);
        setUploadingFiles([]);
        setUploadSessionId(null);
      }
    } catch (error) {
      console.error("Upload flow failed", error);
      alert(t("vionto.alert.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  function removeUpload(index: number) {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function retryUpload(index: number) {
    setUploadingFiles((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        status: "pending",
        progress: 0,
        error: undefined,
      };
      return updated;
    });
  }

  const handleGenerate = useCallback(async () => {
    if (!selectedProjectId) {
      alert(t("vionto.alert.selectProjectFirst"));
      return;
    }
    setIsGenerating(true);
    try {
      // Persist settings (including targetDurationSeconds) before generation
      await saveProjectSettings();
      const apiMode = UI_MODE_TO_API_MODE[activeMode] ?? "story";
      const res = await fetch("/api/story/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          versionId: selectedVersionId ?? undefined,
          ...(!selectedVersionId && selectedAlbumId
            ? { albumId: selectedAlbumId }
            : {}),
          locale: locale.split("-")[0] ?? "en",
          mode: apiMode,
          visualStyle: selectedVisualStyle,
          userNotes: userNotes.trim() || undefined,
          // Hint to the server in case the saved value isn't available yet
          totalDurationMs: targetDurationSeconds * 1_000,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        const errorMsg =
          data.error ??
          data.message ??
          `Generation failed (status ${res.status})`;
        console.error("[ViontoPage] Generate failed:", errorMsg, data);
        alert(errorMsg);
        return;
      }
      const data = (await res.json()) as {
        scriptId: string;
        narration: string;
        srt: string;
        provider: string;
        model: string;
      };
      setVersions((prev) => [
        {
          id: data.scriptId,
          narrationText: data.narration,
          srtText: data.srt,
          provider: data.provider,
          model: data.model,
          promptVersion: "vionto-story-v1",
          isUserEdited: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setScriptStale(false);
    } finally {
      setIsGenerating(false);
    }
  }, [
    locale,
    activeMode,
    selectedVisualStyle,
    userNotes,
    selectedProjectId,
    targetDurationSeconds,
    selectedAlbumId,
  ]);

  const handleSave = useCallback(
    async (scriptId: string, narration: string, srt: string) => {
      const res = await fetch(`/api/story/${scriptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrationText: narration, srtText: srt }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? t("vionto.alert.saveFailed"));
        return;
      }
      setVersions((prev) =>
        prev.map((v) =>
          v.id === scriptId
            ? {
                ...v,
                narrationText: narration,
                srtText: srt,
                isUserEdited: true,
              }
            : v
        )
      );
    },
    []
  );

  // Handle music track selection
  const handleSelectMusicTrack = (track: NormalizedTrackMetadata) => {
    setSelectedMusicTracks((current) =>
      current.some(
        (selected) =>
          selected.trackId === track.trackId &&
          selected.provider === track.provider
      )
        ? current
        : [...current, track]
    );
    setShowMusicSelector(false);
  };

  function getAudioContentType(file: File): string {
    if (file.type) return file.type;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "mp3") return "audio/mpeg";
    if (extension === "wav") return "audio/wav";
    if (extension === "ogg") return "audio/ogg";
    if (extension === "m4a" || extension === "mp4") return "audio/mp4";
    if (extension === "webm") return "audio/webm";
    return "audio/mpeg";
  }

  async function uploadMusicFile(
    file: File
  ): Promise<{ key: string; publicUrl?: string }> {
    const contentType = getAudioContentType(file);
    const presignRes = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType,
        sizeBytes: file.size,
        category: "audio",
      }),
    });

    if (!presignRes.ok) {
      const message = await presignRes.text().catch(() => "");
      throw new Error(message || t("vionto.alert.musicUploadPrepareFailed"));
    }

    const presignData = (await presignRes.json()) as { key: string };
    const form = new FormData();
    form.append("key", presignData.key);
    form.append("file", file);

    const uploadRes = await fetch("/api/uploads/proxy", {
      method: "POST",
      body: form,
    });

    if (!uploadRes.ok) {
      const message = await uploadRes.text().catch(() => "");
      throw new Error(message || t("vionto.alert.musicUploadFailed"));
    }

    const uploadData = (await uploadRes.json()) as {
      key: string;
      publicUrl?: string;
    };
    return { key: uploadData.key, publicUrl: uploadData.publicUrl };
  }

  const clearMusicSelection = () => {
    musicPreviewAudioRef.current?.pause();
    musicPreviewAudioRef.current = null;
    setMusicPreviewTrackId(null);
    // Revoke all blob URLs
    musicBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    setMusicBlobUrls(new Set());
    setSelectedMusicTracks([]);
    setShowMusicSelector(false);
  };

  const removeMusicTrack = (track: NormalizedTrackMetadata) => {
    if (musicPreviewTrackId === track.trackId) {
      musicPreviewAudioRef.current?.pause();
      musicPreviewAudioRef.current = null;
      setMusicPreviewTrackId(null);
    }
    // Revoke blob URL if this is an uploaded track
    if (track.provider === "upload" && track.downloadUrl.startsWith("blob:")) {
      URL.revokeObjectURL(track.downloadUrl);
      setMusicBlobUrls((prev) => {
        const next = new Set(prev);
        next.delete(track.downloadUrl);
        return next;
      });
    }
    setSelectedMusicTracks((current) =>
      current.filter(
        (selected) =>
          !(
            selected.trackId === track.trackId &&
            selected.provider === track.provider
          )
      )
    );
  };

  async function loadMusicLibrary() {
    setIsLoadingMusicLibrary(true);
    setMusicLibraryError(null);
    try {
      const res = await fetch("/api/music/library");
      if (!res.ok) throw new Error("Failed to load music library");
      const data = (await res.json()) as {
        data?: AudioLibraryItem[];
        tracks?: AudioLibraryItem[];
        commonTracks?: AudioLibraryItem[];
        userTracks?: AudioLibraryItem[];
      };
      const items = data.data ?? data.tracks ?? [];
      setMusicLibrary(items);
    } catch (error) {
      console.error("Failed to load music library", error);
      setMusicLibraryError(
        error instanceof Error ? error.message : t("vionto.music.fetchError")
      );
    } finally {
      setIsLoadingMusicLibrary(false);
    }
  }

  const makeLibraryTrackMetadata = (
    item: AudioLibraryItem
  ): NormalizedTrackMetadata => {
    return item.common
      ? makeCommonTrackMetadata(item, t("vionto.music.commonArtist"))
      : makeSpacesTrackMetadata(item, t("vionto.music.libraryArtist"));
  };

  const handleSelectLibraryTrack = (item: AudioLibraryItem) => {
    const track = makeLibraryTrackMetadata(item);
    setSelectedMusicTracks((current) =>
      current.some(
        (selected) =>
          selected.trackId === track.trackId &&
          selected.provider === track.provider
      )
        ? current
        : [...current, track]
    );
    setShowMusicSelector(false);
  };

  const openMoreMusic = () => {
    setMusicSelectorTab("royaltyFree");
    setShowMusicSelector(true);
    void loadMusicLibrary();
  };

  const toggleMusicPreview = async (track: NormalizedTrackMetadata) => {
    if (musicPreviewTrackId === track.trackId) {
      musicPreviewAudioRef.current?.pause();
      musicPreviewAudioRef.current = null;
      setMusicPreviewTrackId(null);
      return;
    }

    let previewUrl = track.downloadUrl;
    if (track.storageKey) {
      const previewRes = await fetch(
        `/api/music/preview?key=${encodeURIComponent(track.storageKey)}`
      );
      const previewData = (await previewRes.json().catch(() => ({}))) as {
        previewUrl?: string;
        error?: string;
      };
      if (!previewRes.ok || !previewData.previewUrl) {
        console.error(
          "Failed to create music preview URL:",
          previewData.error ?? previewRes.statusText
        );
        setMusicPreviewTrackId(null);
        return;
      }
      previewUrl = previewData.previewUrl;
    }

    // Clean up previous audio
    if (musicPreviewAudioRef.current) {
      musicPreviewAudioRef.current.pause();
      musicPreviewAudioRef.current.src = "";
      musicPreviewAudioRef.current.load();
    }

    const audio = new Audio(previewUrl);
    musicPreviewAudioRef.current = audio;
    setMusicPreviewTrackId(track.trackId);

    const handleEnded = () => {
      setMusicPreviewTrackId(null);
      audio.removeEventListener("ended", handleEnded);
    };

    audio.addEventListener("ended", handleEnded);

    try {
      // Wait for audio to be ready to play
      await new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          audio.removeEventListener("canplay", handleCanPlay);
          audio.removeEventListener("error", handleLoadError);
          resolve();
        };
        const handleLoadError = (e: Event) => {
          audio.removeEventListener("canplay", handleCanPlay);
          audio.removeEventListener("error", handleLoadError);
          reject(
            (e.target as HTMLAudioElement)?.error ||
              new Error("Failed to load audio")
          );
        };
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("error", handleLoadError);
      });
      await audio.play();
    } catch (error) {
      console.error("Failed to play audio:", error);
      setMusicPreviewTrackId(null);
    }
  };

  const visibleMusicLibrary = musicLibrary.filter((item) =>
    musicSelectorTab === "royaltyFree" ? item.common : !item.common
  );

  return (
    <main
      className="min-h-screen text-[var(--text)]"
      style={{ background: "var(--color-bg)" }}
    >
      <section className="workspace-shell m-0">
        {/* ─── Sidebar ─────────────────────────────────────────────── */}
        <aside
          aria-label={t("vionto.aria.workspaceNav")}
          className={`sticky top-0 h-screen flex-shrink-0 flex flex-col border-r border-[var(--line)] backdrop-blur-[18px] transition-all duration-200 ${
            collapsed ? "w-[72px]" : "w-64"
          }`}
          style={{ background: "var(--color-panel-strong)", zIndex: 20 }}
        >
          {/* Logo + collapse toggle */}
          <div
            className={`flex h-14 items-center border-b border-[var(--line)] ${
              collapsed ? "justify-center px-2" : "justify-between px-4"
            }`}
          >
            <a
              href="/"
              className="flex items-center gap-2.5 overflow-hidden"
              aria-label={t("vionto.aria.home")}
            >
              <ViontoMark className="h-8 w-8 shrink-0" />
              {!collapsed && (
                <div className="brand-text flex flex-col leading-tight max-sm:hidden">
                  <span
                    className="text-sm font-bold tracking-tight"
                    style={{ color: "var(--text)" }}
                  >
                    Vionto
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--muted)" }}
                  >
                    Vision + Canto
                  </span>
                </div>
              )}
            </a>
            {!collapsed && (
              <button
                type="button"
                onClick={() => {
                  window.localStorage.setItem("vionto:sidebar", "collapsed");
                  setCollapsed(true);
                }}
                title={t("vionto.aria.collapseSidebar")}
                aria-label={t("vionto.aria.collapseSidebar")}
                className="collapse-toggle h-7 w-7 flex items-center justify-center rounded-md transition-colors max-sm:hidden"
                style={{ color: "var(--muted)" }}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            {collapsed && (
              <button
                type="button"
                onClick={() => {
                  window.localStorage.setItem("vionto:sidebar", "expanded");
                  setCollapsed(false);
                }}
                title={t("vionto.aria.expandSidebar")}
                aria-label={t("vionto.aria.expandSidebar")}
                className="collapse-toggle mt-1 h-7 w-7 flex items-center justify-center rounded-md transition-colors max-sm:hidden"
                style={{ color: "var(--muted)" }}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Nav */}
          <nav
            className="flex-1 overflow-y-auto px-2 py-3"
            aria-label={t("vionto.aria.primaryNav")}
          >
            <ul className="space-y-0.5">
              {NAV_ITEMS.map(({ href, labelKey, Icon }, idx) => (
                <li key={href}>
                  <a
                    href={href}
                    title={t(labelKey)}
                    className={`group flex items-center gap-3 rounded-lg py-2 text-sm transition-colors ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      idx === 0
                        ? "bg-[var(--color-primary-soft)] text-[var(--text)]"
                        : "text-[var(--muted)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span>{t(labelKey)}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer MVP panel */}
          {!collapsed && (
            <div
              className="mx-3 mb-3 rounded-2xl border border-[var(--line)] p-3"
              style={{ background: "var(--color-panel)" }}
            >
              <p className="panel-label">MVP target</p>
              <strong className="text-xs" style={{ color: "var(--text)" }}>
                First MP4 in 10 minutes
              </strong>
              <span
                className="text-xs"
                style={{
                  color: "var(--muted)",
                  lineHeight: 1.5,
                  display: "block",
                  marginTop: 2,
                }}
              >
                30–60 images → narrated story + subtitles.
              </span>
            </div>
          )}
        </aside>

        <section className="main-panel">
          <header className="topbar">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-[var(--muted)] sm:inline">
                ASafariM
              </span>
              <span className="hidden text-[var(--muted)] sm:inline">/</span>
              <span className="hidden text-[var(--muted)] md:inline">
                Vionto
              </span>
              <span className="hidden text-[var(--muted)] md:inline">/</span>
              <span className="truncate font-medium text-[var(--text)]">
                {t("vionto.nav.create")}
              </span>
            </div>
            {/* Desktop controls — hidden below portrait tablet */}
            <div className="hidden md:flex items-center gap-2">
              <CountryLanguageSelector key={"language-selector"} />
              <ViontoTopbarControls />
              <a
                className="portal-link"
                href={
                  process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001"
                }
              >
                ASafarIM Hub <ArrowRight size={16} />
              </a>
            </div>
            {/* Hamburger — visible below portrait tablet */}
            <button
              type="button"
              aria-label={
                mobileMenuOpen
                  ? t("vionto.aria.closeMenu")
                  : t("vionto.aria.openMenu")
              }
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] transition hover:bg-white/[0.06]"
              style={{ color: "var(--text)" }}
            >
              {mobileMenuOpen ? (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    d="M2 4h12M2 8h12M2 12h12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </header>
          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div
              className="md:hidden flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3"
              style={{ background: "var(--color-panel-strong)" }}
            >
              <ViontoTopbarControls />
              <a
                className="portal-link inline-flex w-full justify-center"
                href={
                  process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001"
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                ASafarIM Hub <ArrowRight size={16} />
              </a>
            </div>
          )}

          <div className="px-5 pt-5 pb-1">
            <p className="eyebrow">Photo-to-story video MVP</p>
            <h1
              className="mt-1 text-2xl font-semibold"
              style={{ fontSize: "1.5rem", lineHeight: 1.25 }}
            >
              Turn memories into poetic motion.
            </h1>
          </div>

          <div className="creator-grid" id="create">
            <section
              className="upload-panel w-full max-w-full"
              id="uploads"
              aria-labelledby="upload-title"
            >
              <div>
                <p className="eyebrow">{t("vionto.upload.eyebrow")}</p>
                <h2 id="upload-title">{t("vionto.upload.title")}</h2>
                <p>{t("vionto.upload.subtitle")}</p>
              </div>

              {/* Project picker */}
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">
                    {t("vionto.project.label")}
                  </label>
                  <a
                    href="/projects"
                    className="text-xs font-medium text-[var(--color-accent)] hover:underline flex items-center gap-1"
                  >
                    Manage projects
                    <ArrowRight size={11} />
                  </a>
                </div>
                <div className="project-picker-row mt-1">
                  <select
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    value={selectedProjectId ?? ""}
                    onChange={(e) => selectProject(e.target.value || null)}
                    disabled={isLoadingProjects || isUploading}
                  >
                    <option value="">
                      {t("vionto.project.selectPlaceholder")}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsCreatingProject(true)}
                    disabled={isUploading}
                    className="project-new-button inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                  >
                    <Plus size={16} /> {t("vionto.project.new")}
                  </button>
                </div>

                {/* Create project inline form */}
                {isCreatingProject && (
                  <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      placeholder={t("vionto.project.titlePlaceholder")}
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        !isSubmittingProject &&
                        createProject()
                      }
                      disabled={isSubmittingProject}
                      autoFocus
                    />
                    <select
                      value={selectedTemplateId}
                      onChange={(e) =>
                        applyTemplateToDraft(
                          e.target.value as VideoTemplateId | ""
                        )
                      }
                      disabled={isSubmittingProject}
                      className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    >
                      <option value="">Manual setup</option>
                      {VIDEO_TEMPLATES.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    {selectedTemplateId && (
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {getVideoTemplate(selectedTemplateId)?.summary}
                      </p>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingProject(false);
                          setNewProjectTitle("");
                        }}
                        disabled={isSubmittingProject}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={createProject}
                        disabled={
                          !newProjectTitle.trim() || isSubmittingProject
                        }
                        className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                      >
                        {isSubmittingProject ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {t("vionto.project.create")}
                          </>
                        ) : (
                          <>
                            <Plus size={14} />
                            {t("vionto.project.create")}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Video Version Selector ─────────────────────────────────── */}
              {selectedProjectId && videoVersions.length > 0 && (
                <div className="mt-3">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-xs font-medium text-[var(--color-text-muted)]">
                      Video Version
                    </label>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                      <select
                        value={versionTemplateId}
                        onChange={(e) =>
                          setVersionTemplateId(
                            e.target.value as VideoTemplateId | ""
                          )
                        }
                        className="min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] sm:max-w-36"
                        aria-label="Video template"
                      >
                        <option value="">Manual</option>
                        {VIDEO_TEMPLATES.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          createVideoVersion(undefined, selectedAlbumId)
                        }
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
                      >
                        <Plus size={11} /> New version
                      </button>
                    </div>
                  </div>
                  <div className="version-tabs mt-1.5 flex gap-1 overflow-x-auto pb-1">
                    {videoVersions.map((version) => {
                      const isActive = version.id === selectedVersionId;
                      const isRenaming = version.id === renamingVersionId;

                      return (
                        <div
                          key={version.id}
                          className={`group relative flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition cursor-pointer select-none whitespace-nowrap ${
                            isActive
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)] font-medium"
                              : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50"
                          }`}
                          onClick={() => {
                            if (!isRenaming) setSelectedVersionId(version.id);
                          }}
                        >
                          <Clapperboard
                            size={13}
                            className="flex-shrink-0 opacity-60"
                          />

                          {isRenaming ? (
                            <form
                              className="flex items-center gap-1"
                              onSubmit={(e) => {
                                e.preventDefault();
                                renameVideoVersion(version.id, renameValue);
                                setRenamingVersionId(null);
                              }}
                            >
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape")
                                    setRenamingVersionId(null);
                                }}
                              />
                              <button
                                type="submit"
                                className="rounded p-0.5 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingVersionId(null);
                                }}
                                className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                              >
                                <X size={12} />
                              </button>
                            </form>
                          ) : (
                            <>
                              <span className="min-w-0 max-w-[12rem] truncate">
                                {version.name}
                              </span>
                              {version.albumId && (
                                <span className="ml-1 max-w-[8rem] truncate rounded bg-[var(--color-surface)] px-1 py-0.5 text-[9px] text-[var(--color-text-muted)]">
                                  {albums.find((a) => a.id === version.albumId)
                                    ?.name ?? "Album"}
                                </span>
                              )}
                              {version.templateId && (
                                <span className="ml-1 rounded bg-[var(--color-accent)]/10 px-1 py-0.5 text-[9px] text-[var(--color-accent)]">
                                  {getVideoTemplate(version.templateId)?.name ??
                                    "Template"}
                                </span>
                              )}
                            </>
                          )}

                          {/* Action buttons - show on hover for active tab */}
                          {isActive && !isRenaming && (
                            <span className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                title="Rename"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingVersionId(version.id);
                                  setRenameValue(version.name);
                                }}
                                className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                title="Duplicate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateVideoVersion(version.id);
                                }}
                                className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                              >
                                <Copy size={11} />
                              </button>
                              {videoVersions.length > 1 && (
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      confirm(
                                        "Delete this version? This cannot be undone."
                                      )
                                    ) {
                                      deleteVideoVersion(version.id);
                                    }
                                  }}
                                  className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50/10"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Version stats badge */}
                  {selectedVersionId &&
                    (() => {
                      const v = videoVersions.find(
                        (ver) => ver.id === selectedVersionId
                      );
                      if (!v) return null;
                      const stats = [
                        v._count.scripts > 0 &&
                          `${v._count.scripts} script${v._count.scripts > 1 ? "s" : ""}`,
                        v._count.renderJobs > 0 &&
                          `${v._count.renderJobs} render${v._count.renderJobs > 1 ? "s" : ""}`,
                        v._count.exports > 0 &&
                          `${v._count.exports} export${v._count.exports > 1 ? "s" : ""}`,
                      ].filter(Boolean);
                      if (stats.length === 0) return null;
                      return (
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                          {stats.join(" · ")}
                        </p>
                      );
                    })()}
                </div>
              )}
              {/* ─── End Video Version Selector ─────────────────────────────── */}

              {/* Upload dropzone */}
              {selectedProjectId && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptedMime}
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                    disabled={isUploading}
                  />

                  <div
                    className="dropzone"
                    role="button"
                    tabIndex={0}
                    aria-label={t("vionto.upload.dropzoneLabel")}
                    onClick={() =>
                      !isUploading && fileInputRef.current?.click()
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !isUploading &&
                      fileInputRef.current?.click()
                    }
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDropzoneDrop}
                    style={
                      isDragging
                        ? {
                            borderColor: "var(--coral)",
                            background: "rgba(243,111,86,0.12)",
                          }
                        : undefined
                    }
                  >
                    <CloudUpload
                      size={34}
                      style={{ color: isDragging ? "var(--coral)" : undefined }}
                    />
                    <strong>
                      {uploadingFiles.length > 0
                        ? `${uploadingFiles.length} file${uploadingFiles.length > 1 ? "s" : ""} selected`
                        : t("vionto.upload.dropzoneLabel")}
                    </strong>
                    <span>{t("vionto.upload.dropzoneHint")}</span>
                  </div>

                  {/* Upload list with progress */}
                  {uploadingFiles.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {uploadingFiles.slice(0, 5).map((f, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                            {f.file.name}
                          </span>
                          {f.status === "uploading" && (
                            <RefreshCw
                              size={14}
                              className="animate-spin text-[var(--muted)]"
                            />
                          )}
                          {f.status === "complete" && (
                            <span className="text-[var(--coral)]">✓</span>
                          )}
                          {f.status === "error" && (
                            <button
                              type="button"
                              onClick={() => retryUpload(i)}
                              className="text-[var(--muted)] hover:text-[var(--text)]"
                              aria-label={t("vionto.aria.retry")}
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeUpload(i)}
                            disabled={f.status === "uploading"}
                            className="shrink-0 text-[var(--muted)] hover:text-[var(--coral)] transition-colors disabled:opacity-50"
                            aria-label={`Remove ${f.file.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                      {uploadingFiles.length > 5 && (
                        <li className="px-3 py-1 text-xs text-[var(--muted)]">
                          +{uploadingFiles.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Upload button */}
                  {uploadingFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={startUploads}
                      disabled={
                        isUploading ||
                        uploadingFiles.every((f) => f.status === "complete")
                      }
                      className="mt-2 w-full rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        "Upload"
                      )}
                    </button>
                  )}

                  {/* Import photos directly from Google Photos */}
                  <GooglePhotosImportPanel
                    projectId={selectedProjectId}
                    onImported={async () => {
                      await loadProjectAssets(selectedProjectId);
                      const baseAlbum =
                        albums.find((a) => a.isBase) ?? albums[0];
                      if (baseAlbum) {
                        await loadAlbumItems(selectedProjectId, baseAlbum.id);
                      }
                    }}
                  />
                </>
              )}

              {/* Show persisted assets */}
              {selectedProjectId && projectAssets.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setIsAssetsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between gap-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    <span>
                      {t("vionto.project.assets")} ({projectAssets.length})
                    </span>
                    {isAssetsExpanded ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                  {isAssetsExpanded && (
                    <ul className="project-assets-grid mt-1">
                      {projectAssets.map((a, idx) => (
                        <li
                          key={a.id}
                          draggable
                          onDragStart={() => {
                            dragAssetId.current = a.id;
                            setDragActiveId(a.id);
                          }}
                          onDragEnter={() => {
                            dragOverAssetId.current = a.id;
                            setDragOverId(a.id);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnd={() => {
                            const fromId = dragAssetId.current;
                            const toId = dragOverAssetId.current;
                            dragAssetId.current = null;
                            dragOverAssetId.current = null;
                            setDragActiveId(null);
                            setDragOverId(null);
                            if (!fromId || !toId || fromId === toId) return;
                            const from = projectAssets.findIndex(
                              (x) => x.id === fromId
                            );
                            const to = projectAssets.findIndex(
                              (x) => x.id === toId
                            );
                            if (from === -1 || to === -1) return;
                            const next = [...projectAssets];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            reorderAssets(
                              next.map((x, i) => ({ ...x, orderIndex: i }))
                            );
                          }}
                          className={`asset-tile rounded-lg bg-[var(--color-surface-soft)] border overflow-hidden relative group cursor-grab active:cursor-grabbing transition-all ${
                            dragActiveId === a.id
                              ? "opacity-40 scale-95 border-[var(--color-accent)]"
                              : dragOverId === a.id
                                ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50 scale-105"
                                : "border-[var(--line)]"
                          }`}
                        >
                          <span className="absolute top-1 right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white">
                            {idx + 1}
                          </span>
                          <img
                            src={a.thumbnailUrl ?? a.originalUrl}
                            alt=""
                            className="pointer-events-none"
                          />
                          <button
                            type="button"
                            onClick={() => deleteAsset(a.id)}
                            className="absolute top-1 left-1 p-1.5 rounded-md bg-black/50 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label={`Delete ${a.id}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                      {false && projectAssets.length > 8 && (
                        <li className="flex items-center justify-center aspect-square rounded-lg bg-[var(--color-surface-soft)] border border-[var(--line)] text-xs text-[var(--muted)]">
                          +{projectAssets.length - 8} {t("vionto.asset.more")}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* ─── Album Management ──────────────────────────────────────── */}
              {selectedProjectId && (
                <div
                  className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2.5"
                  aria-label="Album management"
                >
                  {/* Album selector bar */}
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-muted)]">
                        Album for active version
                      </p>
                      {activeVersion && (
                        <p className="text-[10px] text-[var(--color-text-muted)] break-words">
                          {activeVersion.name} renders from{" "}
                          {selectedAlbum?.name ?? "the selected album"}.
                        </p>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                      <select
                        value={albumCollectionFilter}
                        onChange={(e) =>
                          setAlbumCollectionFilter(e.target.value)
                        }
                        className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                        aria-label="Album collection"
                      >
                        <option value="">All</option>
                        {COLLECTION_OPTIONS.map((collection) => (
                          <option key={collection} value={collection}>
                            {collection}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowCreateAlbum(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        <Plus size={12} />
                        New album
                      </button>
                    </div>
                  </div>

                  {isLoadingAlbums ? (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Loading albums…
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {albums.map((album) => (
                        <div
                          key={album.id}
                          className="group relative flex min-w-0 items-center gap-1"
                        >
                          {renamingAlbumId === album.id ? (
                            <input
                              type="text"
                              value={renameAlbumValue}
                              autoFocus
                              onChange={(e) =>
                                setRenameAlbumValue(e.target.value)
                              }
                              onBlur={() => handleRenameAlbum(album.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleRenameAlbum(album.id);
                                if (e.key === "Escape") {
                                  setRenamingAlbumId(null);
                                  setRenameAlbumValue("");
                                }
                              }}
                              className="w-32 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text)] outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                selectAlbumForActiveVersion(album.id)
                              }
                              onDoubleClick={() => {
                                if (!album.isBase) {
                                  setRenamingAlbumId(album.id);
                                  setRenameAlbumValue(album.name);
                                }
                              }}
                              className={`flex min-w-0 max-w-full items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                selectedAlbumId === album.id
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                  : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
                              }`}
                            >
                              {album.isBase && (
                                <span className="mr-0.5 text-[10px] opacity-60">
                                  ★
                                </span>
                              )}
                              {!album.isBase &&
                                album.privacyLevel === "private" && (
                                  <Lock size={9} className="opacity-50" />
                                )}
                              {!album.isBase &&
                                album.privacyLevel === "unlisted" && (
                                  <EyeOff size={9} className="opacity-50" />
                                )}
                              {!album.isBase &&
                                album.privacyLevel === "public" && (
                                  <Globe size={9} className="opacity-50" />
                                )}
                              {album.isFavorite && (
                                <span className="text-[10px] text-[var(--color-accent)]">
                                  ★
                                </span>
                              )}
                              <span className="min-w-0 max-w-[10rem] truncate">
                                {album.name}
                              </span>
                              {album.id === activeVersionAlbumId && (
                                <span className="rounded bg-[var(--color-accent)]/10 px-1 text-[9px] text-[var(--color-accent)]">
                                  linked
                                </span>
                              )}
                              <span className="rounded bg-[var(--color-accent)]/10 px-1 text-[9px] text-[var(--color-accent)]">
                                {LIFECYCLE_LABELS[album.lifecycleStage]
                                  ?.label ?? album.lifecycleStage}
                              </span>
                              <span className="ml-1 rounded bg-[var(--color-surface)] px-1 text-[10px] text-[var(--color-text-muted)]">
                                {album._count.items}
                              </span>
                            </button>
                          )}
                          {!album.isBase && selectedAlbumId !== album.id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteAlbum(album.id, album.name)
                              }
                              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-500 group-hover:flex"
                              aria-label={`Delete ${album.name}`}
                            >
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Create album modal */}
                  {showCreateAlbum && (
                    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">
                        New album
                      </p>
                      <input
                        type="text"
                        placeholder="Album name"
                        value={newAlbumName}
                        autoFocus
                        onChange={(e) => setNewAlbumName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCreateAlbum()
                        }
                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newAlbumDesc}
                        onChange={(e) => setNewAlbumDesc(e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                      <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text)]">
                        <input
                          type="checkbox"
                          checked={newAlbumFromBase}
                          onChange={(e) =>
                            setNewAlbumFromBase(e.target.checked)
                          }
                          className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                        />
                        Start with all images from base album
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCreateAlbumDetails((v) => !v)}
                        className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {showCreateAlbumDetails ? (
                          <ChevronUp size={10} />
                        ) : (
                          <ChevronDown size={10} />
                        )}
                        Details (optional)
                      </button>
                      {showCreateAlbumDetails && (
                        <div className="mt-1.5 space-y-1.5 border-t border-[var(--color-border)] pt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                Date from
                              </label>
                              <input
                                type="date"
                                value={newAlbumDateFrom}
                                onChange={(e) =>
                                  setNewAlbumDateFrom(e.target.value)
                                }
                                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                Date to
                              </label>
                              <input
                                type="date"
                                value={newAlbumDateTo}
                                onChange={(e) =>
                                  setNewAlbumDateTo(e.target.value)
                                }
                                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                              Location
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Paris, France"
                              value={newAlbumLocation}
                              onChange={(e) =>
                                setNewAlbumLocation(e.target.value)
                              }
                              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                              People
                            </label>
                            <input
                              type="text"
                              placeholder="Comma-separated names"
                              value={newAlbumPeople}
                              onChange={(e) =>
                                setNewAlbumPeople(e.target.value)
                              }
                              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                Occasion
                              </label>
                              <input
                                type="text"
                                list="occasion-suggestions"
                                placeholder="e.g., wedding"
                                value={newAlbumOccasion}
                                onChange={(e) =>
                                  setNewAlbumOccasion(e.target.value)
                                }
                                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                              />
                              <datalist id="occasion-suggestions">
                                {OCCASION_SUGGESTIONS.map((o) => (
                                  <option key={o} value={o} />
                                ))}
                              </datalist>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                Mood
                              </label>
                              <input
                                type="text"
                                list="mood-suggestions"
                                placeholder="e.g., joyful"
                                value={newAlbumMood}
                                onChange={(e) =>
                                  setNewAlbumMood(e.target.value)
                                }
                                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                              />
                              <datalist id="mood-suggestions">
                                {MOOD_SUGGESTIONS.map((m) => (
                                  <option key={m} value={m} />
                                ))}
                              </datalist>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                              Privacy
                            </label>
                            <select
                              value={newAlbumPrivacy}
                              onChange={(e) =>
                                setNewAlbumPrivacy(e.target.value)
                              }
                              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                            >
                              {PRIVACY_LEVELS.map((p) => (
                                <option key={p} value={p}>
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-medium text-[var(--color-text-muted)]">
                              Collections
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {COLLECTION_OPTIONS.filter(
                                (collection) => collection !== "favorites"
                              ).map((collection) => (
                                <button
                                  key={collection}
                                  type="button"
                                  onClick={() =>
                                    toggleCollection(
                                      collection,
                                      newAlbumCollections,
                                      setNewAlbumCollections
                                    )
                                  }
                                  className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                    newAlbumCollections.includes(collection)
                                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                      : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                                  }`}
                                >
                                  {collection}
                                </button>
                              ))}
                              <label className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                                <input
                                  type="checkbox"
                                  checked={newAlbumFavorite}
                                  onChange={(e) =>
                                    setNewAlbumFavorite(e.target.checked)
                                  }
                                  className="h-3 w-3 accent-[var(--color-accent)]"
                                />
                                favorite
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateAlbum(false);
                            setNewAlbumName("");
                            setNewAlbumDesc("");
                          }}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateAlbum}
                          disabled={!newAlbumName.trim() || isCreatingAlbum}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                        >
                          {isCreatingAlbum ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Plus size={12} />
                          )}
                          Create
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Selected album image grid */}
                  {selectedAlbumId && (
                    <div className="mt-3">
                      {selectedAlbum && (
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-[var(--color-accent)]/10 px-2 py-0.5 font-medium text-[var(--color-accent)]">
                            {LIFECYCLE_LABELS[selectedAlbum.lifecycleStage]
                              ?.label ?? selectedAlbum.lifecycleStage}
                          </span>
                          <span className="text-[var(--color-text-muted)]">
                            Next:{" "}
                            {LIFECYCLE_LABELS[selectedAlbum.lifecycleStage]
                              ?.next ?? "Continue"}
                          </span>
                        </div>
                      )}
                      {/* Toolbar for non-base albums */}
                      {!isBaseAlbumSelected && (
                        <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="min-w-0 text-xs text-[var(--color-text-muted)] break-words">
                            {selectedAlbum?.name} · {albumItems.length} images ·
                            drag to reorder
                          </p>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedAlbum)
                                  openAlbumDetails(selectedAlbum);
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
                            >
                              <Pencil size={12} />
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddImages(true);
                                setAddImageSelection(new Set());
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
                            >
                              <ImagePlus size={12} />
                              Add images
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSortAlbum("date_asc")}
                              disabled={isSorting || albumItems.length < 2}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
                              title="Sort images by EXIF date (oldest first)"
                            >
                              {isSorting ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <ArrowUpDown size={12} />
                              )}
                              Sort by date
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSortAlbum("location")}
                              disabled={isSorting || albumItems.length < 2}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
                              title="Group images by GPS location"
                            >
                              {isSorting ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <MapPin size={12} />
                              )}
                              Group by location
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Edit album details panel */}
                      {showAlbumDetails &&
                        !isBaseAlbumSelected &&
                        selectedAlbum && (
                          <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold text-[var(--color-text)]">
                                Album details
                              </p>
                              <span className="rounded-md bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                                {LIFECYCLE_LABELS[selectedAlbum.lifecycleStage]
                                  ?.label ?? selectedAlbum.lifecycleStage}
                              </span>
                              <span className="text-[10px] text-[var(--color-text-muted)]">
                                Next:{" "}
                                {LIFECYCLE_LABELS[selectedAlbum.lifecycleStage]
                                  ?.next ?? "Continue"}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div>
                                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                  Description
                                </label>
                                <input
                                  type="text"
                                  placeholder="Album description"
                                  value={editDescription}
                                  onChange={(e) =>
                                    setEditDescription(e.target.value)
                                  }
                                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                    Date from
                                  </label>
                                  <input
                                    type="date"
                                    value={editDateFrom}
                                    onChange={(e) =>
                                      setEditDateFrom(e.target.value)
                                    }
                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                    Date to
                                  </label>
                                  <input
                                    type="date"
                                    value={editDateTo}
                                    onChange={(e) =>
                                      setEditDateTo(e.target.value)
                                    }
                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                  Location
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., Paris, France"
                                  value={editLocation}
                                  onChange={(e) =>
                                    setEditLocation(e.target.value)
                                  }
                                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                  People
                                </label>
                                <input
                                  type="text"
                                  placeholder="Comma-separated names"
                                  value={editPeople}
                                  onChange={(e) =>
                                    setEditPeople(e.target.value)
                                  }
                                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                    Occasion
                                  </label>
                                  <input
                                    type="text"
                                    list="edit-occasion-suggestions"
                                    placeholder="e.g., wedding"
                                    value={editOccasion}
                                    onChange={(e) =>
                                      setEditOccasion(e.target.value)
                                    }
                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                  />
                                  <datalist id="edit-occasion-suggestions">
                                    {OCCASION_SUGGESTIONS.map((o) => (
                                      <option key={o} value={o} />
                                    ))}
                                  </datalist>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                    Mood
                                  </label>
                                  <input
                                    type="text"
                                    list="edit-mood-suggestions"
                                    placeholder="e.g., joyful"
                                    value={editMood}
                                    onChange={(e) =>
                                      setEditMood(e.target.value)
                                    }
                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                  />
                                  <datalist id="edit-mood-suggestions">
                                    {MOOD_SUGGESTIONS.map((m) => (
                                      <option key={m} value={m} />
                                    ))}
                                  </datalist>
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">
                                  Privacy
                                </label>
                                <select
                                  value={editPrivacy}
                                  onChange={(e) =>
                                    setEditPrivacy(e.target.value)
                                  }
                                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                                >
                                  {PRIVACY_LEVELS.map((p) => (
                                    <option key={p} value={p}>
                                      {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-medium text-[var(--color-text-muted)]">
                                  Collections
                                </label>
                                <div className="flex flex-wrap gap-1">
                                  {COLLECTION_OPTIONS.filter(
                                    (collection) => collection !== "favorites"
                                  ).map((collection) => (
                                    <button
                                      key={collection}
                                      type="button"
                                      onClick={() =>
                                        toggleCollection(
                                          collection,
                                          editCollections,
                                          setEditCollections
                                        )
                                      }
                                      className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                        editCollections.includes(collection)
                                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                          : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                                      }`}
                                    >
                                      {collection}
                                    </button>
                                  ))}
                                  <label className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                                    <input
                                      type="checkbox"
                                      checked={editFavorite}
                                      onChange={(e) =>
                                        setEditFavorite(e.target.checked)
                                      }
                                      className="h-3 w-3 accent-[var(--color-accent)]"
                                    />
                                    favorite
                                  </label>
                                </div>
                              </div>
                            </div>
                            {albumDetailsError && (
                              <p className="mt-1.5 text-[10px] text-red-500">
                                {albumDetailsError}
                              </p>
                            )}
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowAlbumDetails(false)}
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveAlbumDetails}
                                disabled={isSavingAlbumDetails}
                                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                              >
                                {isSavingAlbumDetails ? (
                                  <RefreshCw
                                    size={12}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Check size={12} />
                                )}
                                Save
                              </button>
                            </div>
                          </div>
                        )}

                      {/* Linked video versions for this album */}
                      {selectedAlbum &&
                        !isBaseAlbumSelected &&
                        (() => {
                          const albumVersions = videoVersions.filter(
                            (v) => v.albumId === selectedAlbumId
                          );
                          return (
                            <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
                                Video versions using this album:
                              </span>
                              {albumVersions.length === 0 && (
                                <span className="text-[10px] text-[var(--color-text-muted)] italic">
                                  None yet
                                </span>
                              )}
                              {albumVersions.map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => setSelectedVersionId(v.id)}
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                    v.id === selectedVersionId
                                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                      : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50"
                                  }`}
                                >
                                  <Clapperboard size={9} />
                                  {v.name}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    !confirm(
                                      `Create a new video version linked to "${selectedAlbum.name}"?\n\nThis adds a new entry in the Video Version tabs above — it is separate from the album itself.`
                                    )
                                  )
                                    return;
                                  createVideoVersion(
                                    `${selectedAlbum.name} - Version ${albumVersions.length + 1}`,
                                    selectedAlbumId
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                                title="Create a brand-new video version linked to this album"
                              >
                                <Plus size={9} />
                                New video version
                              </button>
                            </div>
                          );
                        })()}

                      {/* Add images panel */}
                      {showAddImages && !isBaseAlbumSelected && (
                        <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                          <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">
                            Select images to add (from base album)
                          </p>
                          <ul className="project-assets-grid">
                            {projectAssets
                              .filter(
                                (a) =>
                                  !albumItems.some((i) => i.assetId === a.id)
                              )
                              .map((a) => (
                                <li
                                  key={a.id}
                                  onClick={() =>
                                    setAddImageSelection((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(a.id)) next.delete(a.id);
                                      else next.add(a.id);
                                      return next;
                                    })
                                  }
                                  className={`asset-tile relative cursor-pointer rounded-lg border overflow-hidden transition-all ${
                                    addImageSelection.has(a.id)
                                      ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50"
                                      : "border-[var(--line)] hover:border-[var(--color-accent)]"
                                  }`}
                                >
                                  <img
                                    src={a.thumbnailUrl ?? a.originalUrl}
                                    alt=""
                                    className="pointer-events-none"
                                  />
                                  {addImageSelection.has(a.id) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-accent)]/20">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-xs font-bold">
                                        ✓
                                      </span>
                                    </div>
                                  )}
                                </li>
                              ))}
                          </ul>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddImages(false);
                                setAddImageSelection(new Set());
                              }}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddImagesToAlbum}
                              disabled={addImageSelection.size === 0}
                              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                            >
                              Add{" "}
                              {addImageSelection.size > 0
                                ? `${addImageSelection.size} `
                                : ""}
                              image{addImageSelection.size !== 1 ? "s" : ""}
                            </button>
                          </div>
                        </div>
                      )}

                      {isLoadingAlbumItems ? (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Loading…
                        </p>
                      ) : albumItems.length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {isBaseAlbumSelected
                            ? "No images yet — upload some above."
                            : "No images in this album yet."}
                        </p>
                      ) : (
                        <ul className="project-assets-grid">
                          {albumItems.map((item, idx) => {
                            // Find if a location group header should appear before this item.
                            const groupHeader = locationGroups?.find(
                              (g) => g.startIndex === idx
                            );
                            return (
                              <Fragment key={item.id}>
                                {groupHeader && (
                                  <li
                                    style={{ gridColumn: "1 / -1" }}
                                    className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2 pb-1"
                                  >
                                    <MapPin
                                      size={12}
                                      className="text-[var(--color-accent)] shrink-0"
                                    />
                                    <span className="text-[11px] font-medium text-[var(--color-text)]">
                                      {groupHeader.label}
                                    </span>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                      {groupHeader.count}{" "}
                                      {groupHeader.count === 1
                                        ? "photo"
                                        : "photos"}
                                    </span>
                                  </li>
                                )}
                                <li
                                  draggable
                                  onDragStart={() => {
                                    dragAlbumItemId.current = item.id;
                                    setDragAlbumActiveId(item.id);
                                  }}
                                  onDragEnter={() => {
                                    dragOverAlbumItemId.current = item.id;
                                    setDragAlbumOverId(item.id);
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDragEnd={() => {
                                    const fromId = dragAlbumItemId.current;
                                    const toId = dragOverAlbumItemId.current;
                                    dragAlbumItemId.current = null;
                                    dragOverAlbumItemId.current = null;
                                    setDragAlbumActiveId(null);
                                    setDragAlbumOverId(null);
                                    if (!fromId || !toId || fromId === toId)
                                      return;
                                    const from = albumItems.findIndex(
                                      (x) => x.id === fromId
                                    );
                                    const to = albumItems.findIndex(
                                      (x) => x.id === toId
                                    );
                                    if (from === -1 || to === -1) return;
                                    const next = [...albumItems];
                                    const [moved] = next.splice(from, 1);
                                    next.splice(to, 0, moved);
                                    reorderAlbumItems(
                                      next.map((x, i) => ({
                                        ...x,
                                        orderIndex: i,
                                      }))
                                    );
                                  }}
                                  className={`asset-tile rounded-lg bg-[var(--color-surface-soft)] border overflow-hidden relative group cursor-grab active:cursor-grabbing transition-all ${
                                    dragAlbumActiveId === item.id
                                      ? "opacity-40 scale-95 border-[var(--color-accent)]"
                                      : dragAlbumOverId === item.id
                                        ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/50 scale-105"
                                        : "border-[var(--line)]"
                                  }`}
                                >
                                  <span className="absolute top-1 right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white">
                                    {idx + 1}
                                  </span>
                                  <img
                                    src={
                                      item.asset.thumbnailUrl ??
                                      item.asset.originalUrl ??
                                      ""
                                    }
                                    alt=""
                                    className="pointer-events-none"
                                  />
                                  {item.metadata &&
                                    Object.keys(item.metadata).length > 0 && (
                                      <span className="absolute bottom-1 left-1 z-10 rounded bg-[var(--color-accent)]/80 px-1 py-0.5 text-[8px] font-semibold text-white">
                                        meta
                                      </span>
                                    )}
                                  <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => openMetaEditor(item)}
                                      className="p-1 rounded-md bg-black/50 hover:bg-[var(--color-accent)]/80 text-white"
                                      aria-label="Edit metadata"
                                      title="Edit metadata"
                                    >
                                      <ListChecks size={13} />
                                    </button>
                                    {!isBaseAlbumSelected && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveFromAlbum(item.id)
                                        }
                                        className="p-1 rounded-md bg-black/50 hover:bg-red-500/80 text-white"
                                        aria-label="Remove from album"
                                        title="Remove from album"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </li>
                              </Fragment>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── Per-image metadata editor modal ───────────────────────── */}
              {metaEditorItemId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {metaEditorAssetUrl && (
                          <img
                            src={metaEditorAssetUrl}
                            alt=""
                            className="h-12 w-12 rounded-md border border-[var(--color-border)] object-cover"
                          />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">
                            Image metadata
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Album: {selectedAlbum?.name} · stored per-album, not
                            globally
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMetaEditorItemId(null)}
                        className="shrink-0 rounded-full p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                      Enter flexible JSON metadata for this image in this album.
                      Examples: place, personName, occasion, mood, people,
                      dateLabel, captionHint.
                    </p>
                    <textarea
                      value={metaEditorValue}
                      onChange={(e) => {
                        setMetaEditorValue(e.target.value);
                        setMetaEditorError(null);
                      }}
                      rows={8}
                      spellCheck={false}
                      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 font-mono text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      placeholder={
                        '{\n  "place": "Bern",\n  "personName": "Sara",\n  "occasion": "graduation"\n}'
                      }
                    />
                    {metaEditorError && (
                      <p className="mt-1.5 text-xs text-red-500">
                        {metaEditorError}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setMetaEditorItemId(null)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMetaEditorValue("");
                          setMetaEditorError(null);
                        }}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={saveItemMetadata}
                        disabled={isSavingMeta}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                      >
                        {isSavingMeta ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : null}
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* ─── End Album Management ───────────────────────────────────── */}

              {/* ─── Video Settings separator ────────────────────────────────── */}
              <hr
                className="settings-separator"
                role="separator"
                aria-hidden="true"
              />

              <div
                className="mode-row"
                aria-label={t("vionto.aria.videoModePresets")}
              >
                {modes.map((mode) => (
                  <button
                    key={mode}
                    className={`mode mode-${mode}${mode === activeMode ? " active" : ""}`}
                    type="button"
                    onClick={() => setActiveMode(mode)}
                  >
                    <span>{t(`vionto.mode.${mode}`)}</span>
                  </button>
                ))}
              </div>

              <div
                className="settings-row mt-3"
                aria-label={t("vionto.storyMode.label")}
              >
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    {t("vionto.storyMode.label")}
                  </p>
                  <select
                    value={selectedStoryMode}
                    onChange={(e) => setSelectedStoryMode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]"
                  >
                    {STORY_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    {t("vionto.emotionalTone.label")}
                  </p>
                  <select
                    value={selectedEmotionalTone}
                    onChange={(e) => setSelectedEmotionalTone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]"
                  >
                    {EMOTIONAL_TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3" aria-label={t("vionto.visualStyle.label")}>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  {t("vionto.visualStyle.label")}
                </p>
                <div className="visual-style-grid mt-2">
                  {VISUAL_STYLE_OPTIONS.map((option) => {
                    const active = selectedVisualStyle === option.value;
                    const STYLE_ICON: Record<string, string> = {
                      film_grain: "🎞",
                      polaroid_memory: "📷",
                      clean_modern_slideshow: "🖼",
                      travel_map_overlay: "🗺",
                      vhs_archive: "📼",
                      wedding_cinematic: "💍",
                      social_vertical_captions: "📱",
                    };
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedVisualStyle(option.value)}
                        className={`border p-2.5 text-left transition ${
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)] shadow-sm shadow-[var(--color-accent)]/20"
                            : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elevated)]"
                        }`}
                      >
                        <span
                          className="mb-1 block text-base leading-none"
                          aria-hidden="true"
                        >
                          {STYLE_ICON[option.value] ?? "✨"}
                        </span>
                        <span className="vs-title">{t(option.labelKey)}</span>
                        <span className="vs-desc text-[var(--color-text-muted)]">
                          {t(option.descriptionKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3" aria-label={t("vionto.music.label")}>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  {t("vionto.music.label")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openMoreMusic}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    <Plus className="h-4 w-4" />
                    {t(
                      selectedMusicTracks.length === 0
                        ? "vionto.music.add"
                        : "vionto.music.more"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={clearMusicSelection}
                    disabled={selectedMusicTracks.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("vionto.music.removeAll")}
                  </button>
                </div>
                {selectedMusicTracks.length > 0 && (
                  <div className="mt-2 w-full max-w-full min-w-0 space-y-2">
                    {selectedMusicTracks.map((track, index) => (
                      <div
                        key={`${track.provider}-${track.trackId}`}
                        className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/10 p-2"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleMusicPreview(track)}
                          className="shrink-0 text-[var(--color-accent)] hover:text-[var(--color-accent)]/80"
                          title={
                            musicPreviewTrackId === track.trackId
                              ? t("vionto.audio.previewing")
                              : t("vionto.audio.preview")
                          }
                        >
                          {musicPreviewTrackId === track.trackId ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className="truncate break-all text-sm font-medium text-[var(--color-text)]"
                            title={track.title}
                          >
                            {track.title}
                          </p>
                          <p
                            className="truncate text-xs text-[var(--color-text-muted)]"
                            title={track.artist}
                          >
                            {track.artist}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMusicTrack(track)}
                          className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          title={t("vionto.music.remove")}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Music Track Selector Modal */}
              {showMusicSelector && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-3xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 max-h-[80vh] overflow-y-auto">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">
                        {t("vionto.music.add")}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowMusicSelector(false)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mb-4 flex border-b border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setMusicSelectorTab("royaltyFree")}
                        className={`px-4 py-2 text-sm font-medium transition ${
                          musicSelectorTab === "royaltyFree"
                            ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {t("vionto.music.royaltyFreeTab")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMusicSelectorTab("library")}
                        className={`px-4 py-2 text-sm font-medium transition ${
                          musicSelectorTab === "library"
                            ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {t("vionto.music.libraryTab")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMusicSelectorTab("upload")}
                        className={`px-4 py-2 text-sm font-medium transition ${
                          musicSelectorTab === "upload"
                            ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {t("vionto.music.uploadTab")}
                      </button>
                    </div>

                    {(musicSelectorTab === "royaltyFree" ||
                      musicSelectorTab === "library") && (
                      <div className="space-y-3">
                        {musicSelectorTab === "royaltyFree" && (
                          <p className="rounded-lg bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-text-muted)]">
                            {t("vionto.music.royaltyFreeLicense")}
                          </p>
                        )}
                        {isLoadingMusicLibrary && (
                          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-muted)]">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            {t("common.loading")}
                          </div>
                        )}
                        {musicLibraryError && !isLoadingMusicLibrary && (
                          <p className="rounded-lg bg-red-50/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                            {musicLibraryError}
                          </p>
                        )}
                        {!isLoadingMusicLibrary &&
                          !musicLibraryError &&
                          visibleMusicLibrary.length === 0 && (
                            <div className="py-8 text-center">
                              <FileAudio className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
                              <p className="mt-2 text-sm text-[var(--color-text)]">
                                {t(
                                  musicSelectorTab === "royaltyFree"
                                    ? "vionto.music.royaltyFreeEmpty"
                                    : "vionto.music.libraryEmpty"
                                )}
                              </p>
                              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                {t(
                                  musicSelectorTab === "royaltyFree"
                                    ? "vionto.music.royaltyFreeEmptyHint"
                                    : "vionto.music.libraryEmptyHint"
                                )}
                              </p>
                            </div>
                          )}
                        {!isLoadingMusicLibrary &&
                          !musicLibraryError &&
                          visibleMusicLibrary.length > 0 && (
                            <ul className="space-y-2">
                              {visibleMusicLibrary.map((item) => (
                                <li
                                  key={item.key}
                                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleMusicPreview(
                                        makeLibraryTrackMetadata(item)
                                      )
                                    }
                                    className="shrink-0 text-[var(--color-accent)] hover:text-[var(--color-accent)]/80"
                                    title={
                                      musicPreviewTrackId === item.key
                                        ? t("vionto.audio.previewing")
                                        : t("vionto.audio.preview")
                                    }
                                  >
                                    {musicPreviewTrackId === item.key ? (
                                      <Pause className="h-4 w-4" />
                                    ) : (
                                      <Play className="h-4 w-4" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className="truncate text-sm font-medium text-[var(--color-text)]"
                                      title={item.filename}
                                    >
                                      {item.filename}
                                    </p>
                                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                                      {new Date(
                                        item.lastModified
                                      ).toLocaleDateString()}{" "}
                                      ·{" "}
                                      {(item.sizeBytes / (1024 * 1024)).toFixed(
                                        2
                                      )}{" "}
                                      MB
                                      {item.common && (
                                        <span className="ml-2 rounded-full bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                                          {t("vionto.music.commonBadge")}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectLibraryTrack(item)
                                    }
                                    className="shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-accent)]/90"
                                  >
                                    {t("vionto.music.select")}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                    )}

                    {musicSelectorTab === "upload" && (
                      <div className="space-y-4">
                        <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
                          <input
                            ref={musicUploadInputRef}
                            type="file"
                            accept="audio/*"
                            multiple
                            disabled={isMusicUploading}
                            onChange={async (e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (files.length === 0) return;

                              setIsMusicUploading(true);
                              try {
                                const uploadedTracks = await Promise.all(
                                  files.map(async (file, index) => {
                                    const [{ key }, previewUrl] =
                                      await Promise.all([
                                        uploadMusicFile(file),
                                        Promise.resolve(
                                          URL.createObjectURL(file)
                                        ),
                                      ]);

                                    return {
                                      provider: "upload",
                                      trackId: `upload_${Date.now()}_${index}`,
                                      title: file.name.replace(/\.[^/.]+$/, ""),
                                      artist: t("vionto.music.uploadArtist"),
                                      artistId: "upload",
                                      duration: undefined,
                                      tags: ["uploaded"],
                                      sourceUrl: previewUrl,
                                      downloadUrl: previewUrl,
                                      storageKey: key,
                                      license: "uploaded",
                                      licenseInfo: t(
                                        "vionto.music.uploadDisclaimer"
                                      ),
                                      downloads: 0,
                                      likes: 0,
                                    } satisfies NormalizedTrackMetadata;
                                  })
                                );

                                setSelectedMusicTracks((current) => [
                                  ...current,
                                  ...uploadedTracks,
                                ]);
                                setMusicBlobUrls((prev) => {
                                  const next = new Set(prev);
                                  uploadedTracks.forEach((track) =>
                                    next.add(track.downloadUrl)
                                  );
                                  return next;
                                });
                                setShowMusicSelector(false);
                              } catch (error) {
                                console.error("Failed to upload music", error);
                                alert(
                                  error instanceof Error
                                    ? error.message
                                    : t("vionto.alert.musicUploadFailed")
                                );
                              } finally {
                                setIsMusicUploading(false);
                                // Reset input value to allow selecting the same file again
                                e.target.value = "";
                              }
                            }}
                            className="hidden"
                            id="music-upload"
                          />
                          <label
                            htmlFor="music-upload"
                            className={`flex flex-col items-center gap-2 ${isMusicUploading ? "cursor-wait opacity-70" : "cursor-pointer"}`}
                          >
                            {isMusicUploading ? (
                              <RefreshCw className="h-12 w-12 animate-spin text-[var(--color-text-muted)]" />
                            ) : (
                              <CloudUpload className="h-12 w-12 text-[var(--color-text-muted)]" />
                            )}
                            <p className="text-sm text-[var(--color-text)]">
                              {isMusicUploading
                                ? t("vionto.music.uploading")
                                : t("vionto.music.upload_own")}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              MP3, WAV, OGG, M4A
                            </p>
                          </label>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] text-center">
                          {t("vionto.music.uploadDisclaimer")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3" aria-label={t("vionto.aspect.aria")}>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  {t("vionto.aspect.label")}
                </p>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ASPECT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm transition ${
                        activeAspectRatio === option.value
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-text)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="vionto-aspect-ratio"
                        className="sr-only"
                        value={option.value}
                        checked={activeAspectRatio === option.value}
                        onChange={() => setActiveAspectRatio(option.value)}
                      />
                      {t(option.labelKey)}
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Video length slider ── */}
              <div className="mt-3" aria-label={t("vionto.aria.videoLength")}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    {t("vionto.videoLength.label")}
                  </p>
                  <span className="text-xs font-semibold tabular-nums text-[var(--color-text)]">
                    {t("vionto.videoLength.seconds", {
                      seconds: targetDurationSeconds,
                    })}
                  </span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={90}
                  step={5}
                  value={targetDurationSeconds}
                  aria-label={t("vionto.aria.targetDuration")}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTargetDurationSeconds(val);
                    // Mark existing script as stale so the user knows to regenerate
                    if (versions.length > 0) setScriptStale(true);
                  }}
                  className="mt-1 w-full accent-[var(--color-accent)]"
                />
                <div className="mt-0.5 flex justify-between text-[10px] text-[var(--color-text-muted)]">
                  <span>{t("vionto.videoLength.min")}</span>
                  <span>{t("vionto.videoLength.max")}</span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  {t("vionto.videoLength.description")}
                </p>
                {scriptStale && versions.length > 0 && (
                  <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
                    {t("vionto.videoLength.staleWarning")}
                  </p>
                )}
              </div>

              {/* ─── Story Structure (#102) ──────────────────────────── */}
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => setStoryStructureOpen(!storyStructureOpen)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
                    <ListChecks
                      size={14}
                      className="text-[var(--color-accent)]"
                    />
                    Story Structure
                  </span>
                  {storyStructureOpen ? (
                    <ChevronUp
                      size={14}
                      className="text-[var(--color-text-muted)]"
                    />
                  ) : (
                    <ChevronDown
                      size={14}
                      className="text-[var(--color-text-muted)]"
                    />
                  )}
                </button>
                {storyStructureOpen && (
                  <div className="space-y-2.5 border-t border-[var(--color-border)] px-3 pb-3 pt-2.5">
                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                        Opening Title
                      </label>
                      <input
                        type="text"
                        value={openingTitle}
                        onChange={(e) => setOpeningTitle(e.target.value)}
                        placeholder="e.g. Our Summer in Provence"
                        maxLength={200}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                        Intro Narration
                      </label>
                      <textarea
                        value={introNarration}
                        onChange={(e) => setIntroNarration(e.target.value)}
                        placeholder="A short intro paragraph to set the scene..."
                        maxLength={1000}
                        rows={2}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                          Chapters
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setChapters([
                              ...chapters,
                              { title: "", description: "" },
                            ])
                          }
                          disabled={chapters.length >= 10}
                          className="text-[11px] font-medium text-[var(--color-accent)] hover:underline disabled:opacity-50"
                        >
                          <Plus size={10} className="mr-0.5 inline" /> Add
                          chapter
                        </button>
                      </div>
                      {chapters.map((ch, i) => (
                        <div key={i} className="mt-1 flex gap-1.5">
                          <input
                            type="text"
                            value={ch.title}
                            onChange={(e) => {
                              const next = [...chapters];
                              next[i] = { ...next[i], title: e.target.value };
                              setChapters(next);
                            }}
                            placeholder={`Chapter ${i + 1} title`}
                            maxLength={120}
                            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                          />
                          <input
                            type="text"
                            value={ch.description}
                            onChange={(e) => {
                              const next = [...chapters];
                              next[i] = {
                                ...next[i],
                                description: e.target.value,
                              };
                              setChapters(next);
                            }}
                            placeholder="Description"
                            maxLength={500}
                            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setChapters(chapters.filter((_, j) => j !== i))
                            }
                            className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-red-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                        Climax / Highlight
                      </label>
                      <input
                        type="text"
                        value={climaxDescription}
                        onChange={(e) => setClimaxDescription(e.target.value)}
                        placeholder="Which moment gets the most emphasis?"
                        maxLength={500}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                        Closing Message
                      </label>
                      <input
                        type="text"
                        value={closingMessage}
                        onChange={(e) => setClosingMessage(e.target.value)}
                        placeholder="e.g. Until we meet again..."
                        maxLength={500}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                        Dedication
                      </label>
                      <input
                        type="text"
                        value={dedicationText}
                        onChange={(e) => setDedicationText(e.target.value)}
                        placeholder="e.g. For Mom and Dad"
                        maxLength={300}
                        className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Caption Overlays (#102) ──────────────────────────── */}
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => setCaptionOverlaysOpen(!captionOverlaysOpen)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
                    <Captions
                      size={14}
                      className="text-[var(--color-accent)]"
                    />
                    Caption Overlays
                    {captionsEnabled && (
                      <span className="ml-1 rounded-full bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                        ON
                      </span>
                    )}
                  </span>
                  {captionOverlaysOpen ? (
                    <ChevronUp
                      size={14}
                      className="text-[var(--color-text-muted)]"
                    />
                  ) : (
                    <ChevronDown
                      size={14}
                      className="text-[var(--color-text-muted)]"
                    />
                  )}
                </button>
                {captionOverlaysOpen && (
                  <div className="space-y-3 border-t border-[var(--color-border)] px-3 pb-3 pt-2.5">
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                      <input
                        type="checkbox"
                        checked={captionsEnabled}
                        onChange={(e) => setCaptionsEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                      />
                      Enable caption overlays
                    </label>

                    {captionsEnabled && (
                      <>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-[var(--color-text-muted)]">
                            Show in video
                          </p>
                          {[
                            {
                              label: "Scene captions",
                              checked: showSceneCaptions,
                              onChange: setShowSceneCaptions,
                            },
                            {
                              label: "Date captions",
                              checked: showDateCaptions,
                              onChange: setShowDateCaptions,
                            },
                            {
                              label: "Location captions",
                              checked: showLocationCaptions,
                              onChange: setShowLocationCaptions,
                            },
                            {
                              label: "People labels",
                              checked: showPeopleLabels,
                              onChange: setShowPeopleLabels,
                            },
                          ].map((item) => (
                            <label
                              key={item.label}
                              className="flex items-center gap-2 text-xs text-[var(--color-text)]"
                            >
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) =>
                                  item.onChange(e.target.checked)
                                }
                                className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                              />
                              {item.label}
                            </label>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                              Placement
                            </label>
                            <select
                              value={captionPlacement}
                              onChange={(e) =>
                                setCaptionPlacement(e.target.value as any)
                              }
                              className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                            >
                              <option value="lower_third">Lower third</option>
                              <option value="top">Top</option>
                              <option value="bottom">Bottom</option>
                              <option value="corner">Corner</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-[var(--color-text-muted)]">
                              Style
                            </label>
                            <select
                              value={captionStylePreset}
                              onChange={(e) =>
                                setCaptionStylePreset(e.target.value as any)
                              }
                              className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                            >
                              <option value="minimal">Minimal</option>
                              <option value="memory">Memory</option>
                              <option value="social">Social</option>
                              <option value="documentary">Documentary</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label
                  htmlFor="user-notes"
                  className="text-xs font-medium text-[var(--color-text-muted)]"
                >
                  {t("vionto.notes.label")}
                </label>
                <textarea
                  id="user-notes"
                  className="mt-1 min-h-[60px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder={t("vionto.notes.placeholder")}
                  maxLength={2000}
                />
              </div>
            </section>

            <section className="preview-panel" aria-labelledby="preview-title">
              <div className="preview-frame">
                <div className="film-strip">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div
                  className="video-stage"
                  style={previewFrameStyle(currentPreviewAspectRatio)}
                >
                  {latestExport?.previewUrl ? (
                    <video
                      key={latestExport.id}
                      src={latestExport.previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <>
                      <div className="sun" />
                      <div className="horizon" />
                    </>
                  )}
                  <p>
                    {latestExport?.previewSubtitle ?? t("vionto.preview.empty")}
                  </p>
                </div>
              </div>
              <div className="preview-copy">
                <p className="eyebrow">{t("vionto.preview.eyebrow")}</p>
                <h2 id="preview-title">
                  {latestExport?.previewTitle ??
                    t("vionto.preview.draft", {
                      mode: t(`vionto.mode.${activeMode}`),
                    })}
                </h2>
                <p>
                  {latestExport?.filename ??
                    t("vionto.preview.formatSummary", {
                      aspect: activeAspectRatio,
                    })}
                </p>
                <button
                  type="button"
                  onClick={startRender}
                  disabled={
                    !selectedProjectId ||
                    projectAssets.length === 0 ||
                    !hasRenderableScript ||
                    renderState === "queued" ||
                    renderState === "running"
                  }
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                >
                  <Clapperboard size={16} />
                  {renderState === "queued" || renderState === "running"
                    ? t("vionto.render.creating")
                    : t("vionto.render.createVideo")}
                </button>
              </div>
            </section>
          </div>

          <section
            className="pipeline"
            aria-label={t("vionto.aria.productionPipeline")}
          >
            {pipelineSteps.map((step) => {
              const Icon = step.icon;
              return (
                <article className="pipeline-step" key={step.titleKey}>
                  <Icon size={20} />
                  <h3>{t(step.titleKey)}</h3>
                  <p>{t(step.detailKey)}</p>
                </article>
              );
            })}
          </section>

          <section className="status-grid">
            <div className="script-editor" id="script">
              <ScriptEditor
                versions={versions}
                projectId={selectedProjectId ?? ""}
                onGenerate={handleGenerate}
                onSave={handleSave}
                isGenerating={isGenerating}
              />
            </div>

            {selectedProjectId && (
              <div className="job-card" id="subtitles">
                <div className="section-heading flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Captions size={20} />
                    <h2>{t("vionto.subtitles.title")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubtitlesCollapsed(!subtitlesCollapsed)}
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-soft)] transition"
                    aria-label={
                      subtitlesCollapsed
                        ? t("vionto.aria.expandSubtitles")
                        : t("vionto.aria.collapseSubtitles")
                    }
                  >
                    {subtitlesCollapsed ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronUp size={18} />
                    )}
                  </button>
                </div>
                {!subtitlesCollapsed && (
                  <SubtitleConfig
                    projectId={selectedProjectId}
                    versionId={selectedVersionId}
                    aspectRatio={activeAspectRatio}
                    onChange={setSubtitleConfig}
                  />
                )}
              </div>
            )}

            {selectedProjectId && (
              <div className="job-card" id="audio">
                <div className="section-heading">
                  <Mic size={20} />
                  <h2>{t("vionto.audio.title")}</h2>
                </div>
                <div className="flex flex-col gap-3">
                  {voices.length > 0 ? (
                    <>
                      <label
                        htmlFor="voice-select"
                        className="text-xs text-[var(--color-text-muted)]"
                      >
                        {t("vionto.audio.voiceSelect")}
                      </label>
                      <select
                        id="voice-select"
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                        value={selectedVoice ?? ""}
                        onChange={async (e) => {
                          const newVoice = e.target.value;
                          setSelectedVoice(newVoice);
                          if (newVoice) {
                            await saveVoiceSelection(newVoice);
                          }
                        }}
                      >
                        <option value="">
                          {t("vionto.audio.defaultVoice")}
                        </option>
                        {voices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} ({voice.locale})
                            {voice.gender ? ` · ${voice.gender}` : ""}
                          </option>
                        ))}
                      </select>
                      {selectedVoice && (
                        <button
                          type="button"
                          onClick={previewSelectedVoice}
                          disabled={isPreviewing}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                        >
                          <Play size={16} />
                          {isPreviewing
                            ? t("vionto.audio.previewing")
                            : t("vionto.audio.preview")}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {t("vionto.audio.noVoices")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="job-card" id="export">
              <div className="section-heading">
                <ListChecks size={20} />
                <h2>{t("vionto.render.title")}</h2>
              </div>
              {renderState === "idle" ? (
                <button
                  type="button"
                  onClick={startRender}
                  disabled={
                    !selectedProjectId ||
                    projectAssets.length === 0 ||
                    !hasRenderableScript
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                >
                  <Clapperboard size={16} />
                  {t("vionto.render.start")}
                </button>
              ) : renderState === "queued" || renderState === "running" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm">
                        {renderState === "queued"
                          ? t("vionto.render.queued")
                          : t("vionto.render.running")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={cancelRender}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      <X size={14} />
                      {t("vionto.render.cancel")}
                    </button>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--color-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {renderProgress}%
                  </span>
                </div>
              ) : renderState === "completed" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-green-600">
                    <ListChecks size={16} />
                    <span className="text-sm">
                      {t("vionto.render.completed")}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {exportId && (
                      <button
                        type="button"
                        onClick={getDownloadUrl}
                        disabled={!!downloadUrl}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90 disabled:opacity-50"
                      >
                        <Download size={16} />
                        {downloadUrl
                          ? t("vionto.render.downloading")
                          : t("vionto.render.download")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={startRender}
                      disabled={
                        !selectedProjectId ||
                        projectAssets.length === 0 ||
                        !hasRenderableScript
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)] disabled:opacity-50"
                    >
                      <Clapperboard size={16} />
                      {t("vionto.render.generateVideo")}
                    </button>
                  </div>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
                    >
                      <Download size={16} />
                      {t("vionto.render.save")}
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-red-600">
                    <Trash2 size={16} />
                    <span className="text-sm">{t("vionto.render.failed")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={startRender}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
                  >
                    <RefreshCw size={16} />
                    {t("vionto.render.retry")}
                  </button>
                </div>
              )}
              {renderError && (
                <p className="text-sm text-red-500">{renderError}</p>
              )}
            </div>

            <div className="job-card md:col-span-2" id="library">
              <div className="section-heading">
                <Clapperboard size={20} />
                <h2>{t("vionto.library.title")}</h2>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  value={libraryModeFilter}
                  onChange={(e) =>
                    setLibraryModeFilter(e.target.value as "" | UiMode)
                  }
                  aria-label={t("vionto.library.filterMode")}
                >
                  <option value="">{t("vionto.library.allModes")}</option>
                  {modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`vionto.mode.${mode}`)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  value={libraryCreatedFrom}
                  onChange={(e) => setLibraryCreatedFrom(e.target.value)}
                  aria-label={t("vionto.library.createdFrom")}
                />
                <input
                  type="date"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  value={libraryCreatedTo}
                  onChange={(e) => setLibraryCreatedTo(e.target.value)}
                  aria-label={t("vionto.library.createdTo")}
                />
              </div>
              <div className="relative mt-2">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                />
                <input
                  type="search"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  {...{ placeholder: t("vionto.library.searchPlaceholder") }}
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  aria-label={t("vionto.library.search")}
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {isLoadingLibrary ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <RefreshCw size={16} className="animate-spin" />
                    {t("vionto.library.loading")}
                  </div>
                ) : libraryExports.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {t("vionto.library.empty")}
                  </p>
                ) : (
                  libraryExports.map((item, _idx) => (
                    <article
                      key={item.id}
                      className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)]"
                    >
                      <video
                        src={item.previewUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full bg-black object-contain"
                        style={{
                          aspectRatio: cssAspectRatio(item.aspectRatio),
                        }}
                      />
                      <div className="flex flex-1 flex-col gap-1 p-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-[var(--color-text)]">
                            {item.previewTitle ?? item.projectTitle}
                          </h3>
                          {item.mode && (
                            <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              {item.mode}
                            </span>
                          )}
                          {item.storyMode && (
                            <span className="shrink-0 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                              {t(`vionto.storyMode.${item.storyMode}`)}
                            </span>
                          )}
                          {item.emotionalTone && (
                            <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              {t(`vionto.emotionalTone.${item.emotionalTone}`)}
                            </span>
                          )}
                          {item.aspectLabel && (
                            <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              {item.aspectLabel}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                          {item.filename ?? t("vionto.library.untitled")}
                        </p>
                        {item.previewSubtitle && (
                          <p className="line-clamp-2 text-xs text-[var(--color-text-muted)]">
                            {item.previewSubtitle}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-[11px] text-[var(--color-text-muted)]">
                          <span>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                          {item.durationSeconds != null && (
                            <span>{item.durationSeconds}s</span>
                          )}
                          {item.fileSizeBytes != null && (
                            <span>
                              {(item.fileSizeBytes / (1024 * 1024)).toFixed(1)}{" "}
                              MB
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  t("vionto.library.removeConfirm")
                                )
                              ) {
                                removeLibraryExport(item.id);
                              }
                            }}
                            className="inline-flex items-center justify-center rounded-md border border-red-300 p-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                            aria-label={t("vionto.library.remove")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>

              {/* Pagination */}
              {(libraryPage > 1 || libraryHasNext) && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={libraryPage <= 1 || isLoadingLibrary}
                    onClick={() => {
                      const prevPage = libraryPage - 1;
                      const prevCursor = libraryCursors[prevPage - 1] ?? null;
                      setLibraryPage(prevPage);
                      loadExportLibrary({ cursor: prevCursor });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    {t("vionto.pagination.previous")}
                  </button>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {t("vionto.pagination.page", { page: libraryPage })}
                  </span>
                  <button
                    type="button"
                    disabled={!libraryHasNext || isLoadingLibrary}
                    onClick={() => {
                      const lastItem =
                        libraryExports[libraryExports.length - 1];
                      if (!lastItem) return;
                      const nextCursors = [...libraryCursors];
                      nextCursors[libraryPage] = lastItem.id;
                      setLibraryCursors(nextCursors);
                      setLibraryPage(libraryPage + 1);
                      loadExportLibrary({ cursor: lastItem.id });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("vionto.pagination.next")}
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </section>
        </section>
      </section>

      {/* Download URL Dialog */}
      {showDownloadDialog && downloadUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {t("vionto.downloadDialog.title")}
              </h3>
              <button
                type="button"
                onClick={() => setShowDownloadDialog(false)}
                className="rounded-lg p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)]"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              {t("vionto.downloadDialog.description")}
            </p>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                readOnly
                value={downloadUrl}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
              >
                <Copy size={16} />
                {t("vionto.downloadDialog.copy")}
              </button>
            </div>
            <div className="flex gap-2">
              <a
                href={downloadUrl}
                download
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]/90"
              >
                <Download size={16} />
                {t("vionto.export.downloadMp4")}
              </a>
              <button
                type="button"
                onClick={() => setShowDownloadDialog(false)}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
