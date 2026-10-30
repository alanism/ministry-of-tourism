import type {DiagnosticErrorClass} from '@writers-board/core';
export const exportSteps={pdf:{collect:'Gather the art',layout:'Lay out the pages',write:'Write the PDF',verify:'Read it back'},zip:{collect:'Collect board, layout and notes',layout:'Copy art and credits',write:'Write the ZIP',verify:'Read it back'}} as const;
type Format=keyof typeof exportSteps;
type Step=keyof typeof exportSteps.pdf;
const reasons:Partial<Record<DiagnosticErrorClass,string>>={
 decode:'A picture could not be rendered.',empty:'Add a card or artwork before exporting.',
 network:'The source could not be reached. Check your connection before retrying.',
 storage:'A saved picture or export could not be read or written on this device.',
 timed_out:'The export took too long. Try again.',unavailable:'Export is unavailable in this browser.',
 invalid_input:'Some export content could not be used. Check the selected content and try again.',
};
/** Accept only internal step/class codes; exception text never enters traveler-facing copy. */
export function exportFailureText(format:Format,step:Step,errorClass:DiagnosticErrorClass):string{
 const label=Object.hasOwn(exportSteps[format],step)?exportSteps[format][step]:exportSteps[format].collect;
 if(errorClass==='cancelled')return `Cancelled at “${label}”. Nothing was downloaded. Your board is unchanged.`;
 const reason=Object.hasOwn(reasons,errorClass)?reasons[errorClass]:'The export could not finish.';
 return `${reason} Stopped at “${label}”. Nothing was written. Your board is unchanged.`;
}
