import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * Vionto-specific translation overrides. Keys shadow the base dictionary
 * from `@asafarim/shared-i18n`. Add app-only keys under `vionto.*`.
 */
export const viontoDictionaries: Dictionaries = {
  en: {
    // Topbar / nav
    "vionto.nav.dashboard": "Dashboard",
    "vionto.nav.projects": "Projects",
    "vionto.nav.organizer": "Organizer",
    "vionto.usermenu.user": "User",
    "vionto.usermenu.verified": "Verified",
    "vionto.usermenu.verificationPending": "Verification pending",
    "vionto.usermenu.profileSettings": "Profile settings",
    "vionto.usermenu.refreshSession": "Refresh session",
    "vionto.topbar.switchToLight": "Switch to light theme",
    "vionto.topbar.switchToDark": "Switch to dark theme",
    "vionto.topbar.switchApp": "Switch app",

    // Upload
    "vionto.upload.eyebrow": "Uploads",
    "vionto.upload.title": "Upload a memory set",
    "vionto.upload.subtitle":
      "Add photos, a zip archive, or a future cloud-drive import.",
    "vionto.upload.dropzoneLabel": "Drop images or zip here",
    "vionto.upload.dropzoneHint":
      "JPG, PNG, HEIC, WEBP, or ZIP up to the account limit.",
    "vionto.upload.exifReading": "Reading EXIF metadata…",

    // Script / Story
    "vionto.script.title": "Generated story",
    "vionto.script.placeholder":
      "Story text will appear here after generation.",
    "vionto.script.edit": "Edit script",
    "vionto.script.save": "Save version",
    "vionto.script.regenerate": "Regenerate",
    "vionto.script.generating": "Generating story…",
    "vionto.script.empty":
      "No script yet — upload images and generate a story.",

    // Audio
    "vionto.audio.title": "Audio",
    "vionto.audio.voiceSelect": "Select voice",
    "vionto.audio.defaultVoice": "Default voice",
    "vionto.audio.preview": "Preview voice",
    "vionto.audio.previewing": "Previewing...",
    "vionto.audio.previewText":
      "This is a preview of the selected narration voice for your Vionto story.",
    "vionto.audio.noVoices": "No voices are available for this locale.",
    "vionto.audio.render": "Render narration",

    // Subtitle presets
    "vionto.subtitles.title": "Subtitles",
    "vionto.subtitles.preset": "Preset",
    "vionto.subtitles.advanced": "Advanced settings",
    "vionto.subtitles.styling": "Visual Styling",
    "vionto.subtitles.positioning": "Positioning",
    "vionto.subtitles.timing": "Timing",
    "vionto.subtitles.exportOptions": "Export Options",
    "vionto.subtitles.font": "Font",
    "vionto.subtitles.fontSize": "Size",
    "vionto.subtitles.fontWeight": "Weight",
    "vionto.subtitles.textTransform": "Case",
    "vionto.subtitles.textColor": "Text color",
    "vionto.subtitles.outlineColor": "Outline color",
    "vionto.subtitles.outlineWidth": "Outline width",
    "vionto.subtitles.bgColor": "Background",
    "vionto.subtitles.bgOpacity": "BG opacity",
    "vionto.subtitles.borderRadius": "Corner radius",
    "vionto.subtitles.padding": "Padding",
    "vionto.subtitles.shadow": "Drop shadow",
    "vionto.subtitles.shadowColor": "Shadow color",
    "vionto.subtitles.shadowOffset": "Shadow offset",
    "vionto.subtitles.position": "Vertical position",
    "vionto.subtitles.alignment": "Alignment",
    "vionto.subtitles.marginV": "Vertical margin",
    "vionto.subtitles.marginH": "Horizontal margin",
    "vionto.subtitles.maxLineWidth": "Max chars/line",
    "vionto.subtitles.maxLines": "Max lines",
    "vionto.subtitles.maxChars": "Max chars/segment",
    "vionto.subtitles.minDisplay": "Min display (ms)",
    "vionto.subtitles.maxDisplay": "Max display (ms)",
    "vionto.subtitles.gap": "Gap between segments (ms)",
    "vionto.subtitles.splitPunctuation": "Split on punctuation",
    "vionto.subtitles.splitLong": "Split long sentences",
    "vionto.subtitles.burnIn": "Burn subtitles into video",
    "vionto.subtitles.exportSrt": "Export .srt file",
    "vionto.subtitles.exportVtt": "Export .vtt file",
    "vionto.subtitlePreset.minimal_clean": "Minimal Clean",
    "vionto.subtitlePreset.minimal_clean.description":
      "Simple white text with thin outline",
    "vionto.subtitlePreset.cinematic_lower_third": "Cinematic",
    "vionto.subtitlePreset.cinematic_lower_third.description":
      "Elegant lower-third with semi-transparent background",
    "vionto.subtitlePreset.social_bold": "Social Bold",
    "vionto.subtitlePreset.social_bold.description":
      "Large centered bold text for social media",
    "vionto.subtitlePreset.documentary": "Documentary",
    "vionto.subtitlePreset.documentary.description":
      "Clean captions with dark background box",
    "vionto.subtitlePreset.high_contrast": "High Contrast",
    "vionto.subtitlePreset.high_contrast.description":
      "Yellow text on black background for accessibility",
    "vionto.subtitlePreset.elegant_memory": "Elegant Memory",
    "vionto.subtitlePreset.elegant_memory.description":
      "Warm serif font with subtle background",

    // Render
    "vionto.render.title": "Render queue",
    "vionto.render.start": "Render MP4",
    "vionto.render.queued": "Queued",
    "vionto.render.rendering": "Rendering…",
    "vionto.render.running": "Rendering…",
    "vionto.render.completed": "Completed",
    "vionto.render.failed": "Failed",
    "vionto.render.download": "Get download link for completed video",
    "vionto.render.downloading": "Download link ready",
    "vionto.render.save": "Download MP4",
    "vionto.render.retry": "Retry render",
    "vionto.render.cancel": "Cancel render",
    "vionto.render.cancelled": "Cancelled",
    "vionto.render.generateVideo": "Generate video",

    // Export
    "vionto.export.title": "Export",
    "vionto.export.downloadMp4": "Download MP4",
    "vionto.export.downloadSrt": "Download SRT",
    "vionto.export.burnSubtitles": "Burn subtitles",

    // Modes
    "vionto.mode.cinematic": "Cinematic",
    "vionto.mode.slideshow": "Slideshow",
    "vionto.mode.social": "Social",

    // Billing
    "vionto.billing.creditsRemaining": "Credits remaining",
    "vionto.billing.upgradeCta": "Upgrade plan",

    // Errors
    "vionto.error.unauthorized": "Please sign in to continue.",
    "vionto.error.uploadTooLarge": "File exceeds the maximum allowed size.",
    "vionto.error.generationFailed":
      "Story generation failed. Please try again.",
    "vionto.error.noImages":
      "Upload at least one image before generating a story.",

    // Pipeline
    "vionto.pipeline.ingest": "Ingest",
    "vionto.pipeline.ingestDetail":
      "Images, zip uploads, folder batches, thumbnails, and EXIF capture.",
    "vionto.pipeline.write": "Write",
    "vionto.pipeline.writeDetail":
      "Warm narrative generation from captions, timestamps, places, and mood.",
    "vionto.pipeline.narrate": "Narrate",
    "vionto.pipeline.narrateDetail":
      "Voice selection, TTS rendering, optional background MP3, and ducking.",
    "vionto.pipeline.render": "Render",
    "vionto.pipeline.renderDetail":
      "Pan/zoom motion, transitions, subtitle overlay, and MP4 export.",

    // Nav
    "vionto.nav.create": "Create",
    "vionto.nav.uploads": "Uploads",
    "vionto.nav.script": "Script",
    "vionto.nav.audio": "Audio",
    "vionto.nav.export": "Export",

    // Story modes
    "vionto.storyMode.label": "Story mode",
    "vionto.storyMode.memory_film": "Memory film",
    "vionto.storyMode.memory_film.description":
      "Emotional, cinematic narration for personal memories and reflective albums.",
    "vionto.storyMode.travel_recap": "Travel recap",
    "vionto.storyMode.travel_recap.description":
      "Location-aware recap for trips, routes, highlights, and date/place progression.",
    "vionto.storyMode.family_archive": "Family archive",
    "vionto.storyMode.family_archive.description":
      "Warm, chronological, people-focused storytelling for family albums.",
    "vionto.storyMode.event_recap": "Event recap",
    "vionto.storyMode.event_recap.description":
      "Highlight-driven recap for weddings, birthdays, graduations, parties, and gatherings.",
    "vionto.storyMode.social_reel": "Social reel",
    "vionto.storyMode.social_reel.description":
      "Short, fast-paced vertical-friendly output for Reels, TikTok, Shorts, and stories.",
    "vionto.storyMode.documentary": "Documentary",
    "vionto.storyMode.documentary.description":
      "Slower, more factual narration with stronger emphasis on timeline, context, and observed details.",

    // Emotional tones
    "vionto.emotionalTone.label": "Emotional tone",
    "vionto.emotionalTone.nostalgic": "Nostalgic",
    "vionto.emotionalTone.nostalgic.description":
      "Warm, reflective, memory-focused language with slower pacing.",
    "vionto.emotionalTone.joyful": "Joyful",
    "vionto.emotionalTone.joyful.description":
      "Bright, celebratory, upbeat narration for happy moments and events.",
    "vionto.emotionalTone.calm": "Calm",
    "vionto.emotionalTone.calm.description":
      "Soft, peaceful, minimal, slower narration and gentle transitions.",
    "vionto.emotionalTone.epic": "Epic",
    "vionto.emotionalTone.epic.description":
      "Cinematic, dramatic, grand language for big trips, milestones, and highlights.",
    "vionto.emotionalTone.funny": "Funny",
    "vionto.emotionalTone.funny.description":
      "Light, playful, witty narration for casual albums and social edits.",
    "vionto.emotionalTone.romantic": "Romantic",
    "vionto.emotionalTone.romantic.description":
      "Tender, intimate, affectionate tone for couples, weddings, anniversaries, and love stories.",
    "vionto.emotionalTone.reflective": "Reflective",
    "vionto.emotionalTone.reflective.description":
      "Thoughtful, grounded, introspective narration for personal archives or meaningful life moments.",
    "vionto.visualStyle.label": "Visual style",
    "vionto.visualStyle.film_grain": "Film grain",
    "vionto.visualStyle.film_grain.description":
      "Textured grain, soft contrast, and memory-film atmosphere.",
    "vionto.visualStyle.polaroid_memory": "Polaroid memory",
    "vionto.visualStyle.polaroid_memory.description":
      "Warm tones, gentle vignette, and nostalgic photo-album treatment.",
    "vionto.visualStyle.clean_modern_slideshow": "Clean modern slideshow",
    "vionto.visualStyle.clean_modern_slideshow.description":
      "Sharp, neutral, minimal rendering with the current default look.",
    "vionto.visualStyle.travel_map_overlay": "Travel map overlay",
    "vionto.visualStyle.travel_map_overlay.description":
      "Brighter travel color with a subtle map-grid overlay.",
    "vionto.visualStyle.vhs_archive": "VHS/archive look",
    "vionto.visualStyle.vhs_archive.description":
      "Muted color, analog noise, and archival edge treatment.",
    "vionto.visualStyle.wedding_cinematic": "Wedding cinematic",
    "vionto.visualStyle.wedding_cinematic.description":
      "Soft cinematic contrast, vignette, and elegant caption typography.",
    "vionto.visualStyle.social_vertical_captions": "Social vertical captions",
    "vionto.visualStyle.social_vertical_captions.description":
      "High-contrast vertical-friendly framing with bold centered captions.",

    // Create workflow
    "vionto.project.label": "Project",
    "vionto.project.selectPlaceholder": "Select a project...",
    "vionto.project.new": "New",
    "vionto.project.titlePlaceholder": "Project title",
    "vionto.project.create": "Create",
    "vionto.project.assets": "Project assets",
    "vionto.projects.title": "Projects",
    "vionto.projects.description":
      "Manage your video projects. Create new ones, rename or delete existing ones, or share them with teammates.",
    "vionto.projects.back": "Back",
    "vionto.projects.createVideo": "Create video",
    "vionto.projects.home": "Home",
    "vionto.projects.signInPrompt": "Sign in to view your projects.",
    "vionto.projects.signIn": "Sign in",
    "vionto.projects.searchPlaceholder": "Search projects...",
    "vionto.projects.newProject": "New project",
    "vionto.projects.columnProject": "Project",
    "vionto.projects.columnMode": "Mode",
    "vionto.projects.columnStatus": "Status",
    "vionto.projects.columnAssets": "Assets",
    "vionto.projects.columnAccess": "Access",
    "vionto.projects.columnUpdated": "Updated",
    "vionto.projects.columnActions": "Actions",
    "vionto.projects.emptyTitle": "No projects yet",
    "vionto.projects.emptySearchTitle": "No projects match your search",
    "vionto.projects.emptyDescription":
      "Create your first project to get started.",
    "vionto.projects.emptySearchDescription": "Try a different search term.",
    "vionto.projects.totalSingular": "{count} project",
    "vionto.projects.totalPlural": "{count} projects",
    "vionto.projects.owner": "Owner",
    "vionto.projects.shared": "Shared",
    "vionto.projects.selected": "Selected",
    "vionto.projects.select": "Select",
    "vionto.projects.moreActions": "More actions",
    "vionto.projects.openProject": "Open project",
    "vionto.projects.renameEdit": "Rename / edit",
    "vionto.projects.manageSharing": "Manage sharing",
    "vionto.projects.deleteProject": "Delete project",
    "vionto.projects.sharedViewOnly": "Shared with you (view only)",
    "vionto.projects.renameTitle": "Rename project",
    "vionto.projects.newTitle": "New project",
    "vionto.projects.fieldTitle": "Title",
    "vionto.projects.fieldDescription": "Description",
    "vionto.projects.titleExample": "e.g. Summer 2025 Trip",
    "vionto.projects.descriptionPlaceholder": "Optional description...",
    "vionto.projects.titleRequired": "Title is required.",
    "vionto.projects.genericError": "Something went wrong.",
    "vionto.projects.networkError": "Network error. Please try again.",
    "vionto.projects.save": "Save",
    "vionto.projects.saving": "Saving...",
    "vionto.projects.creating": "Creating...",
    "vionto.projects.deleteTitle": "Delete project?",
    "vionto.projects.deleteIntro": "This will permanently delete",
    "vionto.projects.deleteOutro":
      "and all its assets, scripts, and exports. This action cannot be undone.",
    "vionto.projects.assetWillBeRemoved": "{count} asset will be removed.",
    "vionto.projects.assetsWillBeRemoved": "{count} assets will be removed.",
    "vionto.projects.deleting": "Deleting...",
    "vionto.projects.deleteFailed": "Failed to delete.",
    "vionto.projects.shareTitle": 'Share "{title}"',
    "vionto.projects.emailRequired": "Email is required.",
    "vionto.projects.shareFailed": "Failed to share.",
    "vionto.projects.sharePending":
      "{email} is not registered yet. They'll get access when they sign up.",
    "vionto.projects.shareAdded": "{email} now has {permission} access.",
    "vionto.projects.removeFailed": "Failed to remove.",
    "vionto.projects.permission.viewer": "Viewer",
    "vionto.projects.permission.editor": "Editor",
    "vionto.projects.adding": "Adding...",
    "vionto.projects.addPerson": "Add person",
    "vionto.projects.peopleWithAccess": "People with access",
    "vionto.projects.noSharedUsers": "No one else has access yet.",
    "vionto.projects.added": "added",
    "vionto.projects.pendingRegistration": "pending registration",
    "vionto.projects.removePerson": "Remove {email}",
    "vionto.projects.status.draft": "Draft",
    "vionto.projects.status.ready": "Ready",
    "vionto.projects.status.rendering": "Rendering",
    "vionto.projects.status.completed": "Completed",
    "vionto.projects.status.archived": "Archived",
    "vionto.mode.story": "Story",
    "vionto.aspect.aria": "Aspect ratio",
    "vionto.aspect.label": "Format",
    "vionto.aspect.landscape": "Landscape",
    "vionto.aspect.portrait": "Portrait",
    "vionto.aspect.square": "1by1",
    "vionto.notes.label": "Notes for the narrator",
    "vionto.notes.placeholder":
      "e.g. Focus on the sunset and family moments. Keep it nostalgic.",
    "vionto.preview.eyebrow": "Preview",
    "vionto.preview.empty":
      "Your latest completed Vionto render will appear here.",
    "vionto.preview.draft": "{mode} draft",
    "vionto.preview.formatSummary":
      "{aspect} MP4, H.264 video, AAC audio, subtitles burned in or exported as SRT.",
    "vionto.render.creating": "Creating video...",
    "vionto.render.createVideo": "Create video",
    "vionto.render.createAnother": "Create another video",
    "vionto.library.title": "Video library",
    "vionto.library.filterMode": "Filter videos by mode",
    "vionto.library.allModes": "All modes",
    "vionto.library.createdFrom": "Filter videos created from",
    "vionto.library.createdTo": "Filter videos created to",
    "vionto.library.search": "Search videos",
    "vionto.library.searchPlaceholder": "Search videos by title or keyword...",
    "vionto.library.loading": "Loading videos...",
    "vionto.library.empty": "No completed videos match these filters yet.",
    "vionto.library.untitled": "Untitled export",
    "vionto.library.remove": "Remove video",
    "vionto.library.removeConfirm": "Remove this video from the library?",
    "vionto.pagination.previous": "Previous",
    "vionto.pagination.next": "Next",
    "vionto.pagination.page": "Page {page}",
    "vionto.downloadDialog.title": "Download link",
    "vionto.downloadDialog.description":
      "Your video is ready. Copy the download link below to share, or download directly.",
    "vionto.downloadDialog.copy": "Copy",
    "vionto.downloadDialog.copied": "Download link copied to clipboard",
    "vionto.music.label": "Music",
    "vionto.music.calm_piano": "Calm piano",
    "vionto.music.calm_piano.description":
      "Soft, reflective piano tracks for memory films, calm albums, and reflective stories.",
    "vionto.music.cinematic_strings": "Cinematic strings",
    "vionto.music.cinematic_strings.description":
      "Dramatic orchestra/string tracks for epic, documentary, and milestone videos.",
    "vionto.music.travel_upbeat": "Travel upbeat",
    "vionto.music.travel_upbeat.description":
      "Energetic, optimistic tracks for travel recaps and social reels.",
    "vionto.music.family_warm_acoustic": "Family warm acoustic",
    "vionto.music.family_warm_acoustic.description":
      "Soft acoustic tracks for family archives, birthdays, and personal memories.",
    "vionto.music.happy_upbeat": "Happy upbeat",
    "vionto.music.happy_upbeat.description":
      "Joyful, energetic tracks for celebrations and happy moments.",
    "vionto.music.no_music": "No music",
    "vionto.music.no_music.description":
      "Narration-only videos without background music.",
    "vionto.music.upload_own": "Upload own music",
    "vionto.music.upload_own.description":
      "Provide your own audio file if you have the rights to use it.",
    "vionto.music.uploading": "Uploading music...",
    "vionto.music.uploadDisclaimer":
      "By uploading music, you confirm that you have the rights to use it in your video.",
    "vionto.music.fetchError":
      "Failed to load music tracks. Please try again later.",
    "vionto.music.download": "Download from Pixabay",
    "vionto.music.noTracks": "No tracks found. Try adjusting your filters.",
    "vionto.music.add": "Add music",
    "vionto.music.more": "More music",
    "vionto.music.remove": "Remove music",
    "vionto.music.removeAll": "Remove all music",
    "vionto.music.royaltyFreeTab": "Royalty-free",
    "vionto.music.libraryTab": "Your library",
    "vionto.music.uploadTab": "Upload new",
    "vionto.music.royaltyFreeLicense":
      "Curated tracks stored by Vionto for use under their recorded content licenses.",
    "vionto.music.royaltyFreeEmpty": "No royalty-free tracks available yet",
    "vionto.music.royaltyFreeEmptyHint":
      "The curated music catalog has not been populated yet.",
    "vionto.music.libraryEmpty": "No music in your library yet",
    "vionto.music.libraryEmptyHint":
      "Upload your first track in the Upload tab.",
    "vionto.music.libraryArtist": "Your library",
    "vionto.music.commonArtist": "Curated library",
    "vionto.music.personalUpload": "Personal upload",
    "vionto.music.commonBadge": "Royalty-free",
    "vionto.music.select": "Select",

    // ARIA labels
    "vionto.aria.workspaceNav": "Vionto workspace navigation",
    "vionto.aria.home": "Vionto home",
    "vionto.aria.collapseSidebar": "Collapse sidebar",
    "vionto.aria.expandSidebar": "Expand sidebar",
    "vionto.aria.primaryNav": "Primary",
    "vionto.aria.closeMenu": "Close menu",
    "vionto.aria.openMenu": "Open menu",
    "vionto.aria.retry": "Retry",
    "vionto.aria.deleteAsset": "Delete asset",
    "vionto.aria.videoModePresets": "Video mode presets",
    "vionto.aria.videoLength": "Video length",
    "vionto.aria.targetDuration": "Target video duration in seconds",
    "vionto.aria.productionPipeline": "Vionto production pipeline",
    "vionto.aria.expandSubtitles": "Expand subtitles",
    "vionto.aria.collapseSubtitles": "Collapse subtitles",

    // Video length
    "vionto.videoLength.label": "Video length",
    "vionto.videoLength.seconds": "{seconds} seconds",
    "vionto.videoLength.min": "15s",
    "vionto.videoLength.max": "90s",
    "vionto.videoLength.description":
      "Used to time the story, voiceover, subtitles, and image pacing.",
    "vionto.videoLength.staleWarning":
      "Duration changed — regenerate the story to keep subtitles and pacing in sync.",

    // Queue / pipeline
    "vionto.queue.captioning": "Captioning",
    "vionto.queue.captioningDetail": "{count} images processed",
    "vionto.queue.script": "Script",
    "vionto.queue.scriptDetail": "Narrative draft ready",
    "vionto.queue.voice": "Voice",
    "vionto.queue.voiceDetail": "Voice selected",
    "vionto.queue.render": "Render",
    "vionto.queue.renderDetail": "Preview MP4 queued",

    // Alert messages
    "vionto.alert.selectProjectFirst":
      "Please select or create a project first",
    "vionto.alert.uploadImagesFirst": "Please upload images before rendering",
    "vionto.alert.generateScriptFirst":
      "Please generate a script before rendering",
    "vionto.alert.saveSettingsFailed":
      "Failed to save project settings before rendering",
    "vionto.alert.saveSubtitlesFailed":
      "Failed to save subtitle settings before rendering",
    "vionto.alert.startRenderFailed": "Failed to start render",
    "vionto.alert.previewAudioFailed": "Failed to preview audio",
    "vionto.alert.deleteAssetFailed": "Failed to delete asset",
    "vionto.alert.getDownloadUrlFailed": "Failed to get download URL",
    "vionto.alert.createProjectFailed": "Failed to create project",
    "vionto.alert.uploadSessionFailed": "Failed to create upload session",
    "vionto.alert.noFilesUploaded":
      "No files uploaded successfully. Check the failed file rows and retry.",
    "vionto.alert.uploadFailed": "Upload failed",
    "vionto.alert.saveFailed": "Save failed",
    "vionto.alert.musicUploadFailed": "Music upload failed",
    "vionto.alert.musicUploadPrepareFailed": "Failed to prepare music upload",
    "vionto.alert.renderFailed": "Render failed",
    "vionto.alert.unknownError": "Unknown error",

    // Render errors
    "vionto.render.error.noScript":
      "Generate or save a narration script before rendering.",
    "vionto.render.error.saveSettingsFailed":
      "Failed to save project settings before rendering.",
    "vionto.render.error.saveSubtitlesFailed":
      "Failed to save subtitle settings before rendering.",
    "vionto.render.error.startFailed": "Failed to start render",
    "vionto.render.error.pollFailed": "Failed to poll render status",

    // Units
    "vionto.unit.seconds": "s",
    "vionto.unit.mb": "MB",
  },
  nl: {
    "vionto.nav.dashboard": "Dashboard",
    "vionto.nav.projects": "Projecten",
    "vionto.nav.organizer": "Organizer",
    "vionto.usermenu.user": "Gebruiker",
    "vionto.usermenu.verified": "Geverifieerd",
    "vionto.usermenu.verificationPending": "Verificatie in behandeling",
    "vionto.usermenu.profileSettings": "Profielinstellingen",
    "vionto.usermenu.refreshSession": "Sessie vernieuwen",
    "vionto.topbar.switchToLight": "Schakel naar licht thema",
    "vionto.topbar.switchToDark": "Schakel naar donker thema",
    "vionto.topbar.switchApp": "Wissel app",

    "vionto.upload.eyebrow": "Uploads",
    "vionto.upload.title": "Upload een herinneringenset",
    "vionto.upload.subtitle":
      "Voeg foto's, een zip-archief of een toekomstige clouddrive-import toe.",
    "vionto.upload.dropzoneLabel": "Sleep afbeeldingen of zip hier",
    "vionto.upload.dropzoneHint":
      "JPG, PNG, HEIC, WEBP of ZIP tot de accountlimiet.",
    "vionto.upload.exifReading": "EXIF-metadata wordt gelezen…",

    "vionto.script.title": "Gegenereerd verhaal",
    "vionto.script.placeholder":
      "Verhaaltekst verschijnt hier na het genereren.",
    "vionto.script.edit": "Script bewerken",
    "vionto.script.save": "Versie opslaan",
    "vionto.script.regenerate": "Opnieuw genereren",
    "vionto.script.generating": "Verhaal wordt gegenereerd…",
    "vionto.script.empty":
      "Nog geen script — upload afbeeldingen en genereer een verhaal.",

    "vionto.audio.title": "Audio",
    "vionto.audio.voiceSelect": "Selecteer stem",
    "vionto.audio.defaultVoice": "Standaardstem",
    "vionto.audio.preview": "Stem preview",
    "vionto.audio.previewing": "Preview wordt geladen...",
    "vionto.audio.previewText":
      "Dit is een voorbeeld van de gekozen vertelstem voor je Vionto verhaal.",
    "vionto.audio.noVoices": "Geen stemmen beschikbaar voor deze taal.",
    "vionto.audio.render": "Stem genereren",

    "vionto.render.title": "Renderwachtrij",
    "vionto.render.start": "MP4 renderen",
    "vionto.render.queued": "In wachtrij",
    "vionto.render.rendering": "Bezig met renderen…",
    "vionto.render.running": "Bezig met renderen…",
    "vionto.render.completed": "Voltooid",
    "vionto.render.failed": "Mislukt",
    "vionto.render.download": "Downloadlink voor voltooide video ophalen",
    "vionto.render.downloading": "Downloadlink klaar",
    "vionto.render.save": "MP4 downloaden",
    "vionto.render.retry": "Render opnieuw proberen",
    "vionto.render.cancel": "Render annuleren",
    "vionto.render.cancelled": "Geannuleerd",
    "vionto.render.generateVideo": "Video genereren",

    "vionto.export.title": "Exporteren",
    "vionto.export.downloadMp4": "MP4 downloaden",
    "vionto.export.downloadSrt": "SRT downloaden",
    "vionto.export.burnSubtitles": "Ondertiteling branden",

    "vionto.mode.cinematic": "Filmisch",
    "vionto.mode.slideshow": "Diavoorstelling",
    "vionto.mode.social": "Social",

    "vionto.billing.creditsRemaining": "Resterende credits",
    "vionto.billing.upgradeCta": "Plan upgraden",

    "vionto.error.unauthorized": "Log in om verder te gaan.",
    "vionto.error.uploadTooLarge": "Bestand overschrijdt de maximale grootte.",
    "vionto.error.generationFailed":
      "Verhaalgeneratie mislukt. Probeer opnieuw.",
    "vionto.error.noImages":
      "Upload minstens één afbeelding voordat je een verhaal genereert.",

    "vionto.pipeline.ingest": "Inlezen",
    "vionto.pipeline.ingestDetail":
      "Afbeeldingen, zip-uploads, mapbatches, miniaturen en EXIF-capture.",
    "vionto.pipeline.write": "Schrijven",
    "vionto.pipeline.writeDetail":
      "Warme verhaalgeneratie uit bijschriften, tijdstempels, plaatsen en sfeer.",
    "vionto.pipeline.narrate": "Vertellen",
    "vionto.pipeline.narrateDetail":
      "Stemselectie, TTS-rendering, optionele achtergrondmuziek en ducking.",
    "vionto.pipeline.render": "Renderen",
    "vionto.pipeline.renderDetail":
      "Pan/zoom-beweging, overgangen, ondertiteling-overlay en MP4-export.",

    "vionto.nav.create": "Maken",
    "vionto.nav.uploads": "Uploads",
    "vionto.nav.script": "Script",
    "vionto.nav.audio": "Audio",
    "vionto.nav.export": "Exporteren",

    // Story modes
    "vionto.storyMode.label": "Verhaalmodus",
    "vionto.storyMode.memory_film": "Herinneringenfilm",
    "vionto.storyMode.memory_film.description":
      "Emotionele, cinematografische vertelling voor persoonlijke herinneringen en reflectieve albums.",
    "vionto.storyMode.travel_recap": "Reisoverzicht",
    "vionto.storyMode.travel_recap.description":
      "Locatiebewust overzicht voor reizen, routes, hoogtepunten en datum/plaats voortgang.",
    "vionto.storyMode.family_archive": "Familiearchief",
    "vionto.storyMode.family_archive.description":
      "Warme, chronologische, mensgerichte vertelling voor familiealbums.",
    "vionto.storyMode.event_recap": "Evenementenoverzicht",
    "vionto.storyMode.event_recap.description":
      "Hoogtepunten-gedreven overzicht voor bruiloften, verjaardagen, diploma-uitreikingen, feesten en bijeenkomsten.",
    "vionto.storyMode.social_reel": "Social reel",
    "vionto.storyMode.social_reel.description":
      "Korte, snel-tempo verticaal-vriendelijke output voor Reels, TikTok, Shorts en stories.",
    "vionto.storyMode.documentary": "Documentaire",
    "vionto.storyMode.documentary.description":
      "Trager, meer feitelijke vertelling met sterke nadruk op tijdlijn, context en waargenomen details.",

    // Emotional tones
    "vionto.emotionalTone.label": "Emotionele toon",
    "vionto.emotionalTone.nostalgic": "Nostalgisch",
    "vionto.emotionalTone.nostalgic.description":
      "Warme, reflectieve, geheugen-gefocusseerde taal met langzamer tempo.",
    "vionto.emotionalTone.joyful": "Blij",
    "vionto.emotionalTone.joyful.description":
      "Heldere, feestelijke, opgewekte vertelling voor gelukkige momenten en evenementen.",
    "vionto.emotionalTone.calm": "Kalm",
    "vionto.emotionalTone.calm.description":
      "Zachte, vredige, minimale, langzamere vertelling en zachte overgangen.",
    "vionto.emotionalTone.epic": "Episch",
    "vionto.emotionalTone.epic.description":
      "Cinematografische, dramatische, grandioze taal voor grote reizen, mijlpalen en hoogtepunten.",
    "vionto.emotionalTone.funny": "Grappig",
    "vionto.emotionalTone.funny.description":
      "Licht, speels, witty vertelling voor casual albums en sociale bewerkingen.",
    "vionto.emotionalTone.romantic": "Romantisch",
    "vionto.emotionalTone.romantic.description":
      "Teder, intiem, affectieve toon voor koppels, bruiloften, anniversaries, en liefdesverhalen.",
    "vionto.emotionalTone.reflective": "Reflectief",
    "vionto.emotionalTone.reflective.description":
      "Gedachtevol, gegrond, introspectieve vertelling voor persoonlijke archieven of betekenisvolle levensmomenten.",
    "vionto.visualStyle.label": "Visuele stijl",
    "vionto.visualStyle.film_grain": "Filmkorrel",
    "vionto.visualStyle.film_grain.description":
      "Textuurkorrel, zacht contrast en herinneringsfilm-atmosfeer.",
    "vionto.visualStyle.polaroid_memory": "Polaroid-herinnering",
    "vionto.visualStyle.polaroid_memory.description":
      "Warme tinten, zachte vignette en nostalgische fotoalbumstijl.",
    "vionto.visualStyle.clean_modern_slideshow": "Strakke moderne slideshow",
    "vionto.visualStyle.clean_modern_slideshow.description":
      "Scherpe, neutrale, minimale rendering met de huidige standaardlook.",
    "vionto.visualStyle.travel_map_overlay": "Reiskaart-overlay",
    "vionto.visualStyle.travel_map_overlay.description":
      "Helderdere reiskleur met een subtiele kaartgrid-overlay.",
    "vionto.visualStyle.vhs_archive": "VHS/archief-look",
    "vionto.visualStyle.vhs_archive.description":
      "Gedempte kleur, analoge ruis en archiefachtige randbehandeling.",
    "vionto.visualStyle.wedding_cinematic": "Bruiloft cinematografisch",
    "vionto.visualStyle.wedding_cinematic.description":
      "Zacht filmisch contrast, vignette en elegante ondertitelingstypografie.",
    "vionto.visualStyle.social_vertical_captions": "Social verticale captions",
    "vionto.visualStyle.social_vertical_captions.description":
      "Contrastrijke verticale framing met vet gecentreerde captions.",

    "vionto.project.label": "Project",
    "vionto.project.selectPlaceholder": "Selecteer een project...",
    "vionto.project.new": "Nieuw",
    "vionto.project.titlePlaceholder": "Projecttitel",
    "vionto.project.create": "Maken",
    "vionto.project.assets": "Projectbestanden",
    "vionto.projects.title": "Projecten",
    "vionto.projects.description":
      "Beheer je videoprojecten. Maak nieuwe projecten, hernoem of verwijder bestaande projecten, of deel ze met teamgenoten.",
    "vionto.projects.back": "Terug",
    "vionto.projects.createVideo": "Video maken",
    "vionto.projects.home": "Start",
    "vionto.projects.signInPrompt": "Log in om je projecten te bekijken.",
    "vionto.projects.signIn": "Inloggen",
    "vionto.projects.searchPlaceholder": "Projecten zoeken...",
    "vionto.projects.newProject": "Nieuw project",
    "vionto.projects.columnProject": "Project",
    "vionto.projects.columnMode": "Modus",
    "vionto.projects.columnStatus": "Status",
    "vionto.projects.columnAssets": "Bestanden",
    "vionto.projects.columnAccess": "Toegang",
    "vionto.projects.columnUpdated": "Bijgewerkt",
    "vionto.projects.columnActions": "Acties",
    "vionto.projects.emptyTitle": "Nog geen projecten",
    "vionto.projects.emptySearchTitle": "Geen projecten gevonden",
    "vionto.projects.emptyDescription":
      "Maak je eerste project om te beginnen.",
    "vionto.projects.emptySearchDescription": "Probeer een andere zoekterm.",
    "vionto.projects.totalSingular": "{count} project",
    "vionto.projects.totalPlural": "{count} projecten",
    "vionto.projects.owner": "Eigenaar",
    "vionto.projects.shared": "Gedeeld",
    "vionto.projects.selected": "Geselecteerd",
    "vionto.projects.select": "Selecteren",
    "vionto.projects.moreActions": "Meer acties",
    "vionto.projects.openProject": "Project openen",
    "vionto.projects.renameEdit": "Hernoemen / bewerken",
    "vionto.projects.manageSharing": "Delen beheren",
    "vionto.projects.deleteProject": "Project verwijderen",
    "vionto.projects.sharedViewOnly": "Met jou gedeeld (alleen bekijken)",
    "vionto.projects.renameTitle": "Project hernoemen",
    "vionto.projects.newTitle": "Nieuw project",
    "vionto.projects.fieldTitle": "Titel",
    "vionto.projects.fieldDescription": "Beschrijving",
    "vionto.projects.titleExample": "bijv. Zomerreis 2025",
    "vionto.projects.descriptionPlaceholder": "Optionele beschrijving...",
    "vionto.projects.titleRequired": "Titel is verplicht.",
    "vionto.projects.genericError": "Er is iets misgegaan.",
    "vionto.projects.networkError": "Netwerkfout. Probeer opnieuw.",
    "vionto.projects.save": "Opslaan",
    "vionto.projects.saving": "Opslaan...",
    "vionto.projects.creating": "Maken...",
    "vionto.projects.deleteTitle": "Project verwijderen?",
    "vionto.projects.deleteIntro": "Dit verwijdert permanent",
    "vionto.projects.deleteOutro":
      "en alle bestanden, scripts en exports. Deze actie kan niet ongedaan worden gemaakt.",
    "vionto.projects.assetWillBeRemoved": "{count} bestand wordt verwijderd.",
    "vionto.projects.assetsWillBeRemoved":
      "{count} bestanden worden verwijderd.",
    "vionto.projects.deleting": "Verwijderen...",
    "vionto.projects.deleteFailed": "Verwijderen mislukt.",
    "vionto.projects.shareTitle": '"{title}" delen',
    "vionto.projects.emailRequired": "E-mail is verplicht.",
    "vionto.projects.shareFailed": "Delen mislukt.",
    "vionto.projects.sharePending":
      "{email} is nog niet geregistreerd. Ze krijgen toegang zodra ze zich registreren.",
    "vionto.projects.shareAdded": "{email} heeft nu {permission}-toegang.",
    "vionto.projects.removeFailed": "Verwijderen mislukt.",
    "vionto.projects.permission.viewer": "Kijker",
    "vionto.projects.permission.editor": "Bewerker",
    "vionto.projects.adding": "Toevoegen...",
    "vionto.projects.addPerson": "Persoon toevoegen",
    "vionto.projects.peopleWithAccess": "Personen met toegang",
    "vionto.projects.noSharedUsers": "Nog niemand anders heeft toegang.",
    "vionto.projects.added": "toegevoegd",
    "vionto.projects.pendingRegistration": "wacht op registratie",
    "vionto.projects.removePerson": "{email} verwijderen",
    "vionto.projects.status.draft": "Concept",
    "vionto.projects.status.ready": "Klaar",
    "vionto.projects.status.rendering": "Renderen",
    "vionto.projects.status.completed": "Voltooid",
    "vionto.projects.status.archived": "Gearchiveerd",
    "vionto.mode.story": "Verhaal",
    "vionto.aspect.aria": "Beeldverhouding",
    "vionto.aspect.label": "Formaat",
    "vionto.aspect.landscape": "Liggend",
    "vionto.aspect.portrait": "Staand",
    "vionto.aspect.square": "1 op 1",
    "vionto.notes.label": "Notities voor de verteller",
    "vionto.notes.placeholder":
      "bijv. Focus op de zonsondergang en familiemomenten. Houd het nostalgisch.",
    "vionto.preview.eyebrow": "Voorbeeld",
    "vionto.preview.empty":
      "Je laatste voltooide Vionto-render verschijnt hier.",
    "vionto.preview.draft": "{mode}-concept",
    "vionto.preview.formatSummary":
      "{aspect} MP4, H.264-video, AAC-audio, ondertiteling ingebrand of als SRT geexporteerd.",
    "vionto.render.creating": "Video wordt gemaakt...",
    "vionto.render.createVideo": "Video maken",
    "vionto.render.createAnother": "Nog een video maken",
    "vionto.library.title": "Videobibliotheek",
    "vionto.library.filterMode": "Filter videos op modus",
    "vionto.library.allModes": "Alle modi",
    "vionto.library.createdFrom": "Filter videos gemaakt vanaf",
    "vionto.library.createdTo": "Filter videos gemaakt tot",
    "vionto.library.search": "Videos zoeken",
    "vionto.library.searchPlaceholder": "Zoek videos op titel of trefwoord...",
    "vionto.library.loading": "Videos laden...",
    "vionto.library.empty": "Nog geen voltooide videos voor deze filters.",
    "vionto.library.untitled": "Export zonder titel",
    "vionto.library.remove": "Video verwijderen",
    "vionto.library.removeConfirm": "Video uit de bibliotheek verwijderen?",
    "vionto.pagination.previous": "Vorige",
    "vionto.pagination.next": "Volgende",
    "vionto.pagination.page": "Pagina {page}",
    "vionto.downloadDialog.title": "Downloadlink",
    "vionto.downloadDialog.description":
      "Je video is klaar. Kopieer de downloadlink hieronder om te delen, of download direct.",
    "vionto.downloadDialog.copy": "Kopieren",
    "vionto.downloadDialog.copied": "Downloadlink gekopieerd naar klembord",

    // Music selection
    "vionto.music.label": "Muziek",
    "vionto.music.calm_piano": "Kalme piano",
    "vionto.music.calm_piano.description":
      "Zachte, reflectieve pianotracks voor herinneringenfilms, kalme albums en reflectieve verhalen.",
    "vionto.music.cinematic_strings": "Cinematografische strijkers",
    "vionto.music.cinematic_strings.description":
      "Dramatische orkest/strijker tracks voor epische, documentaire en mijlpaalvideo's.",
    "vionto.music.travel_upbeat": "Reis upbeat",
    "vionto.music.travel_upbeat.description":
      "Energetische, optimistische tracks voor reisoverzichten en social reels.",
    "vionto.music.family_warm_acoustic": "Familie warm akoestisch",
    "vionto.music.family_warm_acoustic.description":
      "Zachte akoestische tracks voor familiearchieven, verjaardagen en persoonlijke herinneringen.",
    "vionto.music.happy_upbeat": "Blij upbeat",
    "vionto.music.happy_upbeat.description":
      "Vrolijke, energieke tracks voor vieringen en blije momenten.",
    "vionto.music.no_music": "Geen muziek",
    "vionto.music.no_music.description":
      "Alleen vertelling video's zonder achtergrondmuziek.",
    "vionto.music.upload_own": "Eigen muziek uploaden",
    "vionto.music.upload_own.description":
      "Bied je eigen audiobestand aan als je de rechten hebt om het te gebruiken.",
    "vionto.music.uploading": "Muziek uploaden...",
    "vionto.music.uploadDisclaimer":
      "Door muziek te uploaden, bevestig je dat je de rechten hebt om het in je video te gebruiken.",
    "vionto.music.fetchError":
      "Muziektracks laden mislukt. Probeer het later opnieuw.",
    "vionto.music.download": "Downloaden van Pixabay",
    "vionto.music.noTracks":
      "Geen tracks gevonden. Probeer je filters aan te passen.",
    "vionto.music.add": "Muziek toevoegen",
    "vionto.music.more": "Meer muziek",
    "vionto.music.remove": "Muziek verwijderen",
    "vionto.music.removeAll": "Alle muziek verwijderen",
    "vionto.music.royaltyFreeTab": "Royalty-free",
    "vionto.music.libraryTab": "Jouw bibliotheek",
    "vionto.music.uploadTab": "Nieuwe upload",
    "vionto.music.royaltyFreeLicense":
      "Gecureerde tracks die Vionto opslaat voor gebruik onder hun geregistreerde contentlicenties.",
    "vionto.music.royaltyFreeEmpty": "Nog geen royalty-free tracks beschikbaar",
    "vionto.music.royaltyFreeEmptyHint":
      "De gecureerde muziekcatalogus is nog niet gevuld.",
    "vionto.music.libraryEmpty": "Nog geen muziek in je bibliotheek",
    "vionto.music.libraryEmptyHint":
      "Upload je eerste track in het tabblad Upload.",
    "vionto.music.libraryArtist": "Jouw bibliotheek",
    "vionto.music.commonArtist": "Gecureerde bibliotheek",
    "vionto.music.personalUpload": "Persoonlijke upload",
    "vionto.music.commonBadge": "Royalty-free",
    "vionto.music.select": "Selecteren",

    // ARIA labels
    "vionto.aria.workspaceNav": "Vionto werkruimte navigatie",
    "vionto.aria.home": "Vionto home",
    "vionto.aria.collapseSidebar": "Zijbalk inklappen",
    "vionto.aria.expandSidebar": "Zijbalk uitklappen",
    "vionto.aria.primaryNav": "Primair",
    "vionto.aria.closeMenu": "Menu sluiten",
    "vionto.aria.openMenu": "Menu openen",
    "vionto.aria.retry": "Opnieuw proberen",
    "vionto.aria.deleteAsset": "Asset verwijderen",
    "vionto.aria.videoModePresets": "Video modus voorinstellingen",
    "vionto.aria.videoLength": "Videolengte",
    "vionto.aria.targetDuration": "Doel videoduur in seconden",
    "vionto.aria.productionPipeline": "Vionto productiepipeline",
    "vionto.aria.expandSubtitles": "Ondertitels uitklappen",
    "vionto.aria.collapseSubtitles": "Ondertitels inklappen",

    // Video length
    "vionto.videoLength.label": "Videolengte",
    "vionto.videoLength.seconds": "{seconds} seconden",
    "vionto.videoLength.min": "15s",
    "vionto.videoLength.max": "90s",
    "vionto.videoLength.description":
      "Gebruikt om het verhaal, voice-over, ondertitels en beeldpassing te timen.",
    "vionto.videoLength.staleWarning":
      "Duur gewijzigd — genereer het verhaal opnieuw om ondertitels en pacing gesynchroniseerd te houden.",

    // Queue / pipeline
    "vionto.queue.captioning": "Bijschriften",
    "vionto.queue.captioningDetail": "{count} afbeeldingen verwerkt",
    "vionto.queue.script": "Script",
    "vionto.queue.scriptDetail": "Verhaalconcept klaar",
    "vionto.queue.voice": "Stem",
    "vionto.queue.voiceDetail": "Stem geselecteerd",
    "vionto.queue.render": "Renderen",
    "vionto.queue.renderDetail": "Preview MP4 in wachtrij",

    // Alert messages
    "vionto.alert.selectProjectFirst": "Selecteer of maak eerst een project",
    "vionto.alert.uploadImagesFirst":
      "Upload eerst afbeeldingen voordat je rendert",
    "vionto.alert.generateScriptFirst":
      "Genereer eerst een script voordat je rendert",
    "vionto.alert.saveSettingsFailed":
      "Opslaan projectinstellingen mislukt voor rendering",
    "vionto.alert.saveSubtitlesFailed":
      "Opslaan ondertitelinstellingen mislukt voor rendering",
    "vionto.alert.startRenderFailed": "Starten render mislukt",
    "vionto.alert.previewAudioFailed": "Voorbeeld audio mislukt",
    "vionto.alert.deleteAssetFailed": "Verwijderen asset mislukt",
    "vionto.alert.getDownloadUrlFailed": "Ophalen download-URL mislukt",
    "vionto.alert.createProjectFailed": "Aanmaken project mislukt",
    "vionto.alert.uploadSessionFailed": "Aanmaken uploadsessie mislukt",
    "vionto.alert.noFilesUploaded":
      "Geen bestanden succesvol geüpload. Controleer de mislukte rijen en probeer opnieuw.",
    "vionto.alert.uploadFailed": "Upload mislukt",
    "vionto.alert.saveFailed": "Opslaan mislukt",
    "vionto.alert.musicUploadFailed": "Muziek upload mislukt",
    "vionto.alert.musicUploadPrepareFailed":
      "Muziek upload voorbereiden mislukt",
    "vionto.alert.renderFailed": "Render mislukt",
    "vionto.alert.unknownError": "Onbekende fout",

    // Render errors
    "vionto.render.error.noScript":
      "Genereer of sla een voice-over script op voordat je rendert.",
    "vionto.render.error.saveSettingsFailed":
      "Opslaan projectinstellingen mislukt voor rendering.",
    "vionto.render.error.saveSubtitlesFailed":
      "Opslaan ondertitelinstellingen mislukt voor rendering.",
    "vionto.render.error.startFailed": "Starten render mislukt",
    "vionto.render.error.pollFailed": "Ophalen renderstatus mislukt",

    // Units
    "vionto.unit.seconds": "s",
    "vionto.unit.mb": "MB",

    "vionto.asset.more": "meer",
    "vionto.music.uploadArtist": "Geüpload",
  },
  fr: {
    "vionto.nav.dashboard": "Tableau de bord",
    "vionto.nav.projects": "Projets",
    "vionto.nav.organizer": "Organisateur",
    "vionto.usermenu.user": "Utilisateur",
    "vionto.usermenu.verified": "Vérifié",
    "vionto.usermenu.verificationPending": "Vérification en attente",
    "vionto.usermenu.profileSettings": "Paramètres du profil",
    "vionto.usermenu.refreshSession": "Rafraîchir la session",
    "vionto.topbar.switchToLight": "Passer au thème clair",
    "vionto.topbar.switchToDark": "Passer au thème sombre",
    "vionto.topbar.switchApp": "Changer d'application",

    "vionto.upload.eyebrow": "Uploads",
    "vionto.upload.title": "Uploader un ensemble de souvenirs",
    "vionto.upload.subtitle":
      "Ajoutez des photos, une archive zip ou une future importation depuis le cloud.",
    "vionto.upload.dropzoneLabel": "Déposez images ou zip ici",
    "vionto.upload.dropzoneHint":
      "JPG, PNG, HEIC, WEBP ou ZIP jusqu'à la limite du compte.",
    "vionto.upload.exifReading": "Lecture des métadonnées EXIF…",

    "vionto.script.title": "Histoire générée",
    "vionto.script.placeholder":
      "Le texte de l'histoire apparaîtra ici après la génération.",
    "vionto.script.edit": "Modifier le script",
    "vionto.script.save": "Sauvegarder la version",
    "vionto.script.regenerate": "Régénérer",
    "vionto.script.generating": "Génération de l'histoire…",
    "vionto.script.empty":
      "Pas encore de script — uploadez des images et générez une histoire.",

    "vionto.audio.title": "Audio",
    "vionto.audio.voiceSelect": "Choisir la voix",
    "vionto.audio.defaultVoice": "Voix par defaut",
    "vionto.audio.preview": "Aperçu voix",
    "vionto.audio.previewing": "Apercu en cours...",
    "vionto.audio.noVoices": "Aucune voix disponible pour cette langue.",
    "vionto.audio.render": "Générer narration",

    "vionto.render.title": "File de rendu",
    "vionto.render.start": "Rendre MP4",
    "vionto.render.queued": "En file",
    "vionto.render.rendering": "Rendu en cours…",
    "vionto.render.running": "Rendu en cours…",
    "vionto.render.completed": "Terminé",
    "vionto.render.failed": "Échoué",
    "vionto.render.download": "Obtenir le lien pour la vidéo terminée",
    "vionto.render.downloading": "Lien prêt",
    "vionto.render.save": "Télécharger MP4",
    "vionto.render.retry": "Réessayer le rendu",
    "vionto.render.cancel": "Annuler le rendu",
    "vionto.render.cancelled": "Annulé",
    "vionto.render.generateVideo": "Générer vidéo",

    "vionto.export.title": "Exporter",
    "vionto.export.downloadMp4": "Télécharger MP4",
    "vionto.export.downloadSrt": "Télécharger SRT",
    "vionto.export.burnSubtitles": "Graver sous-titres",

    "vionto.mode.cinematic": "Cinématique",
    "vionto.mode.slideshow": "Diaporama",
    "vionto.mode.social": "Social",

    "vionto.billing.creditsRemaining": "Crédits restants",
    "vionto.billing.upgradeCta": "Améliorer le plan",

    "vionto.error.unauthorized": "Veuillez vous connecter pour continuer.",
    "vionto.error.uploadTooLarge":
      "Le fichier dépasse la taille maximale autorisée.",
    "vionto.error.generationFailed":
      "La génération de l'histoire a échoué. Veuillez réessayer.",
    "vionto.error.noImages":
      "Uploadez au moins une image avant de générer une histoire.",

    "vionto.pipeline.ingest": "Ingestion",
    "vionto.pipeline.ingestDetail":
      "Images, uploads zip, lots de dossiers, vignettes et capture EXIF.",
    "vionto.pipeline.write": "Écriture",
    "vionto.pipeline.writeDetail":
      "Génération narrative chaleureuse à partir de légendes, horodatages, lieux et ambiance.",
    "vionto.pipeline.narrate": "Narration",
    "vionto.pipeline.narrateDetail":
      "Sélection voix, rendu TTS, MP3 de fond optionnel et ducking.",
    "vionto.pipeline.render": "Rendu",
    "vionto.pipeline.renderDetail":
      "Mouvement panoramique/zoom, transitions, overlay sous-titres et export MP4.",

    "vionto.nav.create": "Créer",
    "vionto.nav.uploads": "Uploads",
    "vionto.nav.script": "Script",
    "vionto.nav.audio": "Audio",
    "vionto.nav.export": "Exporter",

    // Story modes
    "vionto.storyMode.label": "Mode d'histoire",
    "vionto.storyMode.memory_film": "Film de souvenirs",
    "vionto.storyMode.memory_film.description":
      "Narration émotionnelle et cinématographique pour les souvenirs personnels et les albums réflexifs.",
    "vionto.storyMode.travel_recap": "Récapitulatif de voyage",
    "vionto.storyMode.travel_recap.description":
      "Récapitulatif sensible au lieu pour les voyages, itinéraires, points forts et progression date/lieu.",
    "vionto.storyMode.family_archive": "Archives familiales",
    "vionto.storyMode.family_archive.description":
      "Narration chaleureuse, chronologique et centrée sur les personnes pour les albums familiaux.",
    "vionto.storyMode.event_recap": "Récapitulatif d'événement",
    "vionto.storyMode.event_recap.description":
      "Récapitulatif axé sur les points forts pour les mariages, anniversaires, remises de diplômes, fêtes et rassemblements.",
    "vionto.storyMode.social_reel": "Reel social",
    "vionto.storyMode.social_reel.description":
      "Courte, rapide et adaptée au format vertical pour Reels, TikTok, Shorts et stories.",
    "vionto.storyMode.documentary": "Documentaire",
    "vionto.storyMode.documentary.description":
      "Narration plus lente et factuelle avec un accent plus fort sur la chronologie, le contexte et les détails observés.",

    // Emotional tones
    "vionto.emotionalTone.label": "Ton émotionnel",
    "vionto.emotionalTone.nostalgic": "Nostalgique",
    "vionto.emotionalTone.nostalgic.description":
      "Langage chaleureux, réfléchi, centré sur la mémoire avec un rythme plus lent.",
    "vionto.emotionalTone.joyful": "Joyeux",
    "vionto.emotionalTone.joyful.description":
      "Narration lumineuse, festive et enjouée pour les moments heureux et les événements.",
    "vionto.emotionalTone.calm": "Calme",
    "vionto.emotionalTone.calm.description":
      "Narration douce, paisible, minimale, plus lente avec des transitions douces.",
    "vionto.emotionalTone.epic": "Épique",
    "vionto.emotionalTone.epic.description":
      "Langage cinématographique, dramatique et grandiose pour les grands voyages, jalons et points forts.",
    "vionto.emotionalTone.funny": "Drôle",
    "vionto.emotionalTone.funny.description":
      "Narration légère, ludique et spirituelle pour les albums décontractés et les éditions sociales.",
    "vionto.emotionalTone.romantic": "Romantique",
    "vionto.emotionalTone.romantic.description":
      "Ton tendre, intime et affectueux pour les couples, mariages, anniversaires et histoires d'amour.",
    "vionto.emotionalTone.reflective": "Réfléchi",
    "vionto.emotionalTone.reflective.description":
      "Narration pensée, ancrée et introspective pour les archives personnelles ou les moments de vie significatifs.",
    "vionto.visualStyle.label": "Style visuel",
    "vionto.visualStyle.film_grain": "Grain de film",
    "vionto.visualStyle.film_grain.description":
      "Grain texturé, contraste doux et atmosphère de film souvenir.",
    "vionto.visualStyle.polaroid_memory": "Souvenir Polaroid",
    "vionto.visualStyle.polaroid_memory.description":
      "Tons chauds, vignette douce et traitement d'album photo nostalgique.",
    "vionto.visualStyle.clean_modern_slideshow": "Diaporama moderne épuré",
    "vionto.visualStyle.clean_modern_slideshow.description":
      "Rendu net, neutre et minimal avec l'apparence par défaut actuelle.",
    "vionto.visualStyle.travel_map_overlay": "Superposition carte de voyage",
    "vionto.visualStyle.travel_map_overlay.description":
      "Couleur de voyage plus vive avec une grille de carte subtile.",
    "vionto.visualStyle.vhs_archive": "Look VHS/archive",
    "vionto.visualStyle.vhs_archive.description":
      "Couleur atténuée, bruit analogique et traitement d'archive.",
    "vionto.visualStyle.wedding_cinematic": "Mariage cinématographique",
    "vionto.visualStyle.wedding_cinematic.description":
      "Contraste cinématographique doux, vignette et typographie élégante.",
    "vionto.visualStyle.social_vertical_captions":
      "Sous-titres verticaux sociaux",
    "vionto.visualStyle.social_vertical_captions.description":
      "Cadrage vertical à fort contraste avec sous-titres centrés en gras.",

    "vionto.project.label": "Projet",
    "vionto.project.selectPlaceholder": "Selectionnez un projet...",
    "vionto.project.new": "Nouveau",
    "vionto.project.titlePlaceholder": "Titre du projet",
    "vionto.project.create": "Creer",
    "vionto.project.assets": "Ressources du projet",
    "vionto.projects.title": "Projets",
    "vionto.projects.description":
      "Gerez vos projets video. Creez de nouveaux projets, renommez ou supprimez les projets existants, ou partagez-les avec des coequipiers.",
    "vionto.projects.back": "Retour",
    "vionto.projects.createVideo": "Creer une video",
    "vionto.projects.home": "Accueil",
    "vionto.projects.signInPrompt": "Connectez-vous pour voir vos projets.",
    "vionto.projects.signIn": "Se connecter",
    "vionto.projects.searchPlaceholder": "Rechercher des projets...",
    "vionto.projects.newProject": "Nouveau projet",
    "vionto.projects.columnProject": "Projet",
    "vionto.projects.columnMode": "Mode",
    "vionto.projects.columnStatus": "Statut",
    "vionto.projects.columnAssets": "Ressources",
    "vionto.projects.columnAccess": "Acces",
    "vionto.projects.columnUpdated": "Mis a jour",
    "vionto.projects.columnActions": "Actions",
    "vionto.projects.emptyTitle": "Aucun projet pour le moment",
    "vionto.projects.emptySearchTitle":
      "Aucun projet ne correspond a votre recherche",
    "vionto.projects.emptyDescription":
      "Creez votre premier projet pour commencer.",
    "vionto.projects.emptySearchDescription":
      "Essayez un autre terme de recherche.",
    "vionto.projects.totalSingular": "{count} projet",
    "vionto.projects.totalPlural": "{count} projets",
    "vionto.projects.owner": "Proprietaire",
    "vionto.projects.shared": "Partage",
    "vionto.projects.selected": "Selectionne",
    "vionto.projects.select": "Selectionner",
    "vionto.projects.moreActions": "Plus d'actions",
    "vionto.projects.openProject": "Ouvrir le projet",
    "vionto.projects.renameEdit": "Renommer / modifier",
    "vionto.projects.manageSharing": "Gerer le partage",
    "vionto.projects.deleteProject": "Supprimer le projet",
    "vionto.projects.sharedViewOnly": "Partage avec vous (lecture seule)",
    "vionto.projects.renameTitle": "Renommer le projet",
    "vionto.projects.newTitle": "Nouveau projet",
    "vionto.projects.fieldTitle": "Titre",
    "vionto.projects.fieldDescription": "Description",
    "vionto.projects.titleExample": "ex. Voyage ete 2025",
    "vionto.projects.descriptionPlaceholder": "Description optionnelle...",
    "vionto.projects.titleRequired": "Le titre est obligatoire.",
    "vionto.projects.genericError": "Une erreur est survenue.",
    "vionto.projects.networkError": "Erreur reseau. Veuillez reessayer.",
    "vionto.projects.save": "Enregistrer",
    "vionto.projects.saving": "Enregistrement...",
    "vionto.projects.creating": "Creation...",
    "vionto.projects.deleteTitle": "Supprimer le projet ?",
    "vionto.projects.deleteIntro": "Cela supprimera definitivement",
    "vionto.projects.deleteOutro":
      "ainsi que toutes ses ressources, scripts et exports. Cette action est irreversible.",
    "vionto.projects.assetWillBeRemoved": "{count} ressource sera supprimee.",
    "vionto.projects.assetsWillBeRemoved":
      "{count} ressources seront supprimees.",
    "vionto.projects.deleting": "Suppression...",
    "vionto.projects.deleteFailed": "Echec de la suppression.",
    "vionto.projects.shareTitle": 'Partager "{title}"',
    "vionto.projects.emailRequired": "L'e-mail est obligatoire.",
    "vionto.projects.shareFailed": "Echec du partage.",
    "vionto.projects.sharePending":
      "{email} n'est pas encore inscrit. L'acces sera active apres inscription.",
    "vionto.projects.shareAdded": "{email} a maintenant un acces {permission}.",
    "vionto.projects.removeFailed": "Echec de la suppression.",
    "vionto.projects.permission.viewer": "Lecteur",
    "vionto.projects.permission.editor": "Editeur",
    "vionto.projects.adding": "Ajout...",
    "vionto.projects.addPerson": "Ajouter une personne",
    "vionto.projects.peopleWithAccess": "Personnes avec acces",
    "vionto.projects.noSharedUsers": "Personne d'autre n'a encore acces.",
    "vionto.projects.added": "ajoute",
    "vionto.projects.pendingRegistration": "inscription en attente",
    "vionto.projects.removePerson": "Supprimer {email}",
    "vionto.projects.status.draft": "Brouillon",
    "vionto.projects.status.ready": "Pret",
    "vionto.projects.status.rendering": "Rendu",
    "vionto.projects.status.completed": "Termine",
    "vionto.projects.status.archived": "Archive",
    "vionto.mode.story": "Histoire",
    "vionto.aspect.aria": "Ratio d'image",
    "vionto.aspect.label": "Format",
    "vionto.aspect.landscape": "Paysage",
    "vionto.aspect.portrait": "Portrait",
    "vionto.aspect.square": "1 sur 1",
    "vionto.notes.label": "Notes pour le narrateur",
    "vionto.notes.placeholder":
      "ex. Concentrez-vous sur le coucher de soleil et les moments en famille. Gardez un ton nostalgique.",
    "vionto.preview.eyebrow": "Apercu",
    "vionto.preview.empty":
      "Votre dernier rendu Vionto termine apparaitra ici.",
    "vionto.preview.draft": "Brouillon {mode}",
    "vionto.preview.formatSummary":
      "{aspect} MP4, video H.264, audio AAC, sous-titres integres ou exportes en SRT.",
    "vionto.render.creating": "Creation de la video...",
    "vionto.render.createVideo": "Creer la video",
    "vionto.render.createAnother": "Creer une autre video",
    "vionto.library.title": "Bibliotheque video",
    "vionto.library.filterMode": "Filtrer les videos par mode",
    "vionto.library.allModes": "Tous les modes",
    "vionto.library.createdFrom": "Filtrer les videos creees depuis",
    "vionto.library.createdTo": "Filtrer les videos creees jusqu'a",
    "vionto.library.search": "Rechercher des videos",
    "vionto.library.searchPlaceholder": "Rechercher par titre ou mot-cle...",
    "vionto.library.loading": "Chargement des videos...",
    "vionto.library.empty":
      "Aucune video terminee ne correspond encore a ces filtres.",
    "vionto.library.untitled": "Export sans titre",
    "vionto.library.remove": "Supprimer la vidéo",
    "vionto.library.removeConfirm":
      "Supprimer cette vidéo de la bibliothèque ?",
    "vionto.pagination.previous": "Precedent",
    "vionto.pagination.next": "Suivant",
    "vionto.pagination.page": "Page {page}",
    "vionto.downloadDialog.title": "Lien de telechargement",
    "vionto.downloadDialog.description":
      "Votre video est prete. Vous pouvez copier le lien ci-dessous pour la partager ou la telecharger directement.",
    "vionto.downloadDialog.copy": "Copier",
    "vionto.downloadDialog.copied":
      "Lien de telechargement copie dans le presse-papiers",

    // Music selection
    "vionto.music.label": "Musique",
    "vionto.music.calm_piano": "Piano calme",
    "vionto.music.calm_piano.description":
      "Pistes de piano douces et reflechies pour les films de souvenirs, albums calmes et histoires reflechies.",
    "vionto.music.cinematic_strings": "Cordes cinematiques",
    "vionto.music.cinematic_strings.description":
      "Pistes orchestre/cordes dramatiques pour des videos epiques, documentaires et jalons.",
    "vionto.music.travel_upbeat": "Voyage upbeat",
    "vionto.music.travel_upbeat.description":
      "Pistes energiques et optimistes pour les recaps de voyage et social reels.",
    "vionto.music.family_warm_acoustic": "Famille chaleureux acoustique",
    "vionto.music.family_warm_acoustic.description":
      "Pistes acoustiques douces pour les archives familiales, anniversaires et souvenirs personnels.",
    "vionto.music.happy_upbeat": "Joyeux upbeat",
    "vionto.music.happy_upbeat.description":
      "Pistes joyeuses et energiques pour les celebrations et les moments heureux.",
    "vionto.music.no_music": "Pas de musique",
    "vionto.music.no_music.description":
      "Videos uniquement narrees sans bande-son de fond.",
    "vionto.music.upload_own": "Telecharger sa propre musique",
    "vionto.music.upload_own.description":
      "Fournissez votre propre fichier audio si vous avez les droits de l'utiliser.",
    "vionto.music.uploading": "Telechargement de la musique...",
    "vionto.music.uploadDisclaimer":
      "En telechargeant de la musique, vous confirmez que vous avez les droits de l'utiliser dans votre video.",
    "vionto.music.fetchError":
      "Echec du chargement des pistes musicales. Reessayez plus tard.",
    "vionto.music.download": "Telecharger depuis Pixabay",
    "vionto.music.noTracks":
      "Aucune piste trouvee. Essayez d'ajuster vos filtres.",
    "vionto.music.add": "Ajouter de la musique",
    "vionto.music.more": "Plus de musique",
    "vionto.music.remove": "Supprimer la musique",
    "vionto.music.removeAll": "Supprimer toute la musique",
    "vionto.music.royaltyFreeTab": "Libre de redevances",
    "vionto.music.libraryTab": "Votre bibliothèque",
    "vionto.music.uploadTab": "Nouvel upload",
    "vionto.music.royaltyFreeLicense":
      "Pistes sélectionnées stockées par Vionto pour utilisation selon leurs licences de contenu enregistrées.",
    "vionto.music.royaltyFreeEmpty":
      "Aucune piste libre de redevances disponible",
    "vionto.music.royaltyFreeEmptyHint":
      "Le catalogue musical sélectionné n'a pas encore été alimenté.",
    "vionto.music.libraryEmpty":
      "Aucune musique dans votre bibliothèque pour l'instant",
    "vionto.music.libraryEmptyHint":
      "Téléchargez votre premier morceau dans l'onglet Upload.",
    "vionto.music.libraryArtist": "Votre bibliothèque",
    "vionto.music.commonArtist": "Bibliothèque sélectionnée",
    "vionto.music.personalUpload": "Import personnel",
    "vionto.music.commonBadge": "Libre de redevances",
    "vionto.music.select": "Sélectionner",
  },
  de: {
    "vionto.nav.dashboard": "Dashboard",
    "vionto.nav.projects": "Projekte",
    "vionto.nav.organizer": "Organizer",
    "vionto.usermenu.user": "Benutzer",
    "vionto.usermenu.verified": "Verifiziert",
    "vionto.usermenu.verificationPending": "Verifizierung ausstehend",
    "vionto.usermenu.profileSettings": "Profileinstellungen",
    "vionto.usermenu.refreshSession": "Sitzung aktualisieren",
    "vionto.topbar.switchToLight": "Zum hellen Thema wechseln",
    "vionto.topbar.switchToDark": "Zum dunklen Thema wechseln",
    "vionto.topbar.switchApp": "App wechseln",

    "vionto.upload.eyebrow": "Uploads",
    "vionto.upload.title": "Erinnerungsset hochladen",
    "vionto.upload.subtitle":
      "Fügen Sie Fotos, ein Zip-Archiv oder einen zukünftigen Cloud-Drive-Import hinzu.",
    "vionto.upload.dropzoneLabel": "Bilder oder Zip hier ablegen",
    "vionto.upload.dropzoneHint":
      "JPG, PNG, HEIC, WEBP oder ZIP bis zur Kontolimite.",
    "vionto.upload.exifReading": "EXIF-Metadaten werden gelesen…",

    "vionto.script.title": "Generierte Geschichte",
    "vionto.script.placeholder":
      "Der Geschichtentext erscheint hier nach der Generierung.",
    "vionto.script.edit": "Skript bearbeiten",
    "vionto.script.save": "Version speichern",
    "vionto.script.regenerate": "Neu generieren",
    "vionto.script.generating": "Geschichte wird generiert…",
    "vionto.script.empty":
      "Noch kein Skript — laden Sie Bilder hoch und generieren Sie eine Geschichte.",

    "vionto.audio.title": "Audio",
    "vionto.audio.voiceSelect": "Stimme auswählen",
    "vionto.audio.defaultVoice": "Standardstimme",
    "vionto.audio.preview": "Stimmen-Vorschau",
    "vionto.audio.previewing": "Vorschau laedt...",
    "vionto.audio.noVoices":
      "Fuer diese Sprache sind keine Stimmen verfuegbar.",
    "vionto.audio.render": "Stimme rendern",

    "vionto.render.title": "Render-Warteschlange",
    "vionto.render.start": "MP4 rendern",
    "vionto.render.queued": "In Warteschlange",
    "vionto.render.rendering": "Wird gerendert…",
    "vionto.render.running": "Wird gerendert…",
    "vionto.render.completed": "Abgeschlossen",
    "vionto.render.failed": "Fehlgeschlagen",
    "vionto.render.download": "Download-Link für das fertige Video abrufen",
    "vionto.render.downloading": "Download-Link bereit",
    "vionto.render.save": "MP4 herunterladen",
    "vionto.render.retry": "Render erneut versuchen",
    "vionto.render.cancel": "Render abbrechen",
    "vionto.render.cancelled": "Abgebrochen",
    "vionto.render.generateVideo": "Video generieren",

    "vionto.export.title": "Exportieren",
    "vionto.export.downloadMp4": "MP4 herunterladen",
    "vionto.export.downloadSrt": "SRT herunterladen",
    "vionto.export.burnSubtitles": "Untertitel einbrennen",

    "vionto.mode.cinematic": "Filmisch",
    "vionto.mode.slideshow": "Diashow",
    "vionto.mode.social": "Social",

    "vionto.billing.creditsRemaining": "Verbleibende Credits",
    "vionto.billing.upgradeCta": "Plan upgraden",

    "vionto.error.unauthorized": "Bitte melden Sie sich an, um fortzufahren.",
    "vionto.error.uploadTooLarge":
      "Datei überschreitet die maximal zulässige Größe.",
    "vionto.error.generationFailed":
      "Geschichtengenerierung fehlgeschlagen. Bitte versuchen Sie es erneut.",
    "vionto.error.noImages":
      "Laden Sie mindestens ein Bild hoch, bevor Sie eine Geschichte generieren.",

    "vionto.pipeline.ingest": "Ingest",
    "vionto.pipeline.ingestDetail":
      "Bilder, Zip-Uploads, Ordner-Batches, Thumbnails und EXIF-Capture.",
    "vionto.pipeline.write": "Schreiben",
    "vionto.pipeline.writeDetail":
      "Warme Narrativ-Generierung aus Bildunterschriften, Zeitstempeln, Orten und Stimmung.",
    "vionto.pipeline.narrate": "Erzählen",
    "vionto.pipeline.narrateDetail":
      "Stimmenauswahl, TTS-Rendering, optionaler Hintergrund-MP3 und Ducking.",
    "vionto.pipeline.render": "Render",
    "vionto.pipeline.renderDetail":
      "Pan/Zoom-Bewegung, Übergänge, Untertitel-Overlay und MP4-Export.",

    "vionto.nav.create": "Erstellen",
    "vionto.nav.uploads": "Uploads",
    "vionto.nav.script": "Skript",
    "vionto.nav.audio": "Audio",
    "vionto.nav.export": "Exportieren",

    // Story modes
    "vionto.storyMode.label": "Geschichtenmodus",
    "vionto.storyMode.memory_film": "Erinnerungsfilm",
    "vionto.storyMode.memory_film.description":
      "Emotionale, filmische Erzählung für persönliche Erinnerungen und reflektierende Alben.",
    "vionto.storyMode.travel_recap": "Reisezusammenfassung",
    "vionto.storyMode.travel_recap.description":
      "Ortsbewusste Zusammenfassung für Reisen, Routen, Höhepunkte und Datums/Ort-Fortschritt.",
    "vionto.storyMode.family_archive": "Familienarchiv",
    "vionto.storyMode.family_archive.description":
      "Warme, chronologische, menschenorientierte Erzählung für Familienalben.",
    "vionto.storyMode.event_recap": "Veranstaltungszusammenfassung",
    "vionto.storyMode.event_recap.description":
      "Höhepunktengesteuerte Zusammenfassung für Hochzeiten, Geburtstage, Abschlüsse, Partys und Treffen.",
    "vionto.storyMode.social_reel": "Social Reel",
    "vionto.storyMode.social_reel.description":
      "Kurze, schnelle, vertikal-freundliche Ausgabe für Reels, TikTok, Shorts und Stories.",
    "vionto.storyMode.documentary": "Dokumentation",
    "vionto.storyMode.documentary.description":
      "Langsamere, faktischere Erzählung mit stärkerem Fokus auf Zeitstrahl, Kontext und beobachtete Details.",

    // Emotional tones
    "vionto.emotionalTone.label": "Emotionaler Ton",
    "vionto.emotionalTone.nostalgic": "Nostalgisch",
    "vionto.emotionalTone.nostalgic.description":
      "Warme, reflektive, erinnerungsorientierte Sprache mit langsamerem Tempo.",
    "vionto.emotionalTone.joyful": "Fröhlich",
    "vionto.emotionalTone.joyful.description":
      "Helle, feierliche, fröhliche Erzählung für glückliche Momente und Ereignisse.",
    "vionto.emotionalTone.calm": "Ruhig",
    "vionto.emotionalTone.calm.description":
      "Sanfte, friedliche, minimale, langsamere Erzählung und sanfte Übergänge.",
    "vionto.emotionalTone.epic": "Episch",
    "vionto.emotionalTone.epic.description":
      "Filmische, dramatische, großartige Sprache für große Reisen, Meilensteine und Höhepunkte.",
    "vionto.emotionalTone.funny": "Lustig",
    "vionto.emotionalTone.funny.description":
      "Leichte, verspielte, witzige Erzählung für lockere Alben und soziale Bearbeitungen.",
    "vionto.emotionalTone.romantic": "Romantisch",
    "vionto.emotionalTone.romantic.description":
      "Zarte, intime, liebevolle Note für Paare, Hochzeiten, Jubiläen und Liebesgeschichten.",
    "vionto.emotionalTone.reflective": "Reflektierend",
    "vionto.emotionalTone.reflective.description":
      "Gedankenreiche, bodenständige, introspektive Erzählung für persönliche Archive oder bedeutungsvolle Lebensmomente.",
    "vionto.visualStyle.label": "Visueller Stil",
    "vionto.visualStyle.film_grain": "Filmkorn",
    "vionto.visualStyle.film_grain.description":
      "Texturiertes Korn, weicher Kontrast und Erinnerungsfilm-Atmosphäre.",
    "vionto.visualStyle.polaroid_memory": "Polaroid-Erinnerung",
    "vionto.visualStyle.polaroid_memory.description":
      "Warme Töne, sanfte Vignette und nostalgischer Fotoalbum-Look.",
    "vionto.visualStyle.clean_modern_slideshow": "Klare moderne Slideshow",
    "vionto.visualStyle.clean_modern_slideshow.description":
      "Scharfes, neutrales, minimales Rendering mit dem aktuellen Standardlook.",
    "vionto.visualStyle.travel_map_overlay": "Reisekarten-Overlay",
    "vionto.visualStyle.travel_map_overlay.description":
      "Hellere Reisefarben mit einem subtilen Kartenraster.",
    "vionto.visualStyle.vhs_archive": "VHS/Archiv-Look",
    "vionto.visualStyle.vhs_archive.description":
      "Gedämpfte Farben, analoges Rauschen und Archivrand-Behandlung.",
    "vionto.visualStyle.wedding_cinematic": "Hochzeit filmisch",
    "vionto.visualStyle.wedding_cinematic.description":
      "Weicher filmischer Kontrast, Vignette und elegante Untertiteltypografie.",
    "vionto.visualStyle.social_vertical_captions": "Social Vertical Captions",
    "vionto.visualStyle.social_vertical_captions.description":
      "Kontrastreiches vertikales Framing mit fetten zentrierten Captions.",

    "vionto.project.label": "Projekt",
    "vionto.project.selectPlaceholder": "Projekt auswaehlen...",
    "vionto.project.new": "Neu",
    "vionto.project.titlePlaceholder": "Projekttitel",
    "vionto.project.create": "Erstellen",
    "vionto.project.assets": "Projektdateien",
    "vionto.projects.title": "Projekte",
    "vionto.projects.description":
      "Verwalten Sie Ihre Videoprojekte. Erstellen Sie neue Projekte, benennen oder loeschen Sie bestehende Projekte, oder teilen Sie sie mit Teammitgliedern.",
    "vionto.projects.back": "Zurueck",
    "vionto.projects.createVideo": "Video erstellen",
    "vionto.projects.home": "Startseite",
    "vionto.projects.signInPrompt":
      "Melden Sie sich an, um Ihre Projekte zu sehen.",
    "vionto.projects.signIn": "Anmelden",
    "vionto.projects.searchPlaceholder": "Projekte suchen...",
    "vionto.projects.newProject": "Neues Projekt",
    "vionto.projects.columnProject": "Projekt",
    "vionto.projects.columnMode": "Modus",
    "vionto.projects.columnStatus": "Status",
    "vionto.projects.columnAssets": "Dateien",
    "vionto.projects.columnAccess": "Zugriff",
    "vionto.projects.columnUpdated": "Aktualisiert",
    "vionto.projects.columnActions": "Aktionen",
    "vionto.projects.emptyTitle": "Noch keine Projekte",
    "vionto.projects.emptySearchTitle":
      "Keine Projekte entsprechen Ihrer Suche",
    "vionto.projects.emptyDescription":
      "Erstellen Sie Ihr erstes Projekt, um zu beginnen.",
    "vionto.projects.emptySearchDescription":
      "Versuchen Sie einen anderen Suchbegriff.",
    "vionto.projects.totalSingular": "{count} Projekt",
    "vionto.projects.totalPlural": "{count} Projekte",
    "vionto.projects.owner": "Eigentuemer",
    "vionto.projects.shared": "Geteilt",
    "vionto.projects.selected": "Ausgewaehlt",
    "vionto.projects.select": "Auswaehlen",
    "vionto.projects.moreActions": "Weitere Aktionen",
    "vionto.projects.openProject": "Projekt oeffnen",
    "vionto.projects.renameEdit": "Umbenennen / bearbeiten",
    "vionto.projects.manageSharing": "Freigabe verwalten",
    "vionto.projects.deleteProject": "Projekt loeschen",
    "vionto.projects.sharedViewOnly": "Mit Ihnen geteilt (nur ansehen)",
    "vionto.projects.renameTitle": "Projekt umbenennen",
    "vionto.projects.newTitle": "Neues Projekt",
    "vionto.projects.fieldTitle": "Titel",
    "vionto.projects.fieldDescription": "Beschreibung",
    "vionto.projects.titleExample": "z. B. Sommerreise 2025",
    "vionto.projects.descriptionPlaceholder": "Optionale Beschreibung...",
    "vionto.projects.titleRequired": "Titel ist erforderlich.",
    "vionto.projects.genericError": "Etwas ist schiefgelaufen.",
    "vionto.projects.networkError": "Netzwerkfehler. Bitte erneut versuchen.",
    "vionto.projects.save": "Speichern",
    "vionto.projects.saving": "Speichern...",
    "vionto.projects.creating": "Erstellen...",
    "vionto.projects.deleteTitle": "Projekt loeschen?",
    "vionto.projects.deleteIntro": "Dies loescht dauerhaft",
    "vionto.projects.deleteOutro":
      "und alle Dateien, Skripte und Exporte. Diese Aktion kann nicht rueckgaengig gemacht werden.",
    "vionto.projects.assetWillBeRemoved": "{count} Datei wird entfernt.",
    "vionto.projects.assetsWillBeRemoved": "{count} Dateien werden entfernt.",
    "vionto.projects.deleting": "Loeschen...",
    "vionto.projects.deleteFailed": "Loeschen fehlgeschlagen.",
    "vionto.projects.shareTitle": '"{title}" teilen',
    "vionto.projects.emailRequired": "E-Mail ist erforderlich.",
    "vionto.projects.shareFailed": "Teilen fehlgeschlagen.",
    "vionto.projects.sharePending":
      "{email} ist noch nicht registriert. Der Zugriff wird nach der Registrierung aktiviert.",
    "vionto.projects.shareAdded": "{email} hat jetzt {permission}-Zugriff.",
    "vionto.projects.removeFailed": "Entfernen fehlgeschlagen.",
    "vionto.projects.permission.viewer": "Betrachter",
    "vionto.projects.permission.editor": "Bearbeiter",
    "vionto.projects.adding": "Hinzufuegen...",
    "vionto.projects.addPerson": "Person hinzufuegen",
    "vionto.projects.peopleWithAccess": "Personen mit Zugriff",
    "vionto.projects.noSharedUsers": "Noch niemand sonst hat Zugriff.",
    "vionto.projects.added": "hinzugefuegt",
    "vionto.projects.pendingRegistration": "Registrierung ausstehend",
    "vionto.projects.removePerson": "{email} entfernen",
    "vionto.projects.status.draft": "Entwurf",
    "vionto.projects.status.ready": "Bereit",
    "vionto.projects.status.rendering": "Rendering",
    "vionto.projects.status.completed": "Abgeschlossen",
    "vionto.projects.status.archived": "Archiviert",
    "vionto.mode.story": "Geschichte",
    "vionto.aspect.aria": "Seitenverhaeltnis",
    "vionto.aspect.label": "Format",
    "vionto.aspect.landscape": "Querformat",
    "vionto.aspect.portrait": "Hochformat",
    "vionto.aspect.square": "1 zu 1",
    "vionto.notes.label": "Notizen fuer den Sprecher",
    "vionto.notes.placeholder":
      "z.B. Fokus auf Sonnenuntergang und Familienmomente. Nostalgisch halten.",
    "vionto.preview.eyebrow": "Vorschau",
    "vionto.preview.empty":
      "Ihr letzter abgeschlossener Vionto-Render erscheint hier.",
    "vionto.preview.draft": "{mode}-Entwurf",
    "vionto.preview.formatSummary":
      "{aspect} MP4, H.264-Video, AAC-Audio, Untertitel eingebrannt oder als SRT exportiert.",
    "vionto.render.creating": "Video wird erstellt...",
    "vionto.render.createVideo": "Video erstellen",
    "vionto.render.createAnother": "Weiteres Video erstellen",
    "vionto.library.title": "Videobibliothek",
    "vionto.library.filterMode": "Videos nach Modus filtern",
    "vionto.library.allModes": "Alle Modi",
    "vionto.library.createdFrom": "Videos erstellt ab filtern",
    "vionto.library.createdTo": "Videos erstellt bis filtern",
    "vionto.library.search": "Videos suchen",
    "vionto.library.searchPlaceholder":
      "Videos nach Titel oder Stichwort suchen...",
    "vionto.library.loading": "Videos werden geladen...",
    "vionto.library.empty":
      "Noch keine abgeschlossenen Videos fuer diese Filter.",
    "vionto.library.untitled": "Export ohne Titel",
    "vionto.library.remove": "Video entfernen",
    "vionto.library.removeConfirm": "Video aus der Bibliothek entfernen?",
    "vionto.pagination.previous": "Zurueck",
    "vionto.pagination.next": "Weiter",
    "vionto.pagination.page": "Seite {page}",
    "vionto.downloadDialog.title": "Download-Link",
    "vionto.downloadDialog.description":
      "Ihr Video ist bereit. Sie koennen den Download-Link unten kopieren oder direkt herunterladen.",
    "vionto.downloadDialog.copy": "Kopieren",
    "vionto.downloadDialog.copied":
      "Download-Link in die Zwischenablage kopiert",

    // Music selection
    "vionto.music.label": "Musik",
    "vionto.music.calm_piano": "Ruhiges Klavier",
    "vionto.music.calm_piano.description":
      "Sanfte, reflektierende Klavierstuecke fuer Erinnerungsfilme, ruhige Alben und reflektive Geschichten.",
    "vionto.music.cinematic_strings": "Filmische Streicher",
    "vionto.music.cinematic_strings.description":
      "Dramatische Orchester/Streicher-Stuecke fuer epische, dokumentarische und Meilenstein-Videos.",
    "vionto.music.travel_upbeat": "Reise-Upbeat",
    "vionto.music.travel_upbeat.description":
      "Energetische, optimistische Stuecke fuer Reisezusammenfassungen und Social Reels.",
    "vionto.music.family_warm_acoustic": "Familie warm akustisch",
    "vionto.music.family_warm_acoustic.description":
      "Sanfte akustische Stuecke fuer Familienarchive, Geburtstage und persoenliche Erinnerungen.",
    "vionto.music.happy_upbeat": "Fröhlich upbeat",
    "vionto.music.happy_upbeat.description":
      "Fröhliche, energetische Stuecke fuer Feiern und freudige Momente.",
    "vionto.music.no_music": "Keine Musik",
    "vionto.music.no_music.description":
      "Nur Erzaehler-Videos ohne Hintergrund-Soundtrack.",
    "vionto.music.upload_own": "Eigene Musik hochladen",
    "vionto.music.upload_own.description":
      "Stellen Sie Ihre eigene Audiodatei bereit, wenn Sie die Rechte zur Nutzung haben.",
    "vionto.music.uploading": "Musik wird hochgeladen...",
    "vionto.music.uploadDisclaimer":
      "Durch das Hochladen von Musik bestaetigen Sie, dass Sie die Rechte zur Nutzung in Ihrem Video haben.",
    "vionto.music.fetchError":
      "Musikstuecke laden fehlgeschlagen. Versuchen Sie es spaeter erneut.",
    "vionto.music.download": "Von Pixabay herunterladen",
    "vionto.music.noTracks":
      "Keine Stuecke gefunden. Versuchen Sie, Ihre Filter anzupassen.",
    "vionto.music.add": "Musik hinzufügen",
    "vionto.music.more": "Mehr Musik",
    "vionto.music.remove": "Musik entfernen",
    "vionto.music.removeAll": "Alle Musik entfernen",
    "vionto.music.royaltyFreeTab": "Lizenzfrei",
    "vionto.music.libraryTab": "Deine Bibliothek",
    "vionto.music.uploadTab": "Neuer Upload",
    "vionto.music.royaltyFreeLicense":
      "Kuratierte, von Vionto gespeicherte Tracks zur Nutzung gemäß ihren erfassten Inhaltslizenzen.",
    "vionto.music.royaltyFreeEmpty": "Noch keine lizenzfreien Tracks verfügbar",
    "vionto.music.royaltyFreeEmptyHint":
      "Der kuratierte Musikkatalog wurde noch nicht befüllt.",
    "vionto.music.libraryEmpty": "Noch keine Musik in deiner Bibliothek",
    "vionto.music.libraryEmptyHint":
      "Lade deinen ersten Track im Upload-Tab hoch.",
    "vionto.music.libraryArtist": "Deine Bibliothek",
    "vionto.music.commonArtist": "Kuratierte Bibliothek",
    "vionto.music.personalUpload": "Persönlicher Upload",
    "vionto.music.commonBadge": "Lizenzfrei",
    "vionto.music.select": "Auswählen",
  },
};
