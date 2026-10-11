import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, defineChain, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { requireCheck, equalHex, root } from './deployment-checks.mjs';

const maximum = parseEther('2.5');
const directory = resolve(root, 'deployments/.pending');
const path = resolve(directory, 'ship-budget.json');

export async function createShipWriter(env, client) {
  const deployer = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
  const owner = privateKeyToAccount(env.AGENT_OWNER_PRIVATE_KEY);
  const rpc = env.MONAD_RPC_URL;
  const chain = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } } });
  const wallets = [deployer, owner].map(account => createWalletClient({ chain, account, transport: http(rpc, { timeout: 15000, retryCount: 0 }) }));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const balance = await client.getBalance({ address: deployer.address });
  const baseline = parseEther('4.01');
  const ledger = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8'))
    : { chainId: 10143, deployer: deployer.address, maximumWei: maximum.toString(), startedAt: new Date().toISOString(),
      initialObservedDebitWei: (baseline > balance ? baseline - balance : 0n).toString(),
      initialDebitScope: 'Conservative debit from the independently checked 4.01 MON pre-task balance, including owner funding', transactions: [] };
  requireCheck(ledger.chainId === 10143 && equalHex(ledger.deployer, deployer.address) && ledger.maximumWei === maximum.toString(), 'Ship budget belongs to another deployment');
  requireCheck(ledger.transactions.every(item => ['success', 'reverted'].includes(item.status)), 'Unresolved ship transaction: reconcile saved intent before retrying');
  const save = () => {
    writeFileSync(`${path}.tmp`, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  };
  const spent = () => ledger.transactions.filter(item => equalHex(item.from, deployer.address))
    .reduce((total, item) => total + BigInt(item.feeWei ?? '0') + BigInt(item.valueWei), BigInt(ledger.initialObservedDebitWei ?? '0'));
  save();
  return { ledger, deployer, owner, chain,
    spentWei: spent,
    async send({ label, data = '0x', to, value = 0n, role = 'deployer', gas, expected = 'success' }) {
      requireCheck(await client.getChainId() === 10143, 'Ship RPC chain changed');
      requireCheck(ledger.transactions.every(item => ['success', 'reverted'].includes(item.status)), 'Previous ship transaction is unresolved');
      const account = role === 'owner' ? owner : deployer;
      const wallet = wallets[role === 'owner' ? 1 : 0];
      const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'latest' });
      requireCheck(nonce === await client.getTransactionCount({ address: account.address, blockTag: 'pending' }), 'Ship wallet has pending transactions');
      const gasPrice = await client.getGasPrice();
      requireCheck(gasPrice > 0n && gasPrice <= 150000000000n, 'Gas price exceeds the ship allowance');
      const estimate = gas ?? await client.estimateGas({ account: account.address, to, data, value });
      const limit = gas ?? (estimate * 130n + 99n) / 100n;
      const reserve = limit * gasPrice + value;
      requireCheck(role === 'owner' || spent() + reserve <= maximum, 'STOP: transaction would exceed the total 2.5 MON deployer budget');
      requireCheck(await client.getBalance({ address: account.address }) >= reserve, 'Ship wallet cannot fund this transaction');
      const intent = { label, chainId: 10143, from: account.address, to: to ?? null, calldata: data, valueWei: value.toString(),
        nonce, gasLimit: limit.toString(), gasPriceWei: gasPrice.toString(), status: 'prepared' };
      ledger.transactions.push(intent); save();
      const hash = await wallet.sendTransaction({ account, chain, to, data, value, gas: limit, gasPrice, nonce, type: 'legacy' });
      intent.txHash = hash; intent.status = 'pending'; save();
      console.log(JSON.stringify({ action: label, txHash: hash, explorer: `https://testnet.monadscan.com/tx/${hash}` }));
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180000 });
      const transaction = await client.getTransaction({ hash });
      requireCheck(transaction.nonce === nonce && equalHex(transaction.from, account.address)
        && transaction.gas === limit && equalHex(transaction.input, data) && transaction.value === value
        && equalHex((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash), 'Ship receipt differs from prepared transaction');
      Object.assign(intent, { status: receipt.status, block: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
        contractAddress: receipt.contractAddress ?? null, gasUsed: receipt.gasUsed.toString(),
        feeWei: (transaction.gas * receipt.effectiveGasPrice).toString() });
      save();
      requireCheck(receipt.status === expected, 'Ship transaction did not have its expected receipt status');
      console.log(JSON.stringify({ action: label, status: receipt.status, deployerSpentMON: formatEther(spent()) }));
      return { receipt, transaction, block: await client.getBlock({ blockNumber: receipt.blockNumber }) };
    },
  };
}
