export interface LabVerificationResult {
  success: boolean;
  detail: string;
  parameters: Record<string, unknown>;
}

export function verifyOhmsLaw(params: {
  voltage: number;
  resistance: number;
  targetCurrent?: number;
  maxPower?: number;
}): LabVerificationResult {
  const targetCurrent = params.targetCurrent ?? 0.12; // 120 mA
  const maxPower = params.maxPower ?? 1.5; // 1.5 Watts

  const current = params.voltage / Math.max(1, params.resistance);
  const power = Math.pow(current, 2) * params.resistance;

  const isTargetCurrent = Math.abs(current - targetCurrent) <= 0.015;
  const isPowerSafe = power <= maxPower;
  const success = isTargetCurrent && isPowerSafe;

  const detail = success
    ? `Verified: Current ${current.toFixed(3)} A is within tolerance and power dissipation ${power.toFixed(2)} W is safe.`
    : `Verification failed: Current ${current.toFixed(3)} A (target ${targetCurrent} A) or power ${power.toFixed(2)} W (max ${maxPower} W).`;

  return {
    success,
    detail,
    parameters: {
      voltage: params.voltage,
      resistance: params.resistance,
      computedCurrent: current,
      computedPower: power,
      targetCurrent,
      maxPower,
    },
  };
}

export function verifyRcFilter(params: {
  resistance: number;
  capacitanceMicro: number;
  targetCutoff?: number;
}): LabVerificationResult {
  const targetCutoff = params.targetCutoff ?? 1000; // 1000 Hz target

  const capacitanceFarads = params.capacitanceMicro * 1e-6;
  const cutoffFrequency = 1 / (2 * Math.PI * params.resistance * capacitanceFarads);

  const percentageError = Math.abs(cutoffFrequency - targetCutoff) / targetCutoff;
  const success = percentageError <= 0.05;

  const detail = success
    ? `Verified: Cutoff frequency ${cutoffFrequency.toFixed(1)} Hz is within 5% of target ${targetCutoff} Hz.`
    : `Verification failed: Cutoff frequency ${cutoffFrequency.toFixed(1)} Hz exceeds 5% error margin for target ${targetCutoff} Hz.`;

  return {
    success,
    detail,
    parameters: {
      resistance: params.resistance,
      capacitanceMicro: params.capacitanceMicro,
      cutoffFrequency,
      targetCutoff,
      percentageError,
    },
  };
}

export function verifyProjectile(params: {
  angle: number;
  speed: number;
  targetDistance?: number;
  tolerance?: number;
}): LabVerificationResult {
  const targetDistance = params.targetDistance ?? 120; // 120 meters
  const tolerance = params.tolerance ?? 6; // +/- 6 meters
  const g = 9.8; // m/s^2

  const angleRad = (params.angle * Math.PI) / 180;
  const range = (Math.pow(params.speed, 2) * Math.sin(2 * angleRad)) / g;

  const success = Math.abs(range - targetDistance) <= tolerance;

  const detail = success
    ? `Verified: Projectile landed at ${range.toFixed(1)} m, hitting the target within ±${tolerance} m.`
    : `Verification failed: Projectile landed at ${range.toFixed(1)} m (target ${targetDistance} ± ${tolerance} m).`;

  return {
    success,
    detail,
    parameters: {
      angle: params.angle,
      speed: params.speed,
      range,
      targetDistance,
      tolerance,
    },
  };
}

export function verifyLogicGates(params: {
  testedCombinations: string[];
}): LabVerificationResult {
  const required = ["0_0", "0_1", "1_0", "1_1"];
  const testedSet = new Set(params.testedCombinations || []);
  const allFourTested = required.every((k) => testedSet.has(k));

  return {
    success: allFourTested,
    detail: allFourTested
      ? "Verified: Complete 4-state Half Adder truth table successfully tested."
      : `Verification failed: Only ${testedSet.size}/4 truth table states were tested.`,
    parameters: {
      testedCombinations: Array.from(testedSet),
      missing: required.filter((k) => !testedSet.has(k)),
    },
  };
}

export function verifyLab(
  labType: string,
  rawParams: Record<string, unknown>
): LabVerificationResult {
  switch (labType) {
    case "ohms_law":
      return verifyOhmsLaw({
        voltage: Number(rawParams.voltage ?? 0),
        resistance: Number(rawParams.resistance ?? 1),
        targetCurrent: rawParams.targetCurrent !== undefined ? Number(rawParams.targetCurrent) : undefined,
        maxPower: rawParams.maxPower !== undefined ? Number(rawParams.maxPower) : undefined,
      });

    case "rc_filter":
      return verifyRcFilter({
        resistance: Number(rawParams.resistance ?? 1000),
        capacitanceMicro: Number(rawParams.capacitanceMicro ?? 0.1),
        targetCutoff: rawParams.targetCutoff !== undefined ? Number(rawParams.targetCutoff) : undefined,
      });

    case "projectile":
      return verifyProjectile({
        angle: Number(rawParams.angle ?? 45),
        speed: Number(rawParams.speed ?? 30),
        targetDistance: rawParams.targetDistance !== undefined ? Number(rawParams.targetDistance) : undefined,
        tolerance: rawParams.tolerance !== undefined ? Number(rawParams.tolerance) : undefined,
      });

    case "logic_gates":
      return verifyLogicGates({
        testedCombinations: Array.isArray(rawParams.testedCombinations)
          ? rawParams.testedCombinations.map(String)
          : [],
      });

    default:
      return {
        success: false,
        detail: `Unknown or unconfigured lab apparatus: ${labType}`,
        parameters: rawParams,
      };
  }
}
