// Typing happens in a real text box laid exactly over the card, so writing
// feels like the card while keeping native text editing and accessibility.
import { useEffect, useRef, useState } from 'react';
import { cardDimensions, getFrameworkCard, getCategory, type CardView, type CategoryId } from '@writers-board/core';
import { run } from '../state/board';
import { toScreen, useUi } from '../state/ui';
import { columnColor, usePalette } from '../state/palette';
import { joinDictation, MicButton } from '../voice/MicButton';

export function CardEditor({ card }: { card: CardView }) {
  const view = useUi((s) => s.view);
  const palette = usePalette();
  const [text, setText] = useState(card.text);
  const area = useRef<HTMLTextAreaElement>(null);
  const [heardError, setHeardError] = useState('');
  const [partial, setPartial] = useState('');
  const framework = getFrameworkCard(card.type)!;
  const category = getCategory(card.category as CategoryId);
  const { width, height } = cardDimensions(card.size, card.orientation);
  const at = toScreen(view, card.x, card.y);

  // Focus once, with the caret at the end, when the editor opens.
  useEffect(() => {
    const element = area.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const close = () => {
    if (text !== card.text) run('card_set_text', { id: card.id, text });
    useUi.getState().edit(null);
    useUi.getState().select(card.id);
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
      className="card-editor"
      style={{
        left: at.left,
        top: at.top,
        width,
        height,
        // The card straightens while it's being written on, so the editor sits square.
        transform: `scale(${view.zoom})`,
        ['--band' as string]: columnColor(palette, card.category),
      }}
    >
      <div className="card-editor-name">{framework.name}</div>
      <div className="card-editor-question">{framework.question}</div>
      <textarea
        ref={area}
        aria-label={`${framework.name}: ${framework.question}`}
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
    <div className="dictation-bar" style={{ left: at.left, top: at.top + height * view.zoom + 10 }}>
      <MicButton onText={dictate} onError={setHeardError} onPartial={setPartial} />
      {partial && <span className="dictation-partial">{partial}</span>}
      {heardError && <span role="alert">{heardError}</span>}
    </div>
    </>
  );
}
