import{useEffect,useRef,type ReactNode}from'react';
/** Keep room context mounted while the modal is hidden; actual context changes dispose its controller. */
export function SharedRoomSheet({active,label,onClose,children}:{active:boolean;label:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current!;if(active&&!node.open)node.showModal();else if(!active&&node.open)node.close();return()=>{if(node.open)node.close();};},[active]);
 return <dialog ref={ref} className="mot-dialog" hidden={!active} aria-label={label} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===ref.current)onClose();}}>{children}</dialog>;
}
