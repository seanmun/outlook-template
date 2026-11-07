"use client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { docOps } from "@/lib/editor/state";
import { newModuleId, type ModuleInstance } from "@/lib/email/document";
import { findContentIssues } from "@/lib/email/issues";
import { getModule, modulesForBrand } from "@/lib/email/registry";
import { useMemo } from "react";
import { useEditor } from "./context";

function moduleLabel(m: ModuleInstance): string {
  const c = m.content as Record<string, unknown>;
  if (m.type === "text" && typeof c.headline === "string" && c.headline) return c.headline;
  if (m.type === "cta" && typeof c.label === "string") return c.label;
  if (m.type === "header" && typeof c.wordmark === "string") return c.wordmark;
  return "";
}

function Row({ m, index, warn }: { m: ModuleInstance; index: number; warn: number }) {
  const { state, dispatch, change } = useEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const def = getModule(m.type);
  const selected = state.selectedId === m.id;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-md border bg-white px-1 py-1 text-sm ${selected ? "border-blue-500 ring-1 ring-blue-500" : ""} ${isDragging ? "z-10 shadow" : ""}`}
    >
      <button className="cursor-grab touch-none p-1 text-neutral-400" aria-label={`Reorder ${def?.name ?? m.type} (position ${index + 1})`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => dispatch({ type: "select", id: m.id })}>
        <div className="truncate font-medium">
          {def?.name ?? m.type}
          {warn > 0 && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-800">{warn}</span>}
        </div>
        <div className="truncate text-xs text-neutral-500">{moduleLabel(m)}</div>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={() => { const id = newModuleId(); change((d) => docOps.duplicate(d, m.id, id), { select: id }); }}>
        <Copy />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => change((d) => docOps.remove(d, m.id))}>
        <Trash2 />
      </Button>
    </li>
  );
}

export function ModulesPanel() {
  const { state, change, brand } = useEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const catalog = modulesForBrand(brand);
  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of findContentIssues(state.doc)) if (i.moduleId) counts.set(i.moduleId, (counts.get(i.moduleId) ?? 0) + 1);
    return counts;
  }, [state.doc]);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const to = state.doc.modules.findIndex((m) => m.id === e.over!.id);
    change((d) => docOps.move(d, String(e.active.id), to));
  }

  function add(type: string) {
    const sel = state.doc.modules.findIndex((m) => m.id === state.selectedId);
    const id = newModuleId();
    change((d) => docOps.add(d, type, sel >= 0 ? sel + 1 : null, id), { select: id });
  }

  return (
    <div className="space-y-5 p-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Add module</h3>
        <p className="mb-2 text-xs text-neutral-500">Inserted after the selected module, or at the end.</p>
        <div className="grid gap-1.5">
          {catalog.map((def) => (
            <button key={def.type} onClick={() => add(def.type)} className="flex items-start gap-2 rounded-md border p-2 text-left text-sm hover:border-neutral-400">
              <Plus className="mt-0.5 size-4 shrink-0 text-neutral-400" />
              <span>
                <span className="font-medium">{def.name}</span>
                <span className="block text-xs text-neutral-500">{def.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Email structure</h3>
        {state.doc.modules.length === 0 ? (
          <p className="text-xs text-neutral-500">No modules yet. Add one above or describe the email in the AI tab.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={state.doc.modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {state.doc.modules.map((m, i) => (
                  <Row key={m.id} m={m} index={i} warn={issueCounts.get(m.id) ?? 0} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
}
