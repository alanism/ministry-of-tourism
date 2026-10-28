// Renames a guide's title, one of its stops, or a grid label in place.
import { useEffect, useRef, useState } from 'react';
import type { GuideView } from '@writers-board/core';
import { latestBoard, run } from '../state/board';
import { useUi, type LabelEdit } from '../state/ui';

function save(edit: LabelEdit, value: string) {
  const guide: GuideView | undefined = latestBoard()?.guides.find((g) => g.id === edit.guideId);
  if (!guide || value === edit.value) return;
  if (edit.field === 'title') {
    if (value.trim()) run('guide_update', { id: guide.id, title: value.trim() });
  } else if (edit.field.startsWith('axis-')) {
    const axes = [...(guide.axes ?? ['', ''])] as [string, string];
    axes[Number(edit.field.slice(5))] = value;
    run('guide_update', { id: guide.id, axes });
  } else if (edit.field.startsWith('quadrant-')) {
    const quadrants = [...(guide.quadrants ?? ['', '', '', ''])] as [string, string, string, string];
    quadrants[Number(edit.field.slice(9))] = value;
    run('guide_update', { id: guide.id, quadrants });
  } else {
    run('guide_update', { id: guide.id, stops: guide.stops.map((s) => (s.id === edit.field ? { ...s, label: value } : s)) });
  }
}

export function LabelEditor({ edit }: { edit: LabelEdit }) {
  const [value, setValue] = useState(edit.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const close = (commit: boolean) => {
    if (commit) save(edit, value);
    useUi.getState().setLabelEdit(null);
  };

  return (
    <input
      ref={input}
      className="label-editor"
      style={{ left: edit.x, top: edit.y }}
      aria-label="Label"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') close(true);
        if (e.key === 'Escape') close(false);
      }}
    />
  );
}
