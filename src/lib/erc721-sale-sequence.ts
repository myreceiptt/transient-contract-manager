/** Owner-only, off-chain preparation for sequential TLStacks721 ERC721 releases.
 * No pinning, signature, contract call or publication. Created_at never updated_at. */
export const GO_SALE_POLICY = {
  total: 30,
  rounds: [
    {round: 1, phase: 'presale_whitelist', supply: 3, priceEth: '0', walletLimit: 3, allowlistedWalletCount: 1},
    {round: 2, phase: 'public_sale', supply: 27, priceEth: '0.025', walletLimit: 10, allowlistedWalletCount: null},
  ],
} as const;
export type Draft = {
  id: string; kind: string; created_at?: string; archived_at?: string|null;
  version: number; draft: Record<string,unknown>;
};
export type SequenceItem = {
  position:number; expectedTokenIdIfFreshCollection:number; round:1|2;
  phase:'presale_whitelist'|'public_sale'; folderIndex:number; folderFile:string;
  draftId:string; draftCreatedAtUtc:string; draftRevisionAtSnapshot:number;
  titleAtSnapshot:string; imageUri:string; sourceMetadataUri:string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imageCid = /^ipfs:\/\/bafy[a-z2-7]+$/;
const jsonCid = /^ipfs:\/\/bafkrei[a-z2-7]{52}$/;
function createdAt(value:string) {
  // PostgreSQL JSON timestamps retain microseconds; Date#toISOString drops them.
  const m=value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/);
  if(!m || !Number.isFinite(Date.parse(value))) throw new Error('Invalid original UTC creation timestamp.');
  return m[1]+'.'+(m[2]||'').padEnd(6,'0')+'Z';
}
export function prepareSequence(rows:readonly Draft[]):SequenceItem[] {
  const active=rows.filter(row=>row.kind==='ARTWORK' && !row.archived_at);
  if(active.length!==30)throw new Error('Expected exactly 30 active Artwork drafts; found '+active.length+'.');
  const ordered=[...active].sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||a.id.localeCompare(b.id));
  const ids=new Set<string>(),images=new Set<string>(),metadata=new Set<string>();
  return ordered.map((row,i)=>{
    if(!row.created_at)throw new Error('Missing first-save timestamp at #'+(i+1));
    const when=createdAt(row.created_at);
    const title=row.draft.title, image=row.draft.image, uri=row.draft.metadataUri;
    if(!uuid.test(row.id)||ids.has(row.id))throw new Error('Invalid or duplicate draft ID at #'+(i+1));
    if(typeof title!=='string'||!title.trim())throw new Error('Missing title at #'+(i+1));
    if(typeof image!=='string'||!imageCid.test(image)||images.has(image))
      throw new Error('Missing or duplicate image CID at #'+(i+1));
    if(typeof uri!=='string'||!jsonCid.test(uri)||metadata.has(uri))
      throw new Error('Missing or duplicate JSON CID at #'+(i+1));
    ids.add(row.id);images.add(image);metadata.add(uri);
    const round:1|2=i<3?1:2, index=round===1?i:i-3;
    return {position:i+1,expectedTokenIdIfFreshCollection:i+1,round,
      phase:round===1?'presale_whitelist':'public_sale',folderIndex:index,
      folderFile:String(index),draftId:row.id,draftCreatedAtUtc:when,
      draftRevisionAtSnapshot:row.version,titleAtSnapshot:title,imageUri:image,
      sourceMetadataUri:uri};
  });
}
/** Approved original snapshot is supplied privately in the browser; never hard-coded in public source. */
export function verifyApprovedManifest(raw:unknown, live:readonly SequenceItem[],chainId:number,contract:string) {
  if(!raw || typeof raw!=='object')throw new Error('Select the approved JSON Manifest v1.');
  const obj=raw as Record<string,unknown>;
  const collection=obj.collection as Record<string,unknown>|undefined;
  const approval=obj.approval as Record<string,unknown>|undefined;
  if(obj.schema!=='prof-nota-go-one-of-one-artwork-order/v1'||
    collection?.chainId!==chainId||
    String(collection?.contract).toLowerCase()!==contract.toLowerCase()||
    approval?.status!=='OFFCHAIN_ORDER_APPROVED')
      throw new Error('Manifest schema, collection or approval does not match.');
  if(!Array.isArray(obj.artworks)||obj.artworks.length!==30||live.length!==30)
    throw new Error('Approved sequence requires exactly 30 artworks.');
  for(let i=0;i<30;i++){
    const a=obj.artworks[i] as Record<string,unknown>|null, b=live[i];
    if(!a||a.position!==b.position||a.draftId!==b.draftId||
      a.draftCreatedAtUtc!==b.draftCreatedAtUtc||a.round!==b.round||
      a.folderFile!==b.folderFile)
      throw new Error('Approved order mismatch at #'+(i+1));
    if(a.sourceMetadataUri!==b.sourceMetadataUri||a.imageUri!==b.imageUri)
      throw new Error('Metadata or image CID changed at #'+(i+1)+'; review a new manifest version.');
  }
  return {approved:true,checked:30} as const;
}
export function exportSalePreparation(chainId:number,contract:string,artworks:readonly SequenceItem[]) {
  if(chainId!==1||!/^0x[0-9a-fA-F]{40}$/.test(contract)||artworks.length!==30)
    throw new Error('Only a complete Ethereum Mainnet collection can be exported.');
  return {schema:'prof-nota-erc721-sale-preparation/v1',collection:{chainId,contract},
    salePolicy:GO_SALE_POLICY,metadataFolderCids:{presale:null,public:null},
    presaleWallet:null,status:'OFFCHAIN_PREPARATION_ONLY',
    onChainSaleConfigured:false,tokenIdSequenceRequiresFreshCounter:true,artworks};
}
