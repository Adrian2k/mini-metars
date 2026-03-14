import type { Settings } from "./tauri.ts";

export interface MainUiStore {
  showScroll: boolean;
  showInput: boolean;
  showTitlebar: boolean;
  units: "inHg" | "hPa";
  hideAirportIfMissingAtis: boolean;
  showFew: boolean;
  showSct: boolean;
  showBkn: boolean;
  showOvc: boolean;
  showCover: boolean;
  showWxString: boolean;
  fltCatMode: "off" | "dot" | "text";
  showVisibility: boolean;
  showRvr: boolean;
  tempDewpoint: "off" | "temp" | "tempDewp";
  showMetarAge: boolean;
  extraInfoInline: boolean;
}

/** Subset of MainUiStore that the settings window can modify */
export type SettingsMainUiState = Pick<
  MainUiStore,
  | "units"
  | "showFew"
  | "showSct"
  | "showBkn"
  | "showOvc"
  | "showCover"
  | "showWxString"
  | "fltCatMode"
  | "showVisibility"
  | "showRvr"
  | "tempDewpoint"
  | "showMetarAge"
  | "extraInfoInline"
>;

export const DEFAULT_MAIN_UI: MainUiStore = {
  showScroll: true,
  showInput: true,
  showTitlebar: true,
  units: "inHg",
  hideAirportIfMissingAtis: false,
  showFew: false,
  showSct: false,
  showBkn: false,
  showOvc: false,
  showCover: false,
  showWxString: false,
  fltCatMode: "off",
  showVisibility: false,
  showRvr: false,
  tempDewpoint: "off",
  showMetarAge: false,
  extraInfoInline: false,
};

export const DEFAULT_SETTINGS: Settings = {
  loadMostRecentProfileOnOpen: true,
  alwaysOnTop: true,
  autoResize: true,
  qnhHighlightDuration: 10,
  showQnhTrendArrow: true,
  metarYellowMinutes: 90,
  metarRedMinutes: 150,
};
