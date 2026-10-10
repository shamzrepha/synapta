import React from "react";
import { OhmsLawLab, LabProps } from "./ohms-law-lab";
import { RcFilterLab } from "./rc-filter-lab";
import { LogicGatesLab } from "./logic-gates-lab";
import { ProjectileLab } from "./projectile-lab";
import { NoneLab } from "./none-lab";

export type { LabProps };

export const LAB_REGISTRY: Record<string, React.ComponentType<LabProps>> = {
  ohms_law: OhmsLawLab,
  rc_filter: RcFilterLab,
  logic_gates: LogicGatesLab,
  projectile: ProjectileLab,
  none: NoneLab,
};

export { OhmsLawLab, RcFilterLab, LogicGatesLab, ProjectileLab, NoneLab };
