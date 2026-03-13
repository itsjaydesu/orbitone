"use client";

import {
  CAMERA_VIEWS,
  CAMERA_VIEW_LABELS,
  CameraPose,
  CameraView,
  PROCEDURAL_CAMERA_VIEWS,
} from "@/lib/camera-presets";
import { cn } from "@/lib/utils";
import { Save, RotateCcw, Undo2, X } from "lucide-react";

interface CameraLabProps {
  activeView: CameraView;
  draftPose: CameraPose;
  isDirty: boolean;
  onClose: () => void;
  onPoseChange: (pose: CameraPose) => void;
  onResetToDefault: () => void;
  onRevert: () => void;
  onSave: () => void;
  onSelectView: (view: CameraView) => void;
}

const AXES = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "z", label: "Z" },
] as const;

const updateNumericValue = (value: string, fallback: number) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
};

export const CameraLab = ({
  activeView,
  draftPose,
  isDirty,
  onClose,
  onPoseChange,
  onResetToDefault,
  onRevert,
  onSave,
  onSelectView,
}: CameraLabProps) => {
  const isProceduralView = PROCEDURAL_CAMERA_VIEWS.includes(activeView);
  const isFlatLocked = draftPose.flatLock;

  const updateVectorAxis = (
    section: "position" | "target",
    axis: "x" | "y" | "z",
    rawValue: string,
  ) => {
    const nextValue = updateNumericValue(rawValue, draftPose[section][axis]);

    if (isFlatLocked && axis !== "z") {
      if (section === "position") {
        onPoseChange({
          ...draftPose,
          position: {
            ...draftPose.position,
            [axis]: nextValue,
          },
          target: {
            ...draftPose.target,
            [axis]: nextValue,
          },
        });
        return;
      }

      onPoseChange({
        ...draftPose,
        position: {
          ...draftPose.position,
          [axis]: nextValue,
        },
        target: {
          ...draftPose.target,
          [axis]: nextValue,
        },
      });
      return;
    }

    onPoseChange({
      ...draftPose,
      [section]: {
        ...draftPose[section],
        [axis]: nextValue,
      },
    });
  };

  const updateFov = (rawValue: string) => {
    onPoseChange({
      ...draftPose,
      fov: updateNumericValue(rawValue, draftPose.fov),
    });
  };

  const toggleFlatLock = () => {
    onPoseChange({
      ...draftPose,
      flatLock: !draftPose.flatLock,
      target: draftPose.flatLock
        ? draftPose.target
        : {
            ...draftPose.target,
            x: draftPose.position.x,
            y: draftPose.position.y,
          },
    });
  };

  return (
    <div className="nm-card nm-animate-dropdown fixed top-24 right-6 z-[135] w-[28rem] max-w-[calc(100vw-3rem)] rounded-[1.75rem] p-5 text-[var(--nm-text)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="nm-badge rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--nm-text-dim)]">
              Camera Lab
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
                isDirty ? "nm-badge-amber" : "nm-badge-emerald",
              )}
            >
              {isDirty ? "Unsaved" : "Saved"}
            </span>
          </div>
          <h2 className="text-xl font-semibold tracking-[0.08em] text-[var(--nm-text)]">
            {CAMERA_VIEW_LABELS[activeView]}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--nm-text-dim)]">
            Drag directly in the canvas to tune. Locked views use pan plus zoom;
            free views orbit normally. Values below update live while you tune.
          </p>
        </div>

        <button
          onClick={onClose}
          className="nm-raised rounded-full p-2 text-[var(--nm-text-dim)] hover:text-[var(--nm-text)]"
          aria-label="Close camera lab"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-2">
        {CAMERA_VIEWS.map((view) => (
          <button
            key={view}
            onClick={() => onSelectView(view)}
            className={cn(
              "rounded-xl px-2 py-2 text-[11px] font-medium tracking-[0.12em]",
              activeView === view
                ? "nm-toggle-active"
                : "nm-raised text-[var(--nm-text-dim)]",
            )}
          >
            {CAMERA_VIEW_LABELS[view]}
          </button>
        ))}
      </div>

      {isProceduralView && (
        <div className="nm-info-box mb-4 rounded-2xl px-4 py-3 text-sm leading-relaxed text-[var(--nm-text-dim)]">
          This view still uses motion, but the saved pose controls its base
          framing, target, and lens.
        </div>
      )}

      <section className="nm-well mb-4 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--nm-text-dim)]">
              Flat Front Lock
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--nm-text-faint)]">
              Keeps the camera pointed straight down the z-axis so front crops
              stay mathematically flat. Dragging becomes pan plus zoom instead
              of free orbit.
            </p>
          </div>
          <button
            onClick={toggleFlatLock}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]",
              isFlatLocked
                ? "nm-toggle-active"
                : "nm-raised text-[var(--nm-text-dim)]",
            )}
          >
            {isFlatLocked ? "Locked" : "Free"}
          </button>
        </div>
      </section>

      <div className="space-y-4">
        <section className="nm-well rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--nm-text-dim)]">
              Position
            </h3>
            <span className="text-xs text-[var(--nm-text-faint)]">Camera XYZ</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {AXES.map(({ key, label }) => (
              <label key={`position-${key}`} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-[0.14em] text-[var(--nm-text-faint)]">
                  {label}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={draftPose.position[key]}
                  onChange={(event) =>
                    updateVectorAxis("position", key, event.target.value)
                  }
                  className="nm-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="nm-well rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--nm-text-dim)]">
              Aim
            </h3>
            <span className="text-xs text-[var(--nm-text-faint)]">Look-at target</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {AXES.map(({ key, label }) => (
              <label key={`target-${key}`} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-[0.14em] text-[var(--nm-text-faint)]">
                  {label}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={draftPose.target[key]}
                  onChange={(event) =>
                    updateVectorAxis("target", key, event.target.value)
                  }
                  disabled={isFlatLocked && key !== "z"}
                  className="nm-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="nm-well rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--nm-text-dim)]">
              Lens
            </h3>
            <span className="text-xs text-[var(--nm-text-faint)]">Field of view</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <input
              type="range"
              min={20}
              max={100}
              step={0.5}
              value={draftPose.fov}
              onChange={(event) => updateFov(event.target.value)}
              className="nm-range"
            />
            <input
              type="number"
              min={20}
              max={100}
              step="0.5"
              value={draftPose.fov}
              onChange={(event) => updateFov(event.target.value)}
              className="nm-input w-20 rounded-xl px-3 py-2 text-right text-sm"
            />
          </div>
        </section>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          onClick={onSave}
          className="nm-accent-raised flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
        >
          <Save className="h-4 w-4" />
          Save View
        </button>
        <button
          onClick={onRevert}
          className="nm-raised flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-[var(--nm-text)]"
        >
          <Undo2 className="h-4 w-4" />
          Revert
        </button>
        <button
          onClick={onResetToDefault}
          className="nm-destructive flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
    </div>
  );
};
