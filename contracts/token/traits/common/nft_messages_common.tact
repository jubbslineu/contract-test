// Contracts that implements TEP-62 messages
message(0xe227eb04) DeployCollection {
    queryId: Int as uint64;
    owner: Address;
    minter: Address;
}

message(0xaff90f57) DeployCollectionOk {
    queryId: Int as uint64;
}

message(0xde51cffa) MintFailed {
    queryId: Int as uint64;
    index: Int as uint256;
    owner: Address;
}

message(0xe1ef66aa) Mint {
    queryId: Int as uint64;
    index: Int as uint256;
    owner: Address;
    responseDestination: Address;
    customPayload: Cell?;
}

message(0x43cc70ad) ChangeMinter {
    queryId: Int as uint64;
    minter: Address;
}

message(0xdea28773) Setup {
    queryId: Int as uint64;
    owner: Address;
    responseDestination: Address;
    customPayload: Cell?;
}

message(0x2fcb26a2) GetStaticData {
    queryId: Int as uint64;
}

message(0x8b771735) ReportStaticData {
    queryId: Int as uint64;
    index: Int as uint256;
    collection: Address;
}

message(0x05138d91) OwnershipAssigned {
    queryId: Int as uint64;
    prevOwner: Address;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) Excesses {
    queryId: Int as uint64;
}