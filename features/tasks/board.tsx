"use client";
import {
  useId,
  useState,
  useTransition,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
} from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import {
  notifyWorkspaceChange,
  workspaceChangeEvent,
} from "@/lib/workspace-events";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensors,
  useSensor,
  useDroppable,
  closestCorners,
  pointerWithin,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Check,
  CalendarDays,
  Link2,
  Pencil,
  Trash2,
  ArrowUpRight,
  Search,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { taskAction } from "./actions";
import type { BoardTask, Column, LinkOption } from "./types";
import { formatDate } from "@/lib/utils";
const kinds: Record<string, string> = {
  companies: "Empresa",
  offers: "Oferta",
  applications: "Candidatura",
  contacts: "Contacto",
  networking: "Networking",
};
function local(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function TaskCardContent({
  task,
  open,
  disabled,
  complete,
  dragHandleProps,
}: {
  task: BoardTask;
  open: () => void;
  disabled: boolean;
  complete: () => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <>
      <div className="kanban-card-title">
        <button
          {...dragHandleProps}
          className="task-drag"
          aria-label={"Arrastrar " + task.title}
          title="Arrastrar (también con espacio y flechas)"
        >
          <GripVertical size={16} />
        </button>
        <button onClick={open} className="task-open">
          <strong>{task.title}</strong>
        </button>
        <button
          type="button"
          className="task-complete-button"
          data-no-drag
          aria-label={
            (task.completedAt ? "Completada: " : "Completar tarea: ") +
            task.title
          }
          title={task.completedAt ? "Completada" : "Completar tarea"}
          disabled={disabled || !!task.completedAt}
          onClick={complete}
        >
          <span className="task-complete-circle">
            <Check size={12} className={task.completedAt ? "checked" : ""} />
          </span>
        </button>
      </div>
      {task.description && <p className="task-preview">{task.description}</p>}
      <div className="task-links">
        {task.links.slice(0, 3).map((l) => (
          <Link
            key={l.kind + l.recordId}
            href={"/" + l.kind + "/" + l.recordId}
            title={l.label}
          >
            <Link2 size={12} />
            {l.label}
          </Link>
        ))}
        {task.links.length > 3 && <span>+{task.links.length - 3}</span>}
      </div>
      <footer>
        <span
          className={
            task.dueAt && !task.completedAt && new Date(task.dueAt) < new Date()
              ? "task-overdue"
              : ""
          }
        >
          {task.dueAt && (
            <>
              <CalendarDays size={13} />
              {formatDate(task.dueAt)}
            </>
          )}
        </span>
        <button
          className="icon-button"
          onClick={open}
          aria-label={"Editar tarea " + task.title}
        >
          <ArrowUpRight size={14} />
        </button>
      </footer>
    </>
  );
}
function Card(props: {
  task: BoardTask;
  open: () => void;
  disabled: boolean;
  complete: () => void;
}) {
  const { task, disabled } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className={"kanban-card " + (task.completedAt ? "is-complete" : "")}
      data-task-id={task.id}
      onPointerDown={(event) => {
        if (
          event.pointerType !== "touch" &&
          !(event.target as Element).closest("[data-no-drag]")
        )
          listeners?.onPointerDown?.(event);
      }}
      onTouchStart={(event) => {
        if (!(event.target as Element).closest("[data-no-drag]"))
          listeners?.onTouchStart?.(event);
      }}
    >
      <TaskCardContent
        {...props}
        dragHandleProps={{
          ...attributes,
          onKeyDown: (event) => listeners?.onKeyDown?.(event),
        }}
      />
    </article>
  );
}
type DropTarget = { columnId: string; beforeId: string | null };
function DropSlot({ height }: { height: number }) {
  const { setNodeRef } = useDroppable({ id: "drop-preview" });
  return (
    <div
      ref={setNodeRef}
      className="kanban-drop-slot"
      style={{ minHeight: height }}
      aria-label="Posición de destino de la tarea"
    >
      <span>Soltar aquí</span>
    </div>
  );
}
const boardCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const slot = hits.filter((h) => h.id === "drop-preview");
  if (slot.length) return slot;
  const cards = hits.filter((h) => !String(h.id).startsWith("column:"));
  return cards.length
    ? cards
    : hits.length
      ? hits
      : args.pointerCoordinates
        ? []
        : closestCorners(args);
};
function Lane({
  column,
  tasks,
  open,
  create,
  edit,
  pending,
  complete,
  preview,
}: {
  column: Column;
  tasks: BoardTask[];
  open: (t: BoardTask) => void;
  create: () => void;
  edit: () => void;
  pending: boolean;
  complete: (t: BoardTask) => void;
  preview?: { beforeId: string | null; height: number };
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "column:" + column.id,
    disabled: pending,
  });
  return (
    <section
      ref={setNodeRef}
      className={"kanban-lane " + (isOver || preview ? "is-over" : "")}
      aria-label={"Columna " + column.name}
      data-column-id={column.id}
    >
      <header>
        <span className={column.isDone ? "lane-dot done" : "lane-dot"} />
        <h2>{column.name}</h2>
        <span className="count-pill">{tasks.length}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={"Añadir tarea en " + column.name}
          onClick={create}
          disabled={pending}
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-button"
          onClick={edit}
          disabled={pending}
          aria-label={"Editar columna " + column.name}
        >
          <Pencil size={14} />
        </button>
      </header>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="kanban-lane-cards">
          {tasks.flatMap((t) => [
            ...(preview?.beforeId === t.id
              ? [<DropSlot key="drop-preview" height={preview.height} />]
              : []),
            <Card
              key={t.id}
              task={t}
              open={() => open(t)}
              disabled={pending}
              complete={() => complete(t)}
            />,
          ])}
          {preview && !preview.beforeId && <DropSlot height={preview.height} />}
          {!tasks.length && !preview && (
            <p className="kanban-empty">Arrastra una tarea aquí</p>
          )}
        </div>
      </SortableContext>
      <button className="kanban-add-task" onClick={create} disabled={pending}>
        <Plus size={15} />
        Añadir tarea
      </button>
    </section>
  );
}
export function Board({
  columns,
  tasks,
  options: initialOptions,
  initialTaskId,
  initialCreate,
  initialLink,
}: {
  columns: Column[];
  tasks: BoardTask[];
  options?: LinkOption[];
  initialTaskId?: string;
  initialCreate?: boolean;
  initialLink?: LinkOption;
}) {
  const router = useRouter(),
    contextId = useId(),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<BoardTask | null>(
      tasks.find((t) => t.id === initialTaskId) ?? null,
    ),
    [newColumn, setNewColumn] = useState(
      initialCreate
        ? (columns.find((c) => !c.isDone)?.id ?? columns[0]?.id ?? "")
        : "",
    ),
    [columnEditor, setColumnEditor] = useState<Column | null | undefined>(
      undefined,
    ),
    [query, setQuery] = useState(""),
    [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null),
    [dragSize, setDragSize] = useState({ width: 265, height: 120 });
  const [deletingColumn, setDeletingColumn] = useState(false),
    [deleteMode, setDeleteMode] = useState("move"),
    [targetColumn, setTargetColumn] = useState("");
  const [search, setSearch] = useState(""),
    [links, setLinks] = useState<{ kind: string; recordId: string }[]>(
      selected?.links ??
        (initialLink
          ? [{ kind: initialLink.kind, recordId: initialLink.id }]
          : []),
    );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const run = (
    operation: string,
    id: string | undefined,
    input: unknown,
    close = false,
  ) => {
    setError("");
    start(async () => {
      try {
        const result = await taskAction(operation, id, input);
        if (!result.ok) {
          setError(result.error || "No se ha podido guardar.");
          router.refresh();
          return;
        }
        if (close) {
          setSelected(null);
          setNewColumn("");
          setColumnEditor(undefined);
          setDeletingColumn(false);
          if (initialTaskId || initialCreate)
            router.replace("/kanban", { scroll: false });
        }
        notifyWorkspaceChange();
        // The action revalidates this page; avoid racing a second refresh with navigation.
      } catch {
        setError("No se ha podido conectar. Vuelve a intentarlo.");
      }
    });
  };
  const open = (task: BoardTask) => {
    setSelected(task);
    setNewColumn("");
    setSearch("");
    setLinks(task.links);
    setError("");
  };
  const create = (id: string) => {
    setSelected(null);
    setNewColumn(id);
    setSearch("");
    setLinks([]);
    setError("");
  };
  const close = () => {
    setSelected(null);
    setNewColumn("");
    if (initialTaskId || initialCreate)
      router.replace("/kanban", { scroll: false });
  };
  const drop = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    setDropTarget(null);
    if (!over || active.id === over.id) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const target = targetFor(over.id, String(active.id));
    if (!target) return;
    run("move", undefined, {
      taskId: task.id,
      ...target,
      expectedUpdatedAt: task.updatedAt,
    });
  };
  const editing = !!selected || !!newColumn;
  const [loadedOptions, setLoadedOptions] = useState<LinkOption[]>([]);
  const optionsUntil = useRef(0);
  const options = initialOptions ?? loadedOptions;
  useEffect(() => {
    const invalidate = () => {
      optionsUntil.current = 0;
    };
    window.addEventListener(workspaceChangeEvent, invalidate);
    return () => window.removeEventListener(workspaceChangeEvent, invalidate);
  }, []);
  useEffect(() => {
    if (!editing || initialOptions || optionsUntil.current > Date.now()) return;
    const controller = new AbortController();
    fetch("/api/records/tasks?options=1", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "No se han podido cargar los enlaces.");
        return data as LinkOption[];
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        optionsUntil.current = Date.now() + 2 * 60000;
        setLoadedOptions(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [editing, initialOptions]);
  const matched = tasks.filter(
    (t) =>
      !query ||
      [t.title, t.description, ...t.links.map((l) => l.label)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const draggedTask = tasks.find((t) => t.id === dragged);
  function targetFor(
    overId: string | number,
    activeId: string,
  ): DropTarget | null {
    if (overId === "drop-preview") return dropTarget;
    const overTask = tasks.find((t) => t.id === overId && t.id !== activeId);
    const columnId =
      overTask?.columnId ?? String(overId).replace("column:", "");
    return columns.some((c) => c.id === columnId)
      ? { columnId, beforeId: overTask?.id ?? null }
      : null;
  }
  const previewDrop = ({ active, over }: DragOverEvent) => {
    const target = over ? targetFor(over.id, String(active.id)) : null;
    setDropTarget((current) =>
      current?.columnId === target?.columnId &&
      current?.beforeId === target?.beforeId
        ? current
        : target,
    );
  };
  return (
    <div className="page kanban-page">
      <div className="breadcrumb">
        Mi espacio <span>/</span> Kanban
      </div>
      <header className="page-heading">
        <div>
          <h1>Tu tablero</h1>
          <p>
            Organiza los próximos pasos. Las tareas pendientes también aparecen
            en Hoy.
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={() =>
            create(columns.find((c) => !c.isDone)?.id ?? columns[0].id)
          }
          disabled={pending}
        >
          <Plus size={16} />
          Nueva tarea
        </button>
      </header>
      <div className="kanban-toolbar">
        <label className="list-search">
          <Search size={16} />
          <input
            aria-label="Buscar tareas"
            placeholder="Buscar tareas y enlaces…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span>
          {tasks.filter((t) => !t.completedAt).length} pendientes ·{" "}
          {tasks.filter((t) => t.completedAt).length} completadas
        </span>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={boardCollision}
        onDragStart={(e) => {
          setDragged(String(e.active.id));
          setDropTarget(null);
          const rect = e.active.rect.current.initial;
          if (rect) setDragSize({ width: rect.width, height: rect.height });
        }}
        onDragOver={previewDrop}
        onDragEnd={drop}
        onDragCancel={() => {
          setDragged(null);
          setDropTarget(null);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Pulsa espacio para recoger la tarea, flechas para moverla, espacio para soltar y Escape para cancelar.",
          },
        }}
      >
        <div className="kanban-board">
          {columns.map((c) => (
            <Lane
              key={c.id}
              column={c}
              tasks={matched.filter((t) => t.columnId === c.id)}
              open={open}
              create={() => create(c.id)}
              edit={() => {
                setColumnEditor(c);
                setDeletingColumn(false);
                setDeleteMode("move");
                setTargetColumn(columns.find((o) => o.id !== c.id)?.id ?? "");
                setError("");
              }}
              pending={pending}
              preview={
                draggedTask &&
                dropTarget?.columnId === c.id &&
                draggedTask.columnId !== c.id
                  ? { beforeId: dropTarget.beforeId, height: dragSize.height }
                  : undefined
              }
              complete={(task) =>
                run("complete", undefined, {
                  id: task.id,
                  title: task.title,
                  dueAt: task.dueAt,
                })
              }
            />
          ))}
          <button
            className="kanban-add-column"
            onClick={() => {
              setColumnEditor(null);
              setDeletingColumn(false);
              setError("");
            }}
            disabled={pending}
          >
            <Plus size={17} />
            Añadir columna
          </button>
        </div>
        <DragOverlay>
          {draggedTask && (
            <div
              className={
                "kanban-card drag-preview " +
                (draggedTask.completedAt ? "is-complete" : "")
              }
              style={{ width: dragSize.width }}
              aria-hidden="true"
            >
              <TaskCardContent
                task={draggedTask}
                open={() => {}}
                complete={() => {}}
                disabled={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <Sheet
        open={editing}
        onOpenChange={(v) => {
          if (!v && !pending) close();
        }}
        title={selected ? "Editar tarea" : "Nueva tarea"}
        description="Relaciona tu próximo paso con empresas, ofertas, candidaturas, contactos o eventos."
      >
        <form
          key={selected?.id ?? newColumn}
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(
              "save",
              selected?.id,
              {
                expectedUpdatedAt: selected?.updatedAt,
                title: data.get("title"),
                description: data.get("description"),
                dueAt: data.get("dueAt")
                  ? new Date(String(data.get("dueAt"))).toISOString()
                  : null,
                columnId: selected?.columnId ?? newColumn,
                links,
              },
              true,
            );
          }}
        >
          <fieldset disabled={pending}>
            <label>
              Título de tarea
              <input
                name="title"
                defaultValue={selected?.title ?? ""}
                required
                maxLength={500}
              />
            </label>
            <label>
              Descripción
              <textarea
                name="description"
                defaultValue={selected?.description ?? ""}
                rows={4}
                maxLength={30000}
              />
            </label>
            <label>
              Fecha límite
              <input
                name="dueAt"
                type="datetime-local"
                defaultValue={local(selected?.dueAt ?? null)}
              />
            </label>
            <div className="task-related">
              <label>
                Buscar registros para enlazar
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Empresa, puesto, contacto…"
                  maxLength={100}
                />
              </label>
              {search && (
                <div className="task-link-results">
                  {options
                    .filter(
                      (o) =>
                        (o.label + " " + kinds[o.kind])
                          .toLocaleLowerCase()
                          .includes(search.toLocaleLowerCase()) &&
                        !links.some(
                          (l) => l.kind === o.kind && l.recordId === o.id,
                        ),
                    )
                    .slice(0, 12)
                    .map((o) => (
                      <button
                        key={o.kind + o.id}
                        type="button"
                        onClick={() => {
                          setLinks((prev) => [
                            ...prev,
                            { kind: o.kind, recordId: o.id },
                          ]);
                          setSearch("");
                        }}
                      >
                        <small>{kinds[o.kind]}</small>
                        {o.label}
                        <Plus size={14} />
                      </button>
                    ))}
                </div>
              )}
              <ul className="task-linked-list">
                {links.map((l) => {
                  const label =
                    options.find(
                      (o) => o.kind === l.kind && o.id === l.recordId,
                    )?.label ??
                    selected?.links.find(
                      (o) => o.kind === l.kind && o.recordId === l.recordId,
                    )?.label ??
                    (initialLink?.kind === l.kind &&
                    initialLink.id === l.recordId
                      ? initialLink.label
                      : undefined) ??
                    "Registro";
                  return (
                    <li key={l.kind + l.recordId}>
                      <Link href={"/" + l.kind + "/" + l.recordId}>
                        <Link2 size={14} />
                        {label}
                      </Link>
                      {!(
                        selected?.sourceKind === l.kind &&
                        selected.sourceId === l.recordId
                      ) && (
                        <button
                          type="button"
                          aria-label={"Quitar enlace " + label}
                          onClick={() => setLinks(links.filter((o) => o !== l))}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <button className="button button-primary" type="submit">
              {pending ? "Guardando…" : "Guardar tarea"}
            </button>
          </fieldset>
        </form>
        {selected && (
          <div className="task-tools">
            <label>
              Mover a columna
              <Select
                label="Mover tarea a columna"
                value={selected.columnId}
                options={columns.map((c) => ({ value: c.id, label: c.name }))}
                disabled={pending}
                onValueChange={(value) =>
                  run(
                    "move",
                    undefined,
                    {
                      taskId: selected.id,
                      columnId: value,
                      expectedUpdatedAt: selected.updatedAt,
                    },
                    true,
                  )
                }
              />
            </label>
            <button
              className="button button-outline"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Eliminar esta tarea? Su histórico de finalizaciones se conservará.",
                  )
                )
                  run("delete", selected.id, {}, true);
              }}
            >
              <Trash2 size={14} />
              Eliminar tarea
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </Sheet>
      <Sheet
        open={columnEditor !== undefined}
        onOpenChange={(v) => {
          if (!v && !pending) {
            setColumnEditor(undefined);
            setDeletingColumn(false);
          }
        }}
        title={columnEditor ? "Editar columna" : "Nueva columna"}
        description="Personaliza la organización de tu tablero."
      >
        <form
          key={columnEditor?.id ?? "new"}
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              "column",
              columnEditor?.id,
              {
                name: new FormData(e.currentTarget).get("name"),
                position: new FormData(e.currentTarget).get("position"),
                isDone: new FormData(e.currentTarget).has("isDone"),
              },
              true,
            );
          }}
        >
          <label>
            Nombre de columna
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={columnEditor?.name ?? ""}
            />
          </label>
          <label>
            Posición de columna
            <Select
              name="position"
              label="Posición de columna"
              defaultValue={String(
                columnEditor
                  ? columns.findIndex((c) => c.id === columnEditor.id)
                  : columns.length,
              )}
              disabled={pending}
              options={Array.from(
                { length: columnEditor ? columns.length : columns.length + 1 },
                (_, i) => ({
                  value: String(i),
                  label:
                    i === 0
                      ? "1 · Al principio"
                      : i ===
                          (columnEditor ? columns.length - 1 : columns.length)
                        ? `${i + 1} · Al final`
                        : `${i + 1} · Antes de ${columns.filter((c) => c.id !== columnEditor?.id)[i]?.name ?? "la siguiente columna"}`,
                }),
              )}
            />
          </label>
          <label className="completion-destination">
            <input
              type="checkbox"
              name="isDone"
              defaultChecked={!!columnEditor?.isDone}
            />
            Enviar aquí las tareas completadas
          </label>
          <p className="field-hint">
            Solo una columna es el destino de completadas. Cambiarla no altera
            el estado de las tareas existentes. Si la eliminas, se elige otra
            automáticamente.
          </p>
          <div className="column-editor-actions">
            <button className="button button-primary" disabled={pending}>
              Guardar columna
            </button>
            {columnEditor && (
              <button
                type="button"
                className="button button-danger"
                disabled={pending}
                onClick={() => setDeletingColumn(true)}
              >
                <Trash2 size={14} />
                Eliminar columna
              </button>
            )}
          </div>
        </form>
        {columnEditor && deletingColumn && (
          <form
            className="task-form column-delete-form"
            onSubmit={(event) => {
              event.preventDefault();
              const affected = tasks.filter(
                (t) => t.columnId === columnEditor.id,
              );
              const destination = columns.find((c) => c.id === targetColumn);
              const message =
                deleteMode === "move"
                  ? `¿Eliminar «${columnEditor.name}» y trasladar sus ${affected.length} tareas a «${destination?.name ?? ""}» conservando su estado?`
                  : `¿Eliminar «${columnEditor.name}» y borrar sus ${affected.length} tareas? Se cancelarán sus recordatorios. Esta acción no se puede deshacer.`;
              if (window.confirm(message))
                run(
                  "delete-column",
                  columnEditor.id,
                  {
                    mode: deleteMode,
                    targetColumnId:
                      deleteMode === "move" ? targetColumn : undefined,
                    confirmed: true,
                    taskVersions: affected.map((t) => ({
                      id: t.id,
                      updatedAt: t.updatedAt,
                    })),
                  },
                  true,
                );
            }}
          >
            <h3>¿Qué hacemos con las tareas?</h3>
            <p className="field-hint">
              Las finalizaciones ya registradas se conservarán. Es necesario
              mantener al menos una columna.
            </p>
            <label className="checkbox-label">
              <input
                type="radio"
                name="columnDeleteMode"
                checked={deleteMode === "move"}
                onChange={() => setDeleteMode("move")}
              />
              Pasar todas las tareas a otra columna
            </label>
            <label className="checkbox-label">
              <input
                type="radio"
                name="columnDeleteMode"
                checked={deleteMode === "delete"}
                onChange={() => setDeleteMode("delete")}
              />
              Borrar todas las tareas de la columna
            </label>
            {deleteMode === "move" && (
              <label>
                Columna de destino
                <Select
                  label="Columna de destino"
                  value={targetColumn}
                  onValueChange={setTargetColumn}
                  disabled={pending}
                  options={columns
                    .filter((c) => c.id !== columnEditor.id)
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              </label>
            )}
            <button
              className="button button-outline"
              type="button"
              onClick={() => setDeletingColumn(false)}
              disabled={pending}
            >
              Cancelar borrado
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={
                pending ||
                columns.length < 2 ||
                (deleteMode === "move" && !targetColumn)
              }
            >
              Confirmar eliminación de columna
            </button>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </Sheet>
    </div>
  );
}
