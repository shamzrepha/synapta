"use client";

import React, { useEffect, useRef } from "react";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { arduinoGenerator, defineArduinoBlocks, toolbox } from "@/lib/studio/blockly/arduino";
import { emptyBlockly } from "@/lib/studio/blockly/convert";
import { GestureToggle, useGestureLock } from "./gesture-lock";

/**
 * Scratch-style block coding: pick blocks from the drawer, drag them under "when the board starts" or
 * "forever", and they snap together. The sketch they make is what the board runs. On phones the page
 * scrolls over the editor until "Edit blocks" is on, so it never traps a swipe.
 */
export function BlocklyEditor({ state, readOnly, onChange }: { state: object | null; readOnly?: boolean; onChange: (state: object, code: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const last = useRef<string>("");
  const cb = useRef(onChange);
  const gesture = useGestureLock();

  useEffect(() => {
    cb.current = onChange;
  });

  // create the workspace once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    defineArduinoBlocks();
    const dark = document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark";
    const theme = Blockly.Theme.defineTheme("sunroot", {
      name: "sunroot",
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: dark ? "#0b1220" : "#f8fafc",
        toolboxBackgroundColour: dark ? "#111827" : "#e2e8f0",
        toolboxForegroundColour: dark ? "#e2e8f0" : "#0f172a",
        flyoutBackgroundColour: dark ? "#1e293b" : "#f1f5f9",
        flyoutForegroundColour: dark ? "#e2e8f0" : "#0f172a",
        flyoutOpacity: 0.95,
        scrollbarColour: "#94a3b8",
        insertionMarkerColour: "#14b8a6",
        insertionMarkerOpacity: 0.4,
      },
    });
    // on a phone the block drawer is a row along the top, so the workspace keeps the full width
    const narrow = el.clientWidth < 560;
    const w = Blockly.inject(el, {
      toolbox: toolbox(),
      horizontalLayout: narrow,
      toolboxPosition: "start",
      renderer: "zelos",
      theme,
      readOnly: !!readOnly,
      sounds: false,
      trashcan: true,
      grid: { spacing: 24, length: 2, colour: dark ? "#1e293b" : "#cbd5e1", snap: true },
      zoom: { controls: true, wheel: false, pinch: true, startScale: narrow ? 0.7 : 0.9, maxScale: 2, minScale: 0.4, scaleSpeed: 1.2 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    ws.current = w;
    const load = (st: object | null) => {
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load((st || emptyBlockly()) as never, w);
      } finally {
        Blockly.Events.enable();
      }
    };
    load(state);
    last.current = JSON.stringify(Blockly.serialization.workspaces.save(w));

    let timer: ReturnType<typeof setTimeout> | undefined;
    w.addChangeListener((e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || w.isDragging()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const saved = Blockly.serialization.workspaces.save(w);
        const json = JSON.stringify(saved);
        if (json === last.current) return;
        last.current = json;
        cb.current(saved as object, arduinoGenerator.workspaceToCode(w));
      }, 250);
    });
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      w.dispose();
      ws.current = null;
    };
    // the workspace is created once; later changes to `state` are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // undo / redo / an AI edit changed the blocks from outside: show them
  useEffect(() => {
    const w = ws.current;
    if (!w) return;
    const json = JSON.stringify(state || emptyBlockly());
    if (json === last.current) return;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load((state || emptyBlockly()) as never, w);
    } finally {
      Blockly.Events.enable();
    }
    last.current = JSON.stringify(Blockly.serialization.workspaces.save(w));
  }, [state]);

  return (
    <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden h-[62vh] min-h-[360px] max-h-[640px]">
      <div ref={host} className="absolute inset-0" />
      {gesture.canToggle && !gesture.active && (
        <button type="button" onClick={() => gesture.setActive(true)} className="absolute inset-0 z-20 flex items-end justify-center bg-transparent pb-3" style={{ touchAction: "pan-y" }} aria-label="Edit blocks">
          <span className="rounded-full bg-slate-900/85 px-4 py-2 text-xs font-bold text-white shadow-lg">Tap to edit blocks · swipe scrolls the page</span>
        </button>
      )}
      {gesture.canToggle && gesture.active && <GestureToggle active onChange={gesture.setActive} className="absolute top-2 right-2 z-30" />}
    </div>
  );
}
