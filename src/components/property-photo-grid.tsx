"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Grip, X } from "lucide-react";
import { useId, useState } from "react";
import { PropertyImage } from "./property-image";

const thumbnailSizes = "(max-width: 640px) 45vw, 240px";

function SortablePhoto({
  id,
  image,
  index,
  sortable,
  onRemove,
  onMakeCover,
}: {
  id: string;
  image: string;
  index: number;
  sortable: boolean;
  onRemove: () => void;
  onMakeCover: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled: !sortable });

  return (
    <div
      className="image-editor-card"
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      data-drop-target={isOver || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="image-editor-preview">
        <PropertyImage
          src={image}
          alt={`Fotografia proprietății ${index + 1}`}
          sizes={thumbnailSizes}
        />
        <span className="image-order">
          {index === 0
            ? "Fotografie de copertă"
            : String(index + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          className="image-remove"
          aria-label={`Elimină fotografia ${index + 1}`}
          onClick={onRemove}
        >
          <X size={15} />
        </button>
        {(index > 0 || sortable) && (
          <div className="image-editor-actions">
            {index > 0 && (
              <button
                type="button"
                className="make-cover"
                onClick={onMakeCover}
              >
                Setează drept copertă
              </button>
            )}
            {sortable && (
              <button
                type="button"
                className="image-drag-handle"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                aria-label={`Mută fotografia ${index + 1}`}
              >
                <Grip size={14} aria-hidden="true" />
                Mută
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PropertyPhotoGrid({
  images,
  onMove,
  onRemove,
}: {
  images: string[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const contextId = useId();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const occurrences = new Map<string, number>();
  const photos = images.map((image) => {
    const occurrence = (occurrences.get(image) ?? 0) + 1;
    occurrences.set(image, occurrence);
    return { image, id: `${occurrence}:${image}` };
  });
  const ids: UniqueIdentifier[] = photos.map(({ id }) => id);
  const activePhoto = photos.find(({ id }) => id === activeId);

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={(args) =>
        args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
      }
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Apasă Spațiu pentru a ridica fotografia. Folosește săgețile pentru a alege poziția, apoi apasă Spațiu pentru a o fixa. Apasă Escape pentru a anula.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Ai ridicat fotografia de pe poziția ${ids.indexOf(active.id) + 1}.`,
          onDragOver: ({ over }) =>
            over ? `Poziția ${ids.indexOf(over.id) + 1}.` : undefined,
          onDragEnd: ({ over }) =>
            over
              ? `Ai așezat fotografia pe poziția ${ids.indexOf(over.id) + 1}.`
              : "Ordinea fotografiilor a rămas aceeași.",
          onDragCancel: () => "Mutarea a fost anulată.",
        },
      }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        const from = ids.indexOf(active.id);
        const to = over ? ids.indexOf(over.id) : -1;
        if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="image-editor-grid">
          {photos.map(({ id, image }, index) => (
            <SortablePhoto
              key={id}
              id={id}
              image={image}
              index={index}
              sortable={photos.length > 1}
              onRemove={() => onRemove(index)}
              onMakeCover={() => onMove(index, 0)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activePhoto && (
          <div
            className="image-editor-preview image-drag-preview"
            aria-hidden="true"
          >
            <PropertyImage
              src={activePhoto.image}
              alt=""
              sizes={thumbnailSizes}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
