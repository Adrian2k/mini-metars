import "./styles.css";
import { Metar } from "./Metar.tsx";
import { batch, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
// @ts-ignore
import { autofocus } from "@solid-primitives/autofocus";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { logIfDev } from "./logging.ts";
import { clsx } from "clsx";
import { createShortcut, KbdKey } from "@solid-primitives/keyboard";
import {
  initializeDatafeedCmd,
  loadProfileCmd,
  loadSettingsInitialCmd,
  Profile,
  saveProfileAsCmd,
  saveProfileCmd,
  saveSettingsCmd,
  Settings,
} from "./tauri.ts";
import { type } from "@tauri-apps/plugin-os";
import { CustomTitlebar } from "./CustomTitlebar.tsx";
import { warn } from "@tauri-apps/plugin-log";

function removeIndex<T>(array: readonly T[], index: number): T[] {
  return [...array.slice(0, index), ...array.slice(index + 1)];
}

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

function App() {
  // Window basics
  let containerRef: HTMLDivElement | undefined;
  let window = getCurrentWindow();
  let useCustomTitlebar = type() === "windows";

  // Prevent right-click context menu and enable window dragging with right-click
  document.addEventListener("contextmenu", (event) => event.preventDefault());

  let isDragging = false;
  let dragStartScreenX = 0;
  let dragStartScreenY = 0;
  let dragStartWinX = 0;
  let dragStartWinY = 0;
  let dragScaleFactor = 1;

  document.addEventListener("mousedown", (event) => {
    if (event.button === 2) {
      dragStartScreenX = event.screenX;
      dragStartScreenY = event.screenY;
      Promise.all([window.outerPosition(), window.scaleFactor()]).then(([pos, sf]) => {
        dragStartWinX = pos.x;
        dragStartWinY = pos.y;
        dragScaleFactor = sf;
        isDragging = true;
      });
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (isDragging) {
      const dx = (event.screenX - dragStartScreenX) * dragScaleFactor;
      const dy = (event.screenY - dragStartScreenY) * dragScaleFactor;
      window.setPosition(new PhysicalPosition(dragStartWinX + dx, dragStartWinY + dy));
    }
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 2) {
      isDragging = false;
    }
  });

  // Main signals for IDs and input
  const [inputId, setInputId] = createSignal("");
  const [ids, setIds] = createStore<string[]>([]);
  const [mainUi, setMainUi] = createStore<MainUiStore>({
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
  });

  // Settings store
  const [settings, setSettings] = createStore<Settings>({
    loadMostRecentProfileOnOpen: true,
    alwaysOnTop: true,
    autoResize: true,
  });

  let CtrlOrCmd: KbdKey = type() === "macos" || type() === "ios" ? "Meta" : "Control";

  let currentProfileState = createMemo<Profile>(() => {
    return {
      name: "",
      stations: ids,
      showTitlebar: mainUi.showTitlebar,
      showInput: mainUi.showInput,
      units: mainUi.units,
      hideAirportIfMissingAtis: mainUi.hideAirportIfMissingAtis,
      showFew: mainUi.showFew,
      showSct: mainUi.showSct,
      showBkn: mainUi.showBkn,
      showOvc: mainUi.showOvc,
      showCover: mainUi.showCover,
      showWxString: mainUi.showWxString,
      fltCatMode: mainUi.fltCatMode,
      showVisibility: mainUi.showVisibility,
      showRvr: mainUi.showRvr,
      tempDewpoint: mainUi.tempDewpoint,
      showMetarAge: mainUi.showMetarAge,
      extraInfoInline: mainUi.extraInfoInline,
    };
  });

  // Create shortcuts for profile open and save
  createShortcut(
    [CtrlOrCmd, "O"],
    async () => {
      try {
        let p = await loadProfileCmd();
        await loadProfile(p);
        await saveSettingsCmd(settings);
      } catch (error) {
        await warn(`Frontend error: ${error}`);
      }
    },
    { preventDefault: true, requireReset: true }
  );
  createShortcut(
    [CtrlOrCmd, "S"],
    async () => {
      try {
        await saveProfileCmd(currentProfileState());
        await saveSettingsCmd(settings);
      } catch (error) {
        await warn(`Frontend error: ${error}`);
      }
    },
    { preventDefault: true, requireReset: true }
  );
  createShortcut(
    [CtrlOrCmd, "Shift", "S"],
    async () => {
      try {
        await saveProfileAsCmd(currentProfileState());
        await saveSettingsCmd(settings);
      } catch (error) {
        await warn(`Frontend error: ${error}`);
      }
    },
    { preventDefault: true, requireReset: true }
  );

  // Create shortcuts to toggle input box
  createShortcut(
    [CtrlOrCmd, "D"],
    async () =>
      await applyFnAndResize(() => {
        if (ids.length > 0) {
          setMainUi("showInput", (prev) => !prev);
        }
      }),
    {
      preventDefault: true,
      requireReset: false,
    }
  );

  // Create shortcut to hide custom titlebar, Windows only
  createShortcut(
    [CtrlOrCmd, "B"],
    async () =>
      await applyFnAndResize(() => {
        if (useCustomTitlebar) {
          setMainUi("showTitlebar", (prev) => !prev);
        }
      }),
    {
      preventDefault: true,
      requireReset: false,
    }
  );

  // Create shortcut to minimize Window. Only needed on Windows, as it's built-in on  Mac
  if (type() === "windows") {
    createShortcut([CtrlOrCmd, "M"], async () => await window.minimize(), {
      preventDefault: true,
      requireReset: false,
    });
  }

  // Create shortcut to toggle units
  createShortcut([CtrlOrCmd, "U"], () => {
    if (mainUi.units === "inHg") {
      setMainUi("units", "hPa");
    } else {
      setMainUi("units", "inHg");
    }
  });

  // Create shortcut to hide airports with missing ATIS
  createShortcut([CtrlOrCmd, "H"], async () => {
    if (!mainUi.showInput) {
      await applyFnAndResize(() => {
        setMainUi("hideAirportIfMissingAtis", (prev) => !prev);
      });
    }
  });

  // Create shortcuts for cloud layer toggles
  createShortcut(
    [CtrlOrCmd, "1"],
    async () =>
      await applyFnAndResize(() => setMainUi("showFew", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );
  createShortcut(
    [CtrlOrCmd, "2"],
    async () =>
      await applyFnAndResize(() => setMainUi("showSct", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );
  createShortcut(
    [CtrlOrCmd, "3"],
    async () =>
      await applyFnAndResize(() => setMainUi("showBkn", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );
  createShortcut(
    [CtrlOrCmd, "4"],
    async () =>
      await applyFnAndResize(() => setMainUi("showOvc", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );
  createShortcut(
    [CtrlOrCmd, "5"],
    async () =>
      await applyFnAndResize(() => {
        const allOn = mainUi.showFew && mainUi.showSct && mainUi.showBkn && mainUi.showOvc;
        batch(() => {
          setMainUi("showFew", !allOn);
          setMainUi("showSct", !allOn);
          setMainUi("showBkn", !allOn);
          setMainUi("showOvc", !allOn);
        });
      }),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for cover toggle
  createShortcut(
    [CtrlOrCmd, "6"],
    async () =>
      await applyFnAndResize(() => setMainUi("showCover", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for wxString toggle
  createShortcut(
    [CtrlOrCmd, "7"],
    async () =>
      await applyFnAndResize(() => setMainUi("showWxString", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for fltCat toggle (3 states: off -> dot -> text -> off)
  createShortcut(
    [CtrlOrCmd, "8"],
    async () =>
      await applyFnAndResize(() => {
        if (mainUi.fltCatMode === "off") {
          setMainUi("fltCatMode", "dot");
        } else if (mainUi.fltCatMode === "dot") {
          setMainUi("fltCatMode", "text");
        } else {
          setMainUi("fltCatMode", "off");
        }
      }),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for visibility toggle
  createShortcut(
    [CtrlOrCmd, "9"],
    async () =>
      await applyFnAndResize(() => setMainUi("showVisibility", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for temp/dewpoint toggle (3 states: off -> temp -> tempDewp -> off)
  createShortcut(
    [CtrlOrCmd, "T"],
    async () =>
      await applyFnAndResize(() => {
        if (mainUi.tempDewpoint === "off") {
          setMainUi("tempDewpoint", "temp");
        } else if (mainUi.tempDewpoint === "temp") {
          setMainUi("tempDewpoint", "tempDewp");
        } else {
          setMainUi("tempDewpoint", "off");
        }
      }),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for RVR toggle
  createShortcut(
    [CtrlOrCmd, "0"],
    async () =>
      await applyFnAndResize(() => setMainUi("showRvr", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for METAR age toggle (replaces report time)
  createShortcut(
    [CtrlOrCmd, "R"],
    async () =>
      await applyFnAndResize(() => setMainUi("showMetarAge", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  // Create shortcut for extra info display mode (below vs inline)
  createShortcut(
    [CtrlOrCmd, "E"],
    async () =>
      await applyFnAndResize(() => setMainUi("extraInfoInline", (prev) => !prev)),
    { preventDefault: true, requireReset: false }
  );

  async function resetWindowHeight() {
    if (containerRef !== undefined) {
      let currentSize = await window.innerSize();
      logIfDev("Current window size", currentSize);
      logIfDev("containerRef height", containerRef.offsetHeight);
      logIfDev("containerRef scrollWidth", containerRef.scrollWidth);
      let scaleFactor = await window.scaleFactor();
      logIfDev("Scale factor", scaleFactor);
      let offset = mainUi.showTitlebar ? (type() === "macos" ? 30 : 24) : 0;
      let container = Math.max(20, containerRef.offsetHeight);
      let contentWidth = Math.max(200, Math.ceil(containerRef.scrollWidth * scaleFactor));
      await window.setSize(new PhysicalSize(contentWidth, (container + offset) * scaleFactor));
    }
  }

  async function applyFnAndResize(fn: () => void) {
    setMainUi("showScroll", false);
    fn();
    await resetWindowHeight();
    setMainUi("showScroll", true);
  }

  async function loadProfile(p: Profile) {
    const applyProfileToStore = () => {
      batch(() => {
        setIds(p.stations);
        setMainUi("showInput", p.showInput);
        setMainUi("showTitlebar", p.showTitlebar);
        setMainUi("units", p.units);
        setMainUi("hideAirportIfMissingAtis", p.hideAirportIfMissingAtis);
        setMainUi("showFew", p.showFew ?? false);
        setMainUi("showSct", p.showSct ?? false);
        setMainUi("showBkn", p.showBkn ?? false);
        setMainUi("showOvc", p.showOvc ?? false);
        setMainUi("showCover", p.showCover ?? false);
        setMainUi("showWxString", p.showWxString ?? false);
        setMainUi("fltCatMode", p.fltCatMode ?? "off");
        setMainUi("showVisibility", p.showVisibility ?? false);
        setMainUi("showRvr", p.showRvr ?? false);
        setMainUi("tempDewpoint", p.tempDewpoint ?? "off");
        setMainUi("showMetarAge", p.showMetarAge ?? false);
        setMainUi("extraInfoInline", p.extraInfoInline ?? false);
      });
    };
    if (p.window === null) {
      await applyFnAndResize(applyProfileToStore);
    } else {
      applyProfileToStore();
    }
  }

  async function addStation(e: SubmitEvent) {
    e.preventDefault();
    await applyFnAndResize(() =>
      batch(() => {
        if (inputId().length >= 3 && inputId().length <= 4) {
          setIds(ids.length, inputId());
          setInputId("");
        }
      })
    );
  }

  async function removeStation(index: number) {
    await applyFnAndResize(() => setIds((ids) => removeIndex(ids, index)));
  }

  onMount(async () => {
    let res = await loadSettingsInitialCmd();
    await initializeDatafeedCmd();
    setSettings(res.settings);
    if (res.profile && settings.loadMostRecentProfileOnOpen) {
      await loadProfile(res.profile!);
    }
  });

  return (
    <div>
      <Show when={useCustomTitlebar && mainUi.showTitlebar}>
        <CustomTitlebar />
      </Show>
      <div
        class={clsx({
          "h-screen overflow-x-hidden bg-black": true,
          "pt-[24px]": useCustomTitlebar && mainUi.showTitlebar,
          "overflow-y-auto": mainUi.showScroll,
          "overflow-y-hidden": !mainUi.showScroll,
        })}
      >
        <div class="flex flex-col bg-black text-white w-fit" ref={containerRef}>
          <div class="flex flex-col grow">
            <For each={ids}>
              {(id, i) => (
                <div class="flex">
                  <Metar
                    requestedId={id}
                    resizeAfterFn={applyFnAndResize}
                    mainUi={mainUi}
                    deleteOnClick={async () => await removeStation(i())}
                  />
                </div>
              )}
            </For>
            <Show when={mainUi.showInput}>
              <form onSubmit={async (e) => addStation(e)}>
                <input
                  id="stationId"
                  name="stationId"
                  type="text"
                  class="w-16 text-white font-mono bg-gray-900 mx-1 my-1 border-gray-700 border focus:outline-none focus:border-gray-500 px-1 rounded"
                  value={inputId()}
                  onInput={(e) => setInputId(e.currentTarget.value)}
                  use:autofocus
                  autofocus
                  formNoValidate
                  autocomplete="off"
                />
              </form>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
