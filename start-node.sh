#!/bin/bash

set -eu

CHAIN_ID=chain-1
DENOM=uatom
SIMAPP_HOME=${HOME}/.simapp
MNEMONIC="grant rice replace explain federal release fix clever romance raise often wild taxi quarter soccer fiber love must tape steak together observe swap guitar"

config_toml=${SIMAPP_HOME}/config/config.toml
genesis_json=${SIMAPP_HOME}/config/genesis.json

rm -rf $SIMAPP_HOME

simd config set client chain-id $CHAIN_ID
simd config set client keyring-backend test
simd config set app api.enable true
sed -i '' 's/timeout_commit = "5s"/timeout_commit = "1s"/' $config_toml
sed -i '' 's/pprof_laddr = "localhost:6060"/pprof_laddr = "127.0.0.1:6060"/' $config_toml

echo $MNEMONIC | simd keys add val --recover

simd init simapp --chain-id $CHAIN_ID

simd genesis add-genesis-account val 100000000000000${DENOM} --keyring-backend test
simd genesis gentx val 1000000${DENOM} --chain-id $CHAIN_ID
simd genesis collect-gentxs

sed -i '' 's/"max_gas": "10000000"/"max_gas": "1000000000"/' $genesis_json
sed -i -E "s|\"stake\"|\"${DENOM}\"|g" $genesis_json 

simd start