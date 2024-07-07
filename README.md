# Delegation Tracker

This application allows you to check delegations for a given pool operator address.
It will print the following information:
- `Current cycle: <cycle>` - The current cycle.
- `Next cycle's prepare phase starts in <blocks> blocks.` - The number of blocks left until the next cycle.

For the pool operator address, any of these messages can be seen, depending on the actions left to do:
- `Delegation from <address> can be accepted for <amount> uSTX for <cycles> cycles.` - The pool operator can call `delegate-stack-stx` for this delegator.
- `Delegation from <address> can be extended for <cycles> cycles.` - The pool operator can call `delegate-stack-extend` for this delegator.
- `Delegation from <address> can be increased by <amount> uSTX.` - The pool operator can call `delegate-stack-increase` for this delegator.
- `Delegation can be committed for address <pox-address> up until cycle <cycle>.` - The pool operator can call `stack-aggregation-commit-indexed` for this PoX address.
- `Delegation for address <pox-address> can be extended up until cycle <cycle>.` - The pool operator can call `stack-aggregation-commit-indexed` for this PoX address in a future cycle (as long as the existing `delegate-stack-stx` call allows it).
- `Delegation for address <pox-address> can be increased by <amount> uSTX.` - The pool operator can call `stack-aggregation-increase` for this PoX address.

If there are no actions left to be done, this message will be printed:
- `There's no action left to do for <pool-operator>`.

**With the `LOG_ENTRIES` flag enabled, the following will be printed as well:**
- A list with the delegations made to the given pool operator (`delegate-stx`).
- A list with the delegations accepted by the pool operator (`delegate-stack-stx`).
- A list with the delegations committed by the pool operator (`stack-aggregation-commit-indexed`).

## Setup

This setup assumes a `Linux`/`MacOS` machine is being used, with the prequisites installed (`git`, `node`).

```bash
$ git clone https://github.com/BowTiedDevOps/delegation-tracker
$ cd delegation-tracker
$ npm i
```

## Configuring and running the application

This repository contains a sample configuration file (`.env.sample`):

```bash
# The pool operator address for which to check pox data.
POOL_OPERATOR="SP1FCPT26X5HP0MNHMYD3GBSZANAKGMFZH816W2TM"

# Network to fetch pox data for.
# Possible options:
#   - "mainnet";
#   - "testnet";
#   - "nakamoto-testnet";
# Defaults to "mainnet" if ommitted or given a wrong value.
NETWORK="mainnet"

# Whether to print the delegations (delegate-stx), accepted delegations (delegate-stack-stx) and committed delegations (stack-aggregation-commit-indexed) or not.
LOG_ENTRIES="true"
```

Adjust the `POOL_OPERATOR`, `NETWORK` and `LOG_ENTRIES` variables as needed, then rename the file to `.env` and run the application:

```bash
$ mv .env.sample .env
$ npm run start # or `node index.js`
```

---

**Note:** Due to limitations in the Stacks API it uses, this application will become rate-limited at some point. In this case, it will wait 10 seconds and retry until the rate limit is gone. For a complete run, it is expected to take 5-10 minutes, but it can be more than that if the Stacks API is accessed from other places in the meantime.
