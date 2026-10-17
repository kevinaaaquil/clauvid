import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  BoldIcon, CheckIcon, CopyIcon, Heading1Icon, Heading2Icon, Heading3Icon, ItalicIcon, ListIcon,
  MessageSquarePlusIcon, PilcrowIcon, ScissorsLineDashedIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from "@/components/ui/context-menu";

type State = { bold: boolean; italic: boolean; list: boolean; level: 0 | 1 | 2 | 3; hasText: boolean };

/**
 * Right-click menu on the script. Formatting from view mode switches to edit mode first,
 * so the change lands as an ordinary unsaved edit.
 */
export function ScriptContextMenu({ editor, canEdit, canFormat = canEdit, editing, startEditing, onComment, children }: {
  editor: Editor; canEdit: boolean; canFormat?: boolean; editing: boolean; startEditing: () => void; onComment: () => void; children: ReactNode;
}) {
  const [s, setS] = useState<State>({ bold: false, italic: false, list: false, level: 0, hasText: false });

  const read = () => setS({
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), list: editor.isActive("bulletList"),
    level: ([1, 2, 3] as const).find((l) => editor.isActive("heading", { level: l })) ?? 0,
    hasText: !editor.state.selection.empty || !!window.getSelection()?.toString(),
  });

  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    if (!editing) { editor.setEditable(true); startEditing(); }
    fn(editor.chain().focus()).run();
  };
  const copy = async () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n") || window.getSelection()?.toString() || "";
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy"); }
  };

  const Mark = ({ on }: { on: boolean }) => (on ? <CheckIcon className="ml-auto text-brand" /> : null);
  const item = "gap-2.5 rounded-md px-2 py-1.5";

  return (
    <ContextMenu onOpenChange={(o) => o && read()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 rounded-xl p-1.5">
        {canEdit && (
          <>
            <ContextMenuItem className={item} disabled={!s.hasText} onSelect={onComment}>
              <MessageSquarePlusIcon />Comment
            </ContextMenuItem>
          </>
        )}
        {canFormat && (
          <>
            <ContextMenuSeparator className="my-1" />
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleBold())}>
              <BoldIcon />Bold<ContextMenuShortcut className="ml-auto">⌘B</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleItalic())}>
              <ItalicIcon />Italic<ContextMenuShortcut className="ml-auto">⌘I</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator className="my-1" />
            <ContextMenuItem className={item} onSelect={() => run((c) => c.setParagraph())}><PilcrowIcon />Normal text<Mark on={s.level === 0 && !s.list} /></ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleHeading({ level: 1 }))}><Heading1Icon />Heading 1<Mark on={s.level === 1} /></ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleHeading({ level: 2 }))}><Heading2Icon />Heading 2<Mark on={s.level === 2} /></ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleHeading({ level: 3 }))}><Heading3Icon />Heading 3<Mark on={s.level === 3} /></ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.toggleBulletList())}><ListIcon />Bullet list<Mark on={s.list} /></ContextMenuItem>
            <ContextMenuItem className={item} onSelect={() => run((c) => c.setHorizontalRule())}><ScissorsLineDashedIcon />Page break</ContextMenuItem>
            <ContextMenuSeparator className="my-1" />
          </>
        )}
        <ContextMenuItem className={item} disabled={!s.hasText} onSelect={copy}>
          <CopyIcon />Copy<ContextMenuShortcut className="ml-auto">⌘C</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
