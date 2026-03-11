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
import { lookupStationCmd, updateAtisCmd, updateMetarCmd } from "./tauri.ts";
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
  const [altimeter, setAltimeter] = createStore<{ inHg: number; hpa: number }>({
    inHg: 0.0,
    hpa: 0.0,
  });
  const [altimeterUpdated, setAltimeterUpdated] = createSignal(false);
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

        // Highlight altimeter in orange/yellow for 10 minutes if value changed (not on first fetch)
        if (!isFirstFetch && prevAltim !== 0 && prevAltim !== res.altimeter.inHg) {
          setAltimeterUpdated(true);
          if (altimeterUpdateTimer() !== undefined) {
            clearTimeout(altimeterUpdateTimer());
          }
          setAltimeterUpdateTimer(setTimeout(() => {
            setAltimeterUpdated(false);
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

  let fullTextClass = createMemo(() => {
    return clsx({
      "text-xs mb-1 text-gray-400 pr-1": true,
      "w-[calc(100vw-1.25rem)]": props.mainUi.showInput,
      "w-screen": !props.mainUi.showInput,
    });
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
          <div class="w-8">{displayId()}</div>
          <div class="w-8 text-center" onClick={toggleShowAtisTexts}>
            {atisLetter()}
          </div>
          <div
            class={clsx({
              "text-center": true,
              "w-12": props.mainUi.units === "inHg",
              "w-10": props.mainUi.units === "hPa",
            })}
            onClick={toggleShowMetar}
          >
            {altimeterString()}
          </div>
          <div class="flex-grow" onClick={toggleShowMetar}>
            {wind()}
          </div>
        </div>
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
