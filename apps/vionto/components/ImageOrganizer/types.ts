export type ImageAsset = {
  id: string;
  storageKey: string;
  thumbnailKey?: string | null;
  originalFilename: string;
  mimeType: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  caption?: string | null;
  tags?: string[];
  rating?: number;
  isFavorite?: boolean;
  exifData?: Record<string, unknown> | null;
  createdAt: string;
  url: string;
  thumbnailUrl?: string | null;
};

export type ImageEditState = {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  zoom: number;
};

export type EditAction =
  | { type: "ROTATE_CW" }
  | { type: "ROTATE_CCW" }
  | { type: "FLIP_H" }
  | { type: "FLIP_V" }
  | { type: "SET_BRIGHTNESS"; value: number }
  | { type: "SET_CONTRAST"; value: number }
  | { type: "SET_SATURATION"; value: number }
  | { type: "SET_ZOOM"; value: number }
  | { type: "RESET" };

export const DEFAULT_EDIT_STATE: ImageEditState = {
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  zoom: 1,
};
