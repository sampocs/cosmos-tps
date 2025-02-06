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

function log(s: string) {
  console.log(new Date().toISOString(), s);
}

// docker run -it -p 1317:1316 --name localsecret ghcr.io/scrtlabs/localsecret:v1.6.0-patch.2

async function main() {
  try {
    const TXS_TO_SEND = 20;
    const URL = "http://127.0.0.1:1317";
    const CHAIN_ID = "chain-1";
    const DENOM = "uscrt";

    const wallet = new Wallet(
      "grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar",
      { bech32Prefix: "cosmos", coinType: 118 }
    );

    const secretjs = new SecretNetworkClient({
      url: URL,
      chainId: CHAIN_ID,
      wallet: wallet,
      walletAddress: wallet.address,
    });

    const startBlock = await secretjs.query.tendermint.getLatestBlock({});

    log("generating wallets...");

    const secretjss = new Array(TXS_TO_SEND).fill(0).map((_) => {
      const wallet = new AminoWallet(undefined, {
        bech32Prefix: "cosmos",
        coinType: 118,
      }); // replace with Wallet for direct
      return new SecretNetworkClient({
        url: URL,
        chainId: CHAIN_ID,
        wallet: wallet,
        walletAddress: wallet.address,
      });
    });

    const MULTISEND_BATCH = TXS_TO_SEND / 4;
    for (let i = 0; i < TXS_TO_SEND / MULTISEND_BATCH; i++) {
      log(
        `funding accounts ${i * MULTISEND_BATCH} - ${
          i * MULTISEND_BATCH + MULTISEND_BATCH
        } out of ${TXS_TO_SEND}...`
      );
      const tx = await secretjs.tx.bank.multiSend(
        {
          inputs: [
            {
              address: secretjs.address,
              coins: coinsFromString(`${1e6 * MULTISEND_BATCH}${DENOM}`),
            },
          ],
          outputs: secretjss
            .slice(i * MULTISEND_BATCH, i * MULTISEND_BATCH + MULTISEND_BATCH)
            .map((secretjs) => ({
              address: secretjs.address,
              coins: coinsFromString(`${1e6}${DENOM}`),
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

    log("getting accounts...");

    const allAccounts = await secretjs.query.auth.accounts({
      pagination: { limit: String(1e6) },
    });
    const accountsMap: Map<string, BaseAccount> = new Map();
    allAccounts.accounts?.forEach((a) =>
      accountsMap.set((a as BaseAccount).address!, a as BaseAccount)
    );

    log("sending txs...");

    secretjss.forEach((secretjs, idx) => {
      const account = accountsMap.get(secretjs.address);

      if (!account) {
        throw `cannot find account ${idx} ${secretjs.address}`;
      }

      secretjs.tx.bank.send(
        {
          from_address: secretjs.address,
          to_address: secretjs.address,
          amount: coinsFromString(`1${DENOM}`),
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

    const heightTxs: Map<string, number> = new Map();
    const heightTimes: Map<string, string> = new Map();
    for (
      let i = Number(startBlock.block?.header?.height!) + 1;
      i <= Number(end_block.block?.header?.height!);
      i++
    ) {
      const block = await secretjs.query.tendermint.getBlockByHeight({
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
  } catch (err) {
    console.error(err);
    throw err;
  }
}

main();
