import {
  BroadcastMode,
  coinsFromString,
  SecretNetworkClient,
  Wallet,
} from "secretjs";
import { BaseAccount } from "secretjs/dist/grpc_gateway/cosmos/auth/v1beta1/auth.pb";
import { AminoWallet } from "secretjs/dist/wallet_amino";

function sleep(ms: number) {
  return new Promise((accept) => setTimeout(accept, ms));
}

// docker run -it -p 1317:1316 --name localsecret ghcr.io/scrtlabs/localsecret:v1.6.0-patch.2

async function main() {
  try {
    const TXS_TO_SEND = 22_000;
    const URL = "http://localhost:1317";
    const CHAIN_ID = "secretdev-1";

    const wallet = new Wallet(
      "grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar"
    );

    const secretjs = new SecretNetworkClient({
      url: URL,
      chainId: CHAIN_ID,
      wallet: wallet,
      walletAddress: wallet.address,
    });

    const start_block = await secretjs.query.tendermint.getLatestBlock({});

    console.log(new Date().toISOString(), "generating wallets...");

    const secretjss = new Array(TXS_TO_SEND).fill(0).map((_) => {
      const wallet = new AminoWallet(); // replace with Wallet for direct
      return new SecretNetworkClient({
        url: URL,
        chainId: CHAIN_ID,
        wallet: wallet,
        walletAddress: wallet.address,
      });
    });

    const MULTISEND_BATCH = TXS_TO_SEND / 4;
    for (let i = 0; i < TXS_TO_SEND / MULTISEND_BATCH; i++) {
      console.log(
        new Date().toISOString(),
        `funding accounts ${i * MULTISEND_BATCH} - ${
          i * MULTISEND_BATCH + MULTISEND_BATCH
        } out of ${TXS_TO_SEND}...`
      );
      const tx = await secretjs.tx.bank.multiSend(
        {
          inputs: [
            {
              address: secretjs.address,
              coins: coinsFromString(`${1e6 * MULTISEND_BATCH}uscrt`),
            },
          ],
          outputs: secretjss
            .slice(i * MULTISEND_BATCH, i * MULTISEND_BATCH + MULTISEND_BATCH)
            .map((secretjs) => ({
              address: secretjs.address,
              coins: coinsFromString(`${1e6}uscrt`),
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

    console.log(new Date().toISOString(), "getting accounts...");

    const all_accounts = await secretjs.query.auth.accounts({
      pagination: { limit: String(1e6) },
    });
    const accounts_map: Map<string, BaseAccount> = new Map();
    all_accounts.accounts?.forEach((a) =>
      accounts_map.set((a as BaseAccount).address!, a as BaseAccount)
    );

    console.log(new Date().toISOString(), "sending txs...");

    secretjss.forEach((secretjs, idx) => {
      const account = accounts_map.get(secretjs.address);

      if (!account) {
        throw `cannot find account ${idx} ${secretjs.address}`;
      }

      secretjs.tx.bank.send(
        {
          from_address: secretjs.address,
          to_address: secretjs.address,
          amount: coinsFromString("1uscrt"),
        },
        {
          broadcastMode: BroadcastMode.Async,
          waitForCommit: false,
          explicitSignerData: {
            accountNumber: Number(account.account_number!),
            sequence: Number(account.sequence!),
            chainId: CHAIN_ID,
          },
        }
      );
    });

    // let it process a bit
    await sleep(30_000);

    let end_block = await secretjs.query.tendermint.getLatestBlock({});
    while (end_block.block?.data?.txs?.length! > 0) {
      await sleep(3_000);
      end_block = await secretjs.query.tendermint.getLatestBlock({});
    }

    const height_txs: Map<string, number> = new Map();
    const height_times: Map<string, string> = new Map();
    for (
      let i = Number(start_block.block?.header?.height!) + 1;
      i <= Number(end_block.block?.header?.height!);
      i++
    ) {
      const block = await secretjs.query.tendermint.getBlockByHeight({
        height: String(i),
      });
      height_txs.set(
        block.block?.header?.height!,
        block.block?.data?.txs?.length!
      );
      height_times.set(
        block.block?.header?.height!,
        String(block.block?.header?.time!)
      );
    }

    console.log(
      "txs per block",
      new Date().toISOString(),
      Object.fromEntries(height_txs.entries())
    );

    console.log(
      "block times",
      new Date().toISOString(),
      Object.fromEntries(height_times.entries())
    );
  } catch (err) {
    console.error(err);
    throw err;
  }
}

main();
