import { AssistantWorkspace } from "./AssistantWorkspace";

/** Shares the selected server conversation with the full assistant page. */
export function AssistantPanel({ onOpenFull }: { onOpenFull?: () => void }) { return <AssistantWorkspace compact onOpenFull={onOpenFull} />; }
