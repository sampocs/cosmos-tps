#!/bin/bash

set -eu

CHAIN_ID=chain-1
SIMAPP_HOME=${HOME}/.simapp
MNEMONIC="grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar"

rm -rf $SIMAPP_HOME

simd config set client chain-id $CHAIN_ID
simd config set client keyring-backend test
simd config set app api.enable true
sed -i '' 's/timeout_commit = "5s"/timeout_commit = "1s"/' ${SIMAPP_HOME}/config/config.toml

echo $MNEMONIC | simd keys add val --recover

simd init simapp --chain-id $CHAIN_ID

simd genesis add-genesis-account val 100000000000000stake --keyring-backend test
simd genesis gentx val 1000000stake --chain-id $CHAIN_ID
simd genesis collect-gentxs

simd start