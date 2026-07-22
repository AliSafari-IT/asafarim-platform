import type { Dict } from "@asafarim/shared-i18n";

const lbVionto: Dict = {
  // Common action shadows
  "common.rename": "Ëmbenennen",
  "common.duplicate": "Duplizéieren",
  "common.delete": "Läschen",
  "common.remove": "Ewechhuelen",

  // Topbar / nav
  "vionto.nav.dashboard": "Iwwersiicht",
  "vionto.nav.projects": "Projeten",
  "vionto.nav.organizer": "Organisateur",
  "vionto.nav.create": "Erstellen",
  "vionto.nav.uploads": "Uploaden",
  "vionto.nav.script": "Script",
  "vionto.nav.audio": "Audio",
  "vionto.nav.export": "Export",

  "vionto.usermenu.user": "Benotzer",
  "vionto.usermenu.verified": "Verifizéiert",
  "vionto.usermenu.verificationPending": "Verifizéierung aussteet",
  "vionto.usermenu.profileSettings": "Profilastellungen",
  "vionto.usermenu.refreshSession": "Sessioun aktualiséieren",

  "vionto.topbar.switchToLight": "Op hellt Thema wiesselen",
  "vionto.topbar.switchToDark": "Op däischtert Thema wiesselen",
  "vionto.topbar.switchApp": "App wiesselen",

  // Aria / common labels
  "vionto.aria.workspaceNav": "Vionto Workspace Navigatioun",
  "vionto.aria.home": "Vionto Startsäit",
  "vionto.aria.collapseSidebar": "Sidebar zesummeklappen",
  "vionto.aria.expandSidebar": "Sidebar opklappen",
  "vionto.aria.primaryNav": "Primär",
  "vionto.aria.closeMenu": "Menü zoumaachen",
  "vionto.aria.openMenu": "Menü opmaachen",
  "vionto.aria.retry": "Nach eng Kéier probéieren",
  "vionto.aria.deleteAsset": "Asset läschen",
  "vionto.aria.videoTemplate": "Videoschabloun",
  "vionto.aria.albumManagement": "Album Management",
  "vionto.aria.albumCollection": "Albumbibliothéik",
  "vionto.aria.editMetadata": "Metadate beaarbechten",
  "vionto.aria.deleteFromProject": "Aus dem Projet läschen",
  "vionto.aria.removeFromAlbum": "Aus dësem Album ewechhuelen",
  "vionto.aria.selectScriptVersion": "Scriptversioun auswielen",
  "vionto.aria.deleteClip": "Clip läschen",
  "vionto.aria.closePreview": "Preview zoumaachen",
  "vionto.aria.videoModePresets": "Videomoduspresets",
  "vionto.aria.videoLength": "Videodauer",
  "vionto.aria.targetDuration": "Zilvidedauer a Sekonnen",
  "vionto.aria.productionPipeline": "Vionto Produktiounspipeline",
  "vionto.aria.expandSubtitles": "Ënnerschrëften ausklappen",
  "vionto.aria.collapseSubtitles": "Ënnerschrëften zesummeklappen",

  // Templates
  "vionto.template.manual": "Manuel",
  "vionto.template.manualSetup": "Maneschten opzesetzen",
  "vionto.template.fallback": "Schabloun",

  // Album
  "vionto.album.collectionAll": "Alles",
  "vionto.album.namePlaceholder": "Albumnumm",
  "vionto.album.descriptionPlaceholder": "Beschreiwung (fakultativ)",
  "vionto.album.locationPlaceholder": "z.B. Paräis, Frankräich",
  "vionto.album.peoplePlaceholder": "Nimm getrennt mat Komma",
  "vionto.album.occasionPlaceholder": "z.B. Hochzäit",
  "vionto.album.moodPlaceholder": "z.B. lëtzeg",
  "vionto.album.editDescriptionPlaceholder": "Albumbeschreiwung",
  "vionto.album.addImages": "Biller derbäisetzen",
  "vionto.album.sortByDate": "Biller no EXIF-Datum sortéieren (eelstéiert)",
  "vionto.album.sortByDateShort": "No Datum sortéieren",
  "vionto.album.groupByLocation": "Biller no GPS-Standort gruppéieren",
  "vionto.album.groupByLocationShort": "No Standort gruppéieren",
  "vionto.album.selectImagesFromBase": "Biller auswiele fir derbäizesetzen (vum Basisalbum)",
  "vionto.album.new": "Neien Album",
  "vionto.album.manage": "Verwalten",
  "vionto.album.done": "Fäerdeg",
  "vionto.album.startFromBase": "Mat alle Biller vum Basisalbum ufänken",
  "vionto.album.activeVersionLabel": "Album fir déi aktiv Versioun",
  "vionto.album.rendersFrom": "rendert aus",
  "vionto.album.selectedAlbum": "dem ausgewielten Album",
  "vionto.album.selectedCount": "{count} ausgewielt",
  "vionto.album.clearAll": "Alles ofwielen",
  "vionto.album.selectAll": "Alles auswielen",
  "vionto.album.deleting": "Gëtt geläscht…",
  "vionto.album.deleteSelected": "Ausgewielt läschen",
  "vionto.album.loading": "Albume ginn gelueden…",
  "vionto.album.details": "Albumdetails",
  "vionto.album.collectionsLabel": "Collectiounen",
  "vionto.album.emptyBase": "Nach keng Biller — lued der e puer hei uewen erop.",
  "vionto.album.emptyAlbum": "Nach keng Biller an dësem Album.",
  "vionto.album.fallback": "Album",

  // Project
  "vionto.project.label": "Projet",
  "vionto.project.selectPlaceholder": "Wielt e Projet aus...",
  "vionto.project.new": "Nei",
  "vionto.project.titlePlaceholder": "Projetstitel",
  "vionto.project.create": "Erstellen",
  "vionto.project.assets": "Projetassets",
  "vionto.project.manage": "Projeten verwalten",
  "vionto.project.emailPlaceholder": "kolleg@example.com",

  // Create workflow
  "vionto.create.eyebrow": "Foto-zu-Geschicht Video MVP",
  "vionto.create.headline": "Erënnerungen a poetesch Beweegung verwandelen.",
  "vionto.create.hubLink": "ASafarIM Hub",

  // Upload
  "vionto.upload.eyebrow": "Uploaden",
  "vionto.upload.title": "E Memory-Set eroplueden",
  "vionto.upload.subtitle":
    "Fotoen, eng ZIP-Archiv oder e spuere Cloud-Drive-Import dobäisetzen.",
  "vionto.upload.dropzoneLabel": "Biller oder ZIP hei erofleeën",
  "vionto.upload.dropzoneHint":
    "JPG, PNG, HEIC, WEBP oder ZIP bis zur Kontoslimit.",
  "vionto.upload.exifReading": "EXIF-Metadate ginn gelies…",
  "vionto.upload.selectedFiles": "{count} Fichier{s} ausgewielt",
  "vionto.upload.moreFiles": "+{count} méi",
  "vionto.upload.button": "Eroplueden",

  // Confirm
  "vionto.confirm.deleteImageTitle": "Bild läschen",
  "vionto.confirm.removeImageTitle": "Bild aus Album ewechhuelen",
  "vionto.confirm.deleteLabel": "Läschen",
  "vionto.confirm.removeLabel": "Ewechhuelen",

  // Story placeholders
  "vionto.story.openingTitlePlaceholder": "z.B. Eise Summer a Provence",
  "vionto.story.introNarrationPlaceholder":
    "E kuerzen Intropassage fir d'Szeen ze setzen...",
  "vionto.story.chapterDescriptionPlaceholder": "Beschreiwung",
  "vionto.story.climaxPlaceholder": "Welle Moment krut déi meescht Bedeitung?",
  "vionto.story.closingMessagePlaceholder": "z.B. Bis mir eis erëm gesinn...",
  "vionto.story.dedicationPlaceholder": "z.B. Fir Mamm a Papp",

  // Script / Story
  "vionto.script.title": "Generéiert Geschicht",
  "vionto.script.placeholder":
    "Den Story-Text gëtt hei nogest eng Generatioun ugewise.",
  "vionto.script.edit": "Script änneren",
  "vionto.script.save": "Versioun späicheren",
  "vionto.script.regenerate": "Neigeneréieren",
  "vionto.script.generating": "Geschicht gëtt generéiert…",
  "vionto.script.empty":
    "Nach kee Script — lued Biller erop a generéiert eng Geschicht.",

  // Audio
  "vionto.audio.title": "Audio",
  "vionto.audio.voiceSelect": "Stimm auswielen",
  "vionto.audio.defaultVoice": "Standardstimm",
  "vionto.audio.preview": "Stimm previewen",
  "vionto.audio.previewing": "Previewen…",
  "vionto.audio.previewText":
    "Dëst ass e Preview vun der gewielter Erzielerstimm fir är Vionto-Geschicht.",
  "vionto.audio.noVoices": "Keng Stëmmen sinn fir dës Sprooch disponibel.",
  "vionto.audio.render": "Erzielung renderen",

  // Subtitle presets (topbar visible)
  "vionto.subtitles.title": "Ënnerschrëften",
  "vionto.subtitles.preset": "Preset",
  "vionto.subtitles.advanced": "Erweidert Astellungen",
  "vionto.subtitles.styling": "Visuellen Stil",
  "vionto.subtitles.positioning": "Positionéierung",
  "vionto.subtitles.timing": "Timing",
  "vionto.subtitles.exportOptions": "Exportoptiounen",
  "vionto.subtitles.font": "Schrëft",
  "vionto.subtitles.fontSize": "Gréisst",
  "vionto.subtitles.fontWeight": "Breet",
  "vionto.subtitles.textTransform": "Case",
  "vionto.subtitles.textColor": "Textfuerw",
  "vionto.subtitles.outlineColor": "Outlin-Fuerw",
  "vionto.subtitles.outlineWidth": "Outlin-Breet",
  "vionto.subtitles.bgColor": "Hannergrond",
  "vionto.subtitles.bgOpacity": "Hannergrond-Opacitéit",
  "vionto.subtitles.borderRadius": "Eckeradius",
  "vionto.subtitles.padding": "Padding",
  "vionto.subtitles.shadow": "Drop-Shadow",
  "vionto.subtitles.shadowColor": "Shadow-Fuerw",
  "vionto.subtitles.shadowOffset": "Shadow-Offset",
  "vionto.subtitles.position": "Vertikal Positioun",
  "vionto.subtitles.alignment": "Alignement",
  "vionto.subtitles.marginV": "Vertikalen Margin",
  "vionto.subtitles.marginH": "Horizontalen Margin",
  "vionto.subtitles.maxLineWidth": "Max. Zeechen/Linn",
  "vionto.subtitles.maxLines": "Max. Linen",
  "vionto.subtitles.maxChars": "Max. Zeechen/Segment",
  "vionto.subtitles.minDisplay": "Min. uweisen (ms)",
  "vionto.subtitles.maxDisplay": "Max. uweisen (ms)",
  "vionto.subtitles.gap": "Lück tëschent Segmenter (ms)",
  "vionto.subtitles.splitPunctuation": "Op Interpunktioun ophiewen",
  "vionto.subtitles.splitLong": "Laang Sätz ophiewen",
  "vionto.subtitles.burnIn": "Ënnerschrëften am Video brennen",
  "vionto.subtitles.exportSrt": ".srt-Fichier exportéieren",
  "vionto.subtitles.exportVtt": ".vtt-Fichier exportéieren",
  "vionto.subtitle.position.lowerThird": "Ënneren Drëttel",
  "vionto.subtitle.position.top": "Uewen",
  "vionto.subtitle.position.bottom": "Ënnen",
  "vionto.subtitle.position.corner": "Eck",
  "vionto.subtitle.preset.minimal": "Minimal",
  "vionto.subtitle.preset.memory": "Erënnerung",
  "vionto.subtitle.preset.social": "Social",
  "vionto.subtitle.preset.documentary": "Dokumentar",

  // Video version
  "vionto.videoVersion.new": "Nei Videoversioun",
  "vionto.videoVersion.titleTooltip":
    "Eng ganz nei Videoversioun erstellen, déi mat dësem Album verknippt ass.",
  "vionto.videoVersion.label": "Videoversioun",
  "vionto.videoVersion.newVersion": "Nei Versioun",
  "vionto.videoVersion.deleteTitle": "Versioun läschen",
  "vionto.videoVersion.deleteMessage":
    "Dës Versioun läschen? Dëst kann net réckgängeg gemaach ginn.",
  "vionto.videoVersion.fallback": "Versioun",
  "vionto.videoVersion.scripts": "{count} Script{s}",
  "vionto.videoVersion.renders": "{count} Render{s}",
  "vionto.videoVersion.exports": "{count} Export{s}",

  // Modes
  "vionto.mode.cinematic": "Kinematografesch",
  "vionto.mode.slideshow": "Diashow",
  "vionto.mode.social": "Social",
  "vionto.mode.story": "Geschicht",

  // Aspect
  "vionto.aspect.aria": "Bildverhältnis",
  "vionto.aspect.label": "Format",
  "vionto.aspect.landscape": "Landschaft",
  "vionto.aspect.portrait": "Portrait",
  "vionto.aspect.square": "1:1",

  // Notes
  "vionto.notes.label": "Notizen fir den Erzieler",
  "vionto.notes.placeholder":
    "z.B. Konzentréiert Iech op d'Sonnenënnergang a Familljemomenter. Bleift nostalgesch.",

  // Preview
  "vionto.preview.eyebrow": "Preview",
  "vionto.preview.empty":
    "Är lescht fäerdeg Vionto-Render gëtt hei ugewise.",
  "vionto.preview.draft": "{mode} Entworf",
  "vionto.preview.formatSummary":
    "{aspect} MP4, H.264-Video, AAC-Audio, Ënnerschrëften am Video oder als SRT exportéiert.",

  // Render
  "vionto.render.title": "Render Queue",
  "vionto.render.start": "MP4 renderen",
  "vionto.render.queued": "An der Queue",
  "vionto.render.rendering": "Gëtt gerendert…",
  "vionto.render.running": "Gëtt gerendert…",
  "vionto.render.completed": "Fäerdeg",
  "vionto.render.failed": "Feelgeschloen",
  "vionto.render.download": "Download-Link fir fäerdege Video kréien",
  "vionto.render.downloading": "Download-Link fäerdeg",
  "vionto.render.save": "MP4 eroflueden",
  "vionto.render.retry": "Render nees probéieren",
  "vionto.render.cancel": "Render ofbriechen",
  "vionto.render.cancelled": "Ofgebrach",
  "vionto.render.generateVideo": "Video generéieren",
  "vionto.render.creating": "Video gëtt erstallt…",
  "vionto.render.createVideo": "Video erstellen",
  "vionto.render.createAnother": "Nach e Video erstellen",
  "vionto.render.error.noScript":
    "Generéiert oder späichert eng Erzielung ier Dir rendert.",
  "vionto.render.error.saveSettingsFailed":
    "Projetastellungen konnten virun dem Render net gespäichert ginn.",
  "vionto.render.error.saveSubtitlesFailed":
    "Ënnerschrëftenastellungen konnten virun dem Render net gespäichert ginn.",
  "vionto.render.error.startFailed": "Render konnt net gestart ginn",
  "vionto.render.error.pollFailed": "Render-Status konnt net ofgeholl ginn",

  // Export
  "vionto.export.title": "Export",
  "vionto.export.downloadMp4": "MP4 eroflueden",
  "vionto.export.downloadSrt": "SRT eroflueden",
  "vionto.export.burnSubtitles": "Ënnerschrëften brennen",

  // Billing
  "vionto.billing.creditsRemaining": "Verbleiwend Crédits",
  "vionto.billing.upgradeCta": "Plan upgraden",

  // Errors
  "vionto.error.unauthorized": "Loggt Iech w.e.g. an fir weiderzemaachen.",
  "vionto.error.uploadTooLarge": "De Fichier iwwerschrëtt déi maximal erlaabt Gréisst.",
  "vionto.error.generationFailed":
    "Geschichtsgeneratioun feelgeschloen. Probéiert w.e.g. nach eng Kéier.",
  "vionto.error.noImages":
    "Lued w.e.g. mindestens ee Bild erop, ier Dir eng Geschicht generéiert.",

  // Pipeline
  "vionto.pipeline.ingest": "Ingest",
  "vionto.pipeline.ingestDetail":
    "Biller, ZIP-Uploads, Dossier-Batchën, Thumbnails an EXIF-Captures.",
  "vionto.pipeline.write": "Schreiwen",
  "vionto.pipeline.writeDetail":
    "Waarm Erzielung generéiert aus Beschreiwungen, Zäitstempelen, Plazen a Stëmmung.",
  "vionto.pipeline.narrate": "Erzielen",
  "vionto.pipeline.narrateDetail":
    "Stemmauswiel, TTS-Render, optional Hannergrond-MP3 a Ducking.",
  "vionto.pipeline.render": "Renderen",
  "vionto.pipeline.renderDetail":
    "Pan/Zoom-Beweegung, Transitiounen, Ënnerschrëften a MP4-Export.",

  // Video length
  "vionto.videoLength.label": "Videodauer",
  "vionto.videoLength.seconds": "{seconds} Sekonnen",
  "vionto.videoLength.min": "15s",
  "vionto.videoLength.max": "90s",
  "vionto.videoLength.description":
    "Gëtt benotzt fir d'Geschicht, d'Voiceover, d'Ënnerschrëften an d'Billerpacing z'zäiten.",
  "vionto.videoLength.staleWarning":
    "Dauer geännert — generéiert d'Geschicht nees, fir Ënnerschrëften a Pacing synchroon ze halen.",

  // Queue / pipeline
  "vionto.queue.captioning": "Captioning",
  "vionto.queue.captioningDetail": "{count} Biller veraarbecht",
  "vionto.queue.script": "Script",
  "vionto.queue.scriptDetail": "Erzielungsentworf fäerdeg",
  "vionto.queue.voice": "Stimm",
  "vionto.queue.voiceDetail": "Stimm ausgewielt",
  "vionto.queue.render": "Render",
  "vionto.queue.renderDetail": "Preview-MP4 an der Queue",

  // Alert messages
  "vionto.alert.selectProjectFirst":
    "Wielt oder erstellt w.e.g. e Projet fir d'éischt",
  "vionto.alert.uploadImagesFirst":
    "Lued w.e.g. Biller erop, ier Dir rendert",
  "vionto.alert.generateScriptFirst":
    "Generéiert w.e.g. e Script, ier Dir rendert",
  "vionto.alert.saveSettingsFailed":
    "Projetastellungen konnten virun dem Render net gespäichert ginn",
  "vionto.alert.saveSubtitlesFailed":
    "Ënnerschrëftenastellungen konnten virun dem Render net gespäichert ginn",
  "vionto.alert.startRenderFailed": "Render konnt net gestart ginn",
  "vionto.alert.previewAudioFailed": "Audio-Preview feelgeschloen",
  "vionto.alert.deleteAssetFailed": "Asset konnt net geläscht ginn",
  "vionto.alert.getDownloadUrlFailed": "Download-URL konnt net ofgeruff ginn",
  "vionto.alert.createProjectFailed": "Projet konnt net erstallt ginn",
  "vionto.alert.uploadSessionFailed":
    "Upload-Sessioun konnt net erstallt ginn",
  "vionto.alert.noFilesUploaded":
    "Keng Fichieren erfollegräich eropgelueden. Kuckt déi feelgeschloe Reien a probéiert nach eng Kéier.",
  "vionto.alert.uploadFailed": "Upload feelgeschloen",
  "vionto.alert.saveFailed": "Späicheren feelgeschloen",
  "vionto.alert.musicUploadFailed": "Musek-Upload feelgeschloen",
  "vionto.alert.musicUploadPrepareFailed":
    "Musek-Upload konnt net virbereet ginn",
  "vionto.alert.renderFailed": "Render feelgeschloen",
  "vionto.alert.unknownError": "Onbekannte Feeler",

  // Download dialog
  "vionto.downloadDialog.title": "Download-Link",
  "vionto.downloadDialog.description":
    "Äre Video ass fäerdeg. Kopéiert de Download-Link hei ënnen fir ze deelen, oder lueden en direkt erof.",
  "vionto.downloadDialog.copy": "Kopéieren",
  "vionto.downloadDialog.copied": "Download-Link an d'Zwëschenablage kopéiert",

  // Units
  "vionto.unit.seconds": "s",
  "vionto.unit.mb": "MB",

  // Lifecycle labels
  "vionto.lifecycle.draft.label": "Entworf",
  "vionto.lifecycle.draft.next": "Fotoen eroplueden",
  "vionto.lifecycle.photos_uploaded.label": "Fotoen eropgelueden",
  "vionto.lifecycle.photos_uploaded.next": "Geschicht generéieren",
  "vionto.lifecycle.story_generated.label": "Geschicht generéiert",
  "vionto.lifecycle.story_generated.next": "Audio auswielen",
  "vionto.lifecycle.audio_ready.label": "Audio fäerdeg",
  "vionto.lifecycle.audio_ready.next": "Video renderen",
  "vionto.lifecycle.video_rendered.label": "Video gerendert",
  "vionto.lifecycle.video_rendered.next": "Publizéieren/exportéieren",
  "vionto.lifecycle.nextLabel": "Nächst:",

  // Collection labels
  "vionto.collection.family": "Famill",
  "vionto.collection.travel": "Reesen",
  "vionto.collection.events": "Evenementer",
  "vionto.collection.work": "Aarbecht",
  "vionto.collection.archive": "Archiv",
  "vionto.collection.favorites": "Favoritten",
};

export default lbVionto;
