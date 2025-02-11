import {
  BroadcastMode,
  coinsFromString,
  SecretNetworkClient,
  Wallet,
} from "secretjs";
import { AminoWallet } from "secretjs/dist/wallet_amino";
import { GetLatestBlockResponse } from "secretjs/dist/grpc_gateway/cosmos/base/tendermint/v1beta1/query.pb";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import {
  assertIsDeliverTxSuccess,
  SigningStargateClient,
  StargateClient,
  coin,
  GasPrice,
} from "@cosmjs/stargate";
import { MsgMultiSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";

const TXS_TO_SEND = 1;

const RPC_URL = "http://127.0.0.1:26657";
const CHAIN_ID = "chain-1";

const DENOM = "uatom";
const FAUCET_MNEMONIC =
  "grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar";

function sleep(ms: number) {
  return new Promise((accept) => setTimeout(accept, ms));
}

function log(s: string) {
  console.log(new Date().toISOString(), s);
}

type UserClient = {
  wallet: DirectSecp256k1HdWallet;
  client: SigningStargateClient;
  address: string;
};

async function createAccounts(): Promise<Array<UserClient>> {
  log("creating accounts...");

  const faucetWallet = await DirectSecp256k1HdWallet.fromMnemonic(
    FAUCET_MNEMONIC
  );
  const faucetClient = await SigningStargateClient.connectWithSigner(
    RPC_URL,
    faucetWallet,
    {
      gasPrice: GasPrice.fromString("0.01uatom"),
    }
  );
  const [faucetAccount] = await faucetWallet.getAccounts();

  log("generating wallets...");

  const users = await Promise.all(
    Array.from({ length: TXS_TO_SEND }, async () => {
      const userWallet = await DirectSecp256k1HdWallet.generate(24);
      const userClient = await SigningStargateClient.connectWithSigner(
        RPC_URL,
        userWallet
      );
      const [userAccount] = await userWallet.getAccounts();
      return {
        wallet: userWallet,
        client: userClient,
        address: userAccount.address,
      };
    })
  );

  log("funding wallets...");

  const batchSize = 5;
  const numBatches = Math.ceil(TXS_TO_SEND / batchSize);

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const end = Math.min((i + 1) * batchSize, TXS_TO_SEND);

    log(`funding accounts ${start + 1} - ${end} out of ${TXS_TO_SEND}...`);

    const userAmount = coin(1e6, DENOM);
    const batchAmount = coin(1e6 * (end - start), DENOM);

    const msg = {
      typeUrl: MsgMultiSend.typeUrl,
      value: MsgMultiSend.fromPartial({
        inputs: [
          {
            address: faucetAccount.address,
            coins: [batchAmount],
          },
        ],
        outputs: users.slice(start, end).map(({ address }) => ({
          address: address,
          coins: [userAmount],
        })),
      }),
    };

    // Breaks here: Error: Invalid string. Length must be a multiple of 4
    const result = await faucetClient.signAndBroadcast(
      faucetAccount.address,
      [msg],
      "auto"
    );

    assertIsDeliverTxSuccess(result);
  }

  await sleep(5_000);

  return users;
}

async function sendTxs(users: Array<UserClient>): Promise<void> {
  log("sending txs...");

  await Promise.all(
    users.map((user) =>
      user.client.sendTokens(
        user.address,
        user.address,
        coinsFromString(`1${DENOM}`),
        "auto"
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
    url: RPC_URL,
    chainId: CHAIN_ID,
  });

  const users = await createAccounts();

  const startBlock = await client.query.tendermint.getLatestBlock({});

  await sendTxs(users);

  const endBlock = await waitForTxsToFinish(client);

  await summarizeResults(client, startBlock, endBlock);
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
