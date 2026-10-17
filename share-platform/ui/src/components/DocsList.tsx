import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "./Markdown";

export type DocRef = { key: string; name: string; label: string; url: string };

/** Read-only Markdown files, fetched when first opened. */
export function DocsList({ docs }: { docs: DocRef[] }) {
  const [text, setText] = useState<Record<string, string>>({});
  if (!docs.length) return null;
  const load = (keys: string[]) => keys.forEach(async (k) => {
    if (text[k] !== undefined) return;
    const d = docs.find((x) => x.key === k);
    if (!d) return;
    const body = await fetch(d.url, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "Couldn't load this file."));
    setText((s) => ({ ...s, [k]: body }));
  });
  return (
    <section className="mt-8">
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Notes</h3>
      <Accordion type="multiple" className="rounded-xl border bg-card" onValueChange={load}>
        {docs.map((d) => (
          <AccordionItem key={d.key} value={d.key} className="px-4">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-muted-foreground" />
                {d.name}
                <span className="text-xs font-normal text-muted-foreground">{d.label}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {text[d.key] === undefined ? <Skeleton className="h-16 w-full" /> : <Markdown text={text[d.key]} />}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
