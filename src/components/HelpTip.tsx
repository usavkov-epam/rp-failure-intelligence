import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip>
    <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={label}><Info /></Button></TooltipTrigger>
    <TooltipContent className="max-w-80 text-pretty">{children}</TooltipContent>
  </Tooltip>;
}
