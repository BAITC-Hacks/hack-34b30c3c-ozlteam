import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Fuel,
  MapPin,
  PackageMinus,
  ParkingCircle,
  Coffee,
  ShieldCheck,
  Snowflake,
  Split,
  Stamp,
  Truck,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import type { EventKind } from "../types";

/** Один значок на вид события — чтобы лента читалась по форме, а не только по тексту. */
export function eventIcon(kind: EventKind, size = 15): ReactNode {
  const props = { size, strokeWidth: 1.8 } as const;
  switch (kind) {
    case "depart":
      return <Truck {...props} />;
    case "checkpoint":
      return <MapPin {...props} />;
    case "border":
      return <Flag {...props} />;
    case "customs":
      return <Stamp {...props} />;
    case "customsDone":
      return <ShieldCheck {...props} />;
    case "speeding":
      return <AlertTriangle {...props} />;
    case "stop":
      return <ParkingCircle {...props} />;
    case "rest":
      return <Coffee {...props} />;
    case "fuel":
      return <Fuel {...props} />;
    case "breakdown":
      return <Wrench {...props} />;
    case "detour":
      return <Split {...props} />;
    case "coldChain":
      return <Snowflake {...props} />;
    case "arrive":
      return <CheckCircle2 {...props} />;
    case "shortage":
      return <PackageMinus {...props} />;
  }
}
