import { useEffect, useRef, useState } from 'react';
import type { NoteView } from '@writers-board/core';
import { NOTE_SIZE } from '../board/bounds';
import { run } from '../state/board';
import { toScreen, useUi } from '../state/ui';
import { joinDictation, MicButton } from '../voice/MicButton';

export function NoteEditor({ note }: { note: NoteView }) {
  const view = useUi((s) => s.view);
  const [text, setText] = useState(note.text);
  const area = useRef<HTMLTextAreaElement>(null);
  const [heardError, setHeardError] = useState('');
  const [partial, setPartial] = useState('');
  const at = toScreen(view, note.x, note.y);

  useEffect(() => {
    const element = area.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const close = () => {
    if (text !== note.text) run('note_update', { id: note.id, text });
    useUi.getState().edit(null);
    useUi.getState().select(note.id);
  };

  // Dictated words go in at the caret, as the writer's own.
  const dictate = (said: string) => {
    const element = area.current;
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? start;
    const before = joinDictation(text.slice(0, start), said);
    setText(joinDictation(text.slice(0, start), said, text.slice(end)));
    setHeardError('');
    setPartial('');
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <>
    <div
      className="note-editor"
      style={{
        left: at.left,
        top: at.top,
        width: NOTE_SIZE,
        height: NOTE_SIZE,
        background: note.color,
        transform: `scale(${view.zoom})`,
      }}
    >
      <textarea
        ref={area}
        aria-label="Sticky note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            area.current?.blur();
          }
          e.stopPropagation();
        }}
      />
    </div>
    <div className="dictation-bar" style={{ left: at.left, top: at.top + NOTE_SIZE * view.zoom + 10 }}>
      <MicButton onText={dictate} onError={setHeardError} onPartial={setPartial} />
      {partial && <span className="dictation-partial">{partial}</span>}
      {heardError && <span role="alert">{heardError}</span>}
    </div>
    </>
  );
}
