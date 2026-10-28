export interface Toggle {
  set(on: boolean, quiet?: boolean): void;
  get(): boolean;
  destroy(): void;
}
export function makeToggle(
  button: HTMLElement,
  knob: HTMLElement,
  options: { travel: number | (() => number); axis?: 'x' | 'y'; onChange?: (on: boolean) => void; sounds?: () => boolean },
): Toggle;
