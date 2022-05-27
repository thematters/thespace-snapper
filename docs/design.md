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

## data structures

### snapshot

- png, 1000 x 1000, 8-bit/color rgb, no-filter, highest compression, non-interlaced

##### cons

- not the smallest in size

##### pros

- just a image (eg. people can simply open it in browser)
- support any color
- small enough (with random image at around 700k for theoretical upper limit, normally should be smaller than 350k)

##### examples

```
316k    fractal16.png
240k    moutain16.png
104k    panda16.png
688k    random16.png
```

### delta

```
{
    delta: [
        {
            bk: int,                // block number for this delta
            time: ISO8601 string,       // real world time for this block
            cs: [
                {
                    i: int              // pixel id
                    c: int              // pixel color
                },
                ...
            ]
        },
        ...
    ],
    prev_delta: string?                   // ipfs cid of previous delta, null for first delta
    prev_snapshot: string                   // ipfs cid of previous snapshot, null for first delta
}
```

### snapshot info (event)

```
{
    bk_num: int,        // block number for this snapshot
    cid: string         // ipfs cid for this snapshot
}
```

### delta info (event)

```
{
    bk_num: int,        // block number for this delta
    cid: string         // ipfs cid for this delta
}
```
