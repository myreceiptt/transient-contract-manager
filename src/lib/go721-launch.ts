import { keccak256, stringToHex, parseAbi } from 'viem';
import { GO_APPROVED_TERMS } from './erc721-sale-terms';

// Already pinned, saved and audited by the Owner/Admin on 7 November 2026.
// Launch reads these immutable identities; it never uploads or audits them again.
export const GO721_FOLDERS = {
  1: 'ipfs://bafybeie5uy556z3ba4wkwe2domvbpsprozhcliqz35dza3k4bk27cswyfu',
  2: 'ipfs://bafybeiasexly6h7rzmfhrqptcjq5hroiycwljllt5vmbaccfos74lc7ds4',
} as const;
export const GO721_RUNTIME = '0xd63c5a1f574a2c03b17985a72615c25f51362f38e8369cb75ad0c9232fdbc9ce';
export const GO721_DRAFT_ID = '4b1754ec-ca94-492f-aca5-d2aa69394781';
export const GO721_CAMPAIGN_KEY = keccak256(stringToHex(JSON.stringify({
  terms: GO_APPROVED_TERMS, folders: GO721_FOLDERS, runtime: GO721_RUNTIME,
  presaleDuration: 86400,
})));
export const GO721_MINTER_ROLE = keccak256(stringToHex('APPROVED_MINT_CONTRACT'));
export const go721CreatorStateAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function setRole(bytes32 role,address[] accounts,bool status)',
  'function hasRole(bytes32 role,address account) view returns (bool)',
]);
export const go721PurchaseAbi = parseAbi([
  'function purchase(address nftAddress,address recipient,uint256 numberToMint,uint256 presaleNumberCanMint,bytes32[] proof) payable returns (uint256)',
  'event Purchase(address indexed nftAddress,address nftReceiver,address currencyAddress,uint256 amount,uint256 price,int256 decayRate,bool isPresale)',
]);
export type Go721Action =
  | { type: 'grant' }
  | { type: 'configure'; round: 1 | 2; startTime?: number }
  | { type: 'purchase'; quantity: number };
