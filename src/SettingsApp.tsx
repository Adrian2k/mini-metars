import "./styles.css";
import { createStore } from "solid-js/store";
import { onMount } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import { Settings } from "./tauri.ts";
import { SettingsMainUiState, DEFAULT_SETTINGS } from "./shared-types.ts";

type MainUiState = SettingsMainUiState;

function SettingsApp() {
  const [settings, setSettings] = createStore<Settings>({ ...DEFAULT_SETTINGS });

  const [mainUi, setMainUi] = createStore<MainUiState>({
    units: "inHg",
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
  });

  const labelClass = "text-gray-300 text-xs";
  const sectionClass = "mb-3";
  const sectionTitleClass = "text-gray-100 text-xs font-semibold mb-1.5 border-b border-gray-700 pb-0.5";
  const rowClass = "flex items-center justify-between py-0.5";
  const inputClass =
    "w-16 bg-gray-800 text-white text-xs border border-gray-600 rounded px-1 py-0.5 focus:outline-none focus:border-gray-400 text-right";
  const toggleBtnActive = "px-2 py-0.5 text-xs rounded bg-blue-600 text-white cursor-pointer";
  const toggleBtnInactive = "px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400 cursor-pointer hover:bg-gray-600";
  const shortcutBadge = "text-gray-500 text-[10px] ml-1.5 font-mono";

  const ctrlLabel = navigator.platform.includes("Mac") ? "⌘" : "Ctrl";

  // Send a mainUi change to the main window
  function updateMainUi<K extends keyof MainUiState>(key: K, value: MainUiState[K]) {
    setMainUi(key, value);
    emit("settings-mainui-change", { key, value });
  }

  // Send a settings change to the main window
  function updateSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(key, value);
    emit("settings-settings-change", { key, value });
  }

  // Temp/dewpoint cycle helper
  const cycleTempDewpoint = () => {
    if (mainUi.tempDewpoint === "off") {
      updateMainUi("tempDewpoint", "temp");
    } else if (mainUi.tempDewpoint === "temp") {
      updateMainUi("tempDewpoint", "tempDewp");
    } else {
      updateMainUi("tempDewpoint", "off");
    }
  };

  const tempDewpointLabel = () => {
    if (mainUi.tempDewpoint === "off") return "Off";
    if (mainUi.tempDewpoint === "temp") return "Temp";
    return "Temp/Dewp";
  };

  // FltCat cycle helper
  const cycleFltCat = () => {
    if (mainUi.fltCatMode === "off") {
      updateMainUi("fltCatMode", "dot");
    } else if (mainUi.fltCatMode === "dot") {
      updateMainUi("fltCatMode", "text");
    } else {
      updateMainUi("fltCatMode", "off");
    }
  };

  const fltCatLabel = () => {
    if (mainUi.fltCatMode === "off") return "Off";
    if (mainUi.fltCatMode === "dot") return "Dot";
    return "Text";
  };

  onMount(async () => {
    // Listen for initial state from main window
    listen<{ settings: Settings; mainUi: MainUiState }>("settings-init", (event) => {
      setSettings(event.payload.settings);
      setMainUi(event.payload.mainUi);
    });

    // Listen for mainUi updates from main window (e.g. keyboard shortcuts used while settings is open)
    listen<{ key: string; value: unknown }>("mainui-updated", (event) => {
      setMainUi(event.payload.key as keyof MainUiState, event.payload.value as never);
    });

    // Request initial state
    emit("settings-request-init", {});

  });

  return (
    <div class="bg-gray-900 px-3 py-2 font-sans select-none text-white" style="min-width: 320px;">
      <div class="mb-2">
        <span class="text-gray-100 text-sm font-semibold">Settings</span>
      </div>

      {/* Altimeter */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>Altimeter / QNH</div>
        <div class={rowClass}>
          <span class={labelClass}>
            Units
            <span class={shortcutBadge}>{ctrlLabel}+U</span>
          </span>
          <div class="flex gap-1">
            <button
              class={mainUi.units === "inHg" ? toggleBtnActive : toggleBtnInactive}
              onClick={() => updateMainUi("units", "inHg")}
            >
              inHg
            </button>
            <button
              class={mainUi.units === "hPa" ? toggleBtnActive : toggleBtnInactive}
              onClick={() => updateMainUi("units", "hPa")}
            >
              hPa
            </button>
          </div>
        </div>
        <div class={rowClass}>
          <span class={labelClass}>QNH highlight duration (min)</span>
          <input
            type="number"
            class={inputClass}
            value={settings.qnhHighlightDuration}
            min="1"
            max="60"
            onInput={(e) =>
              updateSettings("qnhHighlightDuration", Math.max(1, parseInt(e.currentTarget.value) || 10))
            }
          />
        </div>
        <div class={rowClass}>
          <span class={labelClass}>Show QNH trend arrow (↑↓)</span>
          <button
            class={settings.showQnhTrendArrow ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateSettings("showQnhTrendArrow", !settings.showQnhTrendArrow)}
          >
            {settings.showQnhTrendArrow ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* METAR Age Thresholds */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>METAR Staleness</div>
        <div class={rowClass}>
          <span class={labelClass}>Yellow after (min)</span>
          <input
            type="number"
            class={inputClass}
            value={settings.metarYellowMinutes}
            min="1"
            max="999"
            onInput={(e) =>
              updateSettings("metarYellowMinutes", Math.max(1, parseInt(e.currentTarget.value) || 90))
            }
          />
        </div>
        <div class={rowClass}>
          <span class={labelClass}>Red after (min)</span>
          <input
            type="number"
            class={inputClass}
            value={settings.metarRedMinutes}
            min="1"
            max="999"
            onInput={(e) =>
              updateSettings("metarRedMinutes", Math.max(1, parseInt(e.currentTarget.value) || 150))
            }
          />
        </div>
      </div>

      {/* Data Toggles */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>Data Toggles</div>

        <div class={rowClass}>
          <span class={labelClass}>
            Flight category
            <span class={shortcutBadge}>{ctrlLabel}+8</span>
          </span>
          <button
            class={mainUi.fltCatMode !== "off" ? toggleBtnActive : toggleBtnInactive}
            onClick={cycleFltCat}
          >
            {fltCatLabel()}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Cover
            <span class={shortcutBadge}>{ctrlLabel}+6</span>
          </span>
          <button
            class={mainUi.showCover ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showCover", !mainUi.showCover)}
          >
            {mainUi.showCover ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Weather (wxString)
            <span class={shortcutBadge}>{ctrlLabel}+7</span>
          </span>
          <button
            class={mainUi.showWxString ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showWxString", !mainUi.showWxString)}
          >
            {mainUi.showWxString ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Visibility
            <span class={shortcutBadge}>{ctrlLabel}+9</span>
          </span>
          <button
            class={mainUi.showVisibility ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showVisibility", !mainUi.showVisibility)}
          >
            {mainUi.showVisibility ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            RVR
            <span class={shortcutBadge}>{ctrlLabel}+0</span>
          </span>
          <button
            class={mainUi.showRvr ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showRvr", !mainUi.showRvr)}
          >
            {mainUi.showRvr ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Temp / Dewpoint
            <span class={shortcutBadge}>{ctrlLabel}+T</span>
          </span>
          <button
            class={mainUi.tempDewpoint !== "off" ? toggleBtnActive : toggleBtnInactive}
            onClick={cycleTempDewpoint}
          >
            {tempDewpointLabel()}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            METAR age
            <span class={shortcutBadge}>{ctrlLabel}+R</span>
          </span>
          <button
            class={mainUi.showMetarAge ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showMetarAge", !mainUi.showMetarAge)}
          >
            {mainUi.showMetarAge ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Cloud Layers */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>Cloud Layers</div>
        <div class="flex gap-1.5 flex-wrap">
          <button
            class={mainUi.showFew ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showFew", !mainUi.showFew)}
          >
            FEW <span class={shortcutBadge}>{ctrlLabel}+1</span>
          </button>
          <button
            class={mainUi.showSct ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showSct", !mainUi.showSct)}
          >
            SCT <span class={shortcutBadge}>{ctrlLabel}+2</span>
          </button>
          <button
            class={mainUi.showBkn ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showBkn", !mainUi.showBkn)}
          >
            BKN <span class={shortcutBadge}>{ctrlLabel}+3</span>
          </button>
          <button
            class={mainUi.showOvc ? toggleBtnActive : toggleBtnInactive}
            onClick={() => updateMainUi("showOvc", !mainUi.showOvc)}
          >
            OVC <span class={shortcutBadge}>{ctrlLabel}+4</span>
          </button>
        </div>
      </div>

      {/* Display Mode */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>Display</div>
        <div class={rowClass}>
          <span class={labelClass}>
            Extra info position
            <span class={shortcutBadge}>{ctrlLabel}+E</span>
          </span>
          <div class="flex gap-1">
            <button
              class={!mainUi.extraInfoInline ? toggleBtnActive : toggleBtnInactive}
              onClick={() => updateMainUi("extraInfoInline", false)}
            >
              Below
            </button>
            <button
              class={mainUi.extraInfoInline ? toggleBtnActive : toggleBtnInactive}
              onClick={() => updateMainUi("extraInfoInline", true)}
            >
              Inline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsApp;
