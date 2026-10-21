import fs from 'node:fs';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import creatorCompiler from 'solc';
import stacksCompiler from 'solc-stacks';
const specs = [
  {
    name: 'ERC1155TL',
    source: 'src/erc-1155/ERC1155TL.sol',
    input: 'go1',
    compiler: creatorCompiler,
    hash: '0x182a242cdc62526343ae489f36ec62fe36f9069bd9bc79315a613ad1e4e69294',
  },
  {
    name: 'TLStacks1155',
    source: 'src/TLStacks1155.sol',
    input: 'stacks',
    compiler: stacksCompiler,
    hash: '0x02e6dcd7e74c8a3337cd56868fc5eacd8e0f4cd24fb8975934d47605d46053b7',
  },
];
for (const s of specs) {
  const input = JSON.parse(fs.readFileSync(`contracts/${s.input}.standard-input.json`));
  input.settings.outputSelection = {
    '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
  };
  const out = JSON.parse(s.compiler.compile(JSON.stringify(input)));
  const errors = out.errors?.filter((e) => e.severity === 'error') || [];
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const artifact = out.contracts[s.source][s.name];
  const deployedBytecode = '0x' + artifact.evm.deployedBytecode.object;
  assert.equal(
    keccak256(deployedBytecode),
    s.hash,
    s.name + ' runtime differs from verified deployment',
  );
  fs.writeFileSync(
    `contracts/${s.name}.artifact.json`,
    JSON.stringify(
      {
        compiler: s.compiler.version(),
        abi: artifact.abi,
        bytecode: '0x' + artifact.evm.bytecode.object,
        deployedBytecode,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(`contracts/${s.name}.abi.json`, JSON.stringify(artifact.abi, null, 2));
  console.log(s.name, s.compiler.version(), 'runtime matched', s.hash);
}
