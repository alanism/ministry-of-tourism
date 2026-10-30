/** Recover only the known misdecoded FCC title punctuation; source bodies stay exact. */
export function recoverFccTitle(value:string):string {
  return value.replace(/\u00c2\u00b7/g,'·').replace(/\u00e2\u20ac\u2122/g,'’').replace(/\u00e2\u20ac\u201c/g,'–').replace(/\u00e2\u20ac\u201d/g,'—');
}
