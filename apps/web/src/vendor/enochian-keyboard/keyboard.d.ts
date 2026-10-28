export interface EnochianKeyboard {
  destroy(): void;
}
export function mount(root: HTMLElement, output?: HTMLInputElement | HTMLTextAreaElement | null): EnochianKeyboard;
