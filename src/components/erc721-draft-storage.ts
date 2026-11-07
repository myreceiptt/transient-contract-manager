'use client';
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/api-client';
import {useSession} from './providers';

export type SavedErc721Draft={
  id:string;kind:'ARTWORK'|'MINT_PAGE'|'AUCTION';
  identity:string;actor:string;version:number;
  draft:Record<string,unknown>;archived_at:string|null;updated_at:string;
};
type Kind=SavedErc721Draft['kind'];

/** Explicit manual load/save; no background SIWE prompts on tab navigation.
 * Enabled only once a separate, verified schema rollout is authorized.
 */
export function useErc721Drafts(kind:Kind,chainId:number,contract:string,canManage:boolean){
  const {ensureSession}=useSession();
  const [enabled,setEnabled]=useState(false);
  const [statusNote,setStatusNote]=useState('Checking draft persistence availability…');
  const [records,setRecords]=useState<SavedErc721Draft[]>([]);
  const [active,setActive]=useState<SavedErc721Draft|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let alive=true;
    setEnabled(false);setRecords([]);setActive(null);setMessage('');
    api('erc721_draft_status').then((r:any)=>{
      if(alive){setEnabled(Boolean(r.enabled));setStatusNote(String(r.note||''));}
    }).catch(()=>{
      if(alive){setEnabled(false);setStatusNote('Draft storage availability could not be verified.');}
    });
    return()=>{alive=false;};
  },[chainId,contract,kind,canManage]);
  const load=useCallback(async()=>{
    if(!canManage||!enabled)return;
    setBusy(true);setError('');setMessage('');
    try{
      await ensureSession(chainId);
      const rows=await api('erc721_draft_list',{chainId,contract,kind});
      setRecords(rows as SavedErc721Draft[]);
      setMessage('Saved draft index loaded. No blockchain transaction occurred.');
      return rows as SavedErc721Draft[];
    }catch(e){setError(e instanceof Error?e.message:'Could not load drafts.');}
    finally{setBusy(false);}
  },[canManage,enabled,ensureSession,chainId,contract,kind]);
  async function save(data:Record<string,unknown>,item:SavedErc721Draft|null=active){
    if(!canManage||!enabled){setError('Draft persistence not enabled for this wallet or environment.');return null;}
    setBusy(true);setError('');setMessage('');
    try{
      await ensureSession(chainId);
      const row=await api(item?'erc721_draft_save':'erc721_draft_create',{
        chainId,contract,kind,data,
        ...(item?{id:item.id,expectedVersion:item.version}:{})
      }) as SavedErc721Draft;
      setActive(row);
      setRecords(prev=>[row,...prev.filter(v=>v.id!==row.id)]);
      setMessage('Draft revision '+row.version+' saved off-chain. No NFT or sale created.');
      return row;
    }catch(e){setError(e instanceof Error?e.message:'Could not save draft.');return null;}
    finally{setBusy(false);}
  }
  async function archive(item:SavedErc721Draft){
    if(!canManage||!enabled)return;
    setBusy(true);setError('');setMessage('');
    try{
      await ensureSession(chainId);
      await api('erc721_draft_archive',{
        chainId,contract,kind,id:item.id,expectedVersion:item.version,
      });
      setRecords(prev=>prev.filter(v=>v.id!==item.id));
      setActive(prev=>prev?.id===item.id?null:prev);
      setMessage('Draft archived off-chain. No NFT or on-chain listing affected.');
    }catch(e){setError(e instanceof Error?e.message:'Archive failed.');}
    finally{setBusy(false);}
  }
  return {enabled,statusNote,records,active,setActive,busy,error,message,load,save,archive,
    clearFeedback:()=>{setError('');setMessage('');}};
}
