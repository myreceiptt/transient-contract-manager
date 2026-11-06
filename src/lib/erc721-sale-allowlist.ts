import {encodeAbiParameters,getAddress,keccak256,type Address,type Hex} from 'viem';

/**
 * One-recipient TLStacks721 v2.3.1 presale, independent of caller/payer.
 * Official Solidity: hashedRecipient = keccak256(abi.encode(recipient));
 * leaf = keccak256(bytes.concat(keccak256(abi.encode(hashedRecipient, presaleNumberCanMint))));
 * For exactly ONE recipient, the OpenZeppelin Merkle proof is [] and root = leaf.
 * This module NEVER publishes a drop, posts a proof, or requests a wallet signature.
 */
export const GO_PRESALE_ALLOCATION = 3 as const;
export type OneWalletPresale = {
  schema:'prof-nota-tlstacks721-single-wallet-presale/v1';
  collection:{chainId:1;contract:Address};
  recipient:Address;
  allowedRecipientCount:1;
  presaleSupply:3;
  presaleNumberCanMint:3;
  presaleCostEth:'0';
  merkleRoot:Hex;
  merkleProof:readonly [];
  status:'OFFCHAIN_PREPARATION_ONLY';
};

export function singleWalletPresaleRoot(recipient:string,numberCanMint:number=GO_PRESALE_ALLOCATION){
  if(numberCanMint!==GO_PRESALE_ALLOCATION)
    throw new Error('GO#|O presale allocation must be exactly 3 per allowlisted recipient.');
  const address=getAddress(recipient);
  const hashedRecipient=keccak256(encodeAbiParameters([{type:'address'}],[address]));
  const encoded=encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[hashedRecipient,3n]);
  const merkleRoot=keccak256(keccak256(encoded));
  return {recipient:address,merkleRoot,merkleProof:[] as const};
}

export function prepareOneWalletPresale(
  recipient:string,chainId:number,contract:string,
):OneWalletPresale{
  if(chainId!==1)throw new Error('Only Ethereum Mainnet collection preparation is supported.');
  const collection=getAddress(contract);
  const {recipient:wallet,merkleRoot,merkleProof}=singleWalletPresaleRoot(recipient);
  return {
    schema:'prof-nota-tlstacks721-single-wallet-presale/v1',
    collection:{chainId:1,contract:collection},
    recipient:wallet,
    allowedRecipientCount:1,
    presaleSupply:3,
    presaleNumberCanMint:3,
    presaleCostEth:'0',
    merkleRoot,merkleProof,
    status:'OFFCHAIN_PREPARATION_ONLY',
  };
}

/** Verifies the operator-provided local file, including root recomputation. */
export function verifyOneWalletPresaleFile(
  value:unknown,chainId:number,contract:string,
):OneWalletPresale{
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('Select the single-wallet presale JSON file.');
  const o=value as Record<string,unknown>;
  const collection=o.collection as Record<string,unknown>|undefined;
  if(o.schema!=='prof-nota-tlstacks721-single-wallet-presale/v1'||
    o.status!=='OFFCHAIN_PREPARATION_ONLY'||
    collection?.chainId!==chainId||
    typeof collection?.contract!=='string'||
    getAddress(collection.contract)!==getAddress(contract)||
    o.allowedRecipientCount!==1||
    o.presaleSupply!==3||
    o.presaleNumberCanMint!==3||
    o.presaleCostEth!=='0'||
    !Array.isArray(o.merkleProof)||o.merkleProof.length!==0)
      throw new Error('Whitelist file does not match the approved 3-NFT one-wallet policy.');
  if(typeof o.recipient!=='string'||typeof o.merkleRoot!=='string')
    throw new Error('Whitelist file lacks a recipient or Merkle root.');
  const expected=prepareOneWalletPresale(o.recipient,chainId,contract);
  if(o.merkleRoot!==expected.merkleRoot)
    throw new Error('Merkle root mismatch: file is not valid for the recipient and allowance 3.');
  return expected;
}
