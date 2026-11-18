/**
 * Interactive "Cooking Fever"-Style Science Lab Workbench Engine
 * Simulates real chemical reactions, stoichiometry/qualitative analysis,
 * exothermic/endothermic heat, Bunsen burner thermal decomposition,
 * Nichrome wire flame tests, and 40x/100x/400x optical microscope views.
 */

export type ReagentId =
  | "hcl"
  | "naoh"
  | "cuso4"
  | "feso4"
  | "fecl3"
  | "agno3"
  | "bacl2"
  | "caco3"
  | "phenolphthalein"
  | "iodine"
  | "starch_cells";

export interface ReagentDef {
  id: ReagentId;
  formula: string;
  name: string;
  category: "acid_base" | "salt" | "indicator_bio";
  colorHex: string;
  defaultPh: number;
  flameColor?: { name: string; hex: string; wavelengthNm: number };
  description: string;
}

export const REAGENTS: ReagentDef[] = [
  {
    id: "hcl",
    formula: "HCl (1.0M)",
    name: "Hydrochloric Acid",
    category: "acid_base",
    colorHex: "#e0f2fe",
    defaultPh: 1.0,
    description: "Strong mineral acid; supplies H⁺ and Cl⁻ ions.",
  },
  {
    id: "naoh",
    formula: "NaOH (1.0M)",
    name: "Sodium Hydroxide",
    category: "acid_base",
    colorHex: "#f1f5f9",
    defaultPh: 13.5,
    flameColor: { name: "Golden Yellow (Na⁺)", hex: "#facc15", wavelengthNm: 589 },
    description: "Strong alkali; supplies Na⁺ and OH⁻ ions for hydroxide precipitation.",
  },
  {
    id: "cuso4",
    formula: "CuSO₄ (aq)",
    name: "Copper(II) Sulfate",
    category: "salt",
    colorHex: "#0ea5e9",
    defaultPh: 5.5,
    flameColor: { name: "Emerald Blue-Green (Cu²⁺)", hex: "#10b981", wavelengthNm: 510 },
    description: "Blue transition-metal salt; supplies Cu²⁺ and SO₄²⁻ ions.",
  },
  {
    id: "feso4",
    formula: "FeSO₄ (aq)",
    name: "Iron(II) Sulfate",
    category: "salt",
    colorHex: "#86efac",
    defaultPh: 5.8,
    flameColor: { name: "Gold Sparkle (Fe²⁺)", hex: "#fbbf24", wavelengthNm: 575 },
    description: "Pale green salt; forms dirty-green Fe(OH)₂ with NaOH.",
  },
  {
    id: "fecl3",
    formula: "FeCl₃ (aq)",
    name: "Iron(III) Chloride",
    category: "salt",
    colorHex: "#d97706",
    defaultPh: 4.5,
    flameColor: { name: "Amber Spark (Fe³⁺)", hex: "#f59e0b", wavelengthNm: 580 },
    description: "Yellow-brown solution; forms reddish-brown Fe(OH)₃ precipitate with NaOH.",
  },
  {
    id: "agno3",
    formula: "AgNO₃ (aq)",
    name: "Silver Nitrate",
    category: "salt",
    colorHex: "#f8fafc",
    defaultPh: 6.5,
    description: "Halide test reagent; forms curdy white AgCl precipitate with Cl⁻.",
  },
  {
    id: "bacl2",
    formula: "BaCl₂ (aq)",
    name: "Barium Chloride",
    category: "salt",
    colorHex: "#f8fafc",
    defaultPh: 6.8,
    flameColor: { name: "Apple Green (Ba²⁺)", hex: "#4ade80", wavelengthNm: 524 },
    description: "Toxic if swallowed. Sulfate test reagent; forms dense white BaSO₄ precipitate with SO₄²⁻.",
  },
  {
    id: "caco3",
    formula: "CaCO₃ (s)",
    name: "Calcium Carbonate Chips",
    category: "salt",
    colorHex: "#f1f5f9",
    defaultPh: 8.2,
    flameColor: { name: "Brick Red (Ca²⁺)", hex: "#ef4444", wavelengthNm: 622 },
    description: "Marble chips; fizzes CO₂ with acid and decomposes at high heat.",
  },
  {
    id: "phenolphthalein",
    formula: "In-H (ind)",
    name: "Phenolphthalein",
    category: "indicator_bio",
    colorHex: "#fdf4ff",
    defaultPh: 7.0,
    description: "pH indicator: colorless below pH 8.2, vivid magenta-pink in alkali.",
  },
  {
    id: "iodine",
    formula: "I₂ / KI",
    name: "Lugol's Iodine",
    category: "indicator_bio",
    colorHex: "#b45309",
    defaultPh: 6.8,
    description: "Amber reagent that complexes with starch helices to turn deep blue-black.",
  },
  {
    id: "starch_cells",
    formula: "(C₆H₁₀O₅)ₙ",
    name: "Onion Cells & Starch",
    category: "indicator_bio",
    colorHex: "#fef9c3",
    defaultPh: 7.0,
    description: "Plant epidermis specimen with amyloplast starch granules for microscopy.",
  },
];

export type BurnerSetting = "off" | "safety" | "roaring";

export interface VesselState {
  reagents: ReagentId[];
  burner: BurnerSetting;
  heatingSeconds: number;
  flameLoopActive: boolean;
  microscopeSlideTaken: boolean;
  microscopeZoom: 40 | 100 | 400;
}

export interface ReactionResult {
  liquidColorHex: string;
  precipitate: {
    present: boolean;
    formula: string;
    name: string;
    colorHex: string;
    crystalShape: "needles" | "curdy" | "granular" | "rhombic" | "amyloplast" | "none";
  };
  gasEvolved: {
    present: boolean;
    formula: string;
    name: string;
    rate: number; // 0..1
  };
  temperatureC: number;
  pH: number;
  equation: string;
  observation: string;
  flameTest: {
    active: boolean;
    label: string;
    colorHex: string;
    wavelengthNm: number;
  };
  microscopeSummary: string;
}

export interface LabOrder {
  id: string;
  title: string;
  client: string;
  xpReward: number;
  brief: string;
  hint: string;
  verify: (state: VesselState, result: ReactionResult) => { passed: boolean; progressNote: string };
}

/**
 * Pure deterministic chemical & physical reaction solver for the workbench.
 */
export function evaluateWorkbench(state: VesselState): ReactionResult {
  const has = (id: ReagentId) => state.reagents.includes(id);
  const countOf = (id: ReagentId) => state.reagents.filter((r) => r === id).length;

  // 1. Base temperature from ambient (25°C) + exothermic reaction + Bunsen burner heating
  let tempC = 25;
  if (has("hcl") && has("naoh")) {
    tempC += 16; // Exothermic neutralization ΔH = -57.3 kJ/mol
  }
  const burnerRate = state.burner === "roaring" ? 18 : state.burner === "safety" ? 7 : 0;
  // An aqueous vessel boils at about 100°C and cannot get hotter; only dry solid (marble chips alone) can reach furnace heat.
  const aqueous = state.reagents.some((r) => r !== "caco3");
  tempC = Math.min(aqueous ? 100 : 920, tempC + state.heatingSeconds * burnerRate);

  // 2. Acid-base pH calculation
  const acidUnits = countOf("hcl");
  const baseUnits = countOf("naoh");
  let pH = 7.0;
  if (acidUnits > baseUnits) {
    pH = Math.max(1.0, 2.2 - 0.4 * (acidUnits - baseUnits));
  } else if (baseUnits > acidUnits) {
    pH = Math.min(13.6, 12.0 + 0.5 * (baseUnits - acidUnits));
  } else if (acidUnits > 0 && acidUnits === baseUnits) {
    pH = 7.0;
  } else if (has("cuso4") || has("fecl3") || has("feso4")) {
    pH = 5.4;
  } else if (has("caco3")) {
    pH = 8.2;
  }

  // 3. Default appearance
  let liquidColorHex = "#dbeafe";
  let equation = "Add reagents to the vessel or ignite the Bunsen burner to begin.";
  let observation = "Clear aqueous medium at room temperature.";
  let precipitate: ReactionResult["precipitate"] = {
    present: false,
    formula: "",
    name: "",
    colorHex: "#ffffff",
    crystalShape: "none",
  };
  let gasEvolved: ReactionResult["gasEvolved"] = {
    present: false,
    formula: "",
    name: "",
    rate: 0,
  };

  // Single reagent base colors
  if (has("cuso4")) liquidColorHex = "#38bdf8";
  if (has("feso4")) liquidColorHex = "#86efac";
  if (has("fecl3")) liquidColorHex = "#f59e0b";
  if (has("iodine")) liquidColorHex = "#d97706";

  // A metal hydroxide only precipitates while alkali is in excess: acid at least equal to the NaOH neutralises it or dissolves it again.
  const alkaliExcess = baseUnits > acidUnits;

  // Reaction A: Copper(II) Sulfate + Sodium Hydroxide -> Cu(OH)2 (sky blue ppt)
  // And if heated above 80°C -> thermal dehydration to black CuO!
  if (has("cuso4") && has("naoh") && alkaliExcess) {
    if (tempC >= 80) {
      liquidColorHex = "#cbd5e1";
      precipitate = {
        present: true,
        formula: "CuO(s)",
        name: "Black Copper(II) Oxide",
        colorHex: "#1e293b",
        crystalShape: "granular",
      };
      equation = "Cu(OH)₂(s) —Δ (heat)→ CuO(s)↓ + H₂O(l)";
      observation =
        "Thermal dehydration complete! Pale blue Cu(OH)₂ precipitate turned jet-black as Copper(II) Oxide (CuO) formed.";
    } else {
      liquidColorHex = "#7dd3fc";
      precipitate = {
        present: true,
        formula: "Cu(OH)₂(s)",
        name: "Copper(II) Hydroxide",
        colorHex: "#0284c7",
        crystalShape: "needles",
      };
      equation = "CuSO₄(aq) + 2NaOH(aq) → Cu(OH)₂(s)↓ + Na₂SO₄(aq)";
      observation = "Sky-blue gelatinous precipitate of Copper(II) Hydroxide formed immediately.";
    }
  }
  // Reaction B: Iron(II) Sulfate + NaOH -> Dirty-green Fe(OH)2
  else if (has("feso4") && has("naoh") && alkaliExcess) {
    liquidColorHex = "#bbf7d0";
    precipitate = {
      present: true,
      formula: "Fe(OH)₂(s)",
      name: "Iron(II) Hydroxide",
      colorHex: "#15803d",
      crystalShape: "granular",
    };
    equation = "FeSO₄(aq) + 2NaOH(aq) → Fe(OH)₂(s)↓ + Na₂SO₄(aq)";
    observation = "Dirty-green gelatinous precipitate of Iron(II) Hydroxide formed.";
  }
  // Reaction C: Iron(III) Chloride + NaOH -> Reddish-brown Fe(OH)3
  else if (has("fecl3") && has("naoh") && alkaliExcess) {
    liquidColorHex = "#fde68a";
    precipitate = {
      present: true,
      formula: "Fe(OH)₃(s)",
      name: "Iron(III) Hydroxide",
      colorHex: "#9a3412",
      crystalShape: "granular",
    };
    equation = "FeCl₃(aq) + 3NaOH(aq) → Fe(OH)₃(s)↓ + 3NaCl(aq)";
    observation = "Reddish-brown precipitate of Iron(III) Hydroxide formed.";
  }
  // Reaction D: Silver Nitrate + Chloride (HCl, BaCl2, or FeCl3) -> White curdy AgCl precipitate
  else if (has("agno3") && (has("hcl") || has("bacl2") || has("fecl3"))) {
    liquidColorHex = "#f1f5f9";
    precipitate = {
      present: true,
      formula: "AgCl(s)",
      name: "Silver Chloride",
      colorHex: "#f8fafc",
      crystalShape: "curdy",
    };
    equation = "Ag⁺(aq) + Cl⁻(aq) → AgCl(s)↓";
    observation = "Dense curdy white precipitate of Silver Chloride (AgCl) formed — positive test for Cl⁻ halide ions.";
  }
  // Reaction D2: Silver Nitrate + NaOH (no chloride) -> brown Ag2O
  else if (has("agno3") && has("naoh") && alkaliExcess) {
    liquidColorHex = "#e7e5e4";
    precipitate = {
      present: true,
      formula: "Ag₂O(s)",
      name: "Silver(I) Oxide",
      colorHex: "#78350f",
      crystalShape: "granular",
    };
    equation = "2Ag⁺(aq) + 2OH⁻(aq) → Ag₂O(s)↓ + H₂O(l)";
    observation = "Brown precipitate of Silver(I) Oxide formed (AgOH is unstable and loses water at once).";
  }
  // Reaction E: Barium Chloride + Sulfate (CuSO4 or FeSO4) -> White BaSO4 precipitate
  else if (has("bacl2") && (has("cuso4") || has("feso4"))) {
    liquidColorHex = has("cuso4") ? "#7dd3fc" : "#bbf7d0";
    precipitate = {
      present: true,
      formula: "BaSO₄(s)",
      name: "Barium Sulfate",
      colorHex: "#ffffff",
      crystalShape: "rhombic",
    };
    equation = "Ba²⁺(aq) + SO₄²⁻(aq) → BaSO₄(s)↓";
    observation = "Insoluble white crystalline precipitate of Barium Sulfate (BaSO₄) settled at the bottom.";
  }
  // Reaction F: Calcium Carbonate + HCl -> Vigorous CO2 gas effervescence
  else if (has("caco3") && has("hcl")) {
    liquidColorHex = "#e2e8f0";
    gasEvolved = {
      present: true,
      formula: "CO₂(g)",
      name: "Carbon Dioxide",
      rate: 0.9,
    };
    equation = "CaCO₃(s) + 2HCl(aq) → CaCl₂(aq) + H₂O(l) + CO₂(g)↑";
    observation = "Vigorous effervescence! Colorless, odorless CO₂ gas bubbles rapidly escape the solution.";
  }
  // Reaction G: Thermal decomposition of CaCO3 needs furnace heat (about 840°C and above)
  else if (has("caco3") && tempC >= 840) {
    precipitate = {
      present: true,
      formula: "CaO(s)",
      name: "Calcium Oxide (Quicklime)",
      colorHex: "#f8fafc",
      crystalShape: "granular",
    };
    gasEvolved = {
      present: true,
      formula: "CO₂(g)",
      name: "Carbon Dioxide",
      rate: 0.65,
    };
    equation = "CaCO₃(s) —Δ (high heat)→ CaO(s) + CO₂(g)↑";
    observation = "Calcination in progress: Calcium Carbonate thermally decomposes into Quicklime (CaO) and CO₂ gas.";
  }
  // Reaction H: Iodine + Starch & Onion Cells -> Deep Blue-Black Starch-Iodine Complex
  else if (has("iodine") && has("starch_cells")) {
    liquidColorHex = "#1e1b4b";
    precipitate = {
      present: true,
      formula: "Amylose–I₅⁻",
      name: "Stained Blue-Black Amyloplasts",
      colorHex: "#312e81",
      crystalShape: "amyloplast",
    };
    equation = "I₂/KI(aq) + Amylose Starch → [Amylose–Polyiodide] (Blue-Black Complex)";
    observation = "Positive starch test! Iodine molecules slipped inside the amylose coils, turning deep blue-black.";
  }
  // Reaction I: Exothermic Acid-Base Neutralization + Phenolphthalein indicator
  else if (has("hcl") && has("naoh")) {
    if (has("phenolphthalein")) {
      liquidColorHex = pH >= 8.2 ? "#ec4899" : "#f8fafc";
    } else {
      liquidColorHex = "#e2e8f0";
    }
    equation = "HCl(aq) + NaOH(aq) → NaCl(aq) + H₂O(l)   (ΔH = -57.3 kJ/mol)";
    observation = `Exothermic neutralization! Vessel warmed to ${Math.round(tempC)}°C (pH ${pH.toFixed(1)}).`;
  } else if (has("phenolphthalein") && pH >= 8.2) {
    liquidColorHex = "#ec4899";
    equation = "In-H(aq) + OH⁻(aq) ⇌ In⁻(magenta) + H₂O(l)";
    observation = "Phenolphthalein indicator turned vivid magenta-pink in alkaline solution (pH > 8.2).";
  }

  // Boiling water steam bubbles when heated >= 100°C
  if (tempC >= 100 && !gasEvolved.present && state.reagents.length > 0) {
    gasEvolved = {
      present: true,
      formula: "H₂O(g)",
      name: "Water Vapor (Boiling)",
      rate: 0.75,
    };
  }

  // 4. Flame Test Detection (when burner is on and flame loop is active)
  let flameTest: ReactionResult["flameTest"] = {
    active: false,
    label: "No Flame Test Active",
    colorHex: "#38bdf8",
    wavelengthNm: 0,
  };
  if (state.burner !== "off" && state.flameLoopActive) {
    // Sodium's yellow masks every other colour; iron salts give no clean flame colour so they come last.
    const order: ReagentId[] = ["naoh", "bacl2", "cuso4", "caco3", "fecl3", "feso4"];
    const flameReagent = order.map((id) => REAGENTS.find((r) => r.id === id)).find((r) => r && r.flameColor && state.reagents.includes(r.id));
    if (flameReagent?.flameColor) {
      flameTest = {
        active: true,
        label: flameReagent.flameColor.name,
        colorHex: flameReagent.flameColor.hex,
        wavelengthNm: flameReagent.flameColor.wavelengthNm,
      };
    } else {
      flameTest = {
        active: true,
        label: "Clean Blue Bunsen Flame (No Metal Cation Emission)",
        colorHex: "#38bdf8",
        wavelengthNm: 475,
      };
    }
  }

  // 5. Microscope Summary
  let microscopeSummary = "No slide loaded yet. Click 'Inspect Under Microscope' to examine your sample.";
  if (state.microscopeSlideTaken) {
    if (precipitate.present) {
      microscopeSummary = `${state.microscopeZoom}x Magnification: Observing ${precipitate.name} (${precipitate.formula}) — ${precipitate.crystalShape} micro-structures clearly resolved. Thermal agitation matches ${Math.round(tempC)}°C.`;
    } else if (has("starch_cells")) {
      microscopeSummary = `${state.microscopeZoom}x Magnification: Hexagonal onion epidermal cell walls and nuclei visible. Add Lugol's Iodine to stain the starch granules blue-black!`;
    } else if (state.reagents.length > 0) {
      microscopeSummary = `${state.microscopeZoom}x Magnification: Homogeneous aqueous electrolyte solution (pH ${pH.toFixed(1)}, ${Math.round(tempC)}°C) with dissolved ions in Brownian motion.`;
    } else {
      microscopeSummary = `${state.microscopeZoom}x Magnification: Blank glass slide. Add chemicals to the beaker first.`;
    }
  }

  return {
    liquidColorHex,
    precipitate,
    gasEvolved,
    temperatureC: Math.round(tempC),
    pH: +pH.toFixed(1),
    equation,
    observation,
    flameTest,
    microscopeSummary,
  };
}

/**
 * 6 Gamified "Cooking Fever"-Style Verification Orders for Students to Complete & Verify!
 */
export const LAB_VERIFICATION_ORDERS: LabOrder[] = [
  {
    id: "order_cuoh2",
    title: "Order #1: Sky-Blue Copper(II) Hydroxide Precipitate",
    client: "Qualitative Analysis Lab",
    xpReward: 120,
    brief: "Mix Copper(II) Sulfate (CuSO₄) with Sodium Hydroxide (NaOH), then inspect the blue precipitate under the Microscope.",
    hint: "Tap CuSO₄ + NaOH on the reagent shelf, keep heat below 80°C, and click 'Inspect Slide in Microscope'.",
    verify: (state, res) => ({
      passed: res.precipitate.formula === "Cu(OH)₂(s)" && state.microscopeSlideTaken,
      progressNote:
        res.precipitate.formula === "Cu(OH)₂(s)"
          ? "Cu(OH)₂ synthesized! Now click 'Inspect Slide in Microscope' to verify its needle crystals."
          : "Add CuSO₄ and NaOH to the beaker.",
    }),
  },
  {
    id: "order_cuo_fire",
    title: "Order #2: Thermal Dehydration in Fire (Black CuO)",
    client: "Inorganic Synthesis Station",
    xpReward: 150,
    brief: "Heat your Cu(OH)₂ precipitate over the Roaring Blue Bunsen Burner until it dehydrates into jet-black Copper(II) Oxide (CuO) at ≥80°C!",
    hint: "Mix CuSO₄ + NaOH, switch the Bunsen Burner to 'Roaring Blue Flame', and heat until Temp ≥ 80°C.",
    verify: (_state, res) => ({
      passed: res.precipitate.formula === "CuO(s)" && res.temperatureC >= 80,
      progressNote:
        res.precipitate.formula === "CuO(s)"
          ? "Verified! Black CuO formed by thermal dehydration."
          : "Mix CuSO₄ + NaOH and turn on the Roaring Blue Flame until Temp reaches 80°C+.",
    }),
  },
  {
    id: "order_halide_agcl",
    title: "Order #3: Halide Detective (White Curdy AgCl + 400x Microscope)",
    client: "Forensic Analytical Lab",
    xpReward: 140,
    brief: "Prove the presence of Chloride (Cl⁻) ions using Silver Nitrate (AgNO₃) and verify the curdy white AgCl crystals at 400x magnification.",
    hint: "Mix HCl + AgNO₃, click 'Inspect Slide in Microscope', and switch zoom to 400x.",
    verify: (state, res) => ({
      passed: res.precipitate.formula === "AgCl(s)" && state.microscopeSlideTaken && state.microscopeZoom === 400,
      progressNote:
        res.precipitate.formula === "AgCl(s)"
          ? "AgCl precipitate formed! Open the Microscope and select 400x zoom."
          : "Mix HCl (or BaCl₂) with AgNO₃.",
    }),
  },
  {
    id: "order_caco3_flame",
    title: "Order #4: CO₂ Effervescence & Brick-Red Ca²⁺ Flame Test",
    client: "Spectroscopy & Gas Lab",
    xpReward: 160,
    brief: "React Calcium Carbonate (CaCO₃) with HCl to fizz CO₂ gas, then dip the Flame Test Loop into the roaring burner to verify the 622nm Brick-Red Ca²⁺ flame!",
    hint: "Add CaCO₃ + HCl, turn the Bunsen Burner on, and toggle 'Flame Test Loop' ON.",
    verify: (_state, res) => ({
      passed: res.gasEvolved.formula === "CO₂(g)" && res.flameTest.active && res.flameTest.wavelengthNm === 622,
      progressNote:
        res.gasEvolved.formula === "CO₂(g)"
          ? "CO₂ fizzing! Now turn on the Bunsen Burner and click 'Flame Test Loop' to see the Brick-Red Ca²⁺ flame."
          : "Add CaCO₃ chips and HCl to the beaker.",
    }),
  },
  {
    id: "order_starch_iodine",
    title: "Order #5: Cellular Starch Staining Under Microscope",
    client: "Cell Biology & Biochemistry",
    xpReward: 130,
    brief: "Stain Onion Epidermis & Starch cells with Lugol's Iodine (I₂/KI) to form the deep blue-black polyiodide complex and view under the Microscope.",
    hint: "Add 'Onion Cells & Starch' + 'Lugol's Iodine', then click 'Inspect Slide in Microscope'.",
    verify: (state, res) => ({
      passed: res.precipitate.formula === "Amylose–I₅⁻" && state.microscopeSlideTaken,
      progressNote:
        res.precipitate.formula === "Amylose–I₅⁻"
          ? "Blue-black complex formed! Click 'Inspect Slide in Microscope' to see the stained amyloplasts."
          : "Mix Onion Cells & Starch with Lugol's Iodine.",
    }),
  },
  {
    id: "order_exo_neutral",
    title: "Order #6: Exothermic Neutralization & Pink Indicator Check",
    client: "Thermochemistry Bench",
    xpReward: 150,
    brief: "Trigger an exothermic reaction between HCl and excess NaOH with Phenolphthalein indicator so the vessel warms above 35°C and turns vivid magenta-pink!",
    hint: "Add HCl once, NaOH twice, and Phenolphthalein once.",
    verify: (state, res) => ({
      passed:
        state.reagents.includes("hcl") &&
        state.reagents.includes("naoh") &&
        state.reagents.includes("phenolphthalein") &&
        res.pH >= 8.2 &&
        res.temperatureC >= 35,
      progressNote: "Add HCl + Phenolphthalein + 2x NaOH so the solution warms >35°C and turns magenta-pink.",
    }),
  },
];
