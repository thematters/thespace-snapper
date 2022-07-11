# snapper design proposal

## purpose

- provide efficient map and color change history access for the space clients.

## design goals/considerations

- reliable
- no read bottleneck for clients
- easy to implement
- easy to run as server-less tasks
- low cost, but some gas fee seems OK

## design key points

- all components are stateless
- use events for state management
- use ipfs for data storage
- NOT use ipfs dynamic name resolution facilities (for efficiency and reliability)

## components

1. snapper (run as aws lambda)
2. snapper-contract (run as smart contract)

## snapper

- generate map snapshots and color change deltas
- store snapshot/delta into ipfs
- call snapper-contract to emit events about cache states

### process

#### map snapshot

1. get latest map snapshot from event/ipfs
2. get color changes after latest snapshot
3. apply changes to latest snapshot to generate new snapshot
4. store snapshot to ipfs
5. ask snapper-contract to emit snapshot info event

#### color delta

1. get latest delta from event
2. get color changes after latest delta
3. generate new delta
4. store new delta to ipfs
5. ask snapper-contract to emit delta info event

_note: color delta and map snapshot are generated using the same interval._

## snapper-contract

- receive meta info from snapper and emit events
- [repo](https://github.com/thematters/contracts/tree/develop/src/Snapper)

## data structures

### snapshot

- png, 1000 x 1000, 8-bit/color rgb, no-filter, highest compression, non-interlaced

##### cons

- not the smallest in size

##### pros

- just a image (eg. people can simply open it in browser)
- support any color
- small enough (with random image at around 700k for theoretical upper limit, normally should be smaller than 350k)

### delta

```json
// old data
{
    "delta": [
        {
            "bk": 30565151
            "time": "2022-07-04T07:57:30.000Z"
            "cs": [
                {
                    "i": 1,
                    "c": 15,
                },
                ...
            ]
        },
        ...
    ],
    "prev": "Qma6s6k3iWDtWMBW4qvdZDZxAYFeioMPJDDHYmCpmJgWvp",
    "snapshot": "QmdTzRdbGeEnWW2yS8kHiwF5YFUfbU4FXqDEhTAtVVtdUq"
}

// new data
{
    "delta": [
        {
            "bk": 30565151
            "time": "2022-07-04T07:57:30.000Z"
            "cs": [
                {
                    "i": 1,
                    "c": 15,
                },
                ...
            ]
        },
        ...
    ],
    "prev": "Qma6s6k3iWDtWMBW4qvdZDZxAYFeioMPJDDHYmCpmJgWvp",
    "snapshot": {
	    "cid": "QmdTzRdbGeEnWW2yS8kHiwF5YFUfbU4FXqDEhTAtVVtdUq"
	    "offset": 0
    }
}
```

Field Description:

- `delta` object array:
  - `bk` number, block number for this delta
  - `time` ISO 8601 string, real world time for this block
  - `cs` object array, Color events info:
    - `i` pixel id in this color event
    - `c` pixel color to change in this color event
- `prev` string | null, IPFS CID of previous delta, null for first delta
- `snapshot` object:
  - `cid` string, IPFS CID of previous snapshot
  - `offset` number, index in `delta` array, indicate this snapshot taken before which block number

### snapshot info (event)

```
event Snapshot(uint256 indexed regionId, uint256 indexed block, string cid)
```

### delta info (event)

```
event Delta(uint256 indexed regionId, uint256 indexed block, string cid)
```
