import type { Abi } from 'viem';
import creator from '../../contracts/ERC1155TL.abi.json';
import stacks from '../../contracts/TLStacks1155.abi.json';
export const creatorAbi = creator as Abi;
export const stacksAbi = stacks as Abi;
