import fs from 'node:fs';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import creatorCompiler from 'solc';
import stacksCompiler from 'solc-stacks';
const specs = [
  {
    name: 'TLStacks721',
    source: 'src/TLStacks721.sol',
    input: 'stacks721',
    compiler: stacksCompiler,
    hash: '0xd63c5a1f574a2c03b17985a72615c25f51362f38e8369cb75ad0c9232fdbc9ce',
  },
  {
    name: 'ERC721TL',
    source: 'src/erc-721/ERC721TL.sol',
    input: 'erc721',
    compiler: creatorCompiler,
    hash: '0x3ef32f426fbb9aadd50d894e5c9a8cfea059f7c02106e692e871508da62b05f4',
  },
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
    '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'storageLayout'] },
  };
  const out = JSON.parse(s.compiler.compile(JSON.stringify(input)));
  const errors = out.errors?.filter((e) => e.severity === 'error') || [];
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const artifact = out.contracts[s.source][s.name];
  if (s.name === 'ERC721TL') {
    for (const [label, slot] of [['_counter', '0'], ['_burnCounter', '1']]) {
      const field = artifact.storageLayout.storage.find((v) => v.label === label);
      assert.equal(field?.slot, slot, 'Token history storage slot changed');
      assert.equal(field?.offset, 0);
      assert.equal(field?.type, 't_uint256');
    }
  }
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
