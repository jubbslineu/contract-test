import "../common/nft_messages_common";

// SBT Collection

message(0x53f9d979) RevokeSbt {
    queryId: Int as uint64;
    itemId: Int as uint256;
}

message(0xf4095ff3) ChangeSbtAuthority {
    queryId: Int as uint64;
    itemId: Int as uint256;
    newAuthority: Address;
}

message(0x616c9df9) RevokeSbtFailed {
    queryId: Int as uint64;
}

message(0x0b9642e0) ChangeSbtAuthorityFailed {
    queryId: Int as uint64;
}


// SBT Item

message(0x928ff2eb) ChangeAuthority {
    queryId: Int as uint64;
    newAuthority: Address;
}

message(0x04ded148) ProveOwnership {
    queryId: Int as uint64;
    dest: Address;
    forwardPayload: Cell;
    withContent: Bool;
}

message(0x0524c7ae) OwnershipProof {
    queryId: Int as uint64;
    itemId: Int as uint256;
    owner: Address;
    data: Cell;
    revokedAt: Int as uint64;
    content: Cell?;
}

message(0xd0c3bfea) RequestOwner {
    queryId: Int as uint64;
    dest: Address;
    forwardPayload: Cell;
    withContent: Bool;
}

message(0x0dd607e3) OwnerInfo {
    queryId: Int as uint64;
    itemId: Int as uint256;
    initiator: Address;
    owner: Address;
    data: Cell;
    revokedAt: Int as uint64;
    content: Cell?;
}

message(0x1f04537a) Destroy {
    queryId: Int as uint64;
}

message(0x6f89f5e3) Revoke {
    queryId: Int as uint64;
}

message(0x970bcb9e) ProveOwnershipFailed {
    queryId: Int as uint64;
    failedReceiver: Address;
}