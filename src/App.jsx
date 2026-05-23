import {
  BrowserMultiFormatReader,
} from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";
import { createClient } from "@supabase/supabase-js";
import {
  Album,
  AlertCircle,
  ArrowDownUp,
  Building2,
  Calendar,
  Camera,
  Check,
  Columns3,
  Disc3,
  Download,
  DollarSign,
  Edit3,
  Heart,
  Info,
  Image as ImageIcon,
  FileImage,
  ImagePlus,
  Library,
  Loader2,
  Moon,
  Music2,
  Pencil,
  Plus,
  Save,
  ScanBarcode,
  Search,
  TableProperties,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "vinyl-database-records";
const LEGACY_STORAGE_KEY = "vinyl-database-v1";
const DB_NAME = "vinyl-database";
const DB_VERSION = 1;
const DB_STORE = "app";
const THEME_STORAGE_KEY = "vinyl-database-theme";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_LIBRARY_ID = import.meta.env.VITE_SUPABASE_LIBRARY_ID || "default";
const CLOUD_STORAGE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = CLOUD_STORAGE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const WORKFLOW_STATUSES = new Set(["draft", "saved", "wishlist"]);
const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|tif|tiff|webp)$/i;
const MAX_COVER_SIZE = 1400;
const COVER_JPEG_QUALITY = 0.86;
const EMPTY_FORM = {
  artist: "",
  additionalArtists: "",
  title: "",
  year: "",
  releaseDate: "",
  genre: "",
  label: "",
  length: "",
  cost: "",
  acquiredFrom: "",
  country: "",
  releaseStatus: "",
  format: "",
  trackCount: "",
  favorite: false,
  wantsBetterArtwork: false,
  source: "",
  releaseGroupId: "",
  spotifyUrl: "",
  appleMusicUrl: "",
  scannedBarcode: "",
  tracklist: [],
};

const TABS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "review", label: "Review", icon: Edit3 },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "collection", label: "Collection", icon: Library },
];

const GENRE_OPTIONS = [
  "Alternative",
  "Blues",
  "Classical",
  "Country",
  "Dance",
  "Electronic",
  "Folk",
  "Hip-Hop",
  "Indie",
  "Jazz",
  "Latin",
  "Metal",
  "Pop",
  "Punk",
  "R&B",
  "Rap",
  "Reggae",
  "Rock",
  "Soundtrack",
  "Soul",
];

function titleCase(value = "") {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && word === word.toUpperCase()) return word;
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readLegacyRecords() {
  try {
    const stored = window.localStorage?.getItem(LEGACY_STORAGE_KEY);
    return stored ? JSON.parse(stored) || [] : [];
  } catch {
    return [];
  }
}

function clearLegacyRecords() {
  try {
    window.localStorage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // If legacy storage is unavailable, there is nothing useful to clear.
  }
}

function normalizeStoredRecords(records = []) {
  return Array.isArray(records) ? records.map(normalizeStoredRecord) : [];
}

async function loadCloudRecords() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("vinyl_libraries")
    .select("records")
    .eq("id", SUPABASE_LIBRARY_ID)
    .maybeSingle();

  if (error) throw error;
  return normalizeStoredRecords(data?.records || []);
}

async function saveCloudRecords(records) {
  if (!supabase) return;

  const { error } = await supabase
    .from("vinyl_libraries")
    .upsert(
      {
        id: SUPABASE_LIBRARY_ID,
        records,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}

function openVinylDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE);
      }
    };
    request.onerror = () => reject(request.error || new Error("Database failed to open"));
    request.onsuccess = () => resolve(request.result);
  });
}

function readDatabaseValue(database, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(key);
    request.onerror = () => reject(request.error || new Error("Database read failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function writeDatabaseValue(database, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    store.put(value, key);
    transaction.onerror = () => reject(transaction.error || new Error("Database write failed"));
    transaction.oncomplete = () => resolve();
  });
}

async function loadStoredRecords() {
  const legacyRecords = readLegacyRecords();

  try {
    const database = await openVinylDatabase();
    const saved = await readDatabaseValue(database, STORAGE_KEY);
    const records = Array.isArray(saved?.records)
      ? saved.records.map(normalizeStoredRecord)
      : [];

    if (CLOUD_STORAGE_ENABLED) {
      const cloudRecords = await loadCloudRecords();
      if (cloudRecords?.length) {
        await writeDatabaseValue(database, STORAGE_KEY, {
          records: cloudRecords,
          updatedAt: new Date().toISOString(),
          source: "supabase",
        });
        clearLegacyRecords();
        return cloudRecords;
      }

      const localRecords = records.length
        ? records
        : legacyRecords.map(normalizeStoredRecord);
      if (localRecords.length) {
        await saveCloudRecords(localRecords);
        clearLegacyRecords();
        return localRecords;
      }
    }

    if (!records.length && legacyRecords.length) {
      const migratedRecords = legacyRecords.map(normalizeStoredRecord);
      await writeDatabaseValue(database, STORAGE_KEY, {
        records: migratedRecords,
        updatedAt: new Date().toISOString(),
      });
      clearLegacyRecords();
      return migratedRecords;
    }

    clearLegacyRecords();
    return records;
  } catch {
    return legacyRecords.map(normalizeStoredRecord);
  }
}

async function saveStoredRecords(records) {
  const database = await openVinylDatabase();
  await writeDatabaseValue(database, STORAGE_KEY, {
    records,
    updatedAt: new Date().toISOString(),
    source: CLOUD_STORAGE_ENABLED ? "supabase" : "indexeddb",
  });
  if (CLOUD_STORAGE_ENABLED) {
    await saveCloudRecords(records);
  }
}

function isLikelyImageFile(file) {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function createCoverDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);

  if (/svg|heic|heif/i.test(file.type) || /\.(svg|heic|heif)$/i.test(file.name)) {
    return originalDataUrl;
  }

  try {
    const image = await loadImage(originalDataUrl);
    const scale = Math.min(1, MAX_COVER_SIZE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY);
  } catch {
    return originalDataUrl;
  }
}

async function decodeBarcodeFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  if ("BarcodeDetector" in window) {
    try {
      const supportedFormats =
        typeof window.BarcodeDetector.getSupportedFormats === "function"
          ? await window.BarcodeDetector.getSupportedFormats()
          : [];
      const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
      const formats = supportedFormats.length
        ? preferredFormats.filter((format) => supportedFormats.includes(format))
        : preferredFormats;
      const detector = formats.length
        ? new window.BarcodeDetector({ formats })
        : new window.BarcodeDetector();
      const results = await detector.detect(image);
      const rawValue = results[0]?.rawValue;
      if (rawValue) return rawValue;
    } catch {
      // Fall through to ZXing when the native detector exists but cannot decode the image.
    }
  }

  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageElement(image);
    return typeof result.getText === "function" ? result.getText() : result.text;
  } catch {
    throw new Error("No barcode found. Try a sharper, closer photo of just the barcode.");
  }
}

function normalizeRelease(release) {
  const artist =
    release["artist-credit"]?.map((entry) => entry.name).join(", ") ||
    release.artist ||
    "";
  const label = formatLabels(release["label-info"]);
  const year = release.date?.slice(0, 4) || "";
  const genre =
    release.tags
      ?.slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map((tag) => titleCase(tag.name))
      .join(", ") || "";

  return {
    mbid: release.id,
    artist,
    additionalArtists: joinArtists(splitArtistCredit(artist)),
    title: release.title || "",
    year,
    releaseDate: release.date || "",
    genre,
    label,
    length: "",
    disambiguation: release.disambiguation || "",
    country: release.country || "",
    releaseStatus: release.status || "",
    format: formatMedia(release.media),
    trackCount: release["track-count"] || "",
    source: "MusicBrainz",
    releaseGroupId: release["release-group"]?.id || "",
    score: release.score || 0,
  };
}

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pickGenre(...tagSets) {
  return tagSets
    .flat()
    .filter(Boolean)
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map((tag) => titleCase(tag.name))
    .join(", ");
}

function uniqueJoin(values = []) {
  return Array.from(new Set(values.filter(Boolean))).join(", ");
}

function uniqueBy(values = [], keyFn = (value) => value) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function splitGenres(value = "") {
  return value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}

function joinGenres(genres = []) {
  return uniqueSorted(genres).join(", ");
}

function splitArtists(value = "") {
  return value
    .split(",")
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function joinArtists(artists = []) {
  return uniqueSorted(artists).join(", ");
}

function splitArtistCredit(value = "") {
  return value
    .replace(/\s+feat(?:uring)?\.?\s+/gi, ", ")
    .replace(/\s+with\s+/gi, ", ")
    .replace(/\s*&\s*/g, ", ")
    .replace(/\s+\+\s+/g, ", ")
    .replace(/\s+and\s+/gi, ", ")
    .split(/\s*,\s*/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function artistTokens(record) {
  return uniqueSorted([
    ...splitArtistCredit(record.artist || ""),
    ...splitArtists(record.additionalArtists || ""),
  ]);
}

function inferAdditionalArtists(record) {
  const artists = splitArtistCredit(record.artist || "");
  return artists.length > 1 ? joinArtists(artists) : "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatLabels(labelInfo = []) {
  return uniqueJoin(labelInfo.map((entry) => entry.label?.name));
}

function formatMedia(media = []) {
  return uniqueJoin(media.map((medium) => medium.format));
}

function normalizeTracklist(media = []) {
  return media.flatMap((medium, mediumIndex) =>
    (medium.tracks || []).map((track, trackIndex) => ({
      id: track.id || `${mediumIndex}-${trackIndex}`,
      position: track.position || track.number || String(trackIndex + 1),
      title: track.title || track.recording?.title || "Untitled track",
      length: formatDuration(track.length || track.recording?.length || 0),
      medium: medium.position || mediumIndex + 1,
    })),
  );
}

function normalizeStoredRecord(record) {
  const workflowStatus = WORKFLOW_STATUSES.has(record.status)
    ? record.status
    : "draft";
  const releaseStatus = record.releaseStatus || (
    WORKFLOW_STATUSES.has(record.status) ? "" : record.status || ""
  );

  return {
    ...EMPTY_FORM,
    ...record,
    status: workflowStatus,
    releaseStatus,
    additionalArtists: record.additionalArtists || inferAdditionalArtists(record),
    favorite: Boolean(record.favorite),
    wantsBetterArtwork: Boolean(record.wantsBetterArtwork),
    tracklist: Array.isArray(record.tracklist) ? record.tracklist : [],
  };
}

function normalizeArtworkImages(images = []) {
  return images.map((image, index) => ({
    id: image.id || `${image.image}-${index}`,
    url: image.thumbnails?.large || image.image,
    fullUrl: image.image,
    label: image.types?.length
      ? image.types.join(", ")
      : image.front
        ? "Front"
        : image.back
          ? "Back"
          : "Artwork",
    isFront: Boolean(image.front),
  }));
}

function mergeArtworkOptions(...optionSets) {
  return uniqueBy(
    optionSets.flat().filter(Boolean),
    (option) => option.fullUrl || option.url,
  );
}

function extractStreamingUrls(relations = []) {
  const urls = relations
    .map((relation) => relation.url?.resource || "")
    .filter(Boolean);
  return {
    spotifyUrl: urls.find((url) => /open\.spotify\.com|spotify\.com\/album/i.test(url)) || "",
    appleMusicUrl:
      urls.find((url) => /music\.apple\.com|itunes\.apple\.com/i.test(url)) || "",
  };
}

function albumSearchQuery(record) {
  return [record.artist, record.title].filter(Boolean).join(" ").trim();
}

function spotifyAlbumUrl(record) {
  return record.spotifyUrl || "";
}

function appleMusicAlbumUrl(record) {
  return record.appleMusicUrl || "";
}

async function resolveAppleMusicAlbumUrl(record) {
  const query = albumSearchQuery(record);
  if (!query || !record.title) return "";

  try {
    const params = new URLSearchParams({
      term: query,
      entity: "album",
      media: "music",
      limit: "12",
    });
    const response = await fetchWithTimeout(
      `https://itunes.apple.com/search?${params.toString()}`,
      {},
      5000,
    );
    if (!response.ok) return "";
    const data = await response.json();
    const title = normalizeComparable(record.title);
    const artist = normalizeComparable(record.artist);
    const matches = (data.results || []).filter((result) => result.collectionViewUrl);
    const exact = matches.find((result) => {
      const resultTitle = normalizeComparable(result.collectionName);
      const resultArtist = normalizeComparable(result.artistName);
      return (
        resultTitle === title &&
        (!artist || resultArtist.includes(artist) || artist.includes(resultArtist))
      );
    });
    const close = matches.find((result) => {
      const resultTitle = normalizeComparable(result.collectionName);
      const resultArtist = normalizeComparable(result.artistName);
      return (
        (resultTitle.includes(title) || title.includes(resultTitle)) &&
        (!artist || resultArtist.includes(artist) || artist.includes(resultArtist))
      );
    });
    return exact?.collectionViewUrl || close?.collectionViewUrl || "";
  } catch {
    return "";
  }
}

async function resolveLinkedStreamingUrls(sourceUrl = "") {
  if (!sourceUrl) return {};

  try {
    const params = new URLSearchParams({ url: sourceUrl });
    const response = await fetchWithTimeout(
      `https://api.song.link/v1-alpha.1/links?${params.toString()}`,
      {},
      6000,
    );
    if (!response.ok) return {};
    const data = await response.json();
    return {
      spotifyUrl: data.linksByPlatform?.spotify?.url || "",
      appleMusicUrl: data.linksByPlatform?.appleMusic?.url || "",
    };
  } catch {
    return {};
  }
}

function normalizeComparable(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(value = "") {
  return normalizeComparable(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function editDistance(a = "", b = "") {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function fuzzyTokenMatch(searchToken, targetToken) {
  if (!searchToken || !targetToken) return false;
  if (targetToken.includes(searchToken) || searchToken.includes(targetToken)) return true;
  if (searchToken.length < 4) return false;

  const allowedDistance = searchToken.length >= 7 ? 2 : 1;
  return editDistance(searchToken, targetToken) <= allowedDistance;
}

function matchesSmartSearch(record, query) {
  const search = normalizeComparable(query);
  if (!search) return true;

  const values = [
    record.artist,
    record.additionalArtists,
    ...artistTokens(record),
    record.title,
    record.year,
    record.genre,
    record.label,
    record.cost,
    record.acquiredFrom,
    record.country,
    record.releaseStatus,
    record.scannedBarcode,
  ];
  const normalizedValues = values.map(normalizeComparable).filter(Boolean);
  const haystack = normalizedValues.join(" ");
  const compactHaystack = haystack.replace(/\s+/g, "");
  const compactSearch = search.replace(/\s+/g, "");

  if (haystack.includes(search) || compactHaystack.includes(compactSearch)) {
    return true;
  }

  const targetTokens = searchTokens(normalizedValues.join(" "));
  return searchTokens(search).every((token) =>
    targetTokens.some((targetToken) => fuzzyTokenMatch(token, targetToken)),
  );
}

function cleanBarcode(value = "") {
  return String(value).replace(/\D/g, "");
}

function isVinylRelease(release) {
  return /vinyl|12\"|10\"|7\"|lp/i.test(
    [release.format, release.disambiguation].filter(Boolean).join(" "),
  );
}

function csvCell(value = "") {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCollectionCsv(collection) {
  const headers = [
    "artist",
    "additional_artists",
    "title",
    "year",
    "genres",
    "label",
    "length",
    "cost",
    "source",
    "country",
    "status",
    "favorite",
    "spotify",
    "apple_music",
    "musicbrainz",
    "notes",
  ];
  const rows = collection.map((record) => [
    record.artist,
    record.additionalArtists,
    record.title,
    record.year,
    record.genre,
    record.label,
    record.length,
    record.cost,
    record.acquiredFrom,
    record.country,
    record.releaseStatus,
    record.favorite ? "yes" : "no",
    spotifyAlbumUrl(record),
    appleMusicAlbumUrl(record),
    record.mbid ? `https://musicbrainz.org/release/${record.mbid}` : "",
    record.notes,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vinyl-database.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadFullBackup(records) {
  const backup = {
    app: "vinyl-database",
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `vinyl-database-backup-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function readBackupFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records)) {
    throw new Error("Backup file does not contain vinyl records.");
  }
  return normalizeStoredRecords(records);
}

async function fetchReleaseDetails(mbid) {
  const detailsUrl = `https://musicbrainz.org/ws/2/release/${mbid}?inc=artist-credits+labels+recordings+genres+tags+release-groups+url-rels&fmt=json`;

  const detailsResponse = await fetchWithTimeout(detailsUrl, {}, 8000);

  const detailPatch = {};
  let detailRecord = {};
  if (detailsResponse.ok) {
    const details = await detailsResponse.json();
    const tracks = details.media?.flatMap((medium) => medium.tracks || []) || [];
    const length = tracks.reduce(
      (total, track) => total + (track.length || track.recording?.length || 0),
      0,
    );
    const label = formatLabels(details["label-info"]);
    const releaseGroupTags = details["release-group"]?.genres || details["release-group"]?.tags || [];
    const genre = pickGenre(details.genres, details.tags, releaseGroupTags);
    const tracklist = normalizeTracklist(details.media);

    detailPatch.length = formatDuration(length);
    if (details.date) {
      detailPatch.releaseDate = details.date;
      detailPatch.year = details.date.slice(0, 4);
    }
    if (details.country) detailPatch.country = details.country;
    if (details.status) detailPatch.releaseStatus = details.status;
    if (formatMedia(details.media)) detailPatch.format = formatMedia(details.media);
    if (tracklist.length) detailPatch.trackCount = String(tracklist.length);
    detailPatch.tracklist = tracklist;
    detailPatch.releaseGroupId = details["release-group"]?.id || "";
    detailPatch.source = "MusicBrainz";
    Object.assign(detailPatch, extractStreamingUrls(details.relations));
    if (label) detailPatch.label = label;
    if (genre) detailPatch.genre = genre;
    detailRecord = {
      artist:
        details["artist-credit"]?.map((entry) => entry.name).join(", ") || "",
      title: details.title || "",
    };
  }

  if (detailPatch.releaseGroupId) {
    try {
      const groupResponse = await fetchWithTimeout(
        `https://musicbrainz.org/ws/2/release-group/${detailPatch.releaseGroupId}?inc=genres+tags+url-rels&fmt=json`,
        {},
        6000,
      );
      if (groupResponse.ok) {
        const group = await groupResponse.json();
        Object.assign(
          detailPatch,
          Object.fromEntries(
            Object.entries(extractStreamingUrls(group.relations)).filter(([, value]) => value),
          ),
        );
        if (!detailPatch.genre) {
          const groupGenre = pickGenre(group.genres, group.tags);
          if (groupGenre) detailPatch.genre = groupGenre;
        }
      }
    } catch {
      // Release-group metadata is a bonus; release-level details are enough to continue.
    }
  }

  if (!detailPatch.appleMusicUrl) {
    detailPatch.appleMusicUrl = await resolveAppleMusicAlbumUrl({
      ...detailRecord,
      ...detailPatch,
    });
  }
  if (!detailPatch.spotifyUrl && detailPatch.appleMusicUrl) {
    const linked = await resolveLinkedStreamingUrls(detailPatch.appleMusicUrl);
    if (linked.spotifyUrl) detailPatch.spotifyUrl = linked.spotifyUrl;
  }
  if (!detailPatch.appleMusicUrl && detailPatch.spotifyUrl) {
    const linked = await resolveLinkedStreamingUrls(detailPatch.spotifyUrl);
    if (linked.appleMusicUrl) detailPatch.appleMusicUrl = linked.appleMusicUrl;
  }

  const coverUrls = [
    `https://coverartarchive.org/release/${mbid}`,
    detailPatch.releaseGroupId
      ? `https://coverartarchive.org/release-group/${detailPatch.releaseGroupId}`
      : "",
  ].filter(Boolean);

  const allArtworkOptions = [];
  for (const coverUrl of coverUrls) {
    try {
      const coverResponse = await fetchWithTimeout(coverUrl, {}, 4500);
      if (!coverResponse.ok) continue;
      const cover = await coverResponse.json();
      const artworkOptions = normalizeArtworkImages(cover.images || []);
      allArtworkOptions.push(...artworkOptions);
      const front = cover.images?.find((image) => image.front) || cover.images?.[0];
      if (!detailPatch.referenceArtwork && (front?.thumbnails?.large || front?.image)) {
        detailPatch.referenceArtwork = front.thumbnails?.large || front.image;
      }
    } catch {
      // Cover Art Archive occasionally lacks release-level art; the release-group fallback may still work.
    }
  }
  detailPatch.artworkOptions = mergeArtworkOptions(allArtworkOptions);

  return detailPatch;
}

function quoteMusicBrainz(value = "") {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function fieldQuery(field, value) {
  const clean = quoteMusicBrainz(value);
  return clean ? `${field}:"${clean}"` : "";
}

function parseUpcAlbumTitle(value = "") {
  const clean = value
    .replace(/\s+-\s+Music\s*&\s*Performance\s+-\s*Vinyl.*$/i, "")
    .replace(/\s+-\s*Vinyl.*$/i, "")
    .replace(/\s+\[(LP|Vinyl).*?\]$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = clean.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      artist: parts.slice(0, -1).join(" - "),
      title: parts.at(-1),
    };
  }

  return { artist: "", title: clean };
}

function inferGenresFromText(value = "") {
  const text = normalizeComparable(value);
  const matches = [
    ["Jazz", /\bjazz\b|\bswing\b|\bbig band\b|\bvocal jazz\b/],
    ["Country", /\bcountry\b|\bamericana\b/],
    ["Rock", /\brock\b|\bclassic rock\b/],
    ["Pop", /\bpop\b/],
    ["Hip-Hop", /\bhip hop\b|\bhiphop\b/],
    ["Rap", /\brap\b/],
    ["Soul", /\bsoul\b|\br b\b|\brhythm blues\b/],
    ["Electronic", /\belectronic\b|\bdance\b|\btechno\b|\bhouse\b/],
    ["Folk", /\bfolk\b/],
    ["Blues", /\bblues\b/],
    ["Classical", /\bclassical\b|\borchestra\b|\bsymphony\b/],
    ["Latin", /\blatin\b|\bsalsa\b|\bbachata\b|\breggaeton\b/],
    ["Reggae", /\breggae\b/],
    ["Punk", /\bpunk\b/],
    ["Metal", /\bmetal\b/],
  ]
    .filter(([, pattern]) => pattern.test(text))
    .map(([genre]) => genre);

  return joinGenres(matches);
}

function normalizeUpcItem(item, barcode) {
  const parsed = parseUpcAlbumTitle(item.title || "");
  const description = item.description || "";
  const images = (item.images || [])
    .filter(Boolean)
    .map((url) => url.replace(/^http:\/\//i, "https://"));
  const artworkOptions = images.map((url, index) => ({
    id: `upc-${barcode}-${index}`,
    url,
    fullUrl: url,
    label: index === 0 ? "Product image" : `Product image ${index + 1}`,
    isFront: index === 0,
  }));

  return {
    id: `upc-${barcode}-${item.ean || item.upc || item.title}`,
    mbid: "",
    artist: parsed.artist,
    additionalArtists: joinArtists(splitArtistCredit(parsed.artist)),
    title: parsed.title || item.title || "",
    year: "",
    releaseDate: "",
    genre: inferGenresFromText(`${item.title || ""} ${description}`),
    label: item.brand || "",
    length: "",
    disambiguation: "Matched by barcode fallback",
    country: "",
    releaseStatus: "",
    format: /vinyl|lp/i.test(item.title || item.description || "") ? "Vinyl" : "",
    trackCount: "",
    source: "UPCItemDB",
    releaseGroupId: "",
    score: 100,
    scannedBarcode: barcode,
    referenceArtwork: artworkOptions[0]?.url || "",
    artworkOptions,
    notes: "",
    referenceNote: description,
  };
}

async function searchUpcItemDb(barcode) {
  const clean = cleanBarcode(barcode);
  if (!clean) return [];

  const params = new URLSearchParams({ upc: clean });
  const response = await fetchWithTimeout(`/api/upcitemdb/lookup?${params.toString()}`);
  if (!response.ok) return [];

  const data = await response.json();
  return (data.items || []).map((item) => normalizeUpcItem(item, clean));
}

function buildLookupQueries(form) {
  const artist = form.searchArtist || form.artist || "";
  const title = form.searchTitle || form.title || "";
  const barcode = cleanBarcode(form.scannedBarcode || "");
  const general = quoteMusicBrainz([artist, title].filter(Boolean).join(" "));
  const artistQuery = fieldQuery("artist", artist);
  const titleQuery = fieldQuery("release", title);
  const barcodeQuery = fieldQuery("barcode", barcode);
  const vinylQuery = fieldQuery("format", "Vinyl");
  const combinedQuery = artistQuery && titleQuery ? `${artistQuery} AND ${titleQuery}` : "";
  const queries = [
    barcodeQuery,
    combinedQuery && vinylQuery ? `${combinedQuery} AND ${vinylQuery}` : "",
    combinedQuery,
    artistQuery && vinylQuery ? `${artistQuery} AND ${vinylQuery}` : "",
    titleQuery && vinylQuery ? `${titleQuery} AND ${vinylQuery}` : "",
    artistQuery,
    titleQuery,
    general,
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query) => query.length >= 3);

  return Array.from(new Set(queries));
}

async function searchMusicBrainz(query, limit = 12) {
  const params = new URLSearchParams({
    query,
    fmt: "json",
    limit: String(limit),
  });
  const response = await fetchWithTimeout(
    `https://musicbrainz.org/ws/2/release/?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("MusicBrainz lookup failed");
  }

  const data = await response.json();
  return data.releases || [];
}

function matchPriority(record, form, fallbackTargets = []) {
  const targetTitles = [form.searchTitle, form.title, ...fallbackTargets.map((target) => target.title)]
    .map(normalizeComparable)
    .filter(Boolean);
  const targetArtists = [form.searchArtist, form.artist, ...fallbackTargets.map((target) => target.artist)]
    .map(normalizeComparable)
    .filter(Boolean);
  const recordTitle = normalizeComparable(record.title);
  const recordArtist = normalizeComparable(record.artist);
  let priority = Number(record.score || 0);

  if (targetTitles.some((title) => title && recordTitle === title)) priority += 700;
  if (
    targetTitles.some(
      (title) => title && (recordTitle.includes(title) || title.includes(recordTitle)),
    )
  ) {
    priority += 280;
  }
  if (
    targetArtists.some(
      (artist) => artist && (recordArtist.includes(artist) || artist.includes(recordArtist)),
    )
  ) {
    priority += 220;
  }
  if (targetTitles.length && !targetTitles.some((title) => recordTitle.includes(title))) {
    priority -= 160;
  }
  if (isVinylRelease(record)) priority += 120;
  if (record.source === "UPCItemDB") priority += 80;

  return priority;
}

async function lookupReleases(form) {
  const queries = buildLookupQueries(form);
  const barcode = cleanBarcode(form.scannedBarcode || "");
  if (!queries.length && !barcode) return [];

  let barcodeFallbacks = barcode ? await searchUpcItemDb(barcode) : [];
  const fallbackQueries = barcodeFallbacks.flatMap((match) =>
    buildLookupQueries({
      searchArtist: match.artist,
      searchTitle: match.title,
    }).slice(0, 3),
  );
  const allQueries = Array.from(
    new Set(barcodeFallbacks.length ? [fieldQuery("barcode", barcode), ...fallbackQueries] : queries),
  ).filter(Boolean);
  const releaseMap = new Map();
  for (const query of allQueries) {
    let releases = [];
    try {
      releases = await searchMusicBrainz(query);
    } catch {
      releases = [];
    }
    releases.forEach((release) => {
      if (!releaseMap.has(release.id)) {
        releaseMap.set(release.id, release);
      }
    });
  }

  const releaseCandidates = Array.from(releaseMap.values())
    .map(normalizeRelease)
    .sort((a, b) => {
      return matchPriority(b, form, barcodeFallbacks) - matchPriority(a, form, barcodeFallbacks);
    })
    .slice(0, barcodeFallbacks.length ? 6 : 12);

  const hydrated = await Promise.all(
    releaseCandidates.map(async (normalized) => {
      try {
        const details = await fetchReleaseDetails(normalized.mbid);
        return { ...normalized, ...details };
      } catch {
        return normalized;
      }
    }),
  );

  const results = hydrated
    .sort((a, b) => {
      return matchPriority(b, form, barcodeFallbacks) - matchPriority(a, form, barcodeFallbacks);
    })
    .slice(0, 20);

  const enrichedFallbacks = barcodeFallbacks.map((fallback) => {
    const fallbackTitle = normalizeComparable(fallback.title);
    const fallbackArtists = splitArtistCredit(fallback.artist).map(normalizeComparable);
    const enrichment = results.find((result) => {
      const resultTitle = normalizeComparable(result.title);
      const resultArtist = normalizeComparable(result.artist);
      return (
        resultTitle === fallbackTitle &&
        fallbackArtists.some((artist) => artist && resultArtist.includes(artist))
      );
    });

    return enrichment
      ? {
          ...fallback,
          year: fallback.year || enrichment.year,
          releaseDate: fallback.releaseDate || enrichment.releaseDate,
          genre: fallback.genre || enrichment.genre,
          length: fallback.length || enrichment.length,
          country: fallback.country || enrichment.country,
          releaseStatus: fallback.releaseStatus || enrichment.releaseStatus,
          trackCount: fallback.trackCount || enrichment.trackCount,
          tracklist: fallback.tracklist?.length ? fallback.tracklist : enrichment.tracklist,
          spotifyUrl: fallback.spotifyUrl || enrichment.spotifyUrl,
          appleMusicUrl: fallback.appleMusicUrl || enrichment.appleMusicUrl,
          referenceArtwork: enrichment.referenceArtwork || fallback.referenceArtwork,
          artworkOptions: mergeArtworkOptions(enrichment.artworkOptions || [], fallback.artworkOptions || []),
          additionalArtists: fallback.additionalArtists || enrichment.additionalArtists,
        }
      : fallback;
  });

  return [...enrichedFallbacks, ...results]
    .filter((result) => result.title)
    .sort((a, b) => {
      return matchPriority(b, form, barcodeFallbacks) - matchPriority(a, form, barcodeFallbacks);
    })
    .slice(0, 20);
}

function createDraft(fileName, coverDataUrl) {
  return {
    ...EMPTY_FORM,
    id: crypto.randomUUID(),
    status: "draft",
    createdAt: new Date().toISOString(),
    fileName,
    coverDataUrl,
    referenceArtwork: "",
    artworkOptions: [],
    searchArtist: "",
    searchTitle: "",
    notes: "",
  };
}

function createWishlistItem(patch = {}) {
  return {
    ...EMPTY_FORM,
    id: crypto.randomUUID(),
    status: "wishlist",
    createdAt: new Date().toISOString(),
    source: "Wishlist",
    notes: "",
    ...patch,
  };
}

function mergeRecord(record, patch) {
  return {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function FallbackImage({ sources = [], alt = "", placeholder }) {
  const cleanSources = sources.filter(Boolean);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [cleanSources.join("|")]);

  const source = cleanSources[sourceIndex];
  if (!source) {
    return placeholder || (
      <div className="album-art-placeholder">
        <Album size={36} />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      onError={() => setSourceIndex((current) => current + 1)}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [records, setRecords] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState([]);
  const [artistFilter, setArtistFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");
  const [favoriteFilter, setFavoriteFilter] = useState("all");
  const [sortBy, setSortBy] = useState("dateAddedDesc");
  const [importMode, setImportMode] = useState("cover");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(THEME_STORAGE_KEY) || "light";
  });
  const [lookupState, setLookupState] = useState({
    recordId: "",
    loading: false,
    phase: "",
    error: "",
    results: [],
  });
  const fileInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const coverCameraInputRef = useRef(null);
  const barcodeCameraInputRef = useRef(null);
  const backupInputRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;

    loadStoredRecords()
      .then((storedRecords) => {
        if (!isCurrent) return;
        setRecords((current) => (current.length ? current : storedRecords));
        setStorageError("");
      })
      .catch(() => {
        if (!isCurrent) return;
        setStorageError("The record database could not be opened in this browser.");
      })
      .finally(() => {
        if (isCurrent) setStorageReady(true);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;

    saveStoredRecords(records)
      .then(() => setStorageError(""))
      .catch(() => {
        setStorageError(
          "The browser database could not save this change. The record is visible now, but it may not survive a refresh.",
        );
      });
  }, [records, storageReady]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const drafts = useMemo(
    () => records.filter((record) => record.status === "draft"),
    [records],
  );
  const collection = useMemo(
    () => records.filter((record) => record.status === "saved"),
    [records],
  );
  const wishlist = useMemo(
    () => records.filter((record) => record.status === "wishlist"),
    [records],
  );

  const selectedRecord = useMemo(() => {
    const fallback = drafts[0] || records[0] || null;
    return records.find((record) => record.id === selectedId) || fallback;
  }, [drafts, records, selectedId]);

  useEffect(() => {
    if (!selectedId && selectedRecord) {
      setSelectedId(selectedRecord.id);
    }
  }, [selectedId, selectedRecord]);

  const genres = useMemo(() => {
    const values = new Set();
    collection.forEach((record) => {
      splitGenres(record.genre).forEach((genre) => values.add(genre));
    });
    return Array.from(values).sort();
  }, [collection]);

  const artists = useMemo(
    () => uniqueSorted(collection.flatMap(artistTokens)),
    [collection],
  );

  const years = useMemo(
    () => uniqueSorted(collection.map((record) => record.year)),
    [collection],
  );

  const labels = useMemo(
    () => uniqueSorted(collection.map((record) => record.label)),
    [collection],
  );

  const filteredCollection = useMemo(() => {
    const filtered = collection.filter((record) => {
      const matchesText = matchesSmartSearch(record, query);
      const recordGenres = splitGenres(record.genre);
      const matchesGenre =
        genreFilter.length === 0 ||
        genreFilter.some((genre) => recordGenres.includes(genre));
      const matchesArtist =
        artistFilter === "all" || artistTokens(record).includes(artistFilter);
      const matchesYear = yearFilter === "all" || record.year === yearFilter;
      const matchesLabel = labelFilter === "all" || record.label === labelFilter;
      const matchesFavorite = favoriteFilter === "all" || Boolean(record.favorite);
      return (
        matchesText &&
        matchesGenre &&
        matchesArtist &&
        matchesYear &&
        matchesLabel &&
        matchesFavorite
      );
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.savedAt || a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.savedAt || b.updatedAt || b.createdAt || 0);
      if (sortBy === "artistAsc") return a.artist.localeCompare(b.artist);
      if (sortBy === "artistDesc") return b.artist.localeCompare(a.artist);
      if (sortBy === "titleAsc") return a.title.localeCompare(b.title);
      if (sortBy === "titleDesc") return b.title.localeCompare(a.title);
      if (sortBy === "yearAsc") return (a.year || "9999").localeCompare(b.year || "9999");
      if (sortBy === "yearDesc") return (b.year || "0000").localeCompare(a.year || "0000");
      if (sortBy === "dateAddedAsc") return dateA - dateB;
      return dateB - dateA;
    });
  }, [
    artistFilter,
    collection,
    favoriteFilter,
    genreFilter,
    labelFilter,
    query,
    sortBy,
    yearFilter,
  ]);

  function updateRecord(id, patch) {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? mergeRecord(record, patch) : record,
      ),
    );
  }

  function removeRecord(id) {
    const record = records.find((current) => current.id === id);
    const name = [record?.artist, record?.title].filter(Boolean).join(" - ") || "this record";
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

    setRecords((current) => current.filter((record) => record.id !== id));
    if (selectedId === id) {
      setSelectedId("");
    }
  }

  async function addFiles(fileList) {
    if (!storageReady) {
      setUploadNotice("Opening the record database. Try again in a moment.");
      return;
    }

    const files = Array.from(fileList || []);
    if (!files.length) return;

    const imageFiles = files.filter(isLikelyImageFile);
    const skippedCount = files.length - imageFiles.length;

    if (!imageFiles.length) {
      setUploadNotice("No image files were imported.");
      return;
    }

    setIsImporting(true);
    setUploadNotice("Importing cover artwork...");

    const results = await Promise.allSettled(
      imageFiles.map(async (file) => {
        const coverDataUrl = await createCoverDataUrl(file);
        return createDraft(file.name, coverDataUrl);
      }),
    );
    const newDrafts = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failedCount = results.length - newDrafts.length;

    setIsImporting(false);

    if (!newDrafts.length) {
      setUploadNotice("The image could not be imported. Try a JPG, PNG, or WebP.");
      return;
    }

    setRecords((current) => [...newDrafts, ...current]);
    setSelectedId(newDrafts[0].id);
    setActiveTab("review");
    setUploadNotice(
      [
        `${newDrafts.length} cover${newDrafts.length === 1 ? "" : "s"} imported.`,
        skippedCount ? `${skippedCount} non-image file${skippedCount === 1 ? "" : "s"} skipped.` : "",
        failedCount ? `${failedCount} image${failedCount === 1 ? "" : "s"} failed.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  async function addBarcodeFiles(fileList) {
    if (!storageReady) {
      setUploadNotice("Opening the record database. Try again in a moment.");
      return;
    }

    const files = Array.from(fileList || []).filter(isLikelyImageFile);
    if (!files.length) {
      setUploadNotice("No barcode images were imported.");
      return;
    }

    setIsImporting(true);
    setUploadNotice(`Scanning ${files.length} barcode${files.length === 1 ? "" : "s"}...`);

    const results = [];
    for (const file of files) {
      try {
        const coverDataUrl = await createCoverDataUrl(file);
        const scannedBarcode = await decodeBarcodeFile(file);
        const draft = createDraft(file.name, coverDataUrl);
        const matches = await lookupReleases({ scannedBarcode });
        const bestMatch = matches[0] || {};
        results.push({
          ...draft,
          ...bestMatch,
          id: draft.id,
          status: "draft",
          createdAt: draft.createdAt,
          scannedBarcode,
          coverDataUrl,
          referenceArtwork:
            bestMatch.referenceArtwork ||
            bestMatch.artworkOptions?.find((option) => option.isFront)?.url ||
            "",
          notes: bestMatch.notes || draft.notes,
        });
      } catch (error) {
        const coverDataUrl = await createCoverDataUrl(file).catch(() => "");
        results.push({
          ...createDraft(file.name, coverDataUrl),
          notes: error.message || "Barcode could not be scanned.",
        });
      }
    }

    setIsImporting(false);
    setRecords((current) => [...results, ...current]);
    setSelectedId(results[0]?.id || "");
    setActiveTab("review");
    setUploadNotice(
      `${results.length} barcode scan${results.length === 1 ? "" : "s"} added to Review.`,
    );
  }

  function addWishlistItem(patch) {
    const item = createWishlistItem(patch);
    setRecords((current) => [item, ...current]);
    setActiveTab("wishlist");
  }

  async function restoreBackup(fileList) {
    const file = fileList?.[0];
    if (!file) return;

    try {
      const restoredRecords = await readBackupFile(file);
      setRecords(restoredRecords);
      setSelectedId(restoredRecords.find((record) => record.status === "draft")?.id || "");
      setUploadNotice(`Restored ${restoredRecords.length} record${restoredRecords.length === 1 ? "" : "s"} from backup.`);
      setActiveTab("collection");
    } catch (error) {
      setUploadNotice(error.message || "Backup could not be restored.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  async function handleLookup(record) {
    setLookupState({
      recordId: record.id,
      loading: true,
      phase: record.scannedBarcode
        ? "Reading barcode and searching album databases"
        : "Searching MusicBrainz",
      error: "",
      results: [],
    });

    try {
      const results = await lookupReleases(record);
      setLookupState({
        recordId: record.id,
        loading: false,
        phase: "",
        error: results.length ? "" : "No matches found. Add artist or album clues and try again.",
        results,
      });
    } catch (error) {
      setLookupState({
        recordId: record.id,
        loading: false,
        phase: "",
        error: error.message || "Lookup unavailable.",
        results: [],
      });
    }
  }

  function applyLookup(recordId, result) {
    updateRecord(recordId, {
      ...result,
      id: recordId,
      referenceArtwork:
        result.referenceArtwork || result.artworkOptions?.find((option) => option.isFront)?.url || "",
    });
    setLookupState((current) => ({
      ...current,
      results: [],
      error: "",
      phase: "",
    }));
  }

  function saveRecord(recordId) {
    const record = records.find((current) => current.id === recordId);
    updateRecord(recordId, {
      status: "saved",
      savedAt: record?.savedAt || new Date().toISOString(),
    });
    const nextDraft = drafts.find((draft) => draft.id !== recordId);
    setSelectedId(nextDraft?.id || "");
    setActiveTab(nextDraft ? "review" : "collection");
  }

  function moveToReview(recordId) {
    updateRecord(recordId, { status: "draft" });
    setSelectedId(recordId);
    setActiveTab("review");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <Disc3 size={28} strokeWidth={1.8} />
        </div>
        <div>
          <h1>Vinyl Database</h1>
          <p>
            {collection.length} saved · {drafts.length} waiting · {wishlist.length} wanted ·{" "}
            {CLOUD_STORAGE_ENABLED ? "Cloud sync" : "Local only"}
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <nav className="tabs" aria-label="Main sections">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "tab active" : "tab"}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                  {tab.id === "review" && drafts.length > 0 ? (
                    <strong>{drafts.length}</strong>
                  ) : null}
                  {tab.id === "wishlist" && wishlist.length > 0 ? (
                    <strong>{wishlist.length}</strong>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <input
        ref={backupInputRef}
        className="visually-hidden-file"
        type="file"
        accept="application/json,.json"
        onChange={(event) => restoreBackup(event.target.files)}
      />

      <main>
        {activeTab === "upload" ? (
          <UploadView
            fileInputRef={fileInputRef}
            barcodeInputRef={barcodeInputRef}
            coverCameraInputRef={coverCameraInputRef}
            barcodeCameraInputRef={barcodeCameraInputRef}
            backupInputRef={backupInputRef}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            addFiles={addFiles}
            addBarcodeFiles={addBarcodeFiles}
            importMode={importMode}
            setImportMode={setImportMode}
            restoreBackup={restoreBackup}
            backupRecords={() => downloadFullBackup(records)}
            drafts={drafts}
            records={records}
            uploadNotice={uploadNotice}
            isImporting={isImporting}
            storageReady={storageReady}
            onReview={() => setActiveTab("review")}
          />
        ) : null}

        {storageError ? (
          <div className="app-alert" role="alert">
            <AlertCircle size={18} />
            <span>{storageError}</span>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <ReviewView
            drafts={drafts}
            selectedRecord={selectedRecord}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            updateRecord={updateRecord}
            removeRecord={removeRecord}
            handleLookup={handleLookup}
            lookupState={lookupState}
            applyLookup={applyLookup}
            saveRecord={saveRecord}
            onUpload={() => setActiveTab("upload")}
          />
        ) : null}

        {activeTab === "wishlist" ? (
          <WishlistView
            wishlist={wishlist}
            addWishlistItem={addWishlistItem}
            moveToReview={moveToReview}
            removeRecord={removeRecord}
          />
        ) : null}

        {activeTab === "collection" ? (
          <CollectionView
            collection={collection}
            filteredCollection={filteredCollection}
            query={query}
            setQuery={setQuery}
            genreFilter={genreFilter}
            setGenreFilter={setGenreFilter}
            artistFilter={artistFilter}
            setArtistFilter={setArtistFilter}
            yearFilter={yearFilter}
            setYearFilter={setYearFilter}
            labelFilter={labelFilter}
            setLabelFilter={setLabelFilter}
            favoriteFilter={favoriteFilter}
            setFavoriteFilter={setFavoriteFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            genres={genres}
            artists={artists}
            years={years}
            labels={labels}
            moveToReview={moveToReview}
            updateRecord={updateRecord}
            removeRecord={removeRecord}
            backupRecords={() => downloadFullBackup(records)}
            restoreBackup={() => backupInputRef.current?.click()}
            onUpload={() => setActiveTab("upload")}
          />
        ) : null}
      </main>
    </div>
  );
}

function UploadView({
  fileInputRef,
  barcodeInputRef,
  coverCameraInputRef,
  barcodeCameraInputRef,
  backupInputRef,
  isDragging,
  setIsDragging,
  addFiles,
  addBarcodeFiles,
  importMode,
  setImportMode,
  restoreBackup,
  backupRecords,
  records,
  drafts,
  uploadNotice,
  isImporting,
  storageReady,
  onReview,
}) {
  return (
    <section className="upload-grid">
      <div
        className={isDragging ? "drop-zone dragging" : "drop-zone"}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (importMode === "barcode") {
            addBarcodeFiles(event.dataTransfer.files);
          } else {
            addFiles(event.dataTransfer.files);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={barcodeInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            addBarcodeFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={coverCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={barcodeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addBarcodeFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="record-visual" aria-hidden="true">
          <div className="vinyl-disc">
            <span />
          </div>
          <div className="cover-sleeve">
            <ImagePlus size={42} strokeWidth={1.6} />
          </div>
        </div>
        <div className="drop-copy">
          <h2>Batch add records</h2>
          <p>
            {importMode === "barcode"
              ? "Drop barcode photos to identify albums right away"
              : "Drop cover photos to place them in Review"}
          </p>
        </div>
        <div className="import-mode-control" aria-label="Upload photo type">
          <button
            className={importMode === "cover" ? "active" : ""}
            type="button"
            onClick={() => setImportMode("cover")}
          >
            <ImagePlus size={17} />
            Covers
          </button>
          <button
            className={importMode === "barcode" ? "active" : ""}
            type="button"
            onClick={() => setImportMode("barcode")}
          >
            <ScanBarcode size={17} />
            Barcodes
          </button>
        </div>
        <div className="upload-actions">
          <button
            className="primary-action mobile-capture-action"
            type="button"
            onClick={() =>
              importMode === "barcode"
                ? barcodeCameraInputRef.current?.click()
                : coverCameraInputRef.current?.click()
            }
            disabled={isImporting || !storageReady}
          >
            {isImporting || !storageReady ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Camera size={18} />
            )}
            {!storageReady
              ? "Opening Database"
              : isImporting
                ? "Importing"
                : importMode === "barcode"
                  ? "Take Barcode Photo"
                  : "Take Cover Photo"}
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || !storageReady}
          >
            <ImagePlus size={18} />
            Batch Cover Photos
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => barcodeInputRef.current?.click()}
            disabled={isImporting || !storageReady}
          >
            <ScanBarcode size={18} />
            Batch Barcode Photos
          </button>
        </div>
        {uploadNotice ? (
          <div className="upload-notice" role="status">
            <FileImage size={18} />
            <span>{uploadNotice}</span>
          </div>
        ) : null}
      </div>

      <aside className="queue-panel">
        <div className="panel-heading">
          <div>
            <span>Review queue</span>
            <strong>{drafts.length}</strong>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onReview}
            title="Open review queue"
          >
            <Edit3 size={18} />
          </button>
        </div>
        {drafts.length ? (
          <div className="mini-list">
            {drafts.slice(0, 5).map((draft) => (
              <div className="mini-row" key={draft.id}>
                <FallbackImage
                  sources={[draft.coverDataUrl, draft.referenceArtwork]}
                  alt=""
                  placeholder={(
                    <div className="draft-art-placeholder">
                      <Album size={22} />
                    </div>
                  )}
                />
                <div>
                  <strong>{draft.title || "Untitled record"}</strong>
                  <span>{draft.artist || "Artist pending"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Album} title="No drafts" />
        )}
        <div className="backup-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={backupRecords}
            disabled={!records.length}
          >
            <Download size={18} />
            Backup
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => backupInputRef.current?.click()}
          >
            <Upload size={18} />
            Restore
          </button>
        </div>
      </aside>
    </section>
  );
}

function ReviewView({
  drafts,
  selectedRecord,
  selectedId,
  setSelectedId,
  updateRecord,
  removeRecord,
  handleLookup,
  lookupState,
  applyLookup,
  saveRecord,
  onUpload,
}) {
  if (!drafts.length) {
    return (
      <section className="center-stage">
        <EmptyState icon={Check} title="Queue clear" />
        <button className="primary-action" type="button" onClick={onUpload}>
          <Upload size={18} />
          Upload More
        </button>
      </section>
    );
  }

  const record =
    drafts.find((draft) => draft.id === selectedId) || selectedRecord || drafts[0];

  return (
    <section className="review-layout">
      <aside className="draft-list">
        <div className="panel-title">
          <span>Pending records</span>
          <strong>{drafts.length}</strong>
        </div>
        {drafts.map((draft) => (
          <button
            key={draft.id}
            className={draft.id === record.id ? "draft-item selected" : "draft-item"}
            type="button"
            onClick={() => setSelectedId(draft.id)}
          >
            <FallbackImage
              sources={[draft.coverDataUrl, draft.referenceArtwork]}
              alt=""
              placeholder={(
                <div className="draft-art-placeholder">
                  <Album size={22} />
                </div>
              )}
            />
            <span>
              <strong>{draft.title || "Untitled"}</strong>
              <small>{draft.artist || "Needs identification"}</small>
            </span>
          </button>
        ))}
      </aside>

      <section className="review-card">
        <ArtworkCompare record={record} />
        <ArtworkPicker
          record={record}
          onSelect={(url) => updateRecord(record.id, { referenceArtwork: url })}
        />
        <ClueForm
          record={record}
          onChange={(patch) => updateRecord(record.id, patch)}
          onIdentify={(patch = {}) => handleLookup({ ...record, ...patch })}
          isLoading={lookupState.loading && lookupState.recordId === record.id}
        />
        <RecordForm
          record={record}
          onChange={(patch) => updateRecord(record.id, patch)}
        />
        <StreamingLinksPanel
          record={record}
          onChange={(patch) => updateRecord(record.id, patch)}
        />
        <TracklistPreview record={record} />
        <RecordEvidence record={record} />
        <div className="action-bar">
          <button
            className="ghost-action danger"
            type="button"
            onClick={() => removeRecord(record.id)}
          >
            <Trash2 size={18} />
            Delete
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => saveRecord(record.id)}
          >
            <Save size={18} />
            Save Record
          </button>
        </div>
      </section>

      <LookupPanel
        lookupState={lookupState}
        recordId={record.id}
        onApply={(result) => applyLookup(record.id, result)}
      />
    </section>
  );
}

function ClueForm({ record, onChange, onIdentify, isLoading }) {
  const barcodeInputRef = useRef(null);
  const [barcodeScanState, setBarcodeScanState] = useState("");

  async function handleBarcodeFile(fileList) {
    const file = fileList?.[0];
    if (!file) return;

    setBarcodeScanState("Scanning barcode...");
    try {
      const scannedBarcode = await decodeBarcodeFile(file);
      onChange({ scannedBarcode });
      setBarcodeScanState(`Barcode found: ${scannedBarcode}`);
      onIdentify({ scannedBarcode });
    } catch (error) {
      setBarcodeScanState(error.message || "Barcode could not be scanned.");
    } finally {
      if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    }
  }

  return (
    <section className="clue-panel">
      <div className="panel-title compact">
        <span>Identify album</span>
        <Search size={18} />
      </div>
      <div className="clue-form">
        <label>
          <span>Artist</span>
          <input
            value={record.searchArtist || ""}
            onChange={(event) => onChange({ searchArtist: event.target.value })}
            placeholder="Example: Kacey Musgraves"
          />
        </label>
        <label>
          <span>Album</span>
          <input
            value={record.searchTitle || ""}
            onChange={(event) => onChange({ searchTitle: event.target.value })}
            placeholder="Example: Middle of Nowhere"
          />
        </label>
      </div>
      <input
        ref={barcodeInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => handleBarcodeFile(event.target.files)}
      />
      {record.scannedBarcode ? (
        <div className="barcode-chip">
          <ScanBarcode size={16} />
          <span>{record.scannedBarcode}</span>
          <button
            type="button"
            onClick={() => onChange({ scannedBarcode: "" })}
            title="Clear scanned barcode"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      {barcodeScanState ? <div className="scan-status">{barcodeScanState}</div> : null}
      <div className="identify-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => barcodeInputRef.current?.click()}
        >
          <Camera size={18} />
          Scan Barcode
        </button>
        <button
          className="secondary-action identify-button"
          type="button"
          onClick={onIdentify}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
          Identify
        </button>
      </div>
    </section>
  );
}

function ArtworkCompare({ record }) {
  return (
    <div className="artwork-compare">
      <figure>
        <FallbackImage
          sources={[record.coverDataUrl]}
          alt={`${record.title || "Uploaded"} cover`}
          placeholder={(
            <div className="empty-artwork">
              <Album size={44} strokeWidth={1.4} />
            </div>
          )}
        />
        <figcaption>Uploaded cover</figcaption>
      </figure>
      <figure>
        <FallbackImage
          sources={[record.referenceArtwork, record.coverDataUrl]}
          alt=""
          placeholder={(
            <div className="empty-artwork">
              <Album size={44} strokeWidth={1.4} />
            </div>
          )}
        />
        <figcaption>Reference artwork</figcaption>
      </figure>
    </div>
  );
}

function ArtworkPicker({ record, onSelect }) {
  const options = record.artworkOptions || [];
  if (!options.length) return null;

  return (
    <section className="artwork-picker">
      <div className="panel-title compact">
        <span>Official artwork</span>
        <ImageIcon size={18} />
      </div>
      <div className="artwork-options">
        {options.map((option) => (
          <button
            key={option.id}
            className={
              record.referenceArtwork === option.url
                ? "artwork-option selected"
                : "artwork-option"
            }
            type="button"
            onClick={() => onSelect(option.url)}
            title={`Use ${option.label}`}
          >
            <img src={option.url} alt="" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecordForm({ record, onChange }) {
  const fields = [
    ["artist", "Artist"],
    ["title", "Title"],
    ["year", "Year"],
    ["releaseDate", "Release date"],
    ["label", "Label"],
    ["country", "Country"],
    ["releaseStatus", "Status"],
    ["length", "Length"],
    ["cost", "Cost"],
    ["acquiredFrom", "Source"],
  ];

  return (
    <div className="record-form">
      <label className="checkbox-field full-span">
        <input
          type="checkbox"
          checked={Boolean(record.favorite)}
          onChange={(event) => onChange({ favorite: event.target.checked })}
        />
        <span>Favorite record</span>
      </label>
      <GenreSelector
        value={record.genre || ""}
        onChange={(genre) => onChange({ genre })}
      />
      {fields.map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            value={record[key] || ""}
            onChange={(event) => onChange({ [key]: event.target.value })}
            placeholder={label}
          />
        </label>
      ))}
      <AdditionalArtistSelector
        value={record.additionalArtists || ""}
        onChange={(additionalArtists) => onChange({ additionalArtists })}
      />
      <label className="full-span">
        <span>Notes</span>
        <textarea
          value={record.notes || ""}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Pressing, condition, location"
        />
      </label>
    </div>
  );
}

function AdditionalArtistSelector({ value, onChange }) {
  const [artist, setArtist] = useState("");
  const selectedArtists = splitArtists(value);

  function removeArtist(name) {
    onChange(joinArtists(selectedArtists.filter((current) => current !== name)));
  }

  function addArtist() {
    const name = artist.trim();
    if (!name) return;
    onChange(joinArtists([...selectedArtists, name]));
    setArtist("");
  }

  return (
    <section className="artist-selector full-span">
      <div className="field-heading">
        <span>Additional artists</span>
        <strong>{selectedArtists.length || "None"}</strong>
      </div>
      {selectedArtists.length ? (
        <div className="selected-genre-tags">
          {selectedArtists.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => removeArtist(name)}
              title={`Remove ${name}`}
            >
              {name}
              <X size={14} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="genre-add-row">
        <input
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addArtist();
            }
          }}
          placeholder="Example: Lady Gaga"
        />
        <button className="icon-button" type="button" onClick={addArtist} title="Add artist">
          <Plus size={18} />
        </button>
      </div>
    </section>
  );
}

function GenreSelector({ value, onChange }) {
  const [customGenre, setCustomGenre] = useState("");
  const selectedGenres = splitGenres(value);
  const options = uniqueSorted([...GENRE_OPTIONS, ...selectedGenres]);

  function toggleGenre(genre) {
    const nextGenres = selectedGenres.includes(genre)
      ? selectedGenres.filter((current) => current !== genre)
      : [...selectedGenres, genre];
    onChange(joinGenres(nextGenres));
  }

  function addCustomGenre() {
    const genre = titleCase(customGenre.trim());
    if (!genre) return;
    onChange(joinGenres([...selectedGenres, genre]));
    setCustomGenre("");
  }

  return (
    <section className="genre-selector full-span">
      <div className="field-heading">
        <span>Genres</span>
        <strong>{selectedGenres.length || "Any"}</strong>
      </div>
      {selectedGenres.length ? (
        <div className="selected-genre-tags">
          {selectedGenres.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => toggleGenre(genre)}
              title={`Remove ${genre}`}
            >
              <span>{genre}</span>
              <X size={14} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="genre-chip-grid">
        {options.filter((genre) => !selectedGenres.includes(genre)).map((genre) => (
          <button
            key={genre}
            className="genre-chip"
            type="button"
            onClick={() => toggleGenre(genre)}
            aria-pressed="false"
          >
            {genre}
          </button>
        ))}
      </div>
      <div className="genre-add-row">
        <input
          value={customGenre}
          onChange={(event) => setCustomGenre(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustomGenre();
            }
          }}
          placeholder="Add custom genre"
        />
        <button className="icon-button" type="button" onClick={addCustomGenre} title="Add genre">
          <Plus size={18} />
        </button>
      </div>
    </section>
  );
}

function StreamingLinksPanel({ record, onChange }) {
  const spotifyUrl = spotifyAlbumUrl(record);
  const appleUrl = appleMusicAlbumUrl(record);
  const hasExactLinks = Boolean(spotifyUrl || appleUrl);

  return (
    <section className="streaming-panel">
      <div className="panel-title compact">
        <span>Streaming links</span>
        <Music2 size={18} />
      </div>
      {hasExactLinks ? (
        <div className="album-links">
          {spotifyUrl ? (
            <a href={spotifyUrl} target="_blank" rel="noreferrer">
              <Music2 size={14} />
              Spotify
            </a>
          ) : null}
          {appleUrl ? (
            <a href={appleUrl} target="_blank" rel="noreferrer">
              <Music2 size={14} />
              Apple Music
            </a>
          ) : null}
        </div>
      ) : (
        <p className="exact-link-note">
          Exact album links appear here when MusicBrainz or Apple Music confirms them.
        </p>
      )}
      <div className="streaming-fields">
        <label>
          <span>Spotify album URL</span>
          <input
            value={record.spotifyUrl || ""}
            onChange={(event) => onChange({ spotifyUrl: event.target.value })}
            placeholder="Paste exact Spotify album URL"
          />
        </label>
        <label>
          <span>Apple Music album URL</span>
          <input
            value={record.appleMusicUrl || ""}
            onChange={(event) => onChange({ appleMusicUrl: event.target.value })}
            placeholder="Paste exact Apple Music album URL"
          />
        </label>
      </div>
    </section>
  );
}

function TracklistPreview({ record }) {
  const tracks = record.tracklist || [];
  if (!tracks.length) return null;

  return (
    <section className="tracklist-panel">
      <div className="panel-title compact">
        <span>Tracklist</span>
        <strong>{tracks.length}</strong>
      </div>
      <ol>
        {tracks.slice(0, 24).map((track) => (
          <li key={track.id}>
            <span>{track.position}</span>
            <strong>{track.title}</strong>
            <em>{track.length || "—"}</em>
          </li>
        ))}
      </ol>
      {tracks.length > 24 ? <small>{tracks.length - 24} more tracks hidden</small> : null}
    </section>
  );
}

function RecordEvidence({ record }) {
  if (!record.mbid) return null;

  return (
    <div className="evidence-box">
      <a
        href={`https://musicbrainz.org/release/${record.mbid}`}
        target="_blank"
        rel="noreferrer"
      >
        <Disc3 size={16} />
        MusicBrainz source
      </a>
      <span>
        {[
          record.source,
          record.mbid ? `Release ${record.mbid}` : "",
          record.releaseGroupId ? `Release group ${record.releaseGroupId}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
}

function LookupPanel({ lookupState, recordId, onApply }) {
  const isCurrent = lookupState.recordId === recordId;

  return (
    <aside className="lookup-panel">
      <div className="panel-title">
        <span>Matches</span>
        <Search size={18} />
      </div>
      {isCurrent && lookupState.loading ? (
        <div className="loading-box">
          <Loader2 className="spin" size={28} />
          <span>{lookupState.phase || "Searching"}</span>
        </div>
      ) : null}
      {isCurrent && lookupState.error ? (
        <div className="notice">{lookupState.error}</div>
      ) : null}
      {isCurrent && lookupState.results.length ? (
        <div className="match-list">
          {lookupState.results.map((result) => (
            <article className="match-card" key={result.mbid || result.id || `${result.source}-${result.title}`}>
              {result.referenceArtwork ? (
                <FallbackImage
                  sources={[result.referenceArtwork]}
                  alt=""
                  placeholder={(
                    <div className="match-art">
                      <Album size={28} />
                    </div>
                  )}
                />
              ) : (
                <div className="match-art">
                  <Album size={28} />
                </div>
              )}
              <div>
                <div className="match-badges">
                  <span>{result.source || "MusicBrainz"}</span>
                  {result.score ? <span>{result.score}%</span> : null}
                </div>
                <strong>{result.title}</strong>
                <span>{result.artist}</span>
                <small>
                  {[
                    result.year,
                    result.country,
                    result.label,
                    result.disambiguation,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                <em>
                  {[result.genre, result.length]
                    .filter(Boolean)
                    .join(" · ")}
                </em>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => onApply(result)}
                title="Apply match"
              >
                <Check size={18} />
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {!lookupState.loading && !lookupState.results.length && !lookupState.error ? (
        <EmptyState icon={Search} title="No lookup yet" />
      ) : null}
    </aside>
  );
}

function WishlistView({ wishlist, addWishlistItem, moveToReview, removeRecord }) {
  const [form, setForm] = useState({
    artist: "",
    title: "",
    cost: "",
    notes: "",
  });

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function submitWishlist(event) {
    event.preventDefault();
    if (!form.artist.trim() && !form.title.trim()) return;
    addWishlistItem({
      artist: form.artist.trim(),
      title: form.title.trim(),
      cost: form.cost.trim(),
      notes: form.notes.trim(),
    });
    setForm({ artist: "", title: "", cost: "", notes: "" });
  }

  return (
    <section className="wishlist-view">
      <form className="wishlist-form" onSubmit={submitWishlist}>
        <div className="panel-title compact">
          <span>Add to wishlist</span>
          <Heart size={18} />
        </div>
        <div className="wishlist-fields">
          <label>
            <span>Artist</span>
            <input
              value={form.artist}
              onChange={(event) => updateForm({ artist: event.target.value })}
              placeholder="Example: Sade"
            />
          </label>
          <label>
            <span>Album</span>
            <input
              value={form.title}
              onChange={(event) => updateForm({ title: event.target.value })}
              placeholder="Example: Diamond Life"
            />
          </label>
          <label>
            <span>Expected cost</span>
            <input
              value={form.cost}
              onChange={(event) => updateForm({ cost: event.target.value })}
              placeholder="$25"
            />
          </label>
          <label>
            <span>Notes</span>
            <input
              value={form.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              placeholder="Color, shop, pressing..."
            />
          </label>
        </div>
        <button className="primary-action" type="submit">
          <Plus size={18} />
          Add Wishlist Item
        </button>
      </form>

      {wishlist.length ? (
        <div className="wishlist-grid">
          {wishlist.map((record) => (
            <article className="wishlist-card" key={record.id}>
              <div className="wishlist-art">
                <FallbackImage
                  sources={[record.referenceArtwork, record.coverDataUrl]}
                  alt=""
                  placeholder={<Heart size={32} />}
                />
              </div>
              <div className="wishlist-meta">
                <strong>{record.title || "Untitled wishlist record"}</strong>
                <span>{record.artist || "Artist pending"}</span>
                {record.cost ? (
                  <em>
                    <DollarSign size={14} />
                    {record.cost}
                  </em>
                ) : null}
                {record.notes ? <p>{record.notes}</p> : null}
                {spotifyAlbumUrl(record) || appleMusicAlbumUrl(record) ? (
                  <div className="album-links">
                    {spotifyAlbumUrl(record) ? (
                      <a href={spotifyAlbumUrl(record)} target="_blank" rel="noreferrer">
                        <Music2 size={14} />
                        Spotify
                      </a>
                    ) : null}
                    {appleMusicAlbumUrl(record) ? (
                      <a href={appleMusicAlbumUrl(record)} target="_blank" rel="noreferrer">
                        <Music2 size={14} />
                        Apple
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="wishlist-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => moveToReview(record.id)}
                >
                  <Edit3 size={18} />
                  Review
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => removeRecord(record.id)}
                  title="Delete wishlist item"
                >
                  <X size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="center-stage wishlist-empty">
          <EmptyState icon={Heart} title="Wishlist empty" />
        </section>
      )}
    </section>
  );
}

function CollectionView({
  collection,
  filteredCollection,
  query,
  setQuery,
  genreFilter,
  setGenreFilter,
  artistFilter,
  setArtistFilter,
  yearFilter,
  setYearFilter,
  labelFilter,
  setLabelFilter,
  favoriteFilter,
  setFavoriteFilter,
  sortBy,
  setSortBy,
  genres,
  artists,
  years,
  labels,
  moveToReview,
  updateRecord,
  removeRecord,
  backupRecords,
  restoreBackup,
  onUpload,
}) {
  const [viewMode, setViewMode] = useState("details");
  const [gridColumns, setGridColumns] = useState(4);
  const [detailRecord, setDetailRecord] = useState(null);
  const columnCount = Number(gridColumns);
  const rowCount = Math.max(1, Math.ceil(filteredCollection.length / columnCount));

  if (!collection.length) {
    return (
      <section className="center-stage">
        <EmptyState icon={Library} title="Collection empty" />
        <button className="primary-action" type="button" onClick={onUpload}>
          <Upload size={18} />
          Add Records
        </button>
      </section>
    );
  }

  const favoriteCount = collection.filter((record) => record.favorite).length;
  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    genreFilter.length +
    (artistFilter !== "all" ? 1 : 0) +
    (yearFilter !== "all" ? 1 : 0) +
    (labelFilter !== "all" ? 1 : 0) +
    (favoriteFilter !== "all" ? 1 : 0);
  const stats = [
    { label: "Records", value: collection.length, icon: Library, tone: "indigo" },
    { label: "Artists", value: artists.length, icon: Users, tone: "blue" },
    { label: "Genres", value: genres.length, icon: Tags, tone: "green" },
    { label: "Labels", value: labels.length, icon: Building2, tone: "gold" },
    { label: "Favorites", value: favoriteCount, icon: Heart, tone: "purple" },
  ];

  function toggleGenreFilter(genre) {
    setGenreFilter(
      genreFilter.includes(genre)
        ? genreFilter.filter((current) => current !== genre)
        : [...genreFilter, genre],
    );
  }

  function clearFilters() {
    setQuery("");
    setGenreFilter([]);
    setArtistFilter("all");
    setYearFilter("all");
    setLabelFilter("all");
    setFavoriteFilter("all");
    setSortBy("dateAddedDesc");
  }

  return (
    <section className="collection-dashboard">
      <aside className="collection-filter-panel">
        <button className="filter-apply" type="button" onClick={clearFilters}>
          <SlidersHorizontal size={17} />
          <span>{activeFilterCount ? `Clear ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}` : "Filters"}</span>
        </button>

        <label className="filter-field">
          <span>Search records</span>
          <div className="field-shell">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Artist, title, label, typo ok..."
            />
          </div>
        </label>

        <section className="filter-field genre-filter-field">
          <span>Genres</span>
          <div className="genre-filter-list">
            {genres.map((genre) => (
              <button
                key={genre}
                className={genreFilter.includes(genre) ? "genre-filter selected" : "genre-filter"}
                type="button"
                onClick={() => toggleGenreFilter(genre)}
                aria-pressed={genreFilter.includes(genre)}
              >
                {genre}
              </button>
            ))}
            {!genres.length ? <small>No genres yet</small> : null}
          </div>
        </section>

        <FilterSelect
          icon={Users}
          label="Artist"
          value={artistFilter}
          onChange={setArtistFilter}
          allLabel="All artists"
          options={artists}
        />
        <FilterSelect
          icon={Calendar}
          label="Year"
          value={yearFilter}
          onChange={setYearFilter}
          allLabel="All years"
          options={years}
        />
        <FilterSelect
          icon={Building2}
          label="Label"
          value={labelFilter}
          onChange={setLabelFilter}
          allLabel="All labels"
          options={labels}
        />
        <FilterSelect
          icon={Heart}
          label="Favorite"
          value={favoriteFilter}
          onChange={setFavoriteFilter}
          allLabel="All records"
          options={["favorites"]}
          labels={{ favorites: "Favorites" }}
        />
        <FilterSelect
          icon={ArrowDownUp}
          label="Sort"
          value={sortBy}
          onChange={setSortBy}
          allLabel=""
          options={[
            "dateAddedDesc",
            "dateAddedAsc",
            "yearDesc",
            "yearAsc",
            "artistAsc",
            "artistDesc",
            "titleAsc",
            "titleDesc",
          ]}
          labels={{
            dateAddedDesc: "Date added newest",
            dateAddedAsc: "Date added oldest",
            yearDesc: "Year newest",
            yearAsc: "Year oldest",
            artistAsc: "Artist A-Z",
            artistDesc: "Artist Z-A",
            titleAsc: "Album A-Z",
            titleDesc: "Album Z-A",
          }}
        />
      </aside>

      <section className="collection-main">
        <div className="collection-stats">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article className={`stat-card ${stat.tone}`} key={stat.label}>
                <span>
                  <Icon size={17} />
                  {stat.label}
                </span>
                <strong>{stat.value}</strong>
              </article>
            );
          })}
        </div>

        <div className="collection-section-heading">
          <div>
            <span>Records</span>
            <strong>
              {filteredCollection.length} showing · {columnCount} columns · {rowCount} rows
            </strong>
          </div>
          <div className="collection-view-controls">
            <div className="segmented-control" aria-label="Collection view">
              <button
                className={viewMode === "covers" ? "active" : ""}
                type="button"
                onClick={() => setViewMode("covers")}
              >
                <Album size={17} />
                Covers
              </button>
              <button
                className={viewMode === "details" ? "active" : ""}
                type="button"
                onClick={() => setViewMode("details")}
              >
                <TableProperties size={17} />
                Details
              </button>
            </div>
            <label className="columns-control">
              <Columns3 size={17} />
              <select
                value={gridColumns}
                onChange={(event) => setGridColumns(Number(event.target.value))}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <option key={count} value={count}>
                    {count} columns
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-action"
              type="button"
              onClick={() => downloadCollectionCsv(collection)}
            >
              <Download size={18} />
              CSV
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={backupRecords}
            >
              <Download size={18} />
              Backup
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={restoreBackup}
            >
              <Upload size={18} />
              Restore
            </button>
            <button className="secondary-action" type="button" onClick={onUpload}>
              <Upload size={18} />
              Add
            </button>
          </div>
        </div>

        {filteredCollection.length ? (
          <div
            className={viewMode === "covers" ? "collection-grid cover-only" : "collection-grid details-grid"}
            style={{ "--columns": columnCount }}
          >
            {filteredCollection.map((record) => (
              <article className="album-card" key={record.id}>
                <div className="album-art">
                  <FallbackImage
                    sources={[record.referenceArtwork, record.coverDataUrl]}
                    alt={`${record.title} cover`}
                  />
                </div>
                {viewMode === "details" ? (
                  <div className="album-meta">
                    <h2>
                      {record.favorite ? <span className="favorite-dot">★</span> : null}
                      {record.title || "Untitled"}
                    </h2>
                    <p>{record.artist || "Unknown artist"}</p>
                    {splitArtists(record.additionalArtists).length ? (
                      <div className="album-artist-row">
                        {splitArtists(record.additionalArtists).slice(0, 4).map((artist) => (
                          <span key={artist}>{artist}</span>
                        ))}
                      </div>
                    ) : null}
                    {splitGenres(record.genre).length ? (
                      <div className="album-genre-row">
                        {splitGenres(record.genre).slice(0, 3).map((genre) => (
                          <span key={genre}>{genre}</span>
                        ))}
                      </div>
                    ) : null}
                    <dl>
                      <div>
                        <dt>Year</dt>
                        <dd>{record.year || "—"}</dd>
                      </div>
                      <div>
                        <dt>Label</dt>
                        <dd>{record.label || "—"}</dd>
                      </div>
                      <div>
                        <dt>Length</dt>
                        <dd>{record.length || "—"}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{record.acquiredFrom || "—"}</dd>
                      </div>
                    </dl>
                    <div className="album-links">
                      {spotifyAlbumUrl(record) ? (
                        <a
                          href={spotifyAlbumUrl(record)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Music2 size={14} />
                          Spotify
                        </a>
                      ) : null}
                      {appleMusicAlbumUrl(record) ? (
                        <a
                          href={appleMusicAlbumUrl(record)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Music2 size={14} />
                          Apple
                        </a>
                      ) : null}
                      {record.mbid ? (
                        <a
                          href={`https://musicbrainz.org/release/${record.mbid}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Disc3 size={14} />
                          MusicBrainz
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="card-actions">
                  <button
                    className={record.favorite ? "icon-button favorite active" : "icon-button favorite"}
                    type="button"
                    onClick={() => updateRecord(record.id, { favorite: !record.favorite })}
                    title={record.favorite ? "Remove favorite" : "Favorite record"}
                    aria-label={record.favorite ? "Remove favorite" : "Favorite record"}
                  >
                    <Heart size={18} fill={record.favorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => moveToReview(record.id)}
                    title="Edit record"
                    aria-label="Edit record"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setDetailRecord(record)}
                    title="Record details"
                    aria-label="Record details"
                  >
                    <Info size={18} />
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => removeRecord(record.id)}
                    title="Delete record"
                  >
                    <X size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Search} title="No records match" />
        )}
      </section>
      {detailRecord ? (
        <RecordDetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onEdit={() => {
            setDetailRecord(null);
            moveToReview(detailRecord.id);
          }}
          onFavorite={() => {
            const favorite = !detailRecord.favorite;
            updateRecord(detailRecord.id, { favorite });
            setDetailRecord({ ...detailRecord, favorite });
          }}
          onDelete={() => {
            const deletedId = detailRecord.id;
            setDetailRecord(null);
            removeRecord(deletedId);
          }}
        />
      ) : null}
    </section>
  );
}

function RecordDetailModal({ record, onClose, onEdit, onFavorite, onDelete }) {
  const spotifyUrl = spotifyAlbumUrl(record);
  const appleUrl = appleMusicAlbumUrl(record);
  const meta = [
    ["Artist", record.artist],
    ["Additional artists", record.additionalArtists],
    ["Year", record.year],
    ["Release date", record.releaseDate],
    ["Genre", record.genre],
    ["Label", record.label],
    ["Length", record.length],
    ["Cost", record.cost],
    ["Source", record.acquiredFrom],
    ["Country", record.country],
    ["Status", record.releaseStatus],
    ["Tracks", record.trackCount],
  ].filter(([, value]) => value);

  return (
    <div className="detail-modal-backdrop" role="presentation" onClick={onClose}>
      <article
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${record.title || "Record"} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="icon-button detail-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="detail-hero">
          <FallbackImage
            sources={[record.referenceArtwork, record.coverDataUrl]}
            alt={`${record.title || "Album"} cover`}
          />
        </div>
        <div className="detail-content">
          <div>
            <h2>{record.title || "Untitled"}</h2>
            <p>{record.artist || "Unknown artist"}</p>
          </div>
          <div className="detail-actions">
            <button
              className={record.favorite ? "secondary-action favorite active" : "secondary-action favorite"}
              type="button"
              onClick={onFavorite}
            >
              <Heart size={18} fill={record.favorite ? "currentColor" : "none"} />
              Favorite
            </button>
            <button className="secondary-action" type="button" onClick={onEdit}>
              <Pencil size={18} />
              Edit
            </button>
            <button className="secondary-action danger" type="button" onClick={onDelete}>
              <Trash2 size={18} />
              Delete
            </button>
          </div>
          <dl className="detail-meta">
            {meta.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="album-links">
            {spotifyUrl ? (
              <a href={spotifyUrl} target="_blank" rel="noreferrer">
                <Music2 size={14} />
                Spotify
              </a>
            ) : null}
            {appleUrl ? (
              <a href={appleUrl} target="_blank" rel="noreferrer">
                <Music2 size={14} />
                Apple
              </a>
            ) : null}
            {record.mbid ? (
              <a href={`https://musicbrainz.org/release/${record.mbid}`} target="_blank" rel="noreferrer">
                <Disc3 size={14} />
                MusicBrainz
              </a>
            ) : null}
          </div>
          {record.notes ? (
            <section className="detail-notes">
              <span>Notes</span>
              <p>{record.notes}</p>
            </section>
          ) : null}
          <TracklistPreview record={record} />
        </div>
      </article>
    </div>
  );
}

function FilterSelect({
  icon: Icon,
  label,
  value,
  onChange,
  allLabel,
  options,
  labels = {},
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <div className="field-shell select-shell">
        <Icon size={18} />
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {allLabel ? <option value="all">{allLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {labels[option] || option}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function EmptyState({ icon: Icon, title }) {
  return (
    <div className="empty-state">
      <Icon size={34} strokeWidth={1.5} />
      <span>{title}</span>
    </div>
  );
}
