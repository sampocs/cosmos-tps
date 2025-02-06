install:
	(git clone git@github.com:cosmos/cosmos-sdk.git && cd cosmos-sdk && COSMOS_BUILD_OPTIONS=v2 make install)
	rm -rf cosmos-sdk

start:
	bash start-node.sh

test:
	pnpm ts-node src/index.ts