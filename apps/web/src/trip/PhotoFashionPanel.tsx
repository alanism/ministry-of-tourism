import { useEffect, useRef, useState } from 'react';
import { MUSE_FASHION_PRESET, MUSE_CITY_INK_PRESET, type MuseImagePreset } from '@mot/core';
import { addCityInkMark } from './city-ink-label';
import { prepareFashionPhoto, type PreparedFashionPhoto } from './fashion-photo';
import { PHOTO_STYLE_REFERENCES, loadPhotoStyleReference } from './photo-style-reference';
import { judgeImageQuality, qualityRubric, runQualityLoop, QUALITY_ENDPOINT, type QualityScore, type QualityRun } from './image-quality';
import { createFundedImageClient, FUNDED_IMAGE_LIMITS, type FundedImageStatus } from './funded-image';
import { generateMuseImage, MUSE_IMAGE_EDIT_ENDPOINT, MUSE_IMAGE_PRICE_NOTE, MUSE_IMAGE_PRICING_URL, type MuseImageResult } from './muse-image';
import { addGeneratedImage, MUSE_IMAGE_CREDIT } from './muse-image-board';
import { confirmImageSaved } from './image-save-confirmation';
import type { MuseImagePanelProps } from './MuseImagePanel';
import './photo-fashion.css';

type Result = { image: MuseImageResult; url: string; preset: MuseImagePreset; caption: string; score?: QualityScore };
export function PhotoFashionPanel({ session, actor, refresh, notify, onClose, onBack, whenSaved }: MuseImagePanelProps & { onBack: () => void }) {
  const [source, setSource] = useState<PreparedFashionPhoto & { url: string }>(), [result, setResult] = useState<Result>();
  const [key, setKey] = useState(''), [consent, setConsent] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState<'preparing' | 'generating' | 'saving' | null>(null), [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<false | 'persisted' | 'tab-only'>(false);
  const [funding, setFunding] = useState<'free' | 'byok'>('free'), [freeStatus, setFreeStatus] = useState<FundedImageStatus>();
  const [freeClient] = useState(() => createFundedImageClient());
  const useFree = funding === 'free';
  const [quality, setQuality] = useState(false), [candidates, setCandidates] = useState<Result[]>([]), [qualityStatus, setQualityStatus] = useState<QualityRun['status']>();
  const urls = useRef(new Map<Blob, string>());
  const [style, setStyle] = useState<'fashion' | 'city'>('fashion');
  const preset = style === 'fashion' ? MUSE_FASHION_PRESET : MUSE_CITY_INK_PRESET;
  const treatment = style === 'fashion' ? 'fashion' : 'City Ink';
  const controller = useRef<AbortController | null>(null), run = useRef(0), boardId = useRef(session.boardId);
  useEffect(() => {
    if (funding !== 'free') return;
    const abort = new AbortController(); let active = true;
    const unavailable = () => { if (active) setFreeStatus({ available: false, transport: 'firebase-attested-image', readiness: 'configured-only', limits: FUNDED_IMAGE_LIMITS, reason: 'The free image preview is unavailable. You can choose to use your own key.' }); };
    setFreeStatus(undefined);
    const timer = setTimeout(() => { unavailable(); abort.abort(); }, 10000);
    void freeClient.status(abort.signal).then(value => { if (active && !abort.signal.aborted) setFreeStatus(value); }).catch(unavailable).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [funding, freeClient]);
  const chooseFunding = (value: typeof funding) => {
    setFunding(value); setConsent(false); setError('');
    if (value === 'free') { setKey(''); setQuality(false); }
  };
  useEffect(() => () => { run.current++; controller.current?.abort(); controller.current = null; }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => () => { for (const url of urls.current.values()) URL.revokeObjectURL(url);urls.current.clear(); }, []);
  const clearResults = () => { for (const url of urls.current.values()) URL.revokeObjectURL(url);urls.current.clear();setResult(undefined);setCandidates([]);setQualityStatus(undefined); };
  useEffect(() => { if (busy !== 'generating') return; const started = Date.now(); setElapsed(0); const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer); }, [busy]);
  const select = async (file: File) => {
    if (controller.current) return;
    const id = ++run.current, abort = new AbortController(); controller.current = abort;
    setBusy('preparing'); setError(''); setSource(undefined); clearResults(); setConsent(false); setSaved(false);
    try {
      const value = await prepareFashionPhoto(file, abort.signal);
      if (id === run.current && !abort.signal.aborted) setSource({ ...value, url: URL.createObjectURL(value.blob) });
    } catch (cause) { if (id === run.current) setError(cause instanceof Error ? cause.message : 'Photo preparation failed. Nothing was sent.'); }
    finally { if (id === run.current) { controller.current = null; setBusy(null); } }
  };
  const generate = async () => {
    if (controller.current || !source || !consent || (useFree ? !freeStatus?.available : !key.trim()) || session.boardId !== boardId.current) return;
    const id = ++run.current, abort = new AbortController(); controller.current = abort;
    setBusy('generating'); setError(''); clearResults(); setSaved(false);
    try {
      const styleReference = useFree ? undefined : await loadPhotoStyleReference(style, abort.signal);
      const generateCandidate = async (prompt: string) => {
        let image = useFree ? await freeClient.generate({ style, source: source.blob, photoConsent: consent, signal: abort.signal }) : await generateMuseImage({ key, prompt, aspect: style === 'fashion' ? 'portrait' : source.width >= source.height ? 'landscape' : 'portrait', sourcePhoto: source.blob, styleReference, preserveSourceAspect: style === 'city', signal: abort.signal });
        if (style === 'city' && id === run.current && !abort.signal.aborted) image = await addCityInkMark(image, abort.signal);
        return image;
      };
      const publish = (value: QualityRun) => {
        if (id !== run.current || abort.signal.aborted) return;
        const next = value.candidates.map(candidate => {
          let url = urls.current.get(candidate.image.blob);if (!url) { url = URL.createObjectURL(candidate.image.blob);urls.current.set(candidate.image.blob, url); }
          return { ...candidate, url, preset, caption: style === 'fashion' ? 'My fashion illustration' : 'My City Ink illustration' };
        });
        setCandidates(next);setResult(next[value.best]);setQualityStatus(value.status);
      };
      if (!useFree && quality) {
        const value = await runQualityLoop({ prompt: preset.template, signal: abort.signal, generate: generateCandidate, judge: image => judgeImageQuality({ key, source: source.blob, reference: styleReference!, image, style, prompt: preset.template, signal: abort.signal }), update: publish });
        publish(value);
        if (id === run.current && value.status === 'generation-failed') setError('Image generation did not complete. No automatic retry was sent; any earlier candidate is retained. Meta may already have charged the request.');
      } else {
        const image = await generateCandidate(preset.template);
        publish({ candidates: [{ image }], best: 0, status: 'working' });setQualityStatus(undefined);
      }
    } catch (cause) {
      if (id === run.current) setError(cause instanceof Error ? cause.message : 'The illustration could not be generated. Nothing was added.');
    } finally { if (id === run.current) { controller.current = null; setBusy(null); } }
  };
  const stop = () => {
    controller.current?.abort(); run.current++; controller.current = null; setBusy(null);
    setQualityStatus(useFree ? undefined : 'stopped');setError(useFree ? 'Stopped. A request already sent may consume a free attempt. A late result will be ignored. Any received candidate is retained for review; trying again uses another attempt.' : 'Stopped. Meta may still generate or judge and bill the request. A late result will be ignored. Any received candidate is retained for review; trying again is a new charge.');
  };
  const save = async () => {
    if (!result || busy || saved || controller.current) return;
    const id = ++run.current, abort = new AbortController(); controller.current = abort; setBusy('saving'); setError('');
    try {
      const value = await addGeneratedImage(session, actor, result.image, result.preset, result.caption, { boardId: boardId.current }, { kind: 'private-memory' }, abort.signal);
      refresh();
      const persisted = await confirmImageSaved(value.persisted, whenSaved, abort.signal);
      if (id !== run.current) return;
      setSaved(persisted ? 'persisted' : 'tab-only'); notify(persisted ? 'Private illustration saved. Open Keepsakes → Magazine and include private artwork to preview it.' : 'Illustration is in this tab only. Download an editable backup before closing.');
    } catch (cause) { if (id === run.current) setError(cause instanceof Error ? cause.message : 'The illustration could not be saved.'); }
    finally { if (id === run.current) { controller.current = null; setBusy(null); } }
  };
  const download = () => { if (!result) return; const link = document.createElement('a'); link.href = result.url; link.download = `${result.preset.id}.${result.image.mime.split('/')[1]}`; link.click(); };
  return <section className="mot-muse-image mot-photo-fashion" aria-label={style === 'fashion' ? 'Fashion illustration from your photo' : 'City Ink from your photo'}>
    <header><h2>Your photo, illustrated</h2><p>Turn a photo you choose into an editorial illustration for your trip magazine. The original stays unchanged.</p></header>
    <div className="mot-muse-image-actions"><button type="button" className="m-btn" disabled={!!busy} onClick={onBack}>City and venue illustrations</button><button type="button" className="m-btn" onClick={onClose}>Close</button></div>
    <div className="mot-muse-image-actions" role="group" aria-label="Image generation funding"><button type="button" className={`m-btn${useFree ? ' primary' : ''}`} aria-pressed={useFree} disabled={!!busy} onClick={() => chooseFunding('free')}>Free hackathon preview</button><button type="button" className={`m-btn${!useFree ? ' primary' : ''}`} aria-pressed={!useFree} disabled={!!busy} onClick={() => chooseFunding('byok')}>Use my own key</button></div>
    {useFree && <div role="status"><p>{freeStatus ? freeStatus.available ? 'Free preview configured. Choose a photo and review the consent below.' : freeStatus.reason || 'The free image preview is unavailable.' : 'Checking the free image preview…'}</p><p className="m-muted">One image per request. Up to 2 attempts per browser guest identity in total, with 20 shared attempts per UTC day and 100 shared attempts for this preview. Availability is checked by the server and may run out. Failed, stopped or uncertain requests may consume an attempt. No automatic retries or quality judging are included.{freeStatus?.expiresAt ? ` Preview ends ${new Date(freeStatus.expiresAt).toLocaleString()}.` : ''}</p></div>}
    <label>Illustration treatment<select aria-label="Illustration treatment" className="m-field" value={style} disabled={!!busy} onChange={event => { setStyle(event.target.value as typeof style); clearResults(); setSaved(false); setConsent(false); setError(''); }}><option value="fashion">Fashion Illustration · people</option><option value="city">City Ink · streets and architecture</option></select></label>
    <label>Choose your photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void select(file); }} /></label>
    <p className="m-muted">{style === 'fashion' ? 'Choose a photo of one person.' : 'Choose a street or architecture photo. City Ink keeps the source aspect ratio and adds a local MoT mark.'} PNG, JPEG or simple static WebP, up to 10 MiB and 16 megapixels. A JPEG copy, at most 1,600 pixels on its longest side, is prepared locally without original file metadata. Nothing is uploaded when you choose it.</p>
    {source && <figure className="mot-photo-fashion-source"><img src={source.url} alt="Prepared photo selected for this request" /><figcaption>Prepared photo · {source.width} × {source.height}. The original file is not saved to the board.</figcaption></figure>}
    <details><summary>Illustration style and exact prompt</summary><p>{style === 'fashion' ? 'Fine ink contours, restrained flat colour and soft shading. Faces and clothing details may be redrawn.' : 'Fine architectural ink on white with a central blue band. MoT lettering is added locally in serif type after generation. Architecture and framing may be redrawn.'} The result is opaque; it is not a transparent cutout.</p><figure className="mot-photo-fashion-source"><img src={PHOTO_STYLE_REFERENCES[style].url} alt={PHOTO_STYLE_REFERENCES[style].label} loading="lazy" /><figcaption>IMAGE 2 · style only. Your prepared photo is IMAGE 1.</figcaption></figure><pre>{preset.template}</pre></details>
    <label className="mot-muse-image-ack"><input type="checkbox" checked={quality} disabled={!!busy || useFree} onChange={event => { setQuality(event.target.checked);setConsent(false); }} />Score and improve with the approved rubric (up to 3 images · own key only)</label>
    <p className="m-muted">{useFree ? 'The free preview generates one candidate. To use paid quality scoring and bounded retries, explicitly choose “Use my own key”.' : 'Optional: Muse Spark 1.3 Standard compares your photo, approved reference and each result using 20 criteria scored 1–5. It stops at 80/100 with every critical gate passed, or after three candidates. The best candidate is retained. Scores are model estimates; you choose and review the image before saving. If judging is unavailable, no automatic retry is sent.'}</p>
    <details><summary>Approved quality rubric · 20 criteria and five levels</summary><pre>{qualityRubric(style).text}</pre></details>
    <div className="mot-muse-image-disclosure" role="note"><strong>What leaves this device</strong>{useFree ? <p>Only when you press Generate: the prepared photo, selected style, consent and request ID go through the MoT server to Meta. The server supplies the approved reference and fixed style prompt. Your board, other photos, notes, bookings and original filename are not included. The MoT server does not persist the photo or result; usage records contain no image. Meta processes the images under its own terms; no retention promise is made here. The app owner funds this limited allowance. No key is needed from you. A stopped or failed request may consume an attempt.</p> : <><p>Only when you press Generate: this prepared photo as IMAGE 1, the approved style reference as IMAGE 2, the style prompt and your session key go directly from your browser to Meta at {MUSE_IMAGE_EDIT_ENDPOINT}. {quality && <>Quality review also sends those images and each generated candidate directly to {QUALITY_ENDPOINT}, using Standard mode, without search tools or the public Contributor endpoint. One run permits up to three image charges plus three token-priced vision reviews and may take several minutes. </>}Your board, other photos, notes and bookings are not included. No MoT server receives the key or photo. Meta processes these images under its own terms; no retention promise is made here. Your Meta account pays: {MUSE_IMAGE_PRICE_NOTE} (<a href={MUSE_IMAGE_PRICING_URL} target="_blank" rel="noopener noreferrer">current pricing</a>). A stopped or failed request may already have incurred a charge.</p>
      <label>Meta API key, for this session only<input className="m-field" type="password" autoComplete="off" spellCheck={false} value={key} disabled={!!busy} onChange={event => setKey(event.target.value)} /></label>
      <p className="m-muted">The key is kept in this panel's memory. Closing or switching panels drops it. It is never saved, logged or exported.</p>
      {key && <button type="button" className="m-btn small" disabled={!!busy} onClick={() => setKey('')}>Clear key</button>}</>}
      <label className="mot-muse-image-ack"><input type="checkbox" checked={consent} disabled={!!busy || !source} onChange={event => setConsent(event.target.checked)} />{useFree ? 'I have permission to use this photo and agree to send the prepared copy through the MoT server to Meta, with the approved style reference, using the limited free allowance.' : <>I have permission to use this photo and agree to send the prepared copy and approved style reference to Meta. My Meta account pays for {quality ? 'up to three images and three Standard vision reviews in this run' : 'this image'}.</>}</label>
    </div>
    <div className="mot-muse-image-actions"><button type="button" className="m-btn primary" disabled={!!busy || !source || (useFree ? !freeStatus?.available : !key.trim()) || !consent} onClick={() => void generate()}>{useFree ? result ? 'Generate another free image (uses an attempt)' : `Generate free ${treatment} illustration` : result ? 'Generate another (new charge)' : `Generate ${treatment} illustration`}</button>{busy === 'generating' && <button type="button" className="m-btn" onClick={stop}>Stop illustration</button>}</div>
    {busy && <p role="status">{busy === 'preparing' ? 'Preparing your photo locally…' : busy === 'saving' ? 'Saving the reviewed illustration…' : `Generating ${useFree ? 'with the free allowance' : 'with Muse Image'} · ${elapsed}s`}</p>}{error && <p role="alert">{error}</p>}
    {qualityStatus && <p role="status">{qualityStatus === 'working' ? `Quality run · candidate ${candidates.length}/3. Generating or checking all 20 criteria…` : qualityStatus === 'accepted' ? 'Best candidate meets the model-estimated target. Review it before saving.' : qualityStatus === 'limit' ? 'Three-candidate limit reached. The target was not met; inspect unresolved checks. Start another run only if you accept new charges.' : qualityStatus === 'unavailable' ? 'Quality judging unavailable or incomplete. The latest candidate is unscored; no automatic retry was sent. Earlier scored candidates are retained.' : qualityStatus === 'stopped' ? 'Quality run stopped. Received candidates remain available; no further requests will be sent.' : 'Generation stopped before a complete new candidate was received.'}</p>}
    {candidates.length > 1 && <fieldset disabled={!!busy}><legend>Choose a candidate to review</legend>{candidates.map((candidate, index) => <label key={candidate.url}><input type="radio" name="illustration-candidate" checked={result === candidate} onChange={() => { setResult(candidate);setSaved(false); }} />Candidate {index + 1} · {candidate.score ? `${candidate.score.total}/100 · ${candidate.score.accepted ? 'target met' : 'target not met'}` : 'unscored'}</label>)}</fieldset>}
    {result && <figure className="mot-muse-image-result"><img src={result.url} alt={`Generated ${treatment} illustration to review`} /><figcaption>{MUSE_IMAGE_CREDIT} · opaque background{style === 'city' ? ' · MoT lettering added locally' : ''}. Review the details and framing before saving.</figcaption><a href={result.url} target="_blank" rel="noopener noreferrer">Open full-resolution image to inspect at 100%</a>{result.score && <details><summary>Quality estimate · {result.score.total}/100 · {result.score.accepted ? 'target met' : 'target not met'}</summary><p>Compare the source, approved reference and candidate at fit-to-screen and 100%. These are model judgments, not guarantees. Local PNG delivery check: {result.score.deliveryOk ? 'passed' : 'failed'}.</p><ol>{result.score.gates.map(gate => <li key={gate.id}>{qualityRubric(style).gates[gate.id - 1]} — {gate.pass === null ? 'Unverified' : gate.pass ? 'Pass' : 'Fail'}: {gate.evidence} {gate.fix}</li>)}</ol><ol>{result.score.criteria.map(row => <li key={row.id}>{qualityRubric(style).criteria[row.id - 1]!.label}: {row.score}/5 — {row.evidence} {row.fix}</li>)}</ol><p>Preserve: {result.score.preserve.join(' ')}</p><p>Remaining defects: {result.score.defects.join(' ') || 'No main defect reported; inspect the full scorecard.'}</p></details>}<div className="mot-muse-image-actions"><button type="button" className="m-btn primary" disabled={!!busy || !!saved} onClick={() => void save()}>{saved === 'tab-only' ? 'Added privately · this tab only' : saved ? 'Saved privately for magazine' : 'Save private illustration for magazine'}</button><button type="button" className="m-btn" onClick={download}>Download illustration</button><button type="button" className="m-btn" disabled={!!busy} onClick={() => { clearResults(); setSaved(false); }}>Discard illustration</button></div></figure>}
    {saved && <p role="status">{saved === 'tab-only' ? 'Added as a private photo card in this tab only. Saving on this device was not confirmed. Download the illustration and a full editable ZIP backup before closing this tab.' : 'Saved as a private photo card in Remember.'} Open Keepsakes → Magazine, then select “Include private notes and artwork in this preview” to see it in your magazine. In Export, choose Review copy only when you want private content included. The source photo was not saved or changed.</p>}
  </section>;
}
