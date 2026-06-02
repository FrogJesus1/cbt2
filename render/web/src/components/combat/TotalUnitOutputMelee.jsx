/** @deprecated Use TotalUnitOutputPanel with phase="melee" */
import { TotalUnitOutputPanel } from "./TotalUnitOutputPanel";
export function TotalUnitOutputMelee(props) {
  return <TotalUnitOutputPanel {...props} phase="melee" />;
}
