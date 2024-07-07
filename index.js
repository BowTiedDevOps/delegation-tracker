import { poxAddressToBtcAddress } from '@stacks/stacking';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const POOL_OPERATOR = process.env.POOL_OPERATOR;
const LOG_ENTRIES = process.env.LOG_ENTRIES === 'true';
const NETWORK = 
  process.env.NETWORK === "mainnet" ? 
    "mainnet" : 
    process.env.NETWORK === "testnet" ? 
      "testnet" : 
      process.env.NETWORK === "nakamoto-testnet" ? 
        "nakamoto.testnet" : 
        "mainnet"

const GET_EVENTS_API_URL = `https://api.${NETWORK}.hiro.so/extended/v1/tx/events`;
const POX_INFO_URL = `https://api.${NETWORK}.hiro.so/v2/pox`;
const POX_4_ADDRESS = NETWORK === "mainnet" ? 'SP000000000000000000002Q6VF78.pox-4' : 'ST000000000000000000002AMW42H.pox-4';
const LIMIT = 100;

async function fetchData(offset) {
  try {
    const response = await axios.get(GET_EVENTS_API_URL, {
      params: {
        address: POX_4_ADDRESS,
        limit: LIMIT,
        offset: offset,
      },
    });

    return response.data.events;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchData(offset);
      } else {
        console.error(`Error: ${error}`);
      }
    } else {
      console.error(`Error: ${error}`);
    }
    return null;
  }
}

async function fetchPoxInfo() {
  try {
    const response = await axios.get(POX_INFO_URL);
    return response.data;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return fetchPoxInfo();
      } else {
        console.error(`Error fetching PoX info: ${error}`);
      }
    } else {
      console.error(`Error fetching PoX info: ${error}`);
    }
    return null;
  }
}

function parseStringToJSON(input) {
  function parseValue(value) {
    if (value.startsWith('(tuple')) return parseTuple(value);
    if (value.startsWith('(some')) return parseSome(value);
    if (value === 'none') return null;
    if (value.startsWith('u')) return parseInt(value.slice(1), 10);
    if (value.startsWith('0x')) return value;
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    if (value.startsWith("'")) return value.slice(1);
    if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
    if (value.startsWith('"')) return value.slice(1);
    return value;
  }

  function parseTuple(value) {
    const obj = {};
    const tupleContent = value.slice(7, -1).trim();
    const entries = splitEntries(tupleContent);

    entries.forEach((entry) => {
      const spaceIndex = entry.indexOf(' ');
      const key = entry.slice(1, spaceIndex);
      const val = entry.slice(spaceIndex + 1).trim().slice(0, -1);
      obj[key] = parseValue(val);
    });

    return obj;
  }

  function parseSome(value) {
    const someContent = value.slice(5, -1).trim();
    return parseValue(someContent);
  }

  function splitEntries(content) {
    const entries = [];
    let bracketCount = 0;
    let startIdx = 0;

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '(') bracketCount++;
      if (content[i] === ')') bracketCount--;
      if (bracketCount === 0 && (content[i] === ' ' || i === content.length - 1)) {
        entries.push(content.slice(startIdx, i + 1).trim());
        startIdx = i + 1;
      }
    }

    return entries;
  }

  function parseMain(input) {
    const mainContent = input.slice(4, -1).trim();
    if (mainContent.startsWith('(tuple')) return parseTuple(mainContent);
    const entries = splitEntries(mainContent);
    const result = {};

    entries.forEach((entry) => {
      const spaceIndex = entry.indexOf(' ');
      const key = entry.slice(1, spaceIndex);
      const val = entry.slice(spaceIndex + 1).trim().slice(0, -1);
      result[key] = parseValue(val);
    });

    return result;
  }

  return parseMain(input);
}

async function fetchAllData() {
  const poxInfo = await fetchPoxInfo();
  if (poxInfo === null) return;

  const currentCycle = poxInfo.current_cycle.id;

  console.log("Current cycle:", currentCycle);
  console.log("Next cycle's prepare phase starts in", poxInfo.next_cycle.blocks_until_prepare_phase, "blocks.");
  console.log();
  console.log("Processing PoX data for", POOL_OPERATOR + ":");

  let offset = 0;
  let moreData = true;
  let events = [];

  while (moreData) {
    const data = await fetchData(offset);

    if (data && data.length > 0) {
      for (const entry of data) {
        if (entry.contract_log.value.repr.includes(POOL_OPERATOR)) {
          const result = parseStringToJSON(entry.contract_log.value.repr);
          if (result.name == "delegate-stx") {
            events.push({
              name: result.name,
              stacker: result.stacker,
              amountUstx: result.data["amount-ustx"],
              startCycle: result.data["start-cycle-id"],
              endCycle: result.data["end-cycle-id"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          } else if (result.name == "revoke-delegate-stx") {
            events.push({
              name: result.name,
              stacker: result.stacker,
              startCycle: result.data["start-cycle-id"],
              endCycle: result.data["end-cycle-id"],
            });
          } else if (result.name == "delegate-stack-stx") {
            events.push({
              name: result.name,
              stacker: result.data.stacker,
              amountUstx: result.data["lock-amount"],
              startCycle: result.data["start-cycle-id"],
              endCycle: result.data["end-cycle-id"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          } else if (result.name == "delegate-stack-extend") {
            events.push({
              name: result.name,
              stacker: result.data.stacker,
              startCycle: result.data["start-cycle-id"],
              endCycle: result.data["end-cycle-id"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          } else if (result.name == "delegate-stack-increase") {
            events.push({
              name: result.name,
              stacker: result.data.stacker,
              startCycle: result.data["start-cycle-id"],
              endCycle: result.data["end-cycle-id"],
              increaseBy: result.data["increase-by"],
              totalLocked: result.data["total-locked"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          } else if (result.name == "stack-aggregation-commit-indexed" || result.name == "stack-aggregation-commit") {
            events.push({
              name: result.name,
              amountUstx: result.data["amount-ustx"],
              cycle: result.data["reward-cycle"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          } else if (result.name == "stack-aggregation-increase") {
            events.push({
              name: result.name,
              amountUstx: result.data["amount-ustx"],
              cycle: result.data["reward-cycle"],
              rewardCycleIndex: result.data["reward-cycle-index"],
              poxAddress: result.data["pox-addr"] != null ? 
                poxAddressToBtcAddress(
                  parseInt(result.data["pox-addr"].version, 16),
                  Uint8Array.from(Buffer.from(result.data["pox-addr"].hashbytes.slice(2), 'hex')),
                  'mainnet',
                ) :
                null,
            });
          };
        };
      };
      offset += LIMIT;
    } else {
      moreData = false;
    }
  }

  events.reverse();

  let delegations = new Map();
  let acceptedDelegations = new Map();
  let committedDelegations = new Map();

  for (const event of events) {
    const { name, stacker, startCycle, endCycle, poxAddress, amountUstx, increaseBy, totalLocked, cycle } = event;

    switch (name) {
      case 'delegate-stx':
        delegations.set(stacker, { startCycle, endCycle, poxAddress, amountUstx });
        break;
      case 'revoke-delegate-stx':
        delegations.delete(stacker);
        break;
      case 'delegate-stack-stx':
        acceptedDelegations.set(stacker, { startCycle, endCycle, poxAddress, amountUstx });
        break;
      case 'delegate-stack-extend':
        if (acceptedDelegations.has(stacker)) {
          let existing = acceptedDelegations.get(stacker);
          if (existing.endCycle === startCycle) {
            existing.endCycle = endCycle;
            acceptedDelegations.set(stacker, existing);
          }
        }
        break;
      case 'delegate-stack-increase':
        if (acceptedDelegations.has(stacker)) {
          let existing = acceptedDelegations.get(stacker);
          if (existing.startCycle === startCycle && existing.endCycle === endCycle &&
              (existing.amountUstx + increaseBy) === totalLocked) {
            existing.amountUstx = totalLocked;
            acceptedDelegations.set(stacker, existing);
          }
        }
        break;
      case 'stack-aggregation-commit':
      case 'stack-aggregation-commit-indexed':
        if (poxAddress) {
          if (!committedDelegations.has(poxAddress)) {
            committedDelegations.set(poxAddress, [{ startCycle: cycle, endCycle: cycle + 1, amountUstx }]);
          } else {
            let existingList = committedDelegations.get(poxAddress);
            let lastEntry = existingList[existingList.length - 1];
            if (lastEntry.amountUstx === amountUstx && lastEntry.endCycle === cycle) {
              lastEntry.endCycle = cycle + 1;
            } else {
              existingList.push({ startCycle: cycle, endCycle: cycle + 1, amountUstx });
            }
            committedDelegations.set(poxAddress, existingList);
          }
        }
        break;
      case 'stack-aggregation-increase':
        if (poxAddress) {
          let existingList = committedDelegations.get(poxAddress);
          if (existingList) {
            let entry = existingList.find(e => e.startCycle === cycle);
            if (entry) {
              entry.amountUstx += amountUstx;
            }
          }
        }
        break;
    }
  }

  delegations.forEach((value, key) => {
    if (value.endCycle <= currentCycle) {
      delegations.delete(key);
    }
  });

  acceptedDelegations.forEach((value, key) => {
    if (value.endCycle <= currentCycle) {
      acceptedDelegations.delete(key);
    }
  });

  committedDelegations.forEach((value, key) => {
    committedDelegations.set(key, value.filter(e => e.endCycle > currentCycle));
    if (committedDelegations.get(key).length === 0) {
      committedDelegations.delete(key);
    }
  });

  if (LOG_ENTRIES) {
    console.log("Delegations:");
    delegations.forEach((value, key) => console.log(key, value));
    console.log();

    console.log("Accepted Delegations:");
    acceptedDelegations.forEach((value, key) => console.log(key, value));
    console.log();

    console.log("Committed Delegations:");
    committedDelegations.forEach((value, key) => console.log(key, value));
    console.log();
  }

  let actionsLeft = false;

  delegations.forEach((value, key) => {
    if (!acceptedDelegations.has(key)) {
      const maxCycles = Math.min(value.endCycle - currentCycle, currentCycle + 12);
      actionsLeft = true;
      console.log(`Delegation from ${key} can be accepted for ${value.amountUstx} uSTX for ${maxCycles} cycles.`);
    }
  });

  acceptedDelegations.forEach((value, key) => {
    const maxExtendCycles = Math.min(12 - (value.endCycle - currentCycle), delegations.get(key).endCycle - 1 - currentCycle);
    if (maxExtendCycles > 0) {
      actionsLeft = true;
      console.log(`Delegation from ${key} can be extended for ${maxExtendCycles} cycles.`);
    }

    if (value.amountUstx < delegations.get(key).amountUstx) {
      const increaseAmount = delegations.get(key).amountUstx - value.amountUstx;
      actionsLeft = true;
      console.log(`Delegation from ${key} can be increased by ${increaseAmount} uSTX.`);
    }
  });

  const poxAddressSet = new Set([...acceptedDelegations.values()].map(d => d.poxAddress));

  poxAddressSet.forEach((address) => {
    if (!committedDelegations.has(address)) {
      const maxEndCycle = Math.max(...[...acceptedDelegations.values()].filter(d => d.poxAddress === address).map(d => d.endCycle));
      actionsLeft = true;
      console.log(`Delegation can be committed for address ${address} up until cycle ${maxEndCycle}.`);
    } else {
      const maxEndCycle = Math.max(...[...acceptedDelegations.values()].filter(d => d.poxAddress === address).map(d => d.endCycle));
      const currentCommittedEndCycle = Math.max(...committedDelegations.get(address).map(d => d.endCycle));
      if (currentCommittedEndCycle < maxEndCycle) {
        actionsLeft = true;
        console.log(`Delegation for address ${address} can be extended up until cycle ${maxEndCycle}.`);
      }

      const totalAcceptedAmount = [...acceptedDelegations.values()]
        .filter(d => d.poxAddress === address)
        .reduce((sum, d) => sum + d.amountUstx, 0);
      const currentCommittedAmount = committedDelegations.get(address)
        .reduce((sum, d) => sum + d.amountUstx, 0);

      if (totalAcceptedAmount > currentCommittedAmount) {
        const increaseAmount = totalAcceptedAmount - currentCommittedAmount;
        actionsLeft = true;
        console.log(`Delegation for address ${address} can be increased by ${increaseAmount} uSTX.`);
      }
    }
  });

  if (!actionsLeft) {
    console.log("There's no action left to do for", POOL_OPERATOR);
  }
}

fetchAllData();
