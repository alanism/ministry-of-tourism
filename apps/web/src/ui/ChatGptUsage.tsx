import { useAiSettings, type Job } from '../ai/settings';

export function ChatGptUsage({ job }: { job: Job }) {
  const settings = useAiSettings();
  if (settings.jobs[job].provider !== 'chatgpt') return null;
  return <p className="hint">Using ChatGPT plan · <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a></p>;
}
