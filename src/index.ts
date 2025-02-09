import {
  BroadcastMode,
  coinsFromString,
  SecretNetworkClient,
  Wallet,
} from "secretjs";
import { AminoWallet } from "secretjs/dist/wallet_amino";
import { GetLatestBlockResponse } from "secretjs/dist/grpc_gateway/cosmos/base/tendermint/v1beta1/query.pb";

const TXS_TO_SEND = 1;

const URL = "http://127.0.0.1:1317";
const CHAIN_ID = "chain-1";

const DENOM = "uscrt";
const FAUCET_MNEMONIC =
  "grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar";
const WALLET_OPTS = {
  bech32Prefix: "cosmos",
  coinType: 118,
};

function sleep(ms: number) {
  return new Promise((accept) => setTimeout(accept, ms));
}

function log(s: string) {
  console.log(new Date().toISOString(), s);
}

async function createAccounts(): Promise<SecretNetworkClient[]> {
  log("creating accounts...");

  const faucetWallet = new Wallet(FAUCET_MNEMONIC, WALLET_OPTS);
  const faucetClient = new SecretNetworkClient({
    url: URL,
    chainId: CHAIN_ID,
    wallet: faucetWallet,
    walletAddress: faucetWallet.address,
  });

  log("generating wallets...");

  const userClients = new Array(TXS_TO_SEND).fill(0).map((_) => {
    const userWallet = new AminoWallet(undefined, WALLET_OPTS); // replace with Wallet for direct
    return new SecretNetworkClient({
      url: URL,
      chainId: CHAIN_ID,
      wallet: userWallet,
      walletAddress: userWallet.address,
    });
  });

  log("funding wallets...");

  const batchSize = 5;
  const numBatches = Math.ceil(TXS_TO_SEND / batchSize);

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const end = Math.min((i + 1) * batchSize + 1, TXS_TO_SEND);

    log(`funding accounts ${start + 1} - ${end} out of ${TXS_TO_SEND}...`);

    const userAmmount = coinsFromString(`${1e6}${DENOM}`);
    const batchAmount = coinsFromString(`${1e6 * (end - start)}${DENOM}`);

    const tx = await faucetClient.tx.bank.multiSend(
      {
        inputs: [
          {
            address: faucetClient.address,
            coins: batchAmount,
          },
        ],
        outputs: userClients.slice(start, end).map((user) => ({
          address: user.address,
          coins: userAmmount,
        })),
      },
      {
        gasLimit: 100_000_000,
      }
    );
    if (tx.code != 0) {
      throw tx.rawLog;
    }
  }

  await sleep(5_000);

  return userClients;
}

async function sendTxs(wallets: SecretNetworkClient[]): Promise<void> {
  log("sending txs...");

  for (const user of wallets) {
    try {
      const account = await user.query.auth.account({ address: user.address });
      const balance = await user.query.bank.balance({
        address: user.address,
        denom: DENOM,
      });
      console.log(`Account ${user.address}:`, {
        exists: !!account,
        accountDetails: account,
        balance: balance,
      });
    } catch (e) {
      console.error(`Error querying account ${user.address}:`, e);
    }
  }

  await Promise.all(
    wallets.map((user) =>
      user.tx.bank.send(
        {
          from_address: user.address,
          to_address: user.address,
          amount: coinsFromString(`1${DENOM}`),
        },
        {
          broadcastMode: BroadcastMode.Async,
          waitForCommit: false,
          gasLimit: 25_000,
          gasPriceInFeeDenom: 0.1,
          feeDenom: DENOM,
        }
      )
    )
  ).catch((error) => {
    console.error("Failed to process transactions");
    throw error;
  });
}

async function waitForTxsToFinish(
  client: SecretNetworkClient
): Promise<GetLatestBlockResponse> {
  log("waiting for txs to finish...");

  await sleep(30_000);

  let endBlock = await client.query.tendermint.getLatestBlock({});
  while (endBlock.block?.data?.txs?.length! > 0) {
    await sleep(3_000);
    endBlock = await client.query.tendermint.getLatestBlock({});
  }

  return endBlock;
}

async function summarizeResults(
  client: SecretNetworkClient,
  startBlock: GetLatestBlockResponse,
  endBlock: GetLatestBlockResponse
): Promise<void> {
  const startHeight = Number(startBlock.block?.header?.height!);
  const endHeight = Number(endBlock.block?.header?.height!);

  const heightTxs: Map<string, number> = new Map();
  const heightTimes: Map<string, string> = new Map();
  for (let i = startHeight + 1; i <= endHeight; i++) {
    const block = await client.query.tendermint.getBlockByHeight({
      height: String(i),
    });
    heightTxs.set(
      block.block?.header?.height!,
      block.block?.data?.txs?.length!
    );
    heightTimes.set(
      block.block?.header?.height!,
      String(block.block?.header?.time!)
    );
  }

  console.log(
    "txs per block",
    new Date().toISOString(),
    Object.fromEntries(heightTxs.entries())
  );

  console.log(
    "block times",
    new Date().toISOString(),
    Object.fromEntries(heightTimes.entries())
  );
}

async function main() {
  const client = new SecretNetworkClient({
    url: URL,
    chainId: CHAIN_ID,
  });

  const wallets = await createAccounts();

  const startBlock = await client.query.tendermint.getLatestBlock({});

  await sendTxs(wallets);

  const endBlock = await waitForTxsToFinish(client);

  await summarizeResults(client, startBlock, endBlock);
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
