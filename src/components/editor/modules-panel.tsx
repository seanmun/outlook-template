"use client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, GripVertical, Plus, Smartphone, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { docOps, type Destination } from "@/lib/editor/state";
import { COLUMNS_TYPE, MAX_BLOCKS_PER_COLUMN, locateModule, newModuleId, type ModuleInstance } from "@/lib/email/document";
import { findContentIssues } from "@/lib/email/issues";
import { COLUMN_LAYOUTS, COLUMN_LAYOUT_IDS, type ColumnLayout } from "@/lib/email/modules/columns";
import { getModule, modulesForBrand } from "@/lib/email/registry";
import { useEditor } from "./context";
import { useDrag, useDragSource } from "./drag";

function moduleLabel(m: ModuleInstance): string {
  const c = m.content as Record<string, unknown>;
  if (m.type === "text" && typeof c.headline === "string" && c.headline) return c.headline;
  if (m.type === "cta" && typeof c.label === "string") return c.label;
  if (m.type === "header" && typeof c.wordmark === "string") return c.wordmark;
  if (m.type === COLUMNS_TYPE) return COLUMN_LAYOUTS[m.settings.layout as ColumnLayout]?.label ?? "";
  return "";
}

/** A small picture of a column layout, used on the layout buttons and row headers. */
function LayoutGlyph({ layout }: { layout: ColumnLayout }) {
  return (
    <span className="flex h-5 w-10 gap-0.5" aria-hidden>
      {COLUMN_LAYOUTS[layout].ratios.map((r, i) => (
        <span key={i} className="rounded-[2px] bg-current opacity-60" style={{ flex: r }} />
      ))}
    </span>
  );
}

type ColumnTarget = { parentId: string; column: number };

function WarnBadge({ count }: { count: number }) {
  return count > 0 ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-800">{count}</span> : null;
}

/** One block inside a column: click to select; the selected block gets move and remove controls. */
function NestedBlock({ m, row, column, index, warn }: { m: ModuleInstance; row: ModuleInstance; column: number; index: number; warn: number }) {
  const { state, dispatch, change } = useEditor();
  const def = getModule(m.type);
  const selected = state.selectedId === m.id;
  const columns = row.columns ?? [];
  const blocks = columns[column].blocks;
  const move = (dest: Destination) => change((d) => docOps.moveTo(d, m.id, dest), { select: m.id });
  const iconBtn = "rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <li className={`rounded border bg-white text-xs ${selected ? "border-blue-500 ring-1 ring-blue-500" : ""}`}>
      <button className="block w-full min-w-0 px-1.5 py-1 text-left" onClick={() => dispatch({ type: "select", id: m.id })}>
        <span className="block truncate font-medium">
          {def?.name ?? m.type}
          <WarnBadge count={warn} />
        </span>
        {moduleLabel(m) && <span className="block truncate text-[11px] text-neutral-500">{moduleLabel(m)}</span>}
      </button>
      {selected && (
        <div className="flex flex-wrap items-center gap-0.5 border-t px-1 py-0.5">
          <button className={iconBtn} aria-label="Move up" disabled={index === 0} onClick={() => move({ parentId: row.id, column, index: index - 1 })}>
            <ArrowUp className="size-3.5" />
          </button>
          <button className={iconBtn} aria-label="Move down" disabled={index === blocks.length - 1} onClick={() => move({ parentId: row.id, column, index: index + 1 })}>
            <ArrowDown className="size-3.5" />
          </button>
          <button className={iconBtn} aria-label="Move to the column on the left" disabled={column === 0} onClick={() => move({ parentId: row.id, column: column - 1, index: null })}>
            <ArrowLeft className="size-3.5" />
          </button>
          <button className={iconBtn} aria-label="Move to the column on the right" disabled={column === columns.length - 1} onClick={() => move({ parentId: row.id, column: column + 1, index: null })}>
            <ArrowRight className="size-3.5" />
          </button>
          <button className={`${iconBtn} ml-auto`} aria-label="Remove" onClick={() => change((d) => docOps.remove(d, m.id))}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function Row({ m, index, warns, target, onTarget }: { m: ModuleInstance; index: number; warns: Map<string, number>; target: ColumnTarget | null; onTarget: (t: ColumnTarget | null) => void }) {
  const { state, dispatch, change } = useEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const def = getModule(m.type);
  const selected = state.selectedId === m.id;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border bg-white text-sm ${selected ? "border-blue-500 ring-1 ring-blue-500" : ""} ${isDragging ? "z-10 shadow" : ""}`}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <button className="cursor-grab touch-none p-1 text-neutral-400" aria-label={`Reorder ${def?.name ?? m.type} (position ${index + 1})`} {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => dispatch({ type: "select", id: m.id })}>
          <div className="flex items-center gap-1.5 truncate font-medium">
            {m.columns && <LayoutGlyph layout={m.settings.layout as ColumnLayout} />}
            {def?.name ?? m.type}
            <WarnBadge count={warns.get(m.id) ?? 0} />
          </div>
          <div className="truncate text-xs text-neutral-500">{moduleLabel(m)}</div>
        </button>
        <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={() => { const id = newModuleId(); change((d) => docOps.duplicate(d, m.id, id), { select: id }); }}>
          <Copy />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => change((d) => docOps.remove(d, m.id))}>
          <Trash2 />
        </Button>
      </div>
      {m.columns && (
        <div className="flex gap-1 border-t bg-neutral-50 p-1.5">
          {m.columns.map((col, ci) => {
            const active = target?.parentId === m.id && target.column === ci;
            const full = col.blocks.length >= MAX_BLOCKS_PER_COLUMN;
            return (
              <div key={ci} className="min-w-0 space-y-1" style={{ flex: COLUMN_LAYOUTS[m.settings.layout as ColumnLayout].ratios[ci] }}>
                <ul className="space-y-1">
                  {col.blocks.map((b, bi) => (
                    <NestedBlock key={b.id} m={b} row={m} column={ci} index={bi} warn={warns.get(b.id) ?? 0} />
                  ))}
                </ul>
                <button
                  disabled={full}
                  aria-pressed={active}
                  aria-label={`Add blocks to column ${ci + 1}`}
                  title={full ? "This column is full" : active ? "Blocks you add go here. Click to stop." : "Add blocks to this column"}
                  onClick={() => onTarget(active ? null : { parentId: m.id, column: ci })}
                  className={`flex w-full items-center justify-center gap-1 rounded border border-dashed px-1 py-1.5 text-[11px] transition disabled:opacity-40 ${
                    active ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Plus className="size-3" /> {active ? "Adding here" : col.blocks.length ? "Add" : "Empty: add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

export function ModulesPanel() {
  const { state, change, brand } = useEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const catalog = modulesForBrand(brand);
  const blocks = catalog.filter((d) => d.type !== COLUMNS_TYPE);
  const columnsAvailable = catalog.some((d) => d.type === COLUMNS_TYPE);
  const [picked, setPicked] = useState<ColumnTarget | null>(null);
  const drag = useDrag();
  const dragSource = useDragSource();
  const warns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of findContentIssues(state.doc)) if (i.moduleId) counts.set(i.moduleId, (counts.get(i.moduleId) ?? 0) + 1);
    return counts;
  }, [state.doc]);

  // The picked column only counts while that row still exists and has that column.
  const target = picked && state.doc.modules.find((m) => m.id === picked.parentId)?.columns?.[picked.column] ? picked : null;
  const selectedAt = state.selectedId ? locateModule(state.doc, state.selectedId) : null;
  const selectedRow = selectedAt ? state.doc.modules[selectedAt.parentId === null ? selectedAt.index : state.doc.modules.findIndex((m) => m.id === selectedAt.parentId)] : null;

  /** Where a new block goes: the picked column, else next to the selection, else the end. */
  function blockDestination(): { dest: Destination; label: string } {
    if (target) return { dest: { ...target, index: null }, label: `column ${target.column + 1} of the highlighted row` };
    if (selectedAt && selectedAt.parentId !== null) return { dest: { ...selectedAt, index: selectedAt.index + 1 }, label: "below the selected block, in its column" };
    if (selectedAt && selectedRow?.columns) {
      const empty = selectedRow.columns.findIndex((c) => c.blocks.length === 0);
      if (empty >= 0) return { dest: { parentId: selectedRow.id, column: empty, index: null }, label: `the empty column ${empty + 1} of the selected row` };
    }
    if (selectedAt) return { dest: { parentId: null, index: selectedAt.index + 1 }, label: "below the selected module" };
    return { dest: { parentId: null, index: null }, label: "the end of the email" };
  }
  const where = blockDestination();

  function addBlock(type: string) {
    const id = newModuleId();
    // Keep filling the picked column; otherwise select the new block so the next one lands below it.
    change((d) => docOps.add(d, type, where.dest, id), { select: target ? state.selectedId : id });
  }

  function addColumns(layout: ColumnLayout) {
    const id = newModuleId();
    const after = selectedAt ? (selectedAt.parentId === null ? selectedAt.index : state.doc.modules.findIndex((m) => m.id === selectedAt.parentId)) + 1 : null;
    change((d) => docOps.add(d, COLUMNS_TYPE, { parentId: null, index: after }, id, { layout }), { select: id });
    setPicked({ parentId: id, column: 0 });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const to = state.doc.modules.findIndex((m) => m.id === e.over!.id);
    change((d) => docOps.move(d, String(e.active.id), to));
  }

  return (
    <div className="space-y-5 p-3">
      {columnsAvailable && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Add a row of columns</h3>
          <div className="grid grid-cols-4 gap-1.5">
            {COLUMN_LAYOUT_IDS.map((layout) => (
              <button
                key={layout}
                {...dragSource({ kind: "new", type: COLUMNS_TYPE, settings: { layout } }, COLUMN_LAYOUTS[layout].label)}
                onClick={() => !drag.consumeClick() && addColumns(layout)}
                aria-label={COLUMN_LAYOUTS[layout].label}
                title={COLUMN_LAYOUTS[layout].label}
                className="flex cursor-grab items-center justify-center rounded-md border p-2 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
              >
                <LayoutGlyph layout={layout} />
              </button>
            ))}
          </div>
          <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-neutral-500">
            <Smartphone className="mt-px size-3 shrink-0" /> Columns stay side by side on phones; Outlook templates cannot stack them.
          </p>
        </section>
      )}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Add a block</h3>
        <p className="mb-2 text-xs text-neutral-500">
          Drag onto the email, or click to add to <span className={target ? "font-medium text-blue-700" : "font-medium text-neutral-700"}>{where.label}</span>.
        </p>
        <div className="grid gap-1.5">
          {blocks.map((def) => (
            <button
              key={def.type}
              {...dragSource({ kind: "new", type: def.type }, def.name)}
              onClick={() => !drag.consumeClick() && addBlock(def.type)}
              className="flex cursor-grab items-start gap-2 rounded-md border p-2 text-left text-sm hover:border-neutral-400"
            >
              <GripVertical className="mt-0.5 size-4 shrink-0 text-neutral-400" />
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
          <p className="text-xs text-neutral-500">Nothing here yet. Add a block above or describe the email in the AI tab.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={state.doc.modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {state.doc.modules.map((m, i) => (
                  <Row key={m.id} m={m} index={i} warns={warns} target={target} onTarget={setPicked} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
}
