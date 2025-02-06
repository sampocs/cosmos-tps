# cosmos-tps

## Setup

- Install graphviz

```bash
brew install graphviz
```

- Build simapp binary

```bash
make install
```

## Test flow

- Start cosmos node

```bash
make start-node
```

- Run script

```bash
make test
```

## Profiling

- Generate pprof file

```bash
curl -X GET "http://127.0.0.1:6060/debug/pprof/profile?seconds=10" > profile.pprof
```

- Launch pprof web UI

```bash
go tool pprof -http=localhost:8080 profile.pprof
```
