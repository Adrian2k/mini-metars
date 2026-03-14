import { Component } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { MainUiStore } from "./App.tsx";
import { Settings } from "./tauri.ts";

interface SettingsPanelProps {
  settings: Settings;
  setSettings: SetStoreFunction<Settings>;
  mainUi: MainUiStore;
  setMainUi: SetStoreFunction<MainUiStore>;
  onClose: () => void;
}

export const SettingsPanel: Component<SettingsPanelProps> = (props) => {
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

  // Temp/dewpoint cycle helper
  const cycleTempDewpoint = () => {
    if (props.mainUi.tempDewpoint === "off") {
      props.setMainUi("tempDewpoint", "temp");
    } else if (props.mainUi.tempDewpoint === "temp") {
      props.setMainUi("tempDewpoint", "tempDewp");
    } else {
      props.setMainUi("tempDewpoint", "off");
    }
  };

  const tempDewpointLabel = () => {
    if (props.mainUi.tempDewpoint === "off") return "Off";
    if (props.mainUi.tempDewpoint === "temp") return "Temp";
    return "Temp/Dewp";
  };

  // FltCat cycle helper
  const cycleFltCat = () => {
    if (props.mainUi.fltCatMode === "off") {
      props.setMainUi("fltCatMode", "dot");
    } else if (props.mainUi.fltCatMode === "dot") {
      props.setMainUi("fltCatMode", "text");
    } else {
      props.setMainUi("fltCatMode", "off");
    }
  };

  const fltCatLabel = () => {
    if (props.mainUi.fltCatMode === "off") return "Off";
    if (props.mainUi.fltCatMode === "dot") return "Dot";
    return "Text";
  };

  return (
    <div class="bg-gray-900 border-t border-gray-700 px-3 py-2 font-sans select-none" style="min-width: 320px;">
      <div class="flex items-center justify-between mb-2">
        <span class="text-gray-100 text-sm font-semibold">Settings</span>
        <button
          class="text-gray-400 hover:text-white text-sm px-1"
          onClick={props.onClose}
        >
          ✕
        </button>
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
              class={props.mainUi.units === "inHg" ? toggleBtnActive : toggleBtnInactive}
              onClick={() => props.setMainUi("units", "inHg")}
            >
              inHg
            </button>
            <button
              class={props.mainUi.units === "hPa" ? toggleBtnActive : toggleBtnInactive}
              onClick={() => props.setMainUi("units", "hPa")}
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
            value={props.settings.qnhHighlightDuration}
            min="1"
            max="60"
            onInput={(e) =>
              props.setSettings("qnhHighlightDuration", Math.max(1, parseInt(e.currentTarget.value) || 10))
            }
          />
        </div>
        <div class={rowClass}>
          <span class={labelClass}>Show QNH trend arrow (↑↓)</span>
          <button
            class={props.settings.showQnhTrendArrow ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setSettings("showQnhTrendArrow", !props.settings.showQnhTrendArrow)}
          >
            {props.settings.showQnhTrendArrow ? "On" : "Off"}
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
            value={props.settings.metarYellowMinutes}
            min="1"
            max="999"
            onInput={(e) =>
              props.setSettings("metarYellowMinutes", Math.max(1, parseInt(e.currentTarget.value) || 90))
            }
          />
        </div>
        <div class={rowClass}>
          <span class={labelClass}>Red after (min)</span>
          <input
            type="number"
            class={inputClass}
            value={props.settings.metarRedMinutes}
            min="1"
            max="999"
            onInput={(e) =>
              props.setSettings("metarRedMinutes", Math.max(1, parseInt(e.currentTarget.value) || 150))
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
            class={props.mainUi.fltCatMode !== "off" ? toggleBtnActive : toggleBtnInactive}
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
            class={props.mainUi.showCover ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showCover", !props.mainUi.showCover)}
          >
            {props.mainUi.showCover ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Weather (wxString)
            <span class={shortcutBadge}>{ctrlLabel}+7</span>
          </span>
          <button
            class={props.mainUi.showWxString ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showWxString", !props.mainUi.showWxString)}
          >
            {props.mainUi.showWxString ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Visibility
            <span class={shortcutBadge}>{ctrlLabel}+9</span>
          </span>
          <button
            class={props.mainUi.showVisibility ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showVisibility", !props.mainUi.showVisibility)}
          >
            {props.mainUi.showVisibility ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            RVR
            <span class={shortcutBadge}>{ctrlLabel}+0</span>
          </span>
          <button
            class={props.mainUi.showRvr ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showRvr", !props.mainUi.showRvr)}
          >
            {props.mainUi.showRvr ? "On" : "Off"}
          </button>
        </div>

        <div class={rowClass}>
          <span class={labelClass}>
            Temp / Dewpoint
            <span class={shortcutBadge}>{ctrlLabel}+T</span>
          </span>
          <button
            class={props.mainUi.tempDewpoint !== "off" ? toggleBtnActive : toggleBtnInactive}
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
            class={props.mainUi.showMetarAge ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showMetarAge", !props.mainUi.showMetarAge)}
          >
            {props.mainUi.showMetarAge ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Cloud Layers */}
      <div class={sectionClass}>
        <div class={sectionTitleClass}>Cloud Layers</div>
        <div class="flex gap-1.5 flex-wrap">
          <button
            class={props.mainUi.showFew ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showFew", !props.mainUi.showFew)}
          >
            FEW <span class={shortcutBadge}>{ctrlLabel}+1</span>
          </button>
          <button
            class={props.mainUi.showSct ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showSct", !props.mainUi.showSct)}
          >
            SCT <span class={shortcutBadge}>{ctrlLabel}+2</span>
          </button>
          <button
            class={props.mainUi.showBkn ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showBkn", !props.mainUi.showBkn)}
          >
            BKN <span class={shortcutBadge}>{ctrlLabel}+3</span>
          </button>
          <button
            class={props.mainUi.showOvc ? toggleBtnActive : toggleBtnInactive}
            onClick={() => props.setMainUi("showOvc", !props.mainUi.showOvc)}
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
              class={!props.mainUi.extraInfoInline ? toggleBtnActive : toggleBtnInactive}
              onClick={() => props.setMainUi("extraInfoInline", false)}
            >
              Below
            </button>
            <button
              class={props.mainUi.extraInfoInline ? toggleBtnActive : toggleBtnInactive}
              onClick={() => props.setMainUi("extraInfoInline", true)}
            >
              Inline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
