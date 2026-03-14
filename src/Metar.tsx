import {
  batch,
  Component,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { CloudLayer, lookupStationCmd, MetarDto, updateAtisCmd, updateMetarCmd } from "./tauri.ts";
import { createStore } from "solid-js/store";
import { MainUiStore } from "./App.tsx";
import { clsx } from "clsx";
import { debug, trace, warn } from "@tauri-apps/plugin-log";
import { DeleteButton } from "./DeleteButton.tsx";

interface MetarProps {
  requestedId: string;
  mainUi: MainUiStore;
  resizeAfterFn: (fn: () => void) => void;
  deleteOnClick: () => void;
}

function getRandomInt(min: number, max: number) {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

export const Metar: Component<MetarProps> = (props) => {
  const [icaoId, setIcaoId] = createSignal("");
  const [currentTimestamp, setCurrentTimestamp] = createSignal<Date>();
  const [validId, setValidId] = createSignal(false);

  // UI Display Signals
  const [displayId, setDisplayId] = createSignal("");
  const [wind, setWind] = createSignal("");
  const [rawMetar, setRawMetar] = createSignal("");
  const [metarData, setMetarData] = createSignal<MetarDto | null>(null);
  const [altimeter, setAltimeter] = createStore<{ inHg: number; hpa: number }>({
    inHg: 0.0,
    hpa: 0.0,
  });
  const [altimeterUpdated, setAltimeterUpdated] = createSignal(false);
  const [altimeterTrend, setAltimeterTrend] = createSignal<"up" | "down" | null>(null);
  const [altimeterUpdateTimer, setAltimeterUpdateTimer] = createSignal<number | undefined>(undefined);
  const altimeterString = createMemo(() => {
    if (props.mainUi.units === "inHg") {
      return altimeter.inHg == 0 ? "" : altimeter.inHg.toFixed(2);
    } else {
      return altimeter.hpa == 0 ? "" : altimeter.hpa.toFixed(0);
    }
  });
  const [showFullMetar, setShowFullMetar] = createSignal(false);
  const [atisLetter, setAtisLetter] = createSignal("-");
  const [atisTexts, setAtisTexts] = createStore<string[]>([]);
  const [showAtisTexts, setShowAtisTexts] = createSignal(false);

  // Update handle
  const [metarTimerHandle, setMetarTimerHandle] = createSignal<number | undefined>(undefined);
  const [letterTimerHandle, setLetterTimerHandle] = createSignal<number | undefined>(undefined);

  const fetchAndUpdateStation = async () => {
    try {
      await debug(`Frontend: Looking up requested ID: ${props.requestedId}`);
      let station = await lookupStationCmd(props.requestedId);
      setIcaoId(station.icaoId);
      setDisplayId(station.faaId && station.faaId !== "-" ? station.faaId : station.icaoId);
      setValidId(true);
    } catch (error) {
      setDisplayId(props.requestedId);
      await warn(`Frontend error: ${error}`);
    }
  };

  const updateMetar = async () => {
    if (!validId()) {
      return;
    }

    try {
      await trace(`Frontend: Starting update check for id ${icaoId()}`);
      let res = await updateMetarCmd(icaoId());
      await trace(`Frontend: Retrieved METAR: ${res}`);
      let newTimestamp = new Date(res.metar.obsTime);
      if (currentTimestamp() === undefined || newTimestamp > currentTimestamp()!) {
        await trace(`Frontend: New METAR found for ${icaoId()}`);
        // Check if altimeter value changed
        const prevAltim = altimeter.inHg;
        const isFirstFetch = currentTimestamp() === undefined;
        setCurrentTimestamp(newTimestamp);
        setAltimeter(res.altimeter);
        setWind(res.windString);
        // Strip leading "METAR" or "SPECI" prefix from raw text
        setRawMetar(res.metar.rawOb.replace(/^(METAR|SPECI)\s+/, ""));
        setMetarData(res.metar);

        // Highlight altimeter in orange/yellow for 10 minutes if value changed (not on first fetch)
        if (!isFirstFetch && prevAltim !== 0 && prevAltim !== res.altimeter.inHg) {
          setAltimeterUpdated(true);
          setAltimeterTrend(res.altimeter.inHg > prevAltim ? "up" : "down");
          if (altimeterUpdateTimer() !== undefined) {
            clearTimeout(altimeterUpdateTimer());
          }
          setAltimeterUpdateTimer(setTimeout(() => {
            setAltimeterUpdated(false);
            setAltimeterTrend(null);
            setAltimeterUpdateTimer(undefined);
          }, 10 * 60 * 1000) as unknown as number);
        }
      } else {
        await trace(`Frontend: Fetched METAR for ${icaoId()} same as displayed`);
      }
    } catch (error) {
      await warn(`Frontend error: ${error}`);
    }
  };

  const updateAtis = async () => {
    if (!validId()) {
      return;
    }

    props.resizeAfterFn(async () => {
      try {
        await trace(`Starting ATIS letter fetch for ${icaoId()}`);
        let res = await updateAtisCmd(icaoId());
        await trace(`Retrieved ATIS Letter ${res}`);
        setAtisLetter(res.letter);
        setAtisTexts(res.texts);
      } catch (error) {
        await warn(`Frontend error: ${error}`);
      }
    });
  };

  onMount(async () => {
    try {
      await fetchAndUpdateStation();
      if (validId()) {
        await updateMetar();
        setMetarTimerHandle(setInterval(updateMetar, 1000 * getRandomInt(120, 150)));

        await updateAtis();
        setLetterTimerHandle(setInterval(updateAtis, 1000 * getRandomInt(20, 30)));
      }
    } catch (error) {
      await warn(`Frontend error: ${error}`);
    }
  });

  onCleanup(() => {
    if (metarTimerHandle() !== undefined) {
      clearInterval(metarTimerHandle());
    }

    if (letterTimerHandle() !== undefined) {
      clearInterval(letterTimerHandle());
    }

    if (altimeterUpdateTimer() !== undefined) {
      clearTimeout(altimeterUpdateTimer());
    }
  });

  const toggleShowMetar = () => {
    props.resizeAfterFn(() => {
      batch(() => {
        if (showFullMetar()) {
          setShowFullMetar(false);
        } else {
          setShowFullMetar(true);
          setShowAtisTexts(false);
        }
      });
    });
  };

  const toggleShowAtisTexts = () => {
    props.resizeAfterFn(() => {
      batch(() => {
        if (atisTexts.length === 0) {
          setShowAtisTexts(false);
          return;
        }

        if (showAtisTexts()) {
          setShowAtisTexts(false);
        } else {
          setShowAtisTexts(true);
          setShowFullMetar(false);
        }
      });
    });
  };

  // Re-evaluate wind color every 30 seconds
  const [windColorTick, setWindColorTick] = createSignal(0);
  const windColorTickHandle = setInterval(() => setWindColorTick((v) => v + 1), 30000);
  onCleanup(() => clearInterval(windColorTickHandle));

  // Compute wind color based on METAR age
  const windColorClass = createMemo(() => {
    windColorTick(); // subscribe to tick for periodic re-evaluation
    const ts = currentTimestamp();
    if (!ts) return "";
    const ageMs = Date.now() - ts.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours > 2.5) return "text-red-500";
    if (ageHours > 1.5) return "text-yellow-400";
    return "";
  });

  // Parse visibility from raw METAR text (the actual reported visibility, not the "visib" field)
  const metarVisibility = createMemo(() => {
    const raw = rawMetar();
    if (!raw) return "";
    // Match visibility patterns like 9999, 6000, 0800, or CAVOK
    const match = raw.match(/\s(\d{4})\s/);
    if (match) return match[1];
    const cavok = raw.match(/\sCAVOK\s/);
    if (cavok) return "CAVOK";
    return "";
  });

  // Parse RVR from raw METAR text (e.g. R28L/0600V1000, R09/0800)
  const metarRvr = createMemo(() => {
    const raw = rawMetar();
    if (!raw) return "";
    const matches = raw.match(/\s(R\d{2}[LCR]?\/\S+)/g);
    if (matches) return matches.map((m) => m.trim()).join(" ");
    return "";
  });

  // Compute METAR age string (e.g. "12m ago")
  const [ageTick, setAgeTick] = createSignal(0);
  const ageTickHandle = setInterval(() => setAgeTick((v) => v + 1), 30000);
  onCleanup(() => clearInterval(ageTickHandle));

  const metarAge = createMemo(() => {
    ageTick(); // subscribe to tick for periodic re-evaluation
    const ts = currentTimestamp();
    if (!ts) return "";
    const ageMs = Date.now() - ts.getTime();
    const ageMin = Math.floor(ageMs / 60000);
    if (ageMin < 1) return "<1m";
    if (ageMin < 60) return `${ageMin}m`;
    const ageHrs = Math.floor(ageMin / 60);
    const remMin = ageMin % 60;
    return `${ageHrs}h${remMin}m`;
  });

  // Format cloud layers for display
  const formatCloudLayer = (cloud: CloudLayer): string => {
    if (cloud.base !== undefined && cloud.base !== null) {
      const baseStr = String(cloud.base / 100).padStart(3, "0");
      return `${cloud.cover}${baseStr}`;
    }
    return cloud.cover;
  };

  // Get filtered cloud layers based on toggle states
  const filteredClouds = createMemo(() => {
    const data = metarData();
    if (!data || !data.clouds) return [];
    return data.clouds.filter((c) => {
      const cover = c.cover.toUpperCase();
      if (cover === "FEW" && props.mainUi.showFew) return true;
      if (cover === "SCT" && props.mainUi.showSct) return true;
      if (cover === "BKN" && props.mainUi.showBkn) return true;
      if (cover === "OVC" && props.mainUi.showOvc) return true;
      return false;
    });
  });

  // Flight category color mapping
  const fltCatColor = createMemo(() => {
    const data = metarData();
    if (!data || !data.fltCat) return "text-white";
    switch (data.fltCat) {
      case "VFR": return "text-green-400";
      case "MVFR": return "text-blue-400";
      case "IFR": return "text-red-400";
      case "LIFR": return "text-fuchsia-400";
      default: return "text-white";
    }
  });

  // Format temp/dewpoint display
  const tempDewpointDisplay = createMemo(() => {
    const data = metarData();
    if (!data) return "";
    if (props.mainUi.tempDewpoint === "off") return "";
    if (props.mainUi.tempDewpoint === "temp") {
      if (data.temp === undefined || data.temp === null) return "";
      const t = Math.round(data.temp);
      return t < 0 ? `M${String(Math.abs(t)).padStart(2, "0")}` : `${String(t).padStart(2, "0")}`;
    }
    // tempDewp
    if (data.temp === undefined || data.temp === null) return "";
    const t = Math.round(data.temp);
    const tempStr = t < 0 ? `M${String(Math.abs(t)).padStart(2, "0")}` : `${String(t).padStart(2, "0")}`;
    if (data.dewp === undefined || data.dewp === null) return tempStr;
    const d = Math.round(data.dewp);
    const dewpStr = d < 0 ? `M${String(Math.abs(d)).padStart(2, "0")}` : `${String(d).padStart(2, "0")}`;
    return `${tempStr}/${dewpStr}`;
  });

  // Filter visibility: only show when not 9999 or CAVOK
  const shouldShowVisibility = createMemo(() => {
    if (!props.mainUi.showVisibility) return false;
    const vis = metarVisibility();
    if (!vis) return false;
    return vis !== "9999" && vis !== "CAVOK";
  });

  // Check if any extra info is active (excludes fltCat, which is always before ICAO)
  const hasExtraInfo = createMemo(() => {
    const data = metarData();
    if (!data) return false;
    if (filteredClouds().length > 0) return true;
    if (props.mainUi.showCover && data.cover) return true;
    if (props.mainUi.showWxString && data.wxString) return true;
    if (shouldShowVisibility()) return true;
    if (props.mainUi.showRvr && metarRvr()) return true;
    if (props.mainUi.tempDewpoint !== "off" && tempDewpointDisplay()) return true;
    if (props.mainUi.showMetarAge && metarAge()) return true;
    return false;
  });

  let fullTextClass = createMemo(() => {
    return clsx({
      "text-xs mb-1 text-gray-400 pr-1": true,
      "w-[calc(100vw-1.25rem)]": props.mainUi.showInput,
      "w-screen": !props.mainUi.showInput,
    });
  });

  let extraInfoClass = createMemo(() => {
    return "text-xs text-cyan-300 font-mono";
  });

  // Build inline extra text for "inline" display mode (after wind, same text size)
  const inlineExtraText = createMemo(() => {
    const parts: string[] = [];
    const data = metarData();
    if (!data) return "";
    if (props.mainUi.showCover && data.cover) parts.push(data.cover);
    for (const cloud of filteredClouds()) {
      parts.push(formatCloudLayer(cloud));
    }
    if (props.mainUi.showWxString && data.wxString) parts.push(data.wxString);
    if (shouldShowVisibility()) parts.push(metarVisibility());
    if (props.mainUi.showRvr && metarRvr()) parts.push(metarRvr());
    if (props.mainUi.tempDewpoint !== "off" && tempDewpointDisplay()) parts.push(tempDewpointDisplay());
    if (props.mainUi.showMetarAge && metarAge()) parts.push(metarAge());
    return parts.join("  ");
  });

  return (
    <Show
      when={
        props.mainUi.showInput || !props.mainUi.hideAirportIfMissingAtis || atisLetter() !== "-"
      }
    >
      <Show when={props.mainUi.showInput}>
        <DeleteButton onClick={props.deleteOnClick} />
      </Show>
      <div class="flex flex-col mx-1 select-none cursor-pointer">
        <div class="flex font-mono text-sm space-x-2.5">
          <Show when={props.mainUi.fltCatMode === "dot" && metarData()?.fltCat}>
            <span class={`${fltCatColor()} flex items-center`}>●</span>
          </Show>
          <Show when={props.mainUi.fltCatMode === "text" && metarData()?.fltCat}>
            <span class={`${fltCatColor()} font-mono`}>{metarData()!.fltCat}</span>
          </Show>
          <div class="w-8">{displayId()}</div>
          <div class="w-8 text-center" onClick={toggleShowAtisTexts}>
            {atisLetter()}
          </div>
          <div
            class={clsx({
              "text-center": true,
              "w-12": props.mainUi.units === "inHg",
              "w-10": props.mainUi.units === "hPa",
              "text-amber-400": altimeterUpdated(),
            })}
            onClick={toggleShowMetar}
          >
            {altimeterString()}
            <Show when={altimeterTrend() !== null}>
              <span class="text-amber-400 text-xs ml-0.5">{altimeterTrend() === "up" ? "↑" : "↓"}</span>
            </Show>
          </div>
          <div class={clsx("flex-grow", windColorClass())} onClick={toggleShowMetar}>
            {wind()}
            <Show when={props.mainUi.extraInfoInline && hasExtraInfo()}>
              <span class="text-white ml-3">{inlineExtraText()}</span>
            </Show>
          </div>
        </div>
        <Show when={hasExtraInfo() && !props.mainUi.extraInfoInline}>
          <div class="flex flex-wrap gap-x-2 mx-0.5">
            <Show when={props.mainUi.showCover && metarData()?.cover}>
              <span class={extraInfoClass()}>{metarData()!.cover}</span>
            </Show>
            <Show when={filteredClouds().length > 0}>
              <For each={filteredClouds()}>
                {(cloud) => <span class={extraInfoClass()}>{formatCloudLayer(cloud)}</span>}
              </For>
            </Show>
            <Show when={props.mainUi.showWxString && metarData()?.wxString}>
              <span class={extraInfoClass()}>{metarData()!.wxString}</span>
            </Show>
            <Show when={shouldShowVisibility()}>
              <span class={extraInfoClass()}>{metarVisibility()}</span>
            </Show>
            <Show when={props.mainUi.showRvr && metarRvr()}>
              <span class={extraInfoClass()}>{metarRvr()}</span>
            </Show>
            <Show when={props.mainUi.tempDewpoint !== "off" && tempDewpointDisplay()}>
              <span class={extraInfoClass()}>{tempDewpointDisplay()}</span>
            </Show>
            <Show when={props.mainUi.showMetarAge && metarAge()}>
              <span class={extraInfoClass()}>{metarAge()}</span>
            </Show>
          </div>
        </Show>
        <Show when={showFullMetar() && rawMetar() !== ""}>
          <div class={fullTextClass()}>{rawMetar()}</div>
        </Show>
        <Show when={showAtisTexts()}>
          <For each={atisTexts}>{(atisText) => <div class={fullTextClass()}>{atisText}</div>}</For>
        </Show>
      </div>
    </Show>
  );
};
