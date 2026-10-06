"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, closestCenter,
  useDraggable, useDroppable, useSensor, useSensors, type KeyboardCoordinateGetter } from "@dnd-kit/core";

export type DecisionDrop = "gating" | "open" | "resolved";
const order: DecisionDrop[] = ["gating", "open", "resolved"];
const Allowed = createContext(new Set<string>());
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return;
  event.preventDefault();
  const available = order.filter(target => context.droppableRects.has(`decision-drop-${target}`));
  if (!available.length) return;
  const current = available.indexOf(String(context.over?.id).replace("decision-drop-", "") as DecisionDrop);
  const step = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
  const next = (current + step + available.length) % available.length;
  const rect = context.droppableRects.get(`decision-drop-${available[next]}`);
  if (rect) return { x: rect.left + rect.width / 2 - (context.collisionRect?.width ?? 0) / 2,
    y: rect.top + rect.height / 2 - (context.collisionRect?.height ?? 0) / 2 };
};

export function DecisionDragProvider({ decisions, onMove, children }: {
  decisions: { id: string; title: string }[]; onMove: (id: string, target: DecisionDrop) => void; children: ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  return <Allowed.Provider value={new Set(decisions.map(row => row.id))}>
    <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
      accessibility={{ screenReaderInstructions: { draggable: "Press Space to pick up. Arrow keys choose Blocking delay, Open without delay, or Assume resolved. Press Space to drop, Escape to cancel. Changes are Scenario only." } }}
      onDragStart={event => setDragging(String(event.active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={event => { setDragging(null); const target = String(event.over?.id).replace("decision-drop-", "") as DecisionDrop;
        if (order.includes(target)) onMove(String(event.active.id), target); }}>
      {children}
      <DragOverlay dropAnimation={null}>{dragging ? <div className="max-w-72 rounded-lg border border-[var(--i-violet)] bg-[var(--i-panel)] p-3 text-[var(--i-text)] shadow-xl">
        <div className="i-label text-[var(--i-violet)]">What-if · not saved to Reality</div>{decisions.find(row => row.id === dragging)?.title}
      </div> : null}</DragOverlay>
    </DndContext>
  </Allowed.Provider>;
}

export function useDecisionDrag(id: string) {
  const allowed = useContext(Allowed).has(id);
  return { allowed, ...useDraggable({ id, disabled: !allowed }) };
}

export function DecisionDropZone({ target, title, detail, children }: {
  target: DecisionDrop; title: string; detail: string; children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `decision-drop-${target}` });
  return <section ref={setNodeRef} data-testid={`decision-drop-${target}`} data-drag-over={isOver} aria-label={title}
    className="rounded-lg transition-shadow"
    style={{ outline: isOver ? "2px solid var(--i-violet)" : active ? "1px dashed var(--i-violet)" : undefined,
      background: isOver ? "var(--i-violet-soft)" : undefined }}>
    <div className="flex flex-wrap items-baseline gap-x-3 px-6 pt-3 text-[12px]">
      <strong className="text-[var(--i-text)]">{title}</strong><span className="text-[var(--i-text-soft)]">{detail}</span>
    </div>
    {children}
  </section>;
}
