import type {DiagnosticErrorClass,DiagnosticStep} from '@writers-board/core';
import type {ArtifactProgress} from './artifacts';
export type ZipFeedbackStep=DiagnosticStep;
export interface ZipFeedback {status:'failed'|'cancelled';step:ZipFeedbackStep;stepLabel:string;errorClass:DiagnosticErrorClass;message:string;}
const STEP_LABELS:Record<ZipFeedbackStep,string>={collect:'collect the board',layout:'copy art and credits',write:'write the ZIP',verify:'read it back',persist:'keep it in this browser'};
const ERROR_CLASSES=new Set<DiagnosticErrorClass>(['failed','cancelled','timed_out','unavailable','invalid_input','storage','network','rate_limited','quota_exhausted']);
const STAGES=['collect','layout','write','verify'] as const;
function validStep(value:unknown):ZipFeedbackStep|undefined{return typeof value==='string'&&Object.hasOwn(STEP_LABELS,value)?value as ZipFeedbackStep:undefined;}
export function zipStepFromProgress(progress:Partial<Record<ArtifactProgress['stage'],ArtifactProgress>>={}):ZipFeedbackStep{
  const active=[...STAGES].reverse().find(stage=>progress[stage]&&!progress[stage]!.done);
  if(active)return active;
  const present=[...STAGES].reverse().find(stage=>progress[stage]);
  return present??'collect';
}
export function zipFeedback(input:{aborted?:boolean;errorClass?:DiagnosticErrorClass;step?:unknown;progress?:Partial<Record<ArtifactProgress['stage'],ArtifactProgress>>}):ZipFeedback{
  const status=input.aborted||input.errorClass==='cancelled'?'cancelled':'failed';
  const errorClass=status==='cancelled'?'cancelled':input.errorClass&&ERROR_CLASSES.has(input.errorClass)?input.errorClass:'failed';
  const step=validStep(input.step)??zipStepFromProgress(input.progress);
  const stepLabel=STEP_LABELS[step];
  if(status==='cancelled')return {status,step,stepLabel,errorClass,message:`Cancelled while trying to ${stepLabel}. No ZIP was marked ready. Your board is unchanged.`};
  const detail=errorClass==='unavailable'?`A selected image is unavailable while trying to ${stepLabel}. Restore its original bytes and try again.`
    :errorClass==='invalid_input'?`A selected image failed its checksum while trying to ${stepLabel}. Restore its original bytes and try again.`
    :errorClass==='storage'?`The ZIP could not be kept safely while trying to ${stepLabel}.`
    :errorClass==='timed_out'?`The package timed out while trying to ${stepLabel}.`
    :`The package stopped while trying to ${stepLabel}.`;
  return {status,step,stepLabel,errorClass,message:`${detail} No ZIP was marked ready. Your board is unchanged.`};
}
